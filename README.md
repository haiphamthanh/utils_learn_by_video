# Enjoy Journal

> Keep the moment. Learn the language.

A local-first application for saving meaningful short-video sources, attaching user-provided media, and turning those moments into listening, speaking and journal lessons.

## Current Version

**v0.2.2 — Phase 3: Media Processing + Automatic Environment Repair**

| Capability | Status |
|---|---|
| Express web application | Done |
| SQLite persistence | Done |
| Save source URL + personal note | Done |
| Inbox filters | Done |
| Attach or replace media | Done |
| FFprobe validation | Done |
| Audio extraction | Done |
| Video normalization | Done |
| Poster generation | Done |
| Processing jobs + progress | Done |
| Retry / reprocess | Done |
| Yarn startup workflow | Done |
| Automatic system dependency install | Done |
| Native SQLite binding repair | Done |
| Transcription | Next |
| Lesson generation | Later |
| Learning player | Later |
| Chrome Extension | Later |

## Product Flow

```text
Interesting short video
        ↓
Save URL + personal note
        ↓
Inbox
        ↓
Attach local media
        ↓
Process media
        ↓
VALIDATE
        ↓
PREPARE_MEDIA
        ↓
SAVE_ARTIFACTS
        ↓
MEDIA_READY
        ↓
Transcription (Phase 4)
```

## Architecture

```text
Browser
  │
  ▼
Express + Vanilla JS
  │
  ├── SQLite
  │     ├── sources
  │     ├── inbox_items
  │     ├── media_assets
  │     └── processing_jobs
  │
  └── Local filesystem
        ├── original upload
        ├── normalized.mp4
        ├── audio.wav
        └── poster.jpg

Python AI Worker
  └── scaffolded for Phase 4+
```

## Repository Map

| Path | Responsibility |
|---|---|
| `app/` | Express server, API routes, services and database |
| `public/` | Vanilla HTML, CSS and JavaScript UI |
| `worker/` | Future transcription and lesson pipeline |
| `scripts/` | Diagnostics and media smoke tests |
| `tests/fixtures/` | Small deterministic local media fixture |
| `data/` | Local database, user media and generated artifacts |
| `docs/` | Implementation status |

## Requirements

- Node.js 22, 24 or 26 (Node.js 24 LTS recommended)
- Yarn 1.22.22, `yarnpkg`, or Corepack
- Python 3.11+
- FFmpeg and FFprobe

The normal startup flow installs missing system tools automatically when a supported package manager is available.

Check the machine:

```bash
./scripts/doctor.sh
```

Attempt automatic repair:

```bash
./scripts/doctor.sh --fix
```

Expected:

```text
Enjoy Journal Doctor

✓ Node.js
✓ Python 3
✓ FFmpeg
✓ FFprobe
✓ Yarn or Yarn via Corepack
```

## Quick Start with Yarn

```bash
chmod +x start.sh scripts/*.sh
./start.sh
```

The startup script:

```text
load .env when present
        ↓
auto-install missing system dependencies
        ↓
check Node runtime and ABI
        ↓
use yarn / yarnpkg / Corepack-managed Yarn
        ↓
reinstall dependencies when Node ABI or package files changed
        ↓
verify better-sqlite3 native binding
        ↓
auto-repair native binding when needed
        ↓
yarn migrate
        ↓
yarn start
```

Open:

```text
http://localhost:3000
```

## Manual Start

```bash
yarn install
yarn migrate
yarn start
```

Development mode:

```bash
yarn dev
```

## Yarn Decision

The project now uses Yarn as the only documented package-manager workflow.

`package.json` pins:

```text
packageManager: yarn@1.22.22
```

When `yarn` is not available as a global command, `start.sh` and the user can use Corepack.

No npm command is required by the project workflow.


## Automatic System Setup

`./start.sh` now calls:

```bash
./scripts/install-system-deps.sh --yes
```

Supported automatic installers:

| Platform | Package manager | Packages installed when missing |
|---|---|---|
| macOS | Homebrew | Node.js, Python, FFmpeg, Yarn |
| Debian / Ubuntu | apt | Node.js, Python, FFmpeg, Yarn package |
| Fedora | dnf | Node.js, Python, FFmpeg |
| Arch Linux | pacman | Node.js, Python, FFmpeg, Yarn |

