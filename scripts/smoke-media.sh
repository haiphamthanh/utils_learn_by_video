#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE="$PROJECT_DIR/tests/fixtures/sample-short.mp4"
OUTPUT_DIR="$PROJECT_DIR/data/temp/media-smoke"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

if [ ! -f "$FIXTURE" ]; then
  echo "Missing fixture: $FIXTURE"
  exit 1
fi

echo "Probing fixture..."
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1 "$FIXTURE"

echo "Extracting normalized audio..."
ffmpeg -y -i "$FIXTURE" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$OUTPUT_DIR/audio.wav" >/dev/null 2>&1

echo "Normalizing video..."
ffmpeg -y -i "$FIXTURE" -map 0:v:0 -map 0:a? -c:v libx264 -preset veryfast -crf 23 -c:a aac -movflags +faststart "$OUTPUT_DIR/normalized.mp4" >/dev/null 2>&1

echo "Generating poster..."
ffmpeg -y -ss 1 -i "$FIXTURE" -frames:v 1 -q:v 2 "$OUTPUT_DIR/poster.jpg" >/dev/null 2>&1

for artifact in audio.wav normalized.mp4 poster.jpg; do
  if [ ! -s "$OUTPUT_DIR/$artifact" ]; then
    echo "✗ Missing artifact: $artifact"
    exit 1
  fi
  echo "✓ $artifact"
done

echo "Media smoke test passed."
