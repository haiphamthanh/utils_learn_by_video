import crypto from "node:crypto";

import { getDatabase } from "../db/database.js";

const MAX_TAGS_PER_LESSON = 6;

export function tagSlug(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function normalizeTagNames(values) {
  const source = Array.isArray(values)
    ? values
    : String(values || "").split(",");
  const unique = new Map();

  for (const value of source) {
    const name = String(value || "").replace(/\s+/g, " ").trim().slice(0, 40);
    const slug = tagSlug(name);
    if (!name || !slug || unique.has(slug)) continue;
    unique.set(slug, name);
    if (unique.size >= MAX_TAGS_PER_LESSON) break;
  }

  return [...unique.values()];
}

function tagId(slug) {
  const hash = crypto.createHash("sha1").update(slug).digest("hex").slice(0, 20);
  return `tag_${hash}`;
}

function ensureLegacyTopicTags(db) {
  const rows = db.prepare(`
    SELECT id AS lessonId, topic
    FROM lessons
    WHERE topic IS NOT NULL AND TRIM(topic) != ''
      AND NOT EXISTS (
        SELECT 1 FROM lesson_tags lt WHERE lt.lesson_id = lessons.id
      )
  `).all();
  if (!rows.length) return;

  const timestamp = new Date().toISOString();
  const insertTag = db.prepare(`
    INSERT INTO tags (id, name, slug, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET updated_at = excluded.updated_at
  `);
  const findTag = db.prepare("SELECT id FROM tags WHERE slug = ?");
  const insertLink = db.prepare(`
    INSERT OR IGNORE INTO lesson_tags (lesson_id, tag_id, created_at)
    VALUES (?, ?, ?)
  `);

  const backfill = db.transaction(() => {
    for (const row of rows) {
      const name = normalizeTagNames([row.topic])[0];
      const slug = tagSlug(name);
      if (!name || !slug) continue;
      insertTag.run(tagId(slug), name, slug, timestamp, timestamp);
      const tag = findTag.get(slug);
      if (tag) insertLink.run(row.lessonId, tag.id, timestamp);
    }
  });
  backfill();
}

export function listLessonTags(lessonId, db = getDatabase()) {
  ensureLegacyTopicTags(db);
  return db.prepare(`
    SELECT t.id, t.name, t.slug
    FROM tags t
    JOIN lesson_tags lt ON lt.tag_id = t.id
    WHERE lt.lesson_id = ?
    ORDER BY t.name COLLATE NOCASE
  `).all(lessonId);
}

export function listNoteTags(noteId, db = getDatabase()) {
  return db.prepare(`
    SELECT t.id, t.name, t.slug
    FROM tags t
    JOIN note_tags nt ON nt.tag_id = t.id
    WHERE nt.note_id = ?
    ORDER BY t.name COLLATE NOCASE
  `).all(noteId);
}

export function replaceLessonTags(lessonId, values, db = getDatabase(), timestamp = new Date().toISOString()) {
  const names = normalizeTagNames(values);
  const insertTag = db.prepare(`
    INSERT INTO tags (id, name, slug, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET updated_at = excluded.updated_at
  `);
  const findTag = db.prepare("SELECT id, name, slug FROM tags WHERE slug = ?");
  const insertLink = db.prepare(`
    INSERT INTO lesson_tags (lesson_id, tag_id, created_at)
    VALUES (?, ?, ?)
  `);

  db.prepare("DELETE FROM lesson_tags WHERE lesson_id = ?").run(lessonId);
  const tags = [];
  for (const name of names) {
    const slug = tagSlug(name);
    insertTag.run(tagId(slug), name, slug, timestamp, timestamp);
    const tag = findTag.get(slug);
    if (!tag) continue;
    insertLink.run(lessonId, tag.id, timestamp);
    tags.push(tag);
  }
  return tags;
}

export function replaceNoteTags(noteId, values, db = getDatabase(), timestamp = new Date().toISOString()) {
  const names = normalizeTagNames(values);
  const insertTag = db.prepare(`
    INSERT INTO tags (id, name, slug, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET updated_at = excluded.updated_at
  `);
  const findTag = db.prepare("SELECT id, name, slug FROM tags WHERE slug = ?");
  const insertLink = db.prepare(`
    INSERT INTO note_tags (note_id, tag_id, created_at)
    VALUES (?, ?, ?)
  `);

  db.prepare("DELETE FROM note_tags WHERE note_id = ?").run(noteId);
  const tags = [];
  for (const name of names) {
    const slug = tagSlug(name);
    insertTag.run(tagId(slug), name, slug, timestamp, timestamp);
    const tag = findTag.get(slug);
    if (!tag) continue;
    insertLink.run(noteId, tag.id, timestamp);
    tags.push(tag);
  }
  return tags;
}

function tagError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export function createTag(value, db = getDatabase()) {
  const name = normalizeTagNames([value])[0];
  const slug = tagSlug(name);
  if (!name || !slug) throw tagError("TAG_NAME_REQUIRED", "Tag name is required.", 400);
  const timestamp = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO tags (id, name, slug, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(tagId(slug), name, slug, timestamp, timestamp);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw tagError("TAG_ALREADY_EXISTS", "A tag with this name already exists.", 409);
    }
    throw error;
  }
  return db.prepare("SELECT id, name, slug FROM tags WHERE slug = ?").get(slug);
}

