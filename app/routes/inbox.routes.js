import { Router } from "express";
import multer from "multer";

import { config } from "../config.js";
import {
  createInboxItem,
  getInboxItem,
  listInboxItems,
  attachMedia
} from "../services/inbox.service.js";
import { createMediaUploadStorage } from "../services/media.service.js";
import {
  getProcessingStatus,
  startMediaProcessing
} from "../services/pipeline.service.js";

const allowedMediaTypes = new Set([
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav"
]);

export function createInboxRouter() {
  const router = Router();

  const upload = multer({
    storage: createMediaUploadStorage(),
    limits: {
      fileSize: config.maxUploadMb * 1024 * 1024
    },
    fileFilter: (_req, file, callback) => {
      if (!allowedMediaTypes.has(file.mimetype)) {
        const error = new Error("Unsupported media type.");
        error.status = 400;
        error.code = "MEDIA_UNSUPPORTED";
        callback(error);
        return;
      }
      callback(null, true);
    }
  });

  router.get("/", (req, res) => {
    const items = listInboxItems({
      status: req.query.status || null
    });

    res.json({ data: items, error: null });
  });

  router.post("/", (req, res, next) => {
    try {
      const item = createInboxItem(req.body);
      res.status(201).json({ data: item, error: null });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", (req, res, next) => {
    try {
      const item = getInboxItem(req.params.id);
      res.json({ data: item, error: null });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/media", upload.single("media"), (req, res, next) => {
    try {
      if (!req.file) {
        const error = new Error("Please attach a media file.");
        error.status = 400;
        error.code = "MEDIA_REQUIRED";
        throw error;
      }

      const result = attachMedia(req.params.id, req.file);
      res.status(201).json({ data: result, error: null });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/process", (req, res, next) => {
    try {
      const result = startMediaProcessing(req.params.id);
      res.status(202).json({ data: result, error: null });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/status", (req, res, next) => {
    try {
      const result = getProcessingStatus(req.params.id);
      res.json({ data: result, error: null });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
