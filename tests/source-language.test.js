import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "enjoy-language-test-"));
process.env.DATA_DIR = path.join(tempRoot, "data");

const { createInboxItem } = await import("../app/services/inbox.service.js");
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
