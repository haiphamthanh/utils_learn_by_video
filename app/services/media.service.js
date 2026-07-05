import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";

import { config } from "../config.js";

export function createMediaUploadStorage() {
  return multer.diskStorage({
    destination: (_req, _file, callback) => {
      const directory = path.join(config.dataDir, "inbox");
      fs.mkdirSync(directory, { recursive: true });
      callback(null, directory);
    },

    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
    }
  });
}
