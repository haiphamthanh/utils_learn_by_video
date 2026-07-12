import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { config } from "../config.js";
import { getDatabase } from "../db/database.js";

const SHARE_FORMAT = "enjoy-journal-share";
const SHARE_VERSION = 1;
const MAX_SLUG_LENGTH = 96;

export function shareError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function foldToAscii(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d");
}

function slugifyPiece(value) {
  return foldToAscii(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
}

export function buildSlug({ title, sourceUrl } = {}) {
  const titlePart = slugifyPiece(title);
  const urlPart = slugifyPiece(sourceUrl);
  const core = [titlePart, urlPart].filter(Boolean).join("--");
  if (core) return core;
  return `lesson-${crypto.createHash("sha1").update(`${title}|${sourceUrl}`).digest("hex").slice(0, 12)}`;
}

export function getRegistryEntry(slug) {
  const db = getDatabase();
  return db.prepare(`
    SELECT
      slug,
      title,
      source_url AS sourceUrl,
      inbox_item_id AS inboxItemId,
      lesson_id AS lessonId,
      deleted,
      imported_at AS importedAt,
      last_exported_at AS lastExportedAt,
      updated_at AS updatedAt
    FROM share_registry
    WHERE slug = ?
  `).get(slug) || null;
}

export function listShareRegistry({ status = "" } = {}) {
  const db = getDatabase();
  const params = [];
  let sql = `
    SELECT
      slug,
      title,
      source_url AS sourceUrl,
      inbox_item_id AS inboxItemId,
      lesson_id AS lessonId,
      COALESCE(deleted, 0) AS deleted,
      imported_at AS importedAt,
      last_exported_at AS lastExportedAt,
      updated_at AS updatedAt
    FROM share_registry
  `;

  if (status === "deleted") {
    sql += " WHERE deleted = 1";
  } else if (status === "available") {
    sql += " WHERE deleted = 0 AND inbox_item_id IS NOT NULL";
  } else if (status === "missing") {
    sql += " WHERE deleted = 0 AND inbox_item_id IS NULL";
  }

  sql += " ORDER BY updatedAt DESC";
  return db.prepare(sql).all(...params).map((row) => ({
    ...row,
    deleted: Number(row.deleted) === 1
  }));
}

export function upsertRegistryEntry({ slug, title, sourceUrl, inboxItemId, lessonId, deleted = false, lastExportedAt = undefined }) {
  const db = getDatabase();
  const timestamp = nowIso();
  const existing = db.prepare("SELECT slug FROM share_registry WHERE slug = ?").get(slug);

  if (existing) {
    const setClauses = [];
    const values = [];

    if (title !== undefined) { setClauses.push("title = ?"); values.push(title ?? null); }
    if (sourceUrl !== undefined) { setClauses.push("source_url = ?"); values.push(sourceUrl ?? null); }
    if (inboxItemId !== undefined) { setClauses.push("inbox_item_id = ?"); values.push(inboxItemId ?? null); }
    if (lessonId !== undefined) { setClauses.push("lesson_id = ?"); values.push(lessonId ?? null); }
    if (lastExportedAt !== undefined) { setClauses.push("last_exported_at = ?"); values.push(lastExportedAt ?? null); }
    setClauses.push("deleted = ?"); values.push(deleted ? 1 : 0);
    setClauses.push("updated_at = ?"); values.push(timestamp);
    values.push(slug);

    db.prepare(`UPDATE share_registry SET ${setClauses.join(", ")} WHERE slug = ?`).run(...values);
    return;
  }

  db.prepare(`
    INSERT INTO share_registry (
      slug, title, source_url, inbox_item_id, lesson_id, deleted,
      imported_at, last_exported_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    slug,
    title ?? null,
    sourceUrl ?? null,
    inboxItemId ?? null,
    lessonId ?? null,
    deleted ? 1 : 0,
    timestamp,
    lastExportedAt ?? null,
    timestamp
  );
}

export function recordTombstone({ slug, title = null, sourceUrl = null }) {
  const db = getDatabase();
  const existing = getRegistryEntry(slug);

  if (existing) {
    const timestamp = nowIso();
    db.prepare(`
      UPDATE share_registry
      SET deleted = 1, inbox_item_id = NULL, lesson_id = NULL, updated_at = ?
      WHERE slug = ?
    `).run(timestamp, slug);
    return existing;
  }

  upsertRegistryEntry({ slug, title, sourceUrl, deleted: true });
  return getRegistryEntry(slug);
}

export function restoreTombstone(slug) {
  const entry = getRegistryEntry(slug);
  if (!entry || !entry.deleted) {
    throw shareError("SHARE_TOMBSTONE_NOT_FOUND", "Tombstone not found.", 404);
  }

  const timestamp = nowIso();
  const db = getDatabase();
  db.prepare(`
    UPDATE share_registry
    SET deleted = 0, updated_at = ?
    WHERE slug = ?
  `).run(timestamp, slug);

  return getRegistryEntry(slug);
}

export function listExportableShareLessons() {
  const db = getDatabase();
  return db.prepare(`
    SELECT
      l.id,
      l.title,
      l.summary_vi AS summaryVi,
      l.topic,
      l.difficulty,
      l.provider,
      l.model,
      l.lesson_json_path AS lessonJsonPath,
      l.transcript_id AS transcriptId,
      l.inbox_item_id AS inboxItemId,
      l.created_at AS createdAt,
      s.type AS sourceType,
      s.url AS sourceUrl,
      s.title AS sourceTitle,
      s.author AS sourceAuthor,
      s.platform AS sourcePlatform,
      s.captured_at AS sourceCapturedAt,
      i.personal_note AS personalNote,
      m.id AS mediaAssetId,
      m.normalized_video_path AS videoPath,
      m.normalized_audio_path AS audioPath,
      m.poster_path AS posterPath,
      m.duration_ms AS durationMs,
      COALESCE(lp.learning_status, 'NEW') AS learningStatus,
      lp.view_count AS viewCount,
      lp.listen_count AS listenCount,
      lp.shadow_count AS shadowCount,
      lp.last_opened_at AS lastOpenedAt,
      lp.last_completed_at AS lastCompletedAt
    FROM lessons l
    JOIN inbox_items i ON i.id = l.inbox_item_id
    LEFT JOIN sources s ON s.id = i.source_id
    LEFT JOIN media_assets m ON m.inbox_item_id = i.id
    LEFT JOIN learning_progress lp ON lp.lesson_id = l.id
    WHERE l.id = (
      SELECT l2.id
      FROM lessons l2
      WHERE l2.inbox_item_id = l.inbox_item_id
      ORDER BY l2.created_at DESC
      LIMIT 1
    )
    ORDER BY l.created_at DESC
  `).all();
}

export function listExportableLessonsWithStatus() {
  const lessons = listExportableShareLessons();
  return lessons.map((lesson) => {
    const slug = buildSlug({ title: lesson.title, sourceUrl: lesson.sourceUrl });
    const registry = getRegistryEntry(slug);
    return {
      lessonId: lesson.id,
      title: lesson.title,
      slug,
      sourceUrl: lesson.sourceUrl || null,
      sourceTitle: lesson.sourceTitle,
      durationMs: lesson.durationMs,
      difficulty: lesson.difficulty,
      learningStatus: lesson.learningStatus,
      alreadyExported: Boolean(registry?.lastExportedAt),
      lastExportedAt: registry?.lastExportedAt || null
    };
  });
}

export async function rebuildLastExportedMarks() {
  const { default: AdmZip } = await import("adm-zip");
  const exportDir = path.join(config.dataDir, "exports");
  const activeSlugs = new Set();

  if (fs.existsSync(exportDir)) {
    for (const filename of fs.readdirSync(exportDir)) {
      if (!filename.endsWith(".zip")) continue;
      try {
        const zip = new AdmZip(path.join(exportDir, filename));
        const manifestEntry = zip.getEntry("manifest.json");
        if (!manifestEntry) continue;
        const manifest = JSON.parse(manifestEntry.getData().toString("utf-8"));
        for (const lesson of manifest.lessons || []) {
          if (lesson.slug) activeSlugs.add(lesson.slug);
        }
      } catch {
        // corrupted or unreadable zip — skip
      }
    }
  }

  const db = getDatabase();
  const allSlugs = db.prepare("SELECT slug FROM share_registry").all().map((r) => r.slug);
  const now = nowIso();

  const transaction = db.transaction(() => {
    for (const slug of allSlugs) {
      if (activeSlugs.has(slug)) {
        db.prepare("UPDATE share_registry SET last_exported_at = ?, updated_at = ? WHERE slug = ? AND last_exported_at IS NULL")
          .run(now, now, slug);
      } else {
        db.prepare("UPDATE share_registry SET last_exported_at = NULL, updated_at = ? WHERE slug = ? AND last_exported_at IS NOT NULL")
          .run(now, slug);
      }
    }
  });

  transaction();
}

export function markLessonsAsExported(slugs) {
  if (!slugs || !slugs.length) return;
  const db = getDatabase();
  const timestamp = nowIso();
  const stmt = db.prepare(`
    UPDATE share_registry SET last_exported_at = ?, updated_at = ? WHERE slug = ?
  `);
  const transaction = db.transaction(() => {
    for (const slug of slugs) {
      stmt.run(timestamp, timestamp, slug);
    }
  });
  transaction();
}

export function backfillShareRegistryFromExisting() {
  const lessons = listExportableShareLessons();
  const now = nowIso();
  const db = getDatabase();

  const transaction = db.transaction(() => {
    for (const lesson of lessons) {
      const slug = buildSlug({ title: lesson.title, sourceUrl: lesson.sourceUrl });
      const existing = db.prepare("SELECT slug FROM share_registry WHERE slug = ?").get(slug);
      if (existing) {
        db.prepare(`
          UPDATE share_registry SET inbox_item_id = ?, lesson_id = ?, updated_at = ? WHERE slug = ?
        `).run(lesson.inboxItemId, lesson.id, now, slug);
      } else {
        db.prepare(`
          INSERT INTO share_registry (slug, title, source_url, inbox_item_id, lesson_id, deleted, imported_at, last_exported_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?)
        `).run(slug, lesson.title, lesson.sourceUrl || null, lesson.inboxItemId, lesson.id, now, now);
      }
    }
  });

  transaction();
}

export function listExportedArtifacts() {
  const directory = path.join(config.dataDir, "exports");
  fs.mkdirSync(directory, { recursive: true });

  const entries = [];
  for (const filename of fs.readdirSync(directory)) {
    if (!filename.endsWith(".zip")) continue;
    const filePath = path.join(directory, filename);
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      entries.push({
        filename,
        path: filePath,
        size: stat.size,
        createdAt: stat.birthtime.toISOString()
      });
    } catch {
      continue;
    }
  }
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteExportedArtifact(filename) {
  const directory = path.join(config.dataDir, "exports");
  const safe = path.basename(filename);
  if (!safe.endsWith(".zip")) {
    throw shareError("SHARE_EXPORT_INVALID", "Only .zip exports can be removed.");
  }
  const filePath = path.join(directory, safe);
  if (!fs.existsSync(filePath)) {
    throw shareError("SHARE_EXPORT_NOT_FOUND", "Export file not found.", 404);
  }
  fs.rmSync(filePath, { force: true });
  return { filename: safe, deleted: true };
}

export const SHARE_MANIFEST = { format: SHARE_FORMAT, version: SHARE_VERSION };
