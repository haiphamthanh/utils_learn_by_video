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
import {
  getTranscript,
  getTranscriptionStatus,
  startTranscription,
  updateTranscriptSegment
} from "../services/transcription.service.js";
import {
  getLesson,
  getLessonGenerationStatus,
  startLessonGeneration
} from "../services/lesson.service.js";

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
    limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
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
    res.json({
      data: listInboxItems({ status: req.query.status || null }),
      error: null
    });
  });

  router.post("/", (req, res, next) => {
    try {
      res.status(201).json({ data: createInboxItem(req.body), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", (req, res, next) => {
    try {
      res.json({ data: getInboxItem(req.params.id), error: null });
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
      res.status(201).json({ data: attachMedia(req.params.id, req.file), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/process", (req, res, next) => {
    try {
      res.status(202).json({ data: startMediaProcessing(req.params.id), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/status", (req, res, next) => {
    try {
      res.json({ data: getProcessingStatus(req.params.id), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/transcribe", (req, res, next) => {
    try {
      res.status(202).json({ data: startTranscription(req.params.id), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/transcription-status", (req, res, next) => {
    try {
      res.json({ data: getTranscriptionStatus(req.params.id), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/transcript", (req, res, next) => {
    try {
      res.json({ data: getTranscript(req.params.id), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/transcript/segments/:segmentId", (req, res, next) => {
    try {
      res.json({
        data: updateTranscriptSegment(req.params.id, req.params.segmentId, req.body),
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/lesson/generate", (req, res, next) => {
    try {
      res.status(202).json({
        data: startLessonGeneration(req.params.id),
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/lesson-status", (req, res, next) => {
    try {
      res.json({ data: getLessonGenerationStatus(req.params.id), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/lesson", (req, res, next) => {
    try {
      res.json({ data: getLesson(req.params.id), error: null });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
