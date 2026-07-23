#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "Enjoy Journal extension smoke test"

echo "Checking manifest..."
node --input-type=module <<'NODE'
import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"));
const requiredPermissions = new Set(["activeTab", "scripting", "storage"]);
const requiredHosts = new Set(["http://localhost/*", "http://127.0.0.1/*"]);

if (manifest.manifest_version !== 3) throw new Error("Manifest V3 is required.");
if (!manifest.background?.service_worker) throw new Error("Service worker is missing.");
if (!manifest.action?.default_popup) throw new Error("Popup is missing.");

for (const permission of requiredPermissions) {
  if (!manifest.permissions?.includes(permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}

for (const host of requiredHosts) {
  if (!manifest.host_permissions?.includes(host)) {
    throw new Error(`Missing host permission: ${host}`);
  }
}

console.log("✓ Manifest V3 contract");
NODE

echo "Checking extension JavaScript..."
node --check extension/service-worker.js
node --check extension/popup.js
node --check extension/source-utils.js
node --check extension/content-providers.js
node --check extension/floating-save.js

echo "Checking source detection and URL cleanup..."
node --input-type=module <<'NODE'
import {
  cleanSourceTitle,
  chooseSourceUrl,
  detectSource,
  normalizeSourceUrl
} from "./extension/source-utils.js";

const facebook = normalizeSourceUrl(
  "https://www.facebook.com/reel/1681107386272978/?fbclid=tracking&utm_source=test#comment"
);
if (facebook !== "https://www.facebook.com/reel/1681107386272978") {
  throw new Error(`Unexpected Facebook URL: ${facebook}`);
}
if (detectSource(facebook).type !== "facebook-reel") {
  throw new Error("Facebook Reel detection failed.");
}
if (cleanSourceTitle("Facebook reel Facebook", facebook) !== "Facebook Reel 1681107386272978") {
  throw new Error("Generic Facebook title cleanup failed.");
}

const youtube = normalizeSourceUrl(
  "https://www.youtube.com/shorts/abc123?si=tracking"
);
if (youtube !== "https://www.youtube.com/shorts/abc123") {
  throw new Error(`Unexpected YouTube URL: ${youtube}`);
}
if (detectSource(youtube).type !== "youtube-short") {
  throw new Error("YouTube Short detection failed.");
}

const chosen = chooseSourceUrl(
  "https://www.facebook.com/reel/123/?fbclid=x",
  "https://www.facebook.com/some-generic-canonical"
);
if (chosen !== "https://www.facebook.com/reel/123") {
  throw new Error("Current recognized short URL should win over canonical URL.");
}

console.log("✓ Source detection contract");
NODE

echo "Checking popup files and icons..."
for file in \
  extension/popup.html \
  extension/popup.css \
  extension/content-providers.js \
  extension/floating-save.js \
  extension/icons/icon-16.png \
  extension/icons/icon-32.png \
  extension/icons/icon-48.png \
  extension/icons/icon-128.png; do
  test -s "$file"
done

echo "Checking local-only API safety..."
grep -q 'localhost' extension/service-worker.js
grep -q '127.0.0.1' extension/service-worker.js
grep -q 'API_URL_NOT_LOCAL' extension/service-worker.js
grep -q '"/api/inbox"' extension/service-worker.js
grep -q '"GET_SAVE_AVAILABILITY"' extension/service-worker.js
grep -q 'AUTOMATIC_PIPELINE_BUSY' app/services/automation.service.js

echo "Checking Inbox deep link support..."
grep -q 'URLSearchParams' public/js/app.js
grep -q 'supportedPages' public/js/app.js
grep -q '"inbox"' public/js/app.js
grep -q 'id="inbox-page"' public/index.html

echo "Checking explicit language selection..."
grep -q 'id="source-language"' extension/popup.html
grep -q 'data-ej-language' extension/floating-save.js
grep -q 'language: capture.language' extension/service-worker.js
grep -q 'SOURCE_LANGUAGE_INVALID' extension/service-worker.js

echo "✓ Extension smoke test passed."
