import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "./config.js";
import { initializeDatabase } from "./db/database.js";
import { createInboxRouter } from "./routes/inbox.routes.js";
import { createHealthRouter } from "./routes/health.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

initializeDatabase();

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/health", createHealthRouter());
app.use("/api/inbox", createInboxRouter());

app.use(express.static(path.resolve(__dirname, "../public")));

app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  res.sendFile(path.resolve(__dirname, "../public/index.html"));
});

app.use((error, _req, res, _next) => {
  console.error("[HTTP_ERROR]", error);

  const status = Number(error.status || 500);
  res.status(status).json({
    data: null,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message:
        status >= 500
          ? "The application could not complete this request."
          : error.message
    }
  });
});

app.listen(config.port, () => {
  console.log(`Enjoy Journal running at http://localhost:${config.port}`);
});
