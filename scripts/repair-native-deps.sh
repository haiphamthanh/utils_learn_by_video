#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

ASSUME_YES=0
if [ "${1:-}" = "--yes" ] || [ "${1:-}" = "-y" ]; then
  ASSUME_YES=1
fi

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
  exit 1
}

echo "Repairing native Node.js dependencies"
echo

node scripts/check-runtime.js

echo
if [ "$ASSUME_YES" -eq 1 ]; then
  bash ./scripts/install-system-deps.sh --yes --build-tools
else
  bash ./scripts/install-system-deps.sh --build-tools
fi

echo
printf "Removing stale better-sqlite3 native binding...\n"
rm -rf node_modules/better-sqlite3

printf "Reinstalling dependencies for the current Node.js ABI...\n"
run_yarn install --force

printf "Verifying SQLite binding...\n"
node --input-type=module <<'NODE'
import Database from "better-sqlite3";

const db = new Database(":memory:");
const result = db.prepare("SELECT 1 AS ok").get();
db.close();

if (result.ok !== 1) {
  throw new Error("SQLite verification returned an unexpected result.");
}

console.log("✓ better-sqlite3 native binding loaded successfully.");
NODE

echo
echo "Repair complete."
