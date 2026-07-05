#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

WORK_DIR="data/temp/transcription-smoke"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

python3 worker/transcribe.py \
  --input tests/fixtures/sample-short.mp4 \
  --output "$WORK_DIR/raw.json" \
  --provider mock \
  --model mock-v1 \
  --language en \
  --device cpu

python3 - <<'PY'
import json
from pathlib import Path

path = Path("data/temp/transcription-smoke/raw.json")
data = json.loads(path.read_text())

assert data["segments"], "segments missing"
assert data["segments"][0]["startMs"] == 0
assert data["provider"] == "mock"

print("Transcription smoke test passed.")
PY
