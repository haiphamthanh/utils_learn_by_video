# Enjoy Journal

> Keep the moment. Learn the language.

A local-first application for saving meaningful short videos and turning them into reusable English listening, transcript-review, lesson and journal material.

## Current Version

**v0.5.0 — Phase 6 Learning Player**

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
Open Learning Player
    ↓
Listen · Seek · Loop · Understand · Journal
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
| Per-segment transcript correction | Done |
| Raw transcript preservation | Done |
| Offline `local-basic` lesson provider | Done |
| Optional OpenAI structured lesson provider | Done |
| Versioned `lesson.json` artifacts | Done |
| Today lesson queue | Done |
| Searchable Library | Done |
| Synchronized video/audio + transcript | Done |
| Click sentence to seek | Done |
| Active sentence highlighting | Done |
| Sentence loop ×3 | Done |
| 0.75× / 1× / 1.25× playback speed | Done |
| Meaning tab | Done |
| Phrases and patterns tab | Done |
| Per-lesson Journal editing | Done |
| Learning progress persistence | Done |
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

## Main Product Flow

### 1. Capture

```text
Interesting Reel / Short
        ↓
Save URL + note
        ↓
Inbox
```

### 2. Prepare

```text
Attach local media
        ↓
Process media
        ↓
audio.wav
normalized.mp4
poster.jpg
```

### 3. Understand

```text
Create transcript
        ↓
Timed segments
        ↓
Review only wrong lines
        ↓
Generate lesson
```

### 4. Learn

```text
Open Today or Library
        ↓
Open lesson
        ↓
Click sentence
        ↓
Video seeks to sentence
        ↓
Loop ×3
        ↓
Read meaning / phrase
        ↓
Write personal example
```

## Learning Player

The Phase 6 learning surface combines the previously separate artifacts.

```text
┌───────────────────────────┬───────────────────────────┐
│                           │ Listen                    │
│                           │ Meaning                   │
│       VIDEO / AUDIO       │ Phrases                   │
│                           │ Journal                   │
│                           │                           │
├───────────────────────────┴───────────────────────────┤
│ Previous · Next · Loop ×3 · 0.75× · 1× · 1.25×      │
└───────────────────────────────────────────────────────┘
```

### Sentence Seek

Click any transcript sentence:

```text
segment.startMs
        ↓
media.currentTime
        ↓
play from that sentence
```

### Active Sentence Highlighting

```text
media.currentTime
        ↓
find matching timed segment
        ↓
highlight transcript line
```

### Loop ×3

```text
Choose sentence
        ↓
Loop ×3
        ↓
Play sentence
        ↓
Pause 900 ms
        ↓
Repeat
        ↓
Record one completed shadow loop
```

### Playback Speed

Available directly below the player:

```text
0.75×   1×   1.25×
```

## Today

Today shows up to five lessons:

```text
NEW lessons first
        ↓
LEARNING lessons second
        ↓
MASTERED lessons excluded
```

Opening a lesson records:

```text
NEW
  ↓
LEARNING
```

## Library

The Library searches across:

- lesson title,
- Vietnamese summary,
- topic,
- effective transcript text,
- generated key phrases and patterns,
- personal journal content.

Filters:

```text
All
New
Learning
Mastered
```

Only the latest generated lesson for each Inbox item is shown.

## Journal

The Learning Player currently stores four fields per lesson:

```text
Why I saved this
My thought
Favorite phrase
My example
```

Journal data is stored in SQLite and synchronized back into the lesson artifact.

Regenerating a lesson copies the latest journal and progress state into the new lesson version.

## Learning Progress

Each lesson tracks:

```text
status
listenCount
shadowCount
lastOpenedAt
lastCompletedAt
```

Status:

```text
NEW
LEARNING
MASTERED
```

Actions:

```text
OPENED
LISTEN_COMPLETED
SHADOW_COMPLETED
MARK_LEARNING
MARK_MASTERED
```

## Media Streaming

Media is not copied into the public web directory.

The backend serves lesson media through private application routes:

```http
GET /api/lessons/:id/media/video
GET /api/lessons/:id/media/audio
GET /api/lessons/:id/media/poster
```

Video and audio support HTTP byte ranges:

```text
Accept-Ranges: bytes
Content-Range: bytes start-end/total
```

This is required for reliable browser seeking.

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

## Database Additions in v0.5.0

```text
journal_entries
learning_progress
```

Relationships:

```text
lesson
  ├── journal_entries
  └── learning_progress
```

## Learning API

### List lessons

```http
GET /api/lessons
GET /api/lessons?q=AI
GET /api/lessons?status=LEARNING
```

### Read lesson detail

```http
GET /api/lessons/:id
```

### Save journal

```http
PATCH /api/lessons/:id/journal
Content-Type: application/json
```

```json
{
  "myThought": "This changes how I think about AI tools.",
  "favoritePhrase": "I used to think...",
  "myExample": "I used to think AI was just a chatbot."
}
```

### Update progress

```http
POST /api/lessons/:id/progress
Content-Type: application/json
```

```json
{
  "action": "SHADOW_COMPLETED"
}
```

## Pipeline API

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
```

### Generate lesson

```http
POST /api/inbox/:id/lesson/generate
```

## Smoke Tests

```bash
yarn check
yarn smoke:media
yarn smoke:transcription
yarn smoke:lesson
yarn smoke:learning
```

`smoke:learning` verifies:

- new SQLite tables,
- journal/progress persistence contract,
- Learning Player controls,
- media Range response support.

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

## Update from v0.4.0

Back up data first:

```bash
cp -R data data-backup
```

Replace project code with v0.5.0 but keep the existing `data/` directory.

Then run:

```bash
./start.sh
```

Migration only adds:

```text
journal_entries
learning_progress
```

Existing sources, media, transcripts and lessons remain compatible.

## Next Phase

Phase 7 should focus on capture and retrieval rather than more AI:

```text
Chrome Extension
    ↓
Save current page URL + title + note
    ↓
Inbox
```

After that, the next product-quality backlog should include:

```text
Top-level Journal index
Keyboard shortcuts
Mobile layout refinement
Spaced review scheduling
```
