# Enjoy Journal

> Keep the moment. Learn the language.

A local-first application for saving meaningful short videos and turning them into reusable English listening, transcript-review, lesson and journal material.

## Current Version

**v0.8.0 — Share Lessons Between Machines (zip + Google Drive)**

```text
Click browser extension
    ↓
Save current URL + title + note
    ↓
Automatically import media locally
    ↓
FFmpeg normalization
    ↓
Whisper timed transcript
    ↓
Lesson generation
    ↓
LESSON_READY
    ↓
Listen · Seek · Loop · Understand · Journal
```

Manual media upload remains only as a fallback when a source cannot be imported automatically.

## What Works

| Capability                                          | Status |
| --------------------------------------------------- | ------ |
| Save source URL and personal note                   | Done   |
| Upload/replace media                                | Done   |
| FFmpeg validation and normalization                 | Done   |
| Local Whisper transcription                         | Done   |
| Optional OpenAI transcription                       | Done   |
| Timed transcript segments                           | Done   |
| Per-segment transcript correction                   | Done   |
| Raw transcript preservation                         | Done   |
| Offline `local-basic` lesson provider               | Done   |
| Optional OpenAI structured lesson provider          | Done   |
| Versioned `lesson.json` artifacts                   | Done   |
| Today lesson queue                                  | Done   |
| Searchable Library                                  | Done   |
| Synchronized video/audio + transcript               | Done   |
| Click sentence to seek                              | Done   |
| Active sentence highlighting                        | Done   |
| Sentence loop ×3                                    | Done   |
| 0.75× / 1× / 1.25× playback speed                   | Done   |
| Meaning tab                                         | Done   |
| Phrases and patterns tab                            | Done   |
| Per-lesson Journal editing                          | Done   |
| Learning progress persistence                       | Done   |
| Chrome Extension capture                            | Done   |
| Automatic URL media acquisition                     | Done   |
| Automatic media → transcript → lesson orchestration | Done   |
| Manual upload fallback                              | Done   |
| Share lessons via zip + Google Drive               | Done   |
| Cross-machine import with slug-based deduplication | Done   |
| Tombstone for deleted lessons                       | Done   |
| Share management UI                                 | Done   |

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
installs Whisper/OpenAI/Pydantic/yt-dlp dependencies
    ↓
runs SQLite migrations
    ↓
starts Enjoy Journal
```

## Backup to Backblaze with Restic

The project now includes a small Restic workflow for backing up the local data directory to Backblaze B2 without committing any credentials.

```bash
yarn backup:setup
yarn backup
yarn backup:list
yarn backup:restore
yarn backup:check
```

The setup step creates a local config at `~/.config/enjoy-journal/backup.env` and a local password file at `~/.config/enjoy-journal/restic-password`. Edit the env file with your Backblaze key ID, application key, bucket name and S3 endpoint before the first backup.

## Share Lessons Between Machines (UI + Google Drive)

A simple workflow for moving lessons between machines without any cloud credentials
inside the app.

```text
This machine                            Another machine
   Click "Export all lessons"               Click "Import zip"
        ↓                                         ↓
   Download .zip file                       Upload the .zip file
        ↓                                         ↓
   Upload to Google Drive                   Lessons appear instantly
```

### 1. Export lessons (Web UI)

Open the **Share** page (`http://localhost:3000/?page=share`) and click **Export
all lessons**. This creates a zip file with everything (media, transcript,
lesson data) and lists it under the Exports section. Click **Download .zip** to
save it locally, then upload it to Google Drive.

You can also export from the command line:

```bash
yarn share:export              # all lessons
yarn share:export --no-media    # skip media files (smaller zip)
```

### 2. Upload to Google Drive

Manual step: upload the downloaded zip to Google Drive (or any cloud storage).

### 3. Import on the other machine (Web UI)

On the machine that should receive the lessons:

```bash
./start.sh     # first time only, to migrate the db with share_registry
```

Then open the **Share** page, click the **Import zip** dashed button, and select
the downloaded zip file. The import runs immediately and reports results:
imported / skipped-existing / skipped-deleted.

You can also import from the command line:

```bash
yarn share:import path/to/enjoy-journal-*.zip
yarn share:import path/to/enjoy-journal-*.zip --dry-run   # preview only
```

### Import behavior

For each lesson in the zip the importer computes its **slug** (derived from title
+ source URL) and checks the local `share_registry` table:

```text
slug already exists and is marked deleted    -> skip (tombstoned)
slug already exists and has a local inbox    -> skip (already have it)
slug unknown                                 -> import fully (source, media, transcript, lesson, journal, progress)
```

Importing the same zip twice, or importing a zip with previously deleted lessons,
**is always safe**.

### Managing the share registry

The Share page shows a **Registry** section with every lesson slug this machine
has seen (Available / Deleted / All). When you delete a lesson locally its slug
is kept with a `deleted` flag so the same lesson is never re-imported by accident.

If you intentionally want to re-import a tombstoned lesson, click **Restore
eligibility** next to it in the Registry, then run the import again.

### Share API

```http
GET  /api/share/registry                      # list registry entries
POST /api/share/exports                        # create a new export zip
GET  /api/share/exports/:filename/download     # download an export zip
DELETE /api/share/exports/:filename             # remove an export zip
POST /api/share/imports                        # upload and import a zip (multipart file)
POST /api/share/registry/:slug/restore         # clear the deleted flag
```