On macOS, if Homebrew is missing, the script can install it. If Apple Command Line Tools are missing, macOS opens the official installer and the user reruns `./start.sh` after that installation finishes.

Run setup directly:

```bash
yarn setup:system
```

Check without changing the machine:

```bash
./scripts/install-system-deps.sh --check
```

## Node.js and SQLite Native Binding

The project pins:

```text
better-sqlite3 12.11.1
```

The startup script fingerprints:

```text
platform + architecture + Node ABI + package.json + yarn.lock
```

When the fingerprint changes, dependencies are reinstalled for the current runtime. This prevents stale native binaries from surviving a Node.js upgrade.

Manual repair remains available:

```bash
yarn repair:native
```

That command:

```text
ensure build tools
    ↓
remove stale better-sqlite3 binding
    ↓
yarn install --force
    ↓
open an in-memory SQLite database
    ↓
verify SELECT 1
```

## Media Processing

### Input

Supported upload types:

- MP4
- WebM
- MP3
- M4A
- WAV

The media must contain an audio track because the product is designed for language learning.

### Generated Artifacts

For video:

```text
data/inbox/{inbox-id}/processed/
├── normalized.mp4
├── audio.wav
└── poster.jpg
```

For audio-only input:

```text
data/inbox/{inbox-id}/processed/
└── audio.wav
```

### Normalized Audio Contract

```text
WAV
mono
16 kHz
PCM 16-bit
```

This becomes the stable input contract for transcription in Phase 4.

## Processing State

```text
WAITING_MEDIA
    ↓
READY_TO_PROCESS
    ↓
PROCESSING
    ├── QUEUED
    ├── VALIDATE
    ├── PREPARE_MEDIA
    └── SAVE_ARTIFACTS
    ↓
MEDIA_READY
```

Failure:

```text
PROCESSING
    ↓
FAILED
    ↓
Retry processing
```

A server restart while a job is running marks the job as interrupted instead of leaving the item stuck forever in `PROCESSING`.

## API

### Create Inbox Item

```http
POST /api/inbox
```

### List Inbox Items

```http
GET /api/inbox
GET /api/inbox?status=READY_TO_PROCESS
```

### Upload Media

```http
POST /api/inbox/:id/media
Content-Type: multipart/form-data
```

Field name:

```text
media
```

### Start Media Processing

```http
POST /api/inbox/:id/process
```

Returns `202 Accepted`.

### Read Processing Status

```http
GET /api/inbox/:id/status
```

Example:

```json
{
  "data": {
    "inboxStatus": "PROCESSING",
    "job": {
      "status": "RUNNING",
      "stage": "PREPARE_MEDIA",
      "progress": 35
    },
    "error": null
  },
  "error": null
}
```

## Development Commands

| Command | Purpose |
|---|---|
| `yarn dev` | Start with Node watch mode |
| `yarn start` | Start normally |
| `yarn migrate` | Create/update idempotent schema |
| `yarn doctor` | Check machine requirements |
| `./scripts/doctor.sh --fix` | Install missing system dependencies |
| `yarn setup:system` | Run automatic system setup |
| `yarn repair:native` | Rebuild the SQLite native binding |
| `yarn check` | JavaScript syntax checks |
| `yarn smoke:media` | Verify FFmpeg commands and generated artifacts |

## Media Smoke Test

A deterministic two-second fixture is included:

```text
tests/fixtures/sample-short.mp4
```

Run:

```bash
yarn smoke:media
```

Expected artifacts:

```text
✓ audio.wav
✓ normalized.mp4
✓ poster.jpg
Media smoke test passed.
```

## Data Storage

```text
data/
├── journal.db
├── inbox/
│   ├── uploads/
│   └── {inbox-id}/processed/
├── lessons/
└── temp/
```

Rules:

- SQLite stores searchable metadata and job state.
- Media remains on the filesystem.
- Absolute local paths are not exposed by the public Inbox API.
- The app processes only files the user explicitly provides.
- The app does not scrape or crawl social networks.

## Next Phase

Phase 4 adds one transcription provider behind a stable interface:

```text
audio.wav
    ↓
TranscriptionProvider
    ↓
Timed transcript segments
    ↓
Persist raw transcript
```

Do not start lesson generation until timestamped transcription is reliable.
