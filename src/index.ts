import axios from "axios";
import express from "express";
import { engine } from "express-handlebars";
import session from "express-session";
import { decodeJwt } from "jose";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod";
import { SessionStore } from "./session-store";

const app = express();
app.engine("handlebars", engine());
app.set("trust proxy", 1);
app.set("view engine", "handlebars");
app.set("views", "./views");

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
});

declare module "express-session" {
  interface SessionData {
    oauth2state?: string;
    userId?: string;
    userName?: string;
  }
}

app.use("/static", express.static("static"));

app.use(
  session({
    store: new SessionStore(pool),
    secret: process.env["SESSION_SECRET"]!,
    cookie: {
      httpOnly: true,
      maxAge: 24 * 3600 * 1000,
      sameSite: "strict",
      secure: process.env["SESSION_COOKIE_SECURE_OPTION"] === "true",
    },
    genid: () => randomUUID(),
    resave: false,
    rolling: true,
    saveUninitialized: false,
  })
);

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
    const oauth2state = randomUUID();
    req.session.oauth2state = oauth2state;

    const url = new URL(
      "https://sso.chaster.app/auth/realms/app/protocol/openid-connect/auth"
    );
    url.searchParams.set("client_id", process.env["CHASTER_CLIENT_ID"]!);
    url.searchParams.set("redirect_uri", process.env["CHASTER_REDIRECT_URI"]!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "locks");
    url.searchParams.set("state", req.session.oauth2state);

    res.render("index", {
      url: url.toString(),
      userName: req.session.userName,
    });
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

    const { code, state } = queryValidation.data;
    if (state !== req.session.oauth2state) {
      return next(new Error("invalid state"));
    }

    const {
      data: { access_token, refresh_token },
    } = await axios.post(
      "https://sso.chaster.app/auth/realms/app/protocol/openid-connect/token",
      new URLSearchParams({
        client_id: process.env["CHASTER_CLIENT_ID"]!,
        client_secret: process.env["CHASTER_CLIENT_SECRET"]!,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env["CHASTER_REDIRECT_URI"]!,
      })
    );

    const { sub, preferred_username } = decodeJwt(access_token);

    const client = await pool.connect();
    await client.query(
      "INSERT INTO users (user_id, access_token, refresh_token) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET user_id = $1, access_token = $2, refresh_token = $3",
      [sub, access_token, refresh_token]
    );
    client.release();

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) {
          return reject(err);
        }
        return resolve();
      });
    });

    req.session.userId = sub;
    req.session.userName = preferred_username as string;

    res.redirect("/");
  })
);

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`listening on port ${port}!`));