export function renameTag(tagIdValue, value, db = getDatabase()) {
  const name = normalizeTagNames([value])[0];
  const slug = tagSlug(name);
  if (!name || !slug) throw tagError("TAG_NAME_REQUIRED", "Tag name is required.", 400);
  if (!db.prepare("SELECT id FROM tags WHERE id = ?").get(tagIdValue)) {
    throw tagError("TAG_NOT_FOUND", "Tag not found.", 404);
  }
  try {
    db.prepare("UPDATE tags SET name = ?, slug = ?, updated_at = ? WHERE id = ?")
      .run(name, slug, new Date().toISOString(), tagIdValue);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw tagError("TAG_ALREADY_EXISTS", "A tag with this name already exists.", 409);
    }
    throw error;
  }
  return db.prepare("SELECT id, name, slug FROM tags WHERE id = ?").get(tagIdValue);
}

export function deleteTag(tagIdValue, db = getDatabase()) {
  const existing = db.prepare("SELECT id, name FROM tags WHERE id = ?").get(tagIdValue);
  if (!existing) throw tagError("TAG_NOT_FOUND", "Tag not found.", 404);
  db.transaction(() => {
    db.prepare("DELETE FROM lesson_tags WHERE tag_id = ?").run(tagIdValue);
    db.prepare("DELETE FROM note_tags WHERE tag_id = ?").run(tagIdValue);
    db.prepare("DELETE FROM tags WHERE id = ?").run(tagIdValue);
  })();
  return { ...existing, deleted: true };
}

export function listTags(db = getDatabase()) {
  ensureLegacyTopicTags(db);
  return db.prepare(`
    SELECT
      t.id,
      t.name,
      t.slug,
      COUNT(DISTINCT l.inbox_item_id) AS lessonCount,
      COUNT(DISTINCT nt.note_id) AS noteCount
    FROM tags t
    LEFT JOIN lesson_tags lt ON lt.tag_id = t.id
    LEFT JOIN lessons l ON l.id = lt.lesson_id
      AND l.id = (
        SELECT l2.id FROM lessons l2
        WHERE l2.inbox_item_id = l.inbox_item_id
        ORDER BY l2.created_at DESC LIMIT 1
      )
    LEFT JOIN note_tags nt ON nt.tag_id = t.id
    GROUP BY t.id, t.name, t.slug
    ORDER BY (lessonCount + noteCount) DESC, t.name COLLATE NOCASE
  `).all().map((tag) => ({
    ...tag,
    lessonCount: Number(tag.lessonCount || 0),
    noteCount: Number(tag.noteCount || 0)
  }));
}
