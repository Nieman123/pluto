import { createRequire } from "node:module";
import { resolve } from "node:path";
import express from "express";

const require = createRequire(import.meta.url);
const { app: publicSite } = require("../lib/index.js");
const preview = express();
const dist = resolve(import.meta.dirname, "../../dist");

preview.use(express.static(dist));
preview.use((request, response, next) => {
  if (request.path === "/app" || request.path.startsWith("/app/")) {
    response.sendFile(resolve(dist, "app/index.html"));
    return;
  }
  next();
});
preview.use(publicSite);

const port = Number.parseInt(process.env.PORT || "4173", 10);
preview.listen(port, "127.0.0.1", () => {
  console.log(`Public site preview: http://127.0.0.1:${port}`);
});
