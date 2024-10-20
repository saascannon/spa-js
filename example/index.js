import express from "express";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const app = express();

const port = 3030;

const config = {
  clientId: process.env["SAASCANNON_CLIENT_ID"] || undefined,
  domain: process.env["SAASCANNON_DOMAIN"] || undefined,
  uiBaseUrl: process.env["SAASCANNON_UI_BASE_URL"] || undefined,
};

// set the view engine to ejs
app.set("view engine", "ejs");

/**
 * Single page application (only actually one page for login example)
 */
app.get("/", (req, res) => {
  res.render("index", {
    config: {
      clientId: config.clientId,
      domain: config.domain,
      uiBaseUrl: config.uiBaseUrl,
    },
  });
});

app.get("/sdk.js", (req, res) => {
  res.sendFile(path.resolve("../dist/browser/index.global.js"));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
