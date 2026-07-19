import { Router } from "express";

import {
  createNote,
  deleteNote,
  getNoteDetail,
  listNotes,
  updateNoteDetails
} from "../services/note.service.js";

export function createNotesRouter() {
  const router = Router();

  router.get("/", (req, res, next) => {
    try {
      res.json({
        data: listNotes({
          q: req.query.q || "",
          tag: req.query.tag || "",
          favorite: req.query.favorite === "1" || req.query.favorite === "true",
          status: req.query.status || "",
          limit: req.query.limit || 200
        }),
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", (req, res, next) => {
    try {
      res.status(201).json({ data: createNote(req.body), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", (req, res, next) => {
    try {
      res.json({ data: getNoteDetail(req.params.id), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", (req, res, next) => {
    try {
      res.json({ data: updateNoteDetails(req.params.id, req.body), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", (req, res, next) => {
    try {
      res.json({ data: deleteNote(req.params.id), error: null });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
