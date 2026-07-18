import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { config, toRelativeDataPath, toAbsoluteDataPath } from "../config.js";

import { getDatabase } from "../db/database.js";
import { buildSlug, recordTombstone } from "./share.service.js";

const ALLOWED_SOURCE_TYPES = new Set([
  "facebook-reel",
  "youtube-short",
  "local-file",
  "uploaded-file",
  "other-url"
]);
const ALLOWED_SOURCE_LANGUAGES = new Set(["en", "ja", "zh"]);

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

  const sourceLanguage = String(
    payload.language || config.transcriptionLanguage || "en"
  ).trim().toLowerCase();
  if (!ALLOWED_SOURCE_LANGUAGES.has(sourceLanguage)) {
    throw badRequest(
      "SOURCE_LANGUAGE_INVALID",
      "Language must be one of: en, ja, zh."
    );
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
        id, source_id, status, source_language, personal_note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      inboxId,
      sourceId,
      "WAITING_MEDIA",
      sourceLanguage,
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
      i.source_language AS sourceLanguage,
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
      aj.stage AS acquisitionStage,
      aj.progress AS acquisitionProgress,
      pj.stage AS processingStage,
      pj.progress AS processingProgress,
      tj.stage AS transcriptionStage,
      tj.progress AS transcriptionProgress,
      lj.stage AS lessonStage,
      lj.progress AS lessonProgress,
      t.id AS transcriptId,
      t.raw_text AS transcriptText,
      t.language AS transcriptLanguage,
      t.provider AS transcriptProvider,
      t.model AS transcriptModel,
      l.id AS lessonId,
      l.title AS lessonTitle,
      l.summary_vi AS lessonSummaryVi,
      l.topic AS lessonTopic,
      l.difficulty AS lessonDifficulty,
      l.provider AS lessonProvider,
      l.model AS lessonModel,
      (
        SELECT COUNT(*)
        FROM transcript_segments ts
        WHERE ts.transcript_id = t.id
      ) AS transcriptSegmentCount
    FROM inbox_items i
    LEFT JOIN sources s ON s.id = i.source_id
    LEFT JOIN media_assets m ON m.inbox_item_id = i.id
    LEFT JOIN source_acquisition_jobs aj ON aj.id = (
      SELECT id
      FROM source_acquisition_jobs
      WHERE inbox_item_id = i.id
      ORDER BY started_at DESC
      LIMIT 1
    )
    LEFT JOIN processing_jobs pj ON pj.id = (
      SELECT id
      FROM processing_jobs
      WHERE inbox_item_id = i.id
      ORDER BY started_at DESC
      LIMIT 1
    )
    LEFT JOIN transcription_jobs tj ON tj.id = (
      SELECT id
      FROM transcription_jobs
      WHERE inbox_item_id = i.id
      ORDER BY started_at DESC
      LIMIT 1
    )
    LEFT JOIN transcripts t ON t.id = (
      SELECT id
      FROM transcripts
      WHERE media_asset_id = m.id
      ORDER BY created_at DESC
      LIMIT 1
    )
    LEFT JOIN lesson_generation_jobs lj ON lj.id = (
      SELECT id
      FROM lesson_generation_jobs
      WHERE inbox_item_id = i.id
      ORDER BY started_at DESC
      LIMIT 1
    )
    LEFT JOIN lessons l ON l.id = (
      SELECT id
      FROM lessons
      WHERE inbox_item_id = i.id
      ORDER BY created_at DESC
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
  const item = listInboxItems().find((entry) => entry.id === id);
  if (!item) throw notFound();
  return item;
}

export function attachMedia(inboxItemId, uploadedFile) {
  const db = getDatabase();
  const existing = db.prepare("SELECT id, status FROM inbox_items WHERE id = ?").get(inboxItemId);

  if (!existing) {
    fs.rmSync(uploadedFile.path, { force: true });
    throw notFound();
  }

  if (["PROCESSING", "TRANSCRIBING", "LESSON_GENERATING"].includes(existing.status)) {
    fs.rmSync(uploadedFile.path, { force: true });
    throw badRequest("MEDIA_LOCKED", "Media cannot be replaced while processing.");
  }

  const oldMedia = db.prepare(`
    SELECT
      id,
      original_path AS originalPath,
      normalized_video_path AS normalizedVideoPath,
      normalized_audio_path AS normalizedAudioPath,
      poster_path AS posterPath
    FROM media_assets
    WHERE inbox_item_id = ?
  `).get(inboxItemId);

  const mediaAssetId = makeId("media");
  const createdAt = nowIso();

  const transaction = db.transaction(() => {
    const lessonIds = db.prepare("SELECT id FROM lessons WHERE inbox_item_id = ?")
      .all(inboxItemId)
      .map((row) => row.id);

    for (const lessonId of lessonIds) {
      db.prepare("DELETE FROM journal_entries WHERE lesson_id = ?").run(lessonId);
      db.prepare("DELETE FROM lesson_notes WHERE lesson_id = ?").run(lessonId);
      db.prepare("DELETE FROM learning_progress WHERE lesson_id = ?").run(lessonId);
      db.prepare("DELETE FROM lesson_tags WHERE lesson_id = ?").run(lessonId);
    }

    db.prepare("DELETE FROM lesson_generation_jobs WHERE inbox_item_id = ?").run(inboxItemId);
    db.prepare("DELETE FROM lessons WHERE inbox_item_id = ?").run(inboxItemId);
    db.prepare("DELETE FROM transcription_jobs WHERE inbox_item_id = ?").run(inboxItemId);

    if (oldMedia?.id) {
      const transcriptIds = db.prepare("SELECT id FROM transcripts WHERE media_asset_id = ?")
        .all(oldMedia.id)
        .map((row) => row.id);

      for (const transcriptId of transcriptIds) {
        db.prepare("DELETE FROM transcript_segments WHERE transcript_id = ?").run(transcriptId);
      }

      db.prepare("DELETE FROM transcripts WHERE media_asset_id = ?").run(oldMedia.id);
    }

    db.prepare("DELETE FROM processing_jobs WHERE inbox_item_id = ?").run(inboxItemId);
    db.prepare("DELETE FROM media_assets WHERE inbox_item_id = ?").run(inboxItemId);

    db.prepare(`
      INSERT INTO media_assets (
        id, inbox_item_id, original_filename, media_type, original_path, size_bytes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      mediaAssetId,
      inboxItemId,
      uploadedFile.originalname,
      uploadedFile.mimetype,
      toRelativeDataPath(uploadedFile.path),
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
    const resolvedPath = toAbsoluteDataPath(oldPath);
    if (resolvedPath && resolvedPath !== uploadedFile.path) {
      fs.rmSync(resolvedPath, { force: true });
    }
  }

  return getInboxItem(inboxItemId);
}


export function deleteInboxItem(inboxItemId) {
  const db = getDatabase();
  const target = db.prepare(`
    SELECT
      i.id,
      i.source_id AS sourceId,
      i.status,
      m.id AS mediaAssetId,
      m.original_path AS originalPath
    FROM inbox_items i
    LEFT JOIN media_assets m ON m.inbox_item_id = i.id
    WHERE i.id = ?
  `).get(inboxItemId);

  if (!target) {
    throw notFound();
  }

  const activeStatuses = new Set([
    "ACQUIRING_MEDIA",
    "PROCESSING",
    "TRANSCRIBING",
    "LESSON_GENERATING"
  ]);

  if (activeStatuses.has(target.status)) {
    throw badRequest(
      "SOURCE_DELETE_LOCKED",
      "This source is still being analyzed. Wait for the current step to finish, then delete it."
    );
  }

  const lessonsToDelete = db.prepare(`
    SELECT l.id AS lessonId, l.title, s.url AS sourceUrl
    FROM lessons l
    JOIN inbox_items i ON i.id = l.inbox_item_id
    LEFT JOIN sources s ON s.id = i.source_id
    WHERE l.inbox_item_id = ?
  `).all(inboxItemId);

  const lessonIds = lessonsToDelete.map((row) => row.lessonId);

  const tombstoneEntries = lessonsToDelete
    .map((row) => ({
      slug: buildSlug({ title: row.title, sourceUrl: row.sourceUrl }),
      title: row.title,
      sourceUrl: row.sourceUrl
    }))
    .filter((entry, index, self) =>
      entry.slug && self.findIndex((other) => other.slug === entry.slug) === index
    );

  const transcriptIds = target.mediaAssetId
    ? db.prepare("SELECT id FROM transcripts WHERE media_asset_id = ?")
        .all(target.mediaAssetId)
        .map((row) => row.id)
    : [];

  const transaction = db.transaction(() => {
    for (const entry of tombstoneEntries) {
      recordTombstone({ slug: entry.slug, title: entry.title, sourceUrl: entry.sourceUrl });
    }

    for (const lessonId of lessonIds) {
      db.prepare("DELETE FROM journal_entries WHERE lesson_id = ?").run(lessonId);
      db.prepare("DELETE FROM lesson_notes WHERE lesson_id = ?").run(lessonId);
      db.prepare("DELETE FROM learning_progress WHERE lesson_id = ?").run(lessonId);
      db.prepare("DELETE FROM lesson_tags WHERE lesson_id = ?").run(lessonId);
    }

    db.prepare("DELETE FROM lesson_generation_jobs WHERE inbox_item_id = ?").run(inboxItemId);
    db.prepare("DELETE FROM lessons WHERE inbox_item_id = ?").run(inboxItemId);
    db.prepare("DELETE FROM transcription_jobs WHERE inbox_item_id = ?").run(inboxItemId);

    for (const transcriptId of transcriptIds) {
      db.prepare("DELETE FROM transcript_segments WHERE transcript_id = ?").run(transcriptId);
    }

    if (target.mediaAssetId) {
      db.prepare("DELETE FROM transcripts WHERE media_asset_id = ?").run(target.mediaAssetId);
    }

    db.prepare("DELETE FROM processing_jobs WHERE inbox_item_id = ?").run(inboxItemId);
    db.prepare("DELETE FROM source_acquisition_jobs WHERE inbox_item_id = ?").run(inboxItemId);
    db.prepare("DELETE FROM media_assets WHERE inbox_item_id = ?").run(inboxItemId);
    db.prepare("DELETE FROM inbox_items WHERE id = ?").run(inboxItemId);

    if (target.sourceId) {
      const remainingReferences = db.prepare(
        "SELECT COUNT(*) AS count FROM inbox_items WHERE source_id = ?"
      ).get(target.sourceId).count;

      if (remainingReferences === 0) {
        db.prepare("DELETE FROM sources WHERE id = ?").run(target.sourceId);
      }
    }
  });

  transaction();

  if (target.originalPath) {
    fs.rmSync(toAbsoluteDataPath(target.originalPath), { force: true });
  }

  fs.rmSync(path.join(config.dataDir, "inbox", inboxItemId), {
    recursive: true,
    force: true
  });

  return {
    id: inboxItemId,
    sourceId: target.sourceId,
    deleted: true
  };
}
