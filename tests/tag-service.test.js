import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "enjoy-tag-test-"));
process.env.DATA_DIR = path.join(tempRoot, "data");

const {
  createTag,
  renameTag,
  replaceLessonTags,
} = await import("../app/services/tag.service.js");
const { getDatabase } = await import("../app/db/database.js");

after(() => {
  getDatabase().close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("can recreate a tag slug after the original tag is renamed", () => {
  const db = getDatabase();
  const timestamp = new Date().toISOString();
  db.prepare(`
    INSERT INTO sources (id, type, url, captured_at, created_at)
    VALUES ('source_tag_test', 'other-url', 'https://example.com/tag-test', ?, ?)
  `).run(timestamp, timestamp);
  db.prepare(`
    INSERT INTO inbox_items (id, source_id, status, created_at, updated_at)
    VALUES ('inbox_tag_test', 'source_tag_test', 'LESSON_READY', ?, ?)
  `).run(timestamp, timestamp);
  db.prepare(`
    INSERT INTO media_assets (
      id, inbox_item_id, media_type, original_path, created_at
    ) VALUES ('media_tag_test', 'inbox_tag_test', 'video/mp4', 'tag-test.mp4', ?)
  `).run(timestamp);
  db.prepare(`
    INSERT INTO transcripts (
      id, media_asset_id, raw_text, provider, model, status, raw_json_path,
      created_at, updated_at
    ) VALUES (
      'transcript_tag_test', 'media_tag_test', 'test', 'test', 'test', 'RAW',
      'tag-test.json', ?, ?
    )
  `).run(timestamp, timestamp);
  db.prepare(`
    INSERT INTO lessons (
      id, inbox_item_id, transcript_id, title, provider, model, status,
      lesson_json_path, created_at, updated_at
    ) VALUES (
      'lesson_tag_test', 'inbox_tag_test', 'transcript_tag_test', 'Tag test',
      'test', 'test', 'READY', 'tag-test.json', ?, ?
    )
  `).run(timestamp, timestamp);

  const original = createTag("personal-learning");
  const renamed = renameTag(original.id, "japanese");
  const [recreated] = replaceLessonTags(
    "lesson_tag_test",
    ["personal-learning"],
  );

  assert.equal(renamed.id, original.id);
  assert.equal(renamed.slug, "japanese");
  assert.equal(recreated.slug, "personal-learning");
  assert.notEqual(recreated.id, original.id);
});
