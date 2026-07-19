import crypto from "node:crypto";

import { getDatabase } from "../db/database.js";
import {
  listNoteTags,
  replaceNoteTags,
  tagSlug
} from "./tag.service.js";

function noteError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function nowIso() {
  return new Date().toISOString();
}

function getNoteRecord(noteId, db = getDatabase()) {
  const row = db.prepare(`
    SELECT
      id,
      title,
      content,
      is_favorite AS isFavorite,
      is_done AS isDone,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM notes
    WHERE id = ?
  `).get(noteId);
  if (!row) throw noteError("NOTE_NOT_FOUND", "Note not found.", 404);
  return row;
}

function mapNote(row, db = getDatabase()) {
  return {
    ...row,
    isFavorite: Boolean(row.isFavorite),
    isDone: Boolean(row.isDone),
    tags: listNoteTags(row.id, db)
  };
}

export function listNotes({ q = "", tag = "", favorite = false, status = "", limit = 200 } = {}) {
  const db = getDatabase();
  const normalizedQuery = String(q || "").trim().toLocaleLowerCase();
  const normalizedTag = tagSlug(tag);
  const normalizedStatus = ["done", "pending"].includes(String(status || "").toLowerCase())
    ? String(status).toLowerCase()
    : "";
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 200));
  let sql = `
    SELECT
      n.id,
      n.title,
      n.content,
      n.is_favorite AS isFavorite,
      n.is_done AS isDone,
      n.created_at AS createdAt,
      n.updated_at AS updatedAt
    FROM notes n
    WHERE 1 = 1
  `;
  const params = [];
  if (favorite) sql += " AND n.is_favorite = 1";
  if (normalizedStatus === "done") sql += " AND n.is_done = 1";
  if (normalizedStatus === "pending") sql += " AND n.is_done = 0";
  if (normalizedTag) {
    sql += ` AND EXISTS (
      SELECT 1 FROM note_tags nt
      JOIN tags t ON t.id = nt.tag_id
      WHERE nt.note_id = n.id AND t.slug = ?
    )`;
    params.push(normalizedTag);
  }
  sql += " ORDER BY n.updated_at DESC LIMIT ?";
  params.push(normalizedQuery ? 200 : safeLimit);

  let notes = db.prepare(sql).all(...params).map((row) => mapNote(row, db));
  if (normalizedQuery) {
    notes = notes.filter((note) => [
      note.title,
      note.content,
      note.tags.map((item) => item.name).join(" ")
    ].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedQuery));
  }
  return notes.slice(0, safeLimit);
}

export function getNoteDetail(noteId) {
  return mapNote(getNoteRecord(noteId));
}

export function createNote(payload = {}) {
  const title = String(payload.title ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
  const content = String(payload.content ?? "").trim();
  if (!title) throw noteError("NOTE_TITLE_REQUIRED", "Note title is required.");
  if (!content) throw noteError("NOTE_CONTENT_REQUIRED", "Note content is required.");

  const db = getDatabase();
  const timestamp = nowIso();
  const id = `note_${crypto.randomUUID()}`;
  db.transaction(() => {
    db.prepare(`
      INSERT INTO notes (id, title, content, is_favorite, is_done, created_at, updated_at)
      VALUES (?, ?, ?, 0, 0, ?, ?)
    `).run(id, title, content, timestamp, timestamp);
    replaceNoteTags(id, payload.tags || [], db, timestamp);
  })();
  return getNoteDetail(id);
}

export function updateNoteDetails(noteId, payload = {}) {
  const record = getNoteRecord(noteId);
  const hasContent = Object.prototype.hasOwnProperty.call(payload, "content");
  const hasTags = Object.prototype.hasOwnProperty.call(payload, "tags");
  const hasFavorite = Object.prototype.hasOwnProperty.call(payload, "isFavorite");
  const hasDone = Object.prototype.hasOwnProperty.call(payload, "isDone");
  const content = hasContent ? String(payload.content ?? "").trim() : record.content;
  if (!hasContent && !hasTags && !hasFavorite && !hasDone) {
    throw noteError("NOTE_EMPTY", "No note fields were provided.");
  }
  if (!content) throw noteError("NOTE_CONTENT_REQUIRED", "Note content is required.");

  const db = getDatabase();
  const timestamp = nowIso();
  db.transaction(() => {
    db.prepare(`
      UPDATE notes
      SET
        content = CASE WHEN ? = 1 THEN ? ELSE content END,
        is_favorite = CASE WHEN ? = 1 THEN ? ELSE is_favorite END,
        is_done = CASE WHEN ? = 1 THEN ? ELSE is_done END,
        updated_at = ?
      WHERE id = ?
    `).run(
      hasContent ? 1 : 0,
      content,
      hasFavorite ? 1 : 0,
      payload.isFavorite ? 1 : 0,
      hasDone ? 1 : 0,
      payload.isDone ? 1 : 0,
      timestamp,
      noteId
    );
    if (hasTags) replaceNoteTags(noteId, payload.tags, db, timestamp);
  })();
  return getNoteDetail(noteId);
}

export function deleteNote(noteId) {
  const db = getDatabase();
  getNoteRecord(noteId, db);
  db.prepare("DELETE FROM notes WHERE id = ?").run(noteId);
  return { id: noteId, deleted: true };
}
