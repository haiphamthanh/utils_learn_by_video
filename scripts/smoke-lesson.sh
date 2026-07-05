#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if [ -x .venv/bin/python ]; then
  PYTHON_BIN=.venv/bin/python
fi

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

cat > "$TEMP_DIR/input.json" <<'JSON'
{
  "lesson": {
    "id": "lesson_smoke",
    "createdAt": "2026-07-05T00:00:00.000Z"
  },
  "source": {
    "type": "uploaded-file",
    "platform": null,
    "url": null,
    "title": "Smoke test source",
    "author": null,
    "capturedAt": "2026-07-05T00:00:00.000Z"
  },
  "personalNote": "Test the lesson contract.",
  "media": {
    "videoPath": "media/normalized.mp4",
    "audioPath": "media/audio.wav",
    "posterPath": "media/poster.jpg",
    "durationMs": 6000
  },
  "transcript": {
    "id": "transcript_smoke",
    "language": "en",
    "provider": "mock",
    "model": "mock",
    "segments": [
      {
        "id": "segment_001",
        "sequence": 0,
        "startMs": 0,
        "endMs": 3000,
        "rawText": "i used to think ai was just a chatbot",
        "cleanedText": "I used to think AI was just a chatbot.",
        "reviewedText": null,
        "confidence": 0.99,
        "reviewStatus": "UNREVIEWED"
      }
    ]
  }
}
JSON

"$PYTHON_BIN" worker/generate_lesson.py \
  --input "$TEMP_DIR/input.json" \
  --output "$TEMP_DIR/lesson.json" \
  --provider mock \
  --model mock-v1

"$PYTHON_BIN" - "$TEMP_DIR/lesson.json" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload["schemaVersion"] == "1.0"
assert payload["lesson"]["id"] == "lesson_smoke"
assert payload["lesson"]["title"]
assert payload["learning"]["keyPhrases"]
assert payload["learning"]["shadowingChunks"]
assert payload["learning"]["keyPhrases"][0]["sourceSegmentIds"] == ["segment_001"]
print("Lesson smoke test passed.")
PY
