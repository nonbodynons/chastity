import express from "express";
import { engine } from "express-handlebars";

const app = express();
app.engine("handlebars", engine());
app.set("view engine", "handlebars");
app.set("views", "./views");

app.get("/", (req, res) => {
  res.render("index");
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`listening on port ${port}!`));
