# Enjoy Journal

> Keep the moment. Learn the language.

A local-first application for saving meaningful short videos and turning them into reusable English listening, transcript-review and lesson material.

## Current Version

**v0.4.0 — Phase 5 Transcript Review & Lesson Generation**

```text
Save source URL
    ↓
Attach local media
    ↓
Process with FFmpeg
    ↓
Create timed transcript
    ↓
Review only incorrect lines
    ↓
Generate lesson.json
    ↓
Preview phrases and patterns
```

## What Works

| Capability | Status |
|---|---|
| Save source URL and personal note | Done |
| Upload/replace media | Done |
| FFmpeg validation and normalization | Done |
| Local Whisper transcription | Done |
| Optional OpenAI transcription | Done |
| Timed transcript segments | Done |
| Automatic basic transcript cleaning | Done |
| Per-segment transcript correction | Done |
| Raw transcript preservation | Done |
| Offline `local-basic` lesson provider | Done |
| Optional OpenAI structured lesson provider | Done |
| Versioned `lesson.json` artifacts | Done |
| Lesson preview in Inbox | Done |
| Synchronized learning player | Next |
| Chrome Extension | Later |

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
creates a compatible Python .venv
    ↓
installs Whisper/OpenAI/Pydantic dependencies
    ↓
runs SQLite migrations
    ↓
starts Enjoy Journal
```

## Default Local-First Configuration

`.env` defaults:

```text
TRANSCRIPTION_PROVIDER=local-whisper
TRANSCRIPTION_MODEL=base.en
TRANSCRIPTION_LANGUAGE=en
WHISPER_DEVICE=cpu

LESSON_PROVIDER=local-basic
LESSON_MODEL=local-basic-v1
```

This path needs no API key.

The local lesson provider creates:

- a lesson title,
- reusable phrases when known patterns are detected,
- communication-pattern notes,
- shadowing chunks,
- a valid canonical `lesson.json`.

Its semantic analysis is intentionally limited. Use the OpenAI lesson provider when you want Vietnamese meaning and deeper language analysis.

## Optional OpenAI Lesson Provider

Create `.env`:

```text
LESSON_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_LESSON_MODEL=gpt-5.4-mini
```

The OpenAI provider generates structured:

- Vietnamese summary,
- meaning for transcript segments,
- maximum 5 reusable key phrases,
- communication patterns,
- shadowing chunks,
- maximum 3 comprehension questions.

The worker validates source segment IDs before saving the lesson.

## Transcript Layers

Enjoy Journal preserves three layers:

```text
raw_text
    ↓
cleaned_text
    ↓
reviewed_text
```

Rules:

- `raw_text` is never edited.
- `cleaned_text` is generated automatically for punctuation/capitalization.
- `reviewed_text` is only created when the user saves a correction.
- Lesson generation uses `reviewed_text`, then `cleaned_text`, then `raw_text` as fallback.

## Lesson Artifact

Every generation creates a new file:

```text
data/inbox/{inbox-id}/lesson/
├── input-lesson_job_....json
├── lesson-lesson_....json
└── ...
```

The output contract:

```text
schemaVersion
lesson
source
media
transcript
learning
journal
progress
```

Re-generation creates a new artifact instead of silently overwriting the previous lesson.

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

### Save one transcript correction

```http
PATCH /api/inbox/:id/transcript/segments/:segmentId
Content-Type: application/json
```

```json
{
  "reviewedText": "Corrected sentence."
}
```

### Generate lesson

```http
POST /api/inbox/:id/lesson/generate
```

### Read lesson status

```http
GET /api/inbox/:id/lesson-status
```

### Read latest lesson

```http
GET /api/inbox/:id/lesson
```

## Smoke Tests

```bash
yarn check
yarn smoke:media
yarn smoke:transcription
yarn smoke:lesson
```

`smoke:lesson` uses a deterministic mock provider and does not call an external AI service.

## Data Layout

```text
data/
├── journal.db
└── inbox/{inbox-id}/
    ├── processed/
    │   ├── audio.wav
    │   ├── normalized.mp4
    │   └── poster.jpg
    ├── transcript/
    │   └── raw-transcription_job_....json
    └── lesson/
        ├── input-lesson_job_....json
        └── lesson-lesson_....json
```

## Update from v0.3.0

Back up data first:

```bash
cp -R data data-backup
```

Replace project code with v0.4.0 but keep your existing `data/` directory.

Then run:

```bash
./start.sh
```

Migration only adds new lesson tables. Existing media and transcript rows remain compatible.

## Next Phase

Phase 6 will turn the generated lesson into the main learning experience:

```text
Video player
    +
Timed transcript
    +
Click sentence to seek
    +
Sentence loop
    +
Meaning / Phrases / Journal tabs
```
