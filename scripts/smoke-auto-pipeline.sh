#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

DATA_DIR="$TMP_DIR/data" MEDIA_ACQUISITION_PROVIDER=mock node --input-type=module <<'NODE'
import fs from "node:fs";
import { acquireSourceMedia } from "./app/services/source-acquisition.service.js";

const events = [];
const result = await acquireSourceMedia({
  inboxItemId: "smoke-item",
  sourceUrl: "https://example.com/mock-video",
  onProgress(progress, stage) {
    events.push({ progress, stage });
  }
});

if (!fs.existsSync(result.path)) {
  throw new Error("Mock acquisition did not create a local media file.");
}

if (result.mimetype !== "video/mp4") {
  throw new Error(`Unexpected media type: ${result.mimetype}`);
}

if (!events.some((event) => event.stage === "FETCH_SOURCE")) {
  throw new Error("Acquisition progress contract is missing FETCH_SOURCE.");
}

if (!events.some((event) => event.stage === "COMPLETE" && event.progress === 100)) {
  throw new Error("Acquisition progress contract did not complete.");
}

console.log("Automatic URL acquisition smoke test passed.");
NODE

node --check app/services/source-acquisition.service.js
node --check app/services/automation.service.js
node --check public/js/app.js
node --check extension/service-worker.js

grep -q 'source_acquisition_jobs' app/db/schema.js
grep -q 'ACQUIRING_MEDIA' public/js/app.js
grep -q '/auto-process' app/routes/inbox.routes.js

echo "Automatic analysis contract smoke test passed."
