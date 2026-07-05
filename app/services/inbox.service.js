import crypto from "node:crypto";
import fs from "node:fs";

import { getDatabase } from "../db/database.js";

const ALLOWED_SOURCE_TYPES = new Set([
  "facebook-reel",
  "youtube-short",
  "local-file",
  "uploaded-file",
  "other-url"
]);

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function badRequest(code, message) {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  return error;
}

function notFound(message = "Inbox item not found.") {
  const error = new Error(message);
  error.status = 404;
  error.code = "INBOX_NOT_FOUND";
  return error;
}

export function createInboxItem(payload = {}) {
  const db = getDatabase();

  const source = payload.source || {};
  const sourceType = source.type || "other-url";

  if (!ALLOWED_SOURCE_TYPES.has(sourceType)) {
    throw badRequest("SOURCE_TYPE_INVALID", "Unsupported source type.");
  }

  const url = typeof source.url === "string" ? source.url.trim() : "";
  if (sourceType !== "local-file" && sourceType !== "uploaded-file" && !url) {
    throw badRequest("SOURCE_URL_REQUIRED", "A source URL is required.");
  }

  const createdAt = nowIso();
  const sourceId = makeId("source");
  const inboxId = makeId("inbox");

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO sources (
        id, type, url, title, author, platform, captured_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sourceId,
      sourceType,
      url || null,
      source.title || null,
      source.author || null,
      source.platform || null,
      source.capturedAt || createdAt,
      createdAt
    );

    db.prepare(`
      INSERT INTO inbox_items (
        id, source_id, status, personal_note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      inboxId,
      sourceId,
      "WAITING_MEDIA",
      payload.personalNote || "",
      createdAt,
      createdAt
    );
  });

  transaction();

  return getInboxItem(inboxId);
}

export function listInboxItems({ status = null } = {}) {
  const db = getDatabase();

  let sql = `
    SELECT
      i.id,
      i.status,
      i.personal_note AS personalNote,
      i.error_code AS errorCode,
      i.error_message AS errorMessage,
      i.created_at AS createdAt,
      i.updated_at AS updatedAt,
      s.type AS sourceType,
      s.url AS sourceUrl,
      s.title AS sourceTitle,
      s.platform AS sourcePlatform,
      m.id AS mediaAssetId,
      m.original_filename AS mediaFilename,
      m.media_type AS mediaType,
      m.size_bytes AS mediaSizeBytes,
      m.duration_ms AS durationMs,
      CASE WHEN m.normalized_video_path IS NOT NULL THEN 1 ELSE 0 END AS hasNormalizedVideo,
      CASE WHEN m.normalized_audio_path IS NOT NULL THEN 1 ELSE 0 END AS hasNormalizedAudio,
      CASE WHEN m.poster_path IS NOT NULL THEN 1 ELSE 0 END AS hasPoster,
      j.stage AS processingStage,
      j.progress AS processingProgress
    FROM inbox_items i
    LEFT JOIN sources s ON s.id = i.source_id
    LEFT JOIN media_assets m ON m.inbox_item_id = i.id
    LEFT JOIN processing_jobs j ON j.id = (
      SELECT id
      FROM processing_jobs
      WHERE inbox_item_id = i.id
      ORDER BY started_at DESC
      LIMIT 1
    )
  `;

  const params = [];

  if (status) {
    sql += " WHERE i.status = ?";
    params.push(status);
  }

  sql += " ORDER BY i.updated_at DESC";

  return db.prepare(sql).all(...params);
}

export function getInboxItem(id) {
  const db = getDatabase();
  const item = listInboxItems().find((entry) => entry.id === id);
  if (!item) throw notFound();
  return item;
}

export function attachMedia(inboxItemId, uploadedFile) {
  const db = getDatabase();

  const existing = db
    .prepare("SELECT id, status FROM inbox_items WHERE id = ?")
    .get(inboxItemId);

  if (!existing) {
    fs.rmSync(uploadedFile.path, { force: true });
    throw notFound();
  }

  if (existing.status === "PROCESSING") {
    fs.rmSync(uploadedFile.path, { force: true });
    throw badRequest("MEDIA_LOCKED", "Media cannot be replaced while processing.");
  }

  const oldMedia = db
    .prepare(`
      SELECT
        original_path AS originalPath,
        normalized_video_path AS normalizedVideoPath,
        normalized_audio_path AS normalizedAudioPath,
        poster_path AS posterPath
      FROM media_assets
      WHERE inbox_item_id = ?
    `)
    .get(inboxItemId);

  const mediaAssetId = makeId("media");
  const createdAt = nowIso();

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM processing_jobs WHERE inbox_item_id = ?")
      .run(inboxItemId);

    db.prepare("DELETE FROM media_assets WHERE inbox_item_id = ?")
      .run(inboxItemId);

    db.prepare(`
      INSERT INTO media_assets (
        id,
        inbox_item_id,
        original_filename,
        media_type,
        original_path,
        size_bytes,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      mediaAssetId,
      inboxItemId,
      uploadedFile.originalname,
      uploadedFile.mimetype,
      uploadedFile.path,
      uploadedFile.size,
      createdAt
    );

    db.prepare(`
      UPDATE inbox_items
      SET status = ?, error_code = NULL, error_message = NULL, updated_at = ?
      WHERE id = ?
    `).run("READY_TO_PROCESS", createdAt, inboxItemId);
  });

  transaction();

  for (const oldPath of [
    oldMedia?.originalPath,
    oldMedia?.normalizedVideoPath,
    oldMedia?.normalizedAudioPath,
    oldMedia?.posterPath
  ]) {
    if (oldPath && oldPath !== uploadedFile.path) {
      fs.rmSync(oldPath, { force: true });
    }
  }

  return getInboxItem(inboxItemId);
}
