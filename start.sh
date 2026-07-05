#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

refresh_homebrew_path() {
  if command -v brew >/dev/null 2>&1; then
    return 0
  fi

  for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew /home/linuxbrew/.linuxbrew/bin/brew; do
    if [ -x "$candidate" ]; then
      eval "$("$candidate" shellenv)"
      return 0
    fi
  done
}

run_yarn() {
  if command -v yarn >/dev/null 2>&1; then
    yarn "$@"
    return
  fi

  if command -v yarnpkg >/dev/null 2>&1; then
    yarnpkg "$@"
    return
  fi

  if command -v corepack >/dev/null 2>&1; then
    corepack yarn "$@"
    return
  fi

  echo "Yarn is required but yarn, yarnpkg and Corepack are unavailable."
  echo "Run: ./scripts/install-system-deps.sh --yes"
  exit 1
}

echo "Starting Enjoy Journal"
echo

refresh_homebrew_path

# Install missing system tools before checking the runtime. This includes
# FFmpeg/FFprobe and, when necessary, Node.js, Python and Yarn support.
bash ./scripts/install-system-deps.sh --yes
refresh_homebrew_path

for command_name in node python3 ffmpeg ffprobe; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command after automatic setup: $command_name"
    echo "Run: ./scripts/doctor.sh"
    exit 1
  fi
done

node scripts/check-runtime.js

echo
echo "Preparing Python transcription environment..."
bash ./scripts/setup-python.sh

mkdir -p data/inbox/uploads data/lessons data/temp node_modules

PACKAGE_HASH="$(node --input-type=module <<'NODE'
import crypto from "node:crypto";
import fs from "node:fs";

const hash = crypto.createHash("sha256");
for (const file of ["package.json", "yarn.lock"]) {
  if (fs.existsSync(file)) hash.update(fs.readFileSync(file));
}
console.log(hash.digest("hex"));
NODE
)"

RUNTIME_FINGERPRINT="$(node -p "process.platform + '-' + process.arch + '-abi-' + process.versions.modules")-${PACKAGE_HASH}"
STAMP_FILE="node_modules/.enjoy-journal-runtime"
CURRENT_STAMP=""

if [ -f "$STAMP_FILE" ]; then
  CURRENT_STAMP="$(cat "$STAMP_FILE")"
fi

if [ ! -d node_modules/better-sqlite3 ] || [ "$CURRENT_STAMP" != "$RUNTIME_FINGERPRINT" ]; then
  echo
  echo "Installing dependencies for the current Node.js runtime..."

  if [ -d node_modules/better-sqlite3 ]; then
    echo "Runtime or dependency fingerprint changed; rebuilding native packages."
    run_yarn install --force
  else
    run_yarn install
  fi

  printf "%s" "$RUNTIME_FINGERPRINT" > "$STAMP_FILE"
fi

if ! node --input-type=module <<'NODE'
import Database from "better-sqlite3";
const db = new Database(":memory:");
db.prepare("SELECT 1").get();
db.close();
NODE
then
  echo
  echo "The SQLite native binding does not match the current Node.js runtime."
  echo "Attempting automatic repair..."
  bash ./scripts/repair-native-deps.sh --yes
  printf "%s" "$RUNTIME_FINGERPRINT" > "$STAMP_FILE"
fi

echo
echo "Initializing database..."
run_yarn migrate

echo
echo "Open http://localhost:${PORT:-3000}"
echo

run_yarn start
