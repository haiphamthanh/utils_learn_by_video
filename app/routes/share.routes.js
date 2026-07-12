import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";

import { config } from "../config.js";
import {
  listShareRegistry,
  restoreTombstone,
  listExportedArtifacts,
  deleteExportedArtifact,
  listExportableLessonsWithStatus,
  rebuildLastExportedMarks
} from "../services/share.service.js";

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype === "application/zip" || file.originalname.toLowerCase().endsWith(".zip")) {
      callback(null, true);
      return;
    }
    callback(new Error("Please upload a .zip file."));
  }
});

export function createShareRouter() {
  const router = Router();

  router.get("/registry", (req, res, next) => {
    try {
      res.json({
        data: listShareRegistry({ status: req.query.status || "" }),
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/exportable", (_req, res, next) => {
    try {
      res.json({
        data: listExportableLessonsWithStatus(),
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/exports", (_req, res, next) => {
    try {
      res.json({
        data: listExportedArtifacts(),
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/exports", async (req, res, next) => {
    try {
      const { createShareZip } = await import("../services/share-export.service.js");
      const result = await createShareZip({
        lessonIds: req.body?.lessonIds || undefined,
        noMedia: req.body?.noMedia === true
      });
      res.status(201).json({ data: result, error: null });
    } catch (error) {
      next(error);
    }
  });

  router.get("/exports/:filename/download", (req, res, next) => {
    try {
      const filename = path.basename(req.params.filename);
      if (!filename.endsWith(".zip")) {
        res.status(400).json({ data: null, error: { code: "BAD_REQUEST", message: "Only zip files can be downloaded." } });
        return;
      }
      const filePath = path.join(config.dataDir, "exports", filename);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ data: null, error: { code: "NOT_FOUND", message: "Export file not found." } });
        return;
      }
      const stat = fs.statSync(filePath);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Length", stat.size);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/exports/:filename", async (req, res, next) => {
    try {
      const result = deleteExportedArtifact(req.params.filename);
      await rebuildLastExportedMarks();
      res.json({ data: result, error: null });
    } catch (error) {
      next(error);
    }
  });

  router.post("/imports", importUpload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ data: null, error: { code: "FILE_REQUIRED", message: "Please attach a .zip file." } });
        return;
      }
      const { importShareFromBuffer } = await import("../services/share-import.service.js");
      const { results } = await importShareFromBuffer(req.file.buffer, {
        dryRun: req.body?.dryRun === true
      });
      res.status(200).json({ data: { results }, error: null });
    } catch (error) {
      next(error);
    }
  });

  router.post("/registry/:slug/restore", (req, res, next) => {
    try {
      res.json({ data: restoreTombstone(req.params.slug), error: null });
    } catch (error) {
      next(error);
    }
  });

  return router;
}