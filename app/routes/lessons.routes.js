import fs from "node:fs";
import { Router } from "express";

import {
  getLessonDetail,
  getLessonMedia,
  listLessons,
  recordLessonProgress,
  updateLessonJournal,
  updateLessonMetadata
} from "../services/learning.service.js";

function sendMedia(req, res, media) {
  const range = req.headers.range;

  res.setHeader("Content-Type", media.contentType);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, max-age=3600");

  if (!range || media.contentType.startsWith("image/")) {
    res.setHeader("Content-Length", media.size);
    fs.createReadStream(media.filePath).pipe(res);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.status(416).setHeader("Content-Range", `bytes */${media.size}`).end();
    return;
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), media.size - 1) : media.size - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= media.size) {
    res.status(416).setHeader("Content-Range", `bytes */${media.size}`).end();
    return;
  }

  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${media.size}`);
  res.setHeader("Content-Length", end - start + 1);
  fs.createReadStream(media.filePath, { start, end }).pipe(res);
}

export function createLessonsRouter() {
  const router = Router();

  router.get("/", (req, res, next) => {
    try {
      res.json({
        data: listLessons({
          q: req.query.q || "",
          status: req.query.status || "",
          limit: req.query.limit || 100
        }),
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", (req, res, next) => {
    try {
      res.json({ data: getLessonDetail(req.params.id), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/media/:kind", (req, res, next) => {
    try {
      sendMedia(req, res, getLessonMedia(req.params.id, req.params.kind));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/journal", (req, res, next) => {
    try {
      res.json({
        data: updateLessonJournal(req.params.id, req.body),
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/metadata", (req, res, next) => {
    try {
      res.json({
        data: updateLessonMetadata(req.params.id, req.body),
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/progress", (req, res, next) => {
    try {
      res.json({
        data: recordLessonProgress(req.params.id, req.body?.action),
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
