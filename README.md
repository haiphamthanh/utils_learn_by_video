# Enjoy Journal

> Keep the moment. Learn the language.

A local-first application for saving meaningful short-video sources and turning them into reusable English listening material.

## Current Version

**v0.3.0 — Phase 4 Transcription**

The working flow is now:

```text
Save source URL
    ↓
Attach local media
    ↓
Process with FFmpeg
    ↓
Create timed transcript
    ↓
Preview transcript in Inbox
```

## What Works

| Capability | Status |
|---|---|
| Save source URL and note | Done |
| Upload/replace media | Done |
| FFmpeg validation | Done |
| Audio extraction | Done |
| Normalized video and poster | Done |
| Local Whisper provider | Done |
| OpenAI transcription provider | Done |
| Timed transcript segments | Done |
| Persistent transcript history | Done |
| Transcript preview | Done |
| Lesson generation | Next |
| Learning player | Later |

## Quick Start

```bash
chmod +x start.sh scripts/*.sh
./start.sh
```

Open:

```text
http://localhost:3000
```

`start.sh` automatically:

```text
checks/installs system dependencies
    ↓
checks Node native ABI
    ↓
installs Yarn dependencies when needed
    ↓
creates .venv with compatible Python
    ↓
installs Whisper/OpenAI Python dependencies
    ↓
runs SQLite migrations
    ↓
starts Enjoy Journal
```

## Local Whisper Default

`.env` defaults:

```text
TRANSCRIPTION_PROVIDER=local-whisper
TRANSCRIPTION_MODEL=base.en
TRANSCRIPTION_LANGUAGE=en
WHISPER_DEVICE=cpu
```

The first transcription downloads the selected Whisper model. Later transcriptions reuse the local model cache.

For a smaller/faster model:

```text
TRANSCRIPTION_MODEL=tiny.en
```

For higher accuracy with more compute:

```text
TRANSCRIPTION_MODEL=small.en
```

## Optional OpenAI Provider

Set:

```text
TRANSCRIPTION_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_TRANSCRIPTION_MODEL=whisper-1
```

The project uses `whisper-1` for the OpenAI provider because the lesson player requires segment timestamps.

## API

### Start media processing

```http
POST /api/inbox/:id/process
```

### Start transcription

```http
POST /api/inbox/:id/transcribe
```

### Read transcript

```http
GET /api/inbox/:id/transcript
```

Example response:

```json
{
  "data": {
    "language": "en",
    "provider": "local-whisper",
    "model": "base.en",
    "segments": [
      {
        "startMs": 0,
        "endMs": 2400,
        "rawText": "I used to think..."
      }
    ]
  },
  "error": null
}
```

## Python Environment

Manual setup/check:

```bash
./scripts/setup-python.sh
```

Pre-download the configured local Whisper model:

```bash
yarn model:download
```

## Smoke Tests

Media:

```bash
yarn smoke:media
```

Transcription contract without downloading an AI model:

```bash
yarn smoke:transcription
```

## Data

```text
data/
├── journal.db
└── inbox/{inbox-id}/
    ├── processed/
    │   ├── audio.wav
    │   ├── normalized.mp4
    │   └── poster.jpg
    └── transcript/
        ├── raw-transcription_job_....json
        └── ...
```

Re-transcription creates a new raw JSON artifact. Previous raw transcript artifacts are not silently overwritten.

## Next Phase

Phase 5 will turn the raw timed transcript into learning material:

```text
Raw transcript
    ↓
Clean script
    ↓
Vietnamese meaning
    ↓
Key phrases
    ↓
Shadowing chunks
    ↓
lesson.json
```
