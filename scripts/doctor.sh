#!/usr/bin/env bash
set -u

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

FIX=0
if [ "${1:-}" = "--fix" ]; then
  FIX=1
  bash ./scripts/install-system-deps.sh --yes
  bash ./scripts/setup-python.sh
fi

failures=0

check_command() {
  local command_name="$1"
  local display_name="$2"

  if command -v "$command_name" >/dev/null 2>&1; then
    printf "✓ %s\n" "$display_name"
  else
    printf "✗ %s\n" "$display_name"
    failures=$((failures + 1))
  fi
}

echo "Enjoy Journal Doctor"
echo

check_command node "Node.js"
check_command python3 "Python 3"
check_command ffmpeg "FFmpeg"
check_command ffprobe "FFprobe"

if command -v yarn >/dev/null 2>&1; then
  printf "✓ Yarn %s\n" "$(yarn --version 2>/dev/null || echo unknown)"
elif command -v yarnpkg >/dev/null 2>&1; then
  printf "✓ Yarn %s (yarnpkg command)\n" "$(yarnpkg --version 2>/dev/null || echo unknown)"
elif command -v corepack >/dev/null 2>&1; then
  printf "✓ Yarn via Corepack\n"
else
  printf "✗ Yarn or Corepack\n"
  failures=$((failures + 1))
fi

if command -v node >/dev/null 2>&1; then
  echo
  if ! node scripts/check-runtime.js; then
    failures=$((failures + 1))
  fi

  if [ -d node_modules/better-sqlite3 ]; then
    if node --input-type=module >/dev/null 2>&1 <<'NODE'
import Database from "better-sqlite3";
const db = new Database(":memory:");
db.prepare("SELECT 1").get();
db.close();
NODE
    then
      printf "✓ better-sqlite3 native binding\n"
    else
      printf "✗ better-sqlite3 native binding\n"
      printf "  Repair with: yarn repair:native\n"
      failures=$((failures + 1))
    fi
  else
    printf "○ better-sqlite3 not installed yet\n"
  fi
fi


if [ -x .venv/bin/python ]; then
  if .venv/bin/python - <<'PY' >/dev/null 2>&1
import whisper
import yt_dlp
from openai import OpenAI
PY
  then
    printf "✓ Python AI + URL acquisition environment\n"
  else
    printf "✗ Python AI + URL acquisition environment\n"
    printf "  Repair with: yarn repair:python\n"
    failures=$((failures + 1))
  fi
else
  printf "○ Python transcription environment not prepared yet\n"
  if [ "$FIX" -eq 0 ]; then
    printf "  Prepare with: yarn setup:python\n"
  fi
fi

echo

if [ "$failures" -eq 0 ]; then
  echo "Environment looks ready."
  exit 0
fi

if [ "$FIX" -eq 0 ]; then
  echo "$failures requirement(s) need attention."
  echo "Run ./scripts/doctor.sh --fix to install missing system dependencies automatically."
else
  echo "$failures requirement(s) still need attention after automatic repair."
fi
exit 1
