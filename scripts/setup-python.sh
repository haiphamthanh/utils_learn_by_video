#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

resolve_python() {
  local candidate="$1"

  if [ -x "$candidate" ]; then
    printf "%s\n" "$candidate"
    return 0
  fi

  if command -v "$candidate" >/dev/null 2>&1; then
    command -v "$candidate"
    return 0
  fi

  return 1
}

is_whisper_python() {
  local python_bin="$1"
  "$python_bin" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if (3, 8) <= sys.version_info[:2] <= (3, 11) else 1)
PY
}

find_python() {
  local resolved=""

  for candidate in \
    python3.11 \
    /opt/homebrew/bin/python3.11 \
    /usr/local/bin/python3.11 \
    python3
  do
    resolved="$(resolve_python "$candidate" || true)"
    if [ -n "$resolved" ] && is_whisper_python "$resolved"; then
      printf "%s\n" "$resolved"
      return 0
    fi
  done

  return 1
}

refresh_homebrew_path() {
  if command -v brew >/dev/null 2>&1; then
    return 0
  fi

  for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [ -x "$candidate" ]; then
      eval "$("$candidate" shellenv)"
      return 0
    fi
  done
}

install_python_311_macos() {
  refresh_homebrew_path

  if ! command -v brew >/dev/null 2>&1; then
    echo "Python 3.11 is required for local Whisper and Homebrew is unavailable."
    exit 1
  fi

  echo "Installing Python 3.11 for the transcription worker..."
  brew install python@3.11
}

PYTHON_BIN="$(find_python || true)"

if [ -z "$PYTHON_BIN" ] && [ "$(uname -s)" = "Darwin" ]; then
  install_python_311_macos
  PYTHON_BIN="$(find_python || true)"
fi

if [ -z "$PYTHON_BIN" ]; then
  echo "A Python 3.8-3.11 runtime is required for local Whisper."
  echo "Install Python 3.11, then rerun ./start.sh."
  exit 1
fi

echo "Using Python: $PYTHON_BIN ($("$PYTHON_BIN" --version 2>&1))"

if [ -x .venv/bin/python ] && ! is_whisper_python .venv/bin/python; then
  echo "Existing .venv uses an incompatible Python version; recreating it."
  rm -rf .venv
fi

if [ ! -x .venv/bin/python ]; then
  echo "Creating Python virtual environment..."
  "$PYTHON_BIN" -m venv .venv
fi

REQUIREMENTS_HASH="$("$PYTHON_BIN" - <<'PY'
import hashlib
from pathlib import Path

path = Path("requirements.txt")
print(hashlib.sha256(path.read_bytes()).hexdigest())
PY
)"

PYTHON_RUNTIME="$(.venv/bin/python -c 'import platform, sys; print(f"{platform.system()}-{platform.machine()}-{sys.version_info.major}.{sys.version_info.minor}")')"
FINGERPRINT="${PYTHON_RUNTIME}-${REQUIREMENTS_HASH}"
STAMP_FILE=".venv/.enjoy-journal-requirements"
CURRENT=""

if [ -f "$STAMP_FILE" ]; then
  CURRENT="$(cat "$STAMP_FILE")"
fi

if [ "$CURRENT" != "$FINGERPRINT" ]; then
  echo "Installing Python transcription dependencies..."
  .venv/bin/python -m pip install --upgrade pip setuptools wheel

  if ! .venv/bin/python -m pip install -r requirements.txt; then
    echo "Initial install failed. Installing Rust build support and retrying..."

    refresh_homebrew_path
    if [ "$(uname -s)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
      brew install rust
    fi

    .venv/bin/python -m pip install setuptools-rust
    .venv/bin/python -m pip install -r requirements.txt
  fi

  printf "%s" "$FINGERPRINT" > "$STAMP_FILE"
fi

.venv/bin/python - <<'PY'
import whisper
from openai import OpenAI

print("Python transcription environment ready.")
PY
