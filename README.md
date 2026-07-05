# Enjoy Journal

> Keep the moment. Learn the language.

A local-first application for saving meaningful short-video sources, attaching media, and gradually turning those moments into listening, speaking and journal lessons.

## Current Scope

This repository implements **Phase 1–2** of the MVP.

| Capability | Status |
|---|---|
| Express web application | Done |
| SQLite persistence | Done |
| Save source URL | Done |
| Add personal note | Done |
| Inbox list and filtering | Done |
| Attach or replace media | Done |
| Health API | Done |
| Media processing | Next |
| Transcription | Next |
| Lesson generation | Next |
| Learning player | Next |
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
Ready to process
        ↓
Future AI pipeline
        ↓
Lesson + Journal
```

## Architecture

```text
Browser
  │
  ▼
Express + Vanilla JS
  │
  ├── SQLite
  │
  └── Local filesystem
          │
          ▼
      Python Worker
      (Phase 3+)
```

## Repository Map

| Path | Responsibility |
|---|---|
| `app/` | Express server, API routes, services and database |
| `public/` | Vanilla HTML, CSS and JavaScript UI |
| `worker/` | Media and AI pipeline scaffold |
| `scripts/` | Machine diagnostics and utility scripts |
| `data/` | Local database and user-owned media |
| `docs/` | Implementation status and next tasks |

## Requirements

- Node.js 20+
- npm
- Python 3.11+
- FFmpeg for Phase 3+

Run diagnostics:

```bash
./scripts/doctor.sh
```

## Quick Start

```bash
chmod +x start.sh scripts/doctor.sh
./start.sh
```

Then open:

```text
http://localhost:3000
```

The first start installs Node.js dependencies, creates data directories, initializes SQLite, and starts the application.

## Manual Start

```bash
npm install
npm run migrate
npm start
```

## API

### Health

```http
GET /api/health
```

### Create Inbox Item

```http
POST /api/inbox
Content-Type: application/json
```

Example:

```json
{
  "source": {
    "type": "facebook-reel",
    "url": "https://www.facebook.com/reel/...",
    "platform": "facebook"
  },
  "personalNote": "I like the way this idea is explained."
}
```

### List Inbox Items

```http
GET /api/inbox
GET /api/inbox?status=WAITING_MEDIA
```

### Upload Media

```http
POST /api/inbox/:id/media
Content-Type: multipart/form-data
```

Form field:

```text
media
```

Supported MVP media:

- MP4
- WebM
- MP3
- M4A
- WAV

## Data Storage

```text
data/
├── journal.db
├── inbox/
├── lessons/
└── temp/
```

Rules:

- SQLite stores searchable metadata and relationships.
- Media remains on the filesystem.
- Source URLs can exist without local media.
- The current project does not scrape or crawl social networks.

## Status Flow

```text
WAITING_MEDIA
    ↓
READY_TO_PROCESS
    ↓
PROCESSING       (next phase)
    ↓
READY            (next phase)
```

## Development Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start with Node.js watch mode |
| `npm start` | Start normally |
| `npm run migrate` | Initialize database schema |
| `npm run doctor` | Check local requirements |

## Next Implementation Phase

Phase 3 should add:

1. Media validation
2. FFmpeg adapter
3. Audio extraction
4. Poster generation
5. Processing job state
6. Processing status UI

Do not implement transcription until Phase 3 acceptance criteria pass.

## Privacy

Enjoy Journal is private and local-first.

- A URL is only saved when the user explicitly adds it.
- The application does not crawl Facebook or other platforms.
- Media processing operates only on files the user provides.
- No user media is published by the application.