### Zip format reference

```text
enjoy-journal-<timestamp>.zip
├── manifest.json
└── lessons/
    └── <slug>/
        ├── meta.json         # title, source, personalNote, provider/model
        ├── lesson.json       # sanitized lesson artifact (media paths stripped)
        ├── transcript.json   # language + segments (raw/cleaned/reviewed)
        └── media/
            ├── video.mp4     # optional
            ├── audio.wav     # optional
            └── poster.jpg    # optional
```

## Main Product Flow

### Default: one action

```text
Interesting Reel / Short
        ↓
Click Enjoy Journal extension
        ↓
Add why it matters
        ↓
Save & analyze
        ↓
ACQUIRING_MEDIA
        ↓
PROCESSING
        ↓
TRANSCRIBING
        ↓
LESSON_GENERATING
        ↓
LESSON_READY
```

The server returns immediately after save. The complete pipeline continues locally in the background while Inbox shows progress.

### Fallback only

If URL acquisition fails because a source is unsupported or needs browser authentication:

```text
Automatic import failed
        ↓
Retry automatic analysis
        or
Attach media manually
        ↓
Automatic pipeline continues from the next unfinished step
```

### Optional authenticated source import

Default behavior does not read browser cookies. For a source that requires an existing browser login, the user can explicitly configure:

```env
MEDIA_COOKIE_BROWSER=chrome
```

Supported values follow the local `yt-dlp --cookies-from-browser` syntax. Leave this blank unless it is needed.

## Chrome Extension Capture

The Phase 7 extension closes the missing first step of the workflow.

```text
Current browser tab
        ↓ explicit click
activeTab + scripting
        ↓
Popup
        ↓
Manifest V3 service worker
        ↓ local HTTP
Enjoy Journal API
        ↓
Inbox
```

The extension intentionally does not download media, crawl feeds, collect comments, or run a persistent content script.

### Install

Start Enjoy Journal first:

```bash
./start.sh
```

Then open:

```text
chrome://extensions
```

Enable Developer mode, choose **Load unpacked**, and select:

```text
<project>/extension
```

Pin **Enjoy Journal Capture** to the Chrome toolbar.

### Use

```text
Open Facebook Reel / YouTube Short / useful page
        ↓
Click extension icon
        ↓
Choose English / Japanese / Chinese
        ↓
Add a short note
        ↓
Save & analyze
        ↓
Close the social platform
        ↓
Open Enjoy Journal when the lesson is ready
```

### Connection

Default local server:

```text
http://localhost:3000
```

The popup can save a different localhost port. The MVP intentionally rejects arbitrary remote server URLs.

The selected video language is stored on the Inbox item and passed explicitly to
the transcription worker. The server does not auto-detect the language. Local
Whisper automatically switches from an English-only `.en` model name to its
multilingual counterpart for Japanese and Chinese captures.

### Source cleanup

The extension normalizes known short-video URLs before saving. For example, tracking parameters are removed from Facebook Reel and YouTube Short URLs. Recognized current Reel/Short URLs take precedence over a generic page canonical URL.

### Extension commands

```bash
yarn smoke:extension
yarn extension:package
```

More detail: `docs/CHROME_EXTENSION.md`.

## Automatic URL Analysis Configuration

```env
AUTO_PROCESS_URLS=true
MEDIA_ACQUISITION_PROVIDER=yt-dlp
MEDIA_COOKIE_BROWSER=
```

`yt-dlp` is installed inside the project `.venv` by `./start.sh`. FFmpeg/FFprobe remain system dependencies and are installed automatically when possible.

Useful commands:

```bash
yarn smoke:auto
yarn setup:python
./scripts/doctor.sh
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
yarn smoke:extension
```

`smoke:learning` verifies the journal/progress and Learning Player contracts.

`smoke:extension` verifies:

- Manifest V3 structure,
- minimum permissions,
- local host permissions,
- extension JavaScript syntax,
- Facebook Reel URL normalization,
- YouTube Short URL normalization,
- local-only API safety.

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

## Update from v0.5.0

Back up data first:

```bash
cp -R data data-backup
```

Replace project code with v0.6.0 but keep the existing `data/` directory.

Then run:

```bash
./start.sh
```

Phase 7 does not require a database migration. Existing sources, media, transcripts, lessons, journal entries and learning progress remain compatible.

## Next Phase

Phase 8 should complete retrieval and reflection before adding more AI:

```text
Top-level Journal index
        ↓
Browse saved thoughts and phrases
        ↓
Search journal content
        ↓
Jump back to original lesson sentence
```

Then continue with:

```text
Keyboard shortcuts
Mobile interaction refinement
Spaced review scheduling
Optional cloud/private remote access
```


## Python environment self-repair

`./start.sh` now verifies that `.venv` contains a working `pip` before installing AI dependencies. If the environment exists but `pip` is missing, setup will:

```text
Detect missing pip
    ↓
python -m ensurepip
    ↓
Still broken?
    ↓
Recreate .venv
    ↓
Verify pip
    ↓
Install AI dependencies
```

Manual repair is also available:

```bash
yarn repair:python
```

This only removes `.venv`; it does not touch `data/`, SQLite, media, transcripts or lessons.
