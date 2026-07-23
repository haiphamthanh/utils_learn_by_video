import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "enjoy-language-test-"));
process.env.DATA_DIR = path.join(tempRoot, "data");

const {
  createInboxItem,
  inboxIdFromSourceUrl,
} = await import("../app/services/inbox.service.js");
const { assertAutomaticPipelineAvailable } = await import("../app/services/automation.service.js");
const { getDatabase } = await import("../app/db/database.js");

after(() => {
  getDatabase().close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function source(index) {
  return {
    type: "other-url",
    url: `https://example.com/video-${index}`,
  };
}

test("stores the explicitly selected source language per inbox item", () => {
  for (const [index, language] of ["en", "ja", "zh"].entries()) {
    const item = createInboxItem({ source: source(index), language });
    assert.equal(item.sourceLanguage, language);
  }
});

test("rejects unsupported or automatic language values", () => {
  for (const language of ["auto", "fr"]) {
    assert.throws(
      () => createInboxItem({ source: source(language), language }),
      (error) => error.code === "SOURCE_LANGUAGE_INVALID",
    );
  }
});

test("blocks a new automatic save while another video is processing", () => {
  const item = createInboxItem({ source: source("busy"), language: "en" });
  getDatabase().prepare(
    "UPDATE inbox_items SET status = 'PROCESSING' WHERE id = ?",
  ).run(item.id);

  assert.throws(
    () => assertAutomaticPipelineAvailable(),
    (error) =>
      error.code === "AUTOMATIC_PIPELINE_BUSY" &&
      error.status === 409,
  );

  getDatabase().prepare(
    "UPDATE inbox_items SET status = 'FAILED' WHERE id = ?",
  ).run(item.id);
  assert.doesNotThrow(() => assertAutomaticPipelineAvailable());
});

test("uses the Facebook Reel URL identifier as the inbox item id", () => {
  const reelUrl = "https://www.facebook.com/reel/1481114549911736";
  assert.equal(
    inboxIdFromSourceUrl("facebook-reel", reelUrl),
    "1481114549911736",
  );

  const item = createInboxItem({
    source: {
      type: "facebook-reel",
      url: reelUrl,
      platform: "facebook",
    },
    language: "en",
  });

  assert.equal(item.id, "1481114549911736");
  assert.equal(
    getDatabase().prepare(
      "SELECT source_id AS sourceId FROM inbox_items WHERE id = ?",
    ).get(item.id).sourceId,
    "source_1481114549911736",
  );
});

test("rejects saving the same Facebook Reel twice", () => {
  assert.throws(
    () => createInboxItem({
      source: {
        type: "facebook-reel",
        url: "https://www.facebook.com/reel/1481114549911736",
      },
      language: "en",
    }),
    (error) =>
      error.code === "SOURCE_ALREADY_SAVED" &&
      error.status === 409 &&
      error.message === "Video đã có rồi.",
  );
});
