import axios from "axios";
import express from "express";
import { engine } from "express-handlebars";
import { z } from "zod";

const app = express();
app.engine("handlebars", engine());
app.set("view engine", "handlebars");
app.set("views", "./views");

const wrapAsyncHandler =
  (handler: express.RequestHandler): express.RequestHandler =>
  async (req, res, next) => {
    try {
      handler(req, res, next);
    } catch (err) {
      next(err);
    }
  };

app.get(
  "/",
  wrapAsyncHandler(async (req, res) => {
    const url = new URL(
      "https://sso.chaster.app/auth/realms/app/protocol/openid-connect/auth"
    );
    url.searchParams.set("client_id", process.env["CHASTER_CLIENT_ID"]!);
    url.searchParams.set("redirect_uri", process.env["CHASTER_REDIRECT_URI"]!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "locks");
    url.searchParams.set("state", "12345"); // TODO: CSRF 対策
    res.render("index", { url: url.toString() });
  })
);

const OAuth2CallbackQuerySchema = z.object({
  state: z.string(),
  code: z.string(),
});

app.get(
  "/oidc",
  wrapAsyncHandler(async (req, res, next) => {
    const queryValidation = await OAuth2CallbackQuerySchema.safeParseAsync(
      req.query
    );
    if (!queryValidation.success) {
      return next(queryValidation.error);
    }

    const { code } = queryValidation.data;
    const { data } = await axios.post(
      "https://sso.chaster.app/auth/realms/app/protocol/openid-connect/token",
      new URLSearchParams({
        client_id: process.env["CHASTER_CLIENT_ID"]!,
        client_secret: process.env["CHASTER_CLIENT_SECRET"]!,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env["CHASTER_REDIRECT_URI"]!,
      })
    );
    console.info(data);

    res.redirect("/");
  })
);

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`listening on port ${port}!`));
