#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

BOOTSTRAP_ONLY=0
if [ "${1:-}" = "--bootstrap-only" ]; then
  BOOTSTRAP_ONLY=1
fi

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

is_supported_python() {
  local python_bin="$1"
  "$python_bin" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info[:2] == (3, 9) else 1)
PY
}

can_bootstrap_venv() {
  local python_bin="$1"
  "$python_bin" -m ensurepip --version >/dev/null 2>&1
}

find_python() {
  local resolved=""

  for candidate in \
    python3.9 \
    /usr/bin/python3.9 \
    /opt/homebrew/bin/python3.9 \
    /usr/local/bin/python3.9 \
    python3 \
    /usr/bin/python3 \
    /opt/homebrew/bin/python3 \
    /usr/local/bin/python3 \
    python
  do
    resolved="$(resolve_python "$candidate" || true)"
    if [ -n "$resolved" ] && is_supported_python "$resolved" && can_bootstrap_venv "$resolved"; then
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

install_python_39_macos() {
  refresh_homebrew_path

  if ! command -v brew >/dev/null 2>&1; then
    echo "Python 3.9 is required for local Whisper and Homebrew is unavailable."
    exit 1
  fi

  echo "Installing Python 3.9 for the transcription worker..."
  brew install python@3.9
}

create_venv() {
  echo "Creating Python virtual environment..."
  rm -rf .venv
  "$PYTHON_BIN" -m venv .venv
}

venv_has_pip() {
  [ -x .venv/bin/python ] && .venv/bin/python -m pip --version >/dev/null 2>&1
}

bootstrap_pip() {
  if venv_has_pip; then
    return 0
  fi

  echo "Python virtual environment exists but pip is missing."
  echo "Bootstrapping pip with ensurepip..."

  if .venv/bin/python -m ensurepip --upgrade --default-pip >/dev/null 2>&1 && venv_has_pip; then
    echo "pip restored successfully."
    return 0
  fi

  echo "Could not restore pip in the existing virtual environment."
  echo "Recreating .venv with $PYTHON_BIN..."
  create_venv

  if ! venv_has_pip; then
    echo "pip is still missing after recreating .venv; retrying ensurepip..."
    .venv/bin/python -m ensurepip --upgrade --default-pip
  fi

  if ! venv_has_pip; then
    echo
    echo "Could not install pip into the Python virtual environment."
    echo "Selected Python: $PYTHON_BIN"
    echo "Try:"
    echo "  rm -rf .venv"
    echo "  $PYTHON_BIN -m ensurepip --upgrade"
    echo "  ./start.sh"
    exit 1
  fi

  echo "Python virtual environment repaired successfully."
}

PYTHON_BIN="$(find_python || true)"

if [ -z "$PYTHON_BIN" ] && [ "$(uname -s)" = "Darwin" ]; then
  install_python_39_macos
  PYTHON_BIN="$(find_python || true)"
fi

if [ -z "$PYTHON_BIN" ]; then
  echo "A Python 3.9 runtime is required for local Whisper and automatic URL import."
  echo "Install Python 3.9, then rerun ./start.sh."
  exit 1
fi

echo "Using Python: $PYTHON_BIN ($("$PYTHON_BIN" --version 2>&1))"

if [ -x .venv/bin/python ] && ! is_supported_python .venv/bin/python; then
  echo "Existing .venv uses an incompatible Python version; recreating it."
  create_venv
fi

if [ ! -x .venv/bin/python ]; then
  create_venv
fi

# A virtual environment may survive a Python/package-manager change in a
# partially broken state. Verify pip independently from the Python executable
# and self-heal before any dependency command is attempted.
bootstrap_pip

if [ "$BOOTSTRAP_ONLY" -eq 1 ]; then
  .venv/bin/python -m pip --version
  echo "Python virtual environment bootstrap check passed."
  exit 0
fi

REQUIREMENTS_HASH="$("$PYTHON_BIN" - <<'PY'
import hashlib
from pathlib import Path

path = Path("requirements.txt")
print(hashlib.sha256(path.read_bytes()).hexdigest())
PY
)"

PYTHON_RUNTIME="$(.venv/bin/python - <<'PY'
import platform
import sys
print(
    f"{platform.system()}-{platform.machine()}-"
    f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}-"
    f"{sys.base_prefix}"
)
PY
)"
FINGERPRINT="${PYTHON_RUNTIME}-${REQUIREMENTS_HASH}"
STAMP_FILE=".venv/.enjoy-journal-requirements"
CURRENT=""

if [ -f "$STAMP_FILE" ]; then
  CURRENT="$(cat "$STAMP_FILE")"
fi

ai_environment_ready() {
  .venv/bin/python - <<'PY' >/dev/null 2>&1
import whisper
import yt_dlp
from openai import OpenAI
from pydantic import BaseModel
PY
}

NEED_INSTALL=0
if [ "$CURRENT" != "$FINGERPRINT" ]; then
  NEED_INSTALL=1
elif ! ai_environment_ready; then
  echo "Python dependency stamp exists, but required packages are missing or broken."
  NEED_INSTALL=1
fi

if [ "$NEED_INSTALL" -eq 1 ]; then
  echo "Installing Python AI dependencies..."
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

if ! ai_environment_ready; then
  echo
  echo "Python dependencies are still unavailable after setup."
  echo "Run: yarn repair:python"
  exit 1
fi

echo "Python AI environment ready."
