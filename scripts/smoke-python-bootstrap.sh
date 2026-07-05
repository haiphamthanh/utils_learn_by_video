#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PYTHON_BIN=""
for candidate in python3.11 /opt/homebrew/bin/python3.11 /usr/local/bin/python3.11 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v "$candidate")"
    break
  elif [ -x "$candidate" ]; then
    PYTHON_BIN="$candidate"
    break
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  echo "No Python runtime available for bootstrap smoke test."
  exit 1
fi

"$PYTHON_BIN" -m venv "$TMP_DIR/venv"

# Remove pip from the environment to reproduce the user's failure mode.
rm -f "$TMP_DIR/venv/bin/pip" "$TMP_DIR/venv/bin/pip3" "$TMP_DIR/venv/bin/pip3."*
find "$TMP_DIR/venv" -type d \( -name 'pip' -o -name 'pip-*dist-info' \) -prune -exec rm -rf {} + 2>/dev/null || true

if "$TMP_DIR/venv/bin/python" -m pip --version >/dev/null 2>&1; then
  echo "Could not simulate missing pip."
  exit 1
fi

"$TMP_DIR/venv/bin/python" -m ensurepip --upgrade --default-pip >/dev/null
"$TMP_DIR/venv/bin/python" -m pip --version >/dev/null

echo "Python pip bootstrap smoke test passed."
