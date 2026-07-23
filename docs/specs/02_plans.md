Tôi đã khóa phạm vi theo hướng **MVP nhỏ nhưng dùng được thật**, không biến project thành một hệ thống download/scrape Facebook phức tạp.

Các nền tảng kỹ thuật chính đã được kiểm tra lại theo tài liệu hiện tại: Chrome Extension dùng Manifest V3, content script và service worker; FFmpeg chịu trách nhiệm chuẩn hóa media; SQLite phù hợp với dữ liệu local đơn giản; speech-to-text có thể dùng local Whisper hoặc OpenAI Transcription API. ([Chrome for Developers][1])

Dưới đây là bản có thể đưa thẳng cho coding agent.

# ENJOY JOURNAL

## Design Document & Implementation Plan

**Version:** MVP v1
**Purpose:** Personal English Listening & Language Journal
**Primary User:** Single user
**Architecture Style:** Local-first, modular monolith
**Primary Input:** Short English videos and manually imported media
**Primary Output:** Clean learning lessons with video, timed transcript, phrases and journal notes

---

# 1. Product Vision

## 1.1. Problem

The user frequently discovers useful short English videos while browsing social media.

A typical video contains:

* English speech
* subtitles or on-screen text
* interesting ideas
* useful communication patterns
* short duration suitable for repeated listening

Current problems:

1. Saved videos remain inside distracting social-media platforms.
2. The user forgets why a video was saved.
3. Video content is not converted into reusable learning material.
4. There is no structured transcript.
5. There is no sentence-loop practice.
6. Useful language patterns become difficult to find later.
7. The same content cannot easily become a personal journal entry.

---

## 1.2. Product Idea

Create a personal system that transforms:

```text
Interesting short video
        ↓
Save source
        ↓
Attach media
        ↓
AI processing
        ↓
Timed transcript
        ↓
Learning lesson
        ↓
Personal journal
        ↓
Repeated listening
```

The product is not a video downloader.

The product is:

> A personal system for collecting ideas, language and moments worth remembering.

---

# 2. Core Product Principles

## 2.1. No Infinite Feed

The application must not contain:

* infinite scrolling
* trending content
* recommendations unrelated to saved content
* comments
* likes
* social metrics
* engagement notifications

The application optimizes for:

```text
Understand
    ↓
Repeat
    ↓
Remember
    ↓
Use
```

---

## 2.2. Source Is Not the Product

Facebook, YouTube or any future platform is only a source.

The core domain must work without knowing where a video came from.

```text
Source
  ↓
Inbox Item
  ↓
Media Asset
  ↓
Transcript
  ↓
Lesson
  ↓
Journal
```

---

## 2.3. AI Must Not Destroy Original Data

Always preserve:

```text
Original Media
Raw Transcript
Clean Transcript
Reviewed Transcript
Generated Lesson
```

AI-generated content must never silently overwrite the original transcript.

---

## 2.4. Human Review Must Be Cheap

The user must not be required to manually edit the entire transcript.

Review should focus on:

```text
Low-confidence sentence
        ↓
Click
        ↓
Listen
        ↓
Quick edit
        ↓
Save
```

---

## 2.5. Local First

The first version must work completely on one computer.

```text
Browser
    ↓
localhost
    ↓
Express Server
    ↓
SQLite + Local Files
    ↓
AI Worker
```

Remote deployment is a later phase.

---

# 3. MVP Scope

## 3.1. Must Have

The MVP must support:

1. Save a source URL.
2. Add a personal note explaining why it was saved.
3. Upload a local MP4, WebM, MP3, M4A or WAV file.
4. Extract and normalize audio.
5. Generate a transcript.
6. Store timestamps for transcript segments.
7. Generate a cleaned transcript.
8. Generate Vietnamese meaning.
9. Extract useful phrases.
10. Generate shadowing chunks.
11. Play the original video.
12. Click a transcript sentence to seek the video.
13. Loop one sentence.
14. Edit incorrect transcript sentences.
15. Save personal journal notes.
16. Browse all saved lessons.
17. Search lessons.
18. Use a Chrome Extension to save the current page URL.

---

## 3.2. Should Have

Add only after the core flow is stable:

* OCR from visible subtitles
* automatic transcript comparison
* spaced repetition
* vocabulary cards
* pronunciation recording
* AI discussion
* mobile share integration
* cloud synchronization

---

## 3.3. Explicitly Out of Scope for MVP

Do not implement:

* Facebook account automation
* Facebook scraping
* background crawling
* bulk reel collection
* automatic social-media login
* multi-user accounts
* social features
* complex recommendation engine
* React
* microservices
* Docker requirement
* vector database
* Kubernetes
* complex event bus

---

# 4. Primary User Journey

## Flow A — Save While Browsing

```text
User watches interesting video
        ↓
Clicks Enjoy Journal extension
        ↓
Extension shows:

Title
Current URL
Personal note

        ↓
Clicks Save
        ↓
Inbox item created
        ↓
User returns to browsing
```

The extension does not process video.

Its responsibility ends after creating the inbox item.

---

## Flow B — Complete an Inbox Item

```text
Open Enjoy Journal
        ↓
Open Inbox
        ↓
Select saved source
        ↓
Attach local video
        ↓
Click Process
        ↓
Pipeline runs
        ↓
Lesson becomes READY
```

---

## Flow C — Learn

```text
Open Today
        ↓
Select lesson
        ↓
Watch once without transcript
        ↓
Listen with transcript
        ↓
Click difficult sentence
        ↓
Loop sentence
        ↓
Shadow sentence
        ↓
Read meaning
        ↓
Save useful phrase
        ↓
Write one personal thought
```

---

## Flow D — Return Later

```text
Search phrase / topic
        ↓
Open previous lesson
        ↓
Play sentence
        ↓
Reuse pattern
```

---

# 5. High-Level Architecture

```text
┌──────────────────────────────┐
│       Chrome Extension       │
│                              │
│ Save URL                     │
│ Save page title              │
│ Save personal note           │
└──────────────┬───────────────┘
               │ HTTP
               ▼
┌──────────────────────────────┐
│       Express Web App        │
│                              │
│ UI                           │
│ REST API                     │
│ Domain Services              │
│ Job Orchestration            │
└──────────────┬───────────────┘
               │
        ┌──────┴───────┐
        ▼              ▼
┌─────────────┐  ┌─────────────┐
│   SQLite    │  │ Local Files │
│             │  │             │
│ metadata    │  │ video       │
│ transcript  │  │ audio       │
│ lesson      │  │ poster      │
│ journal     │  │ JSON        │
└─────────────┘  └──────┬──────┘
                        │
                        ▼
              ┌──────────────────┐
              │    AI Worker     │
              │                  │
              │ FFmpeg           │
              │ Transcription    │
              │ Lesson Generator │
              │ Optional OCR     │
              └──────────────────┘
```

---

# 6. Technology Stack

| Area          | Technology              | Reason                                        |
| ------------- | ----------------------- | --------------------------------------------- |
| Backend       | Node.js + Express       | Simple and readable                           |
| Frontend      | HTML + CSS + Vanilla JS | No framework overhead                         |
| Database      | SQLite                  | Single-user local-first application           |
| Media         | FFmpeg                  | Audio extraction and media normalization      |
| AI Worker     | Python                  | Easier integration with speech and AI tooling |
| Transcription | Provider Adapter        | Local or cloud can be changed                 |
| Extension     | Chrome Manifest V3      | Current extension architecture                |
| Storage       | Local filesystem        | Simple and transparent                        |

FFmpeg is designed for reading, converting and transcoding media, which makes it suitable as the media-normalization layer. ([FFmpeg][2])

SQLite should store structured metadata. Large media files must remain on the filesystem rather than inside the database. SQLite supports JSON functions, but the MVP should prefer explicit relational columns for frequently queried data. ([SQLite][3])

---

# 7. Repository Structure

```text
enjoy-journal/
│
├── app/
│   ├── server.js
│   ├── config.js
│   ├── routes/
│   │   ├── inbox.routes.js
│   │   ├── lessons.routes.js
│   │   ├── media.routes.js
│   │   └── journal.routes.js
│   │
│   ├── services/
│   │   ├── inbox.service.js
│   │   ├── lesson.service.js
│   │   ├── media.service.js
│   │   ├── pipeline.service.js
│   │   └── storage.service.js
│   │
│   └── db/
│       ├── database.js
│       ├── migrate.js
│       └── migrations/
│
├── worker/
│   ├── main.py
│   ├── pipeline.py
│   ├── stages/
│   │   ├── prepare_media.py
│   │   ├── transcribe.py
│   │   ├── clean_script.py
│   │   ├── generate_lesson.py
│   │   └── quality_check.py
│   │
│   └── providers/
│       ├── transcription_base.py
│       ├── local_whisper.py
│       └── openai_transcription.py
│
├── public/
│   ├── index.html
│   ├── styles/
│   │   └── app.css
│   ├── js/
│   │   ├── app.js
│   │   ├── api.js
│   │   ├── player.js
│   │   └── pages/
│   └── components/
│
├── extension/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   └── service-worker.js
│
├── data/
│   ├── journal.db
│   ├── inbox/
│   ├── lessons/
│   └── temp/
│
├── scripts/
│   ├── doctor.sh
│   └── reset-dev-data.sh
│
├── .env.example
├── start.sh
├── package.json
├── requirements.txt
└── README.md
```

## Repository Rule

Maximum conceptual depth:

```text
domain
    ↓
feature
        ↓
file
```

Do not divide one simple feature into unnecessary layers such as:

```text
controller
repository
use-case
interactor
gateway
adapter
factory
```

Use services only when actual logic exists.

---

# 8. Domain Model

The system contains six main entities.

```text
Source
Inbox Item
Media Asset
Transcript
Lesson
Journal Entry
```

---

# 9. Entity Relationships

```text
Source
  │
  │ 1
  ▼
Inbox Item
  │
  │ 0..1
  ▼
Media Asset
  │
  │ 0..1
  ▼
Transcript
  │
  │ 0..1
  ▼
Lesson
  │
  │ 0..*
  ▼
Journal Entry
```

A source can exist without media.

This is important.

Example:

```text
Saved Facebook Reel
        ↓
URL exists
        ↓
No local video yet
        ↓
Status = WAITING_MEDIA
```

---

# 10. Database Schema

## 10.1. sources

```sql
CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    url TEXT,
    title TEXT,
    author TEXT,
    platform TEXT,
    captured_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
```

Example `type`:

```text
facebook-reel
youtube-short
local-file
uploaded-file
other-url
```

---

## 10.2. inbox_items

```sql
CREATE TABLE inbox_items (
    id TEXT PRIMARY KEY,
    source_id TEXT,
    status TEXT NOT NULL,
    personal_note TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY(source_id) REFERENCES sources(id)
);
```

Allowed status:

```text
SAVED
WAITING_MEDIA
READY_TO_PROCESS
PROCESSING
NEEDS_REVIEW
READY
FAILED
ARCHIVED
```

---

## 10.3. media_assets

```sql
CREATE TABLE media_assets (
    id TEXT PRIMARY KEY,
    inbox_item_id TEXT NOT NULL,
    original_filename TEXT,
    media_type TEXT NOT NULL,
    original_path TEXT NOT NULL,
    normalized_video_path TEXT,
    normalized_audio_path TEXT,
    poster_path TEXT,
    duration_ms INTEGER,
    size_bytes INTEGER,
    created_at TEXT NOT NULL,

    FOREIGN KEY(inbox_item_id) REFERENCES inbox_items(id)
);
```

---

## 10.4. transcripts

```sql
CREATE TABLE transcripts (
    id TEXT PRIMARY KEY,
    media_asset_id TEXT NOT NULL,
    language TEXT,
    raw_text TEXT,
    cleaned_text TEXT,
    reviewed_text TEXT,
    provider TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY(media_asset_id) REFERENCES media_assets(id)
);
```

---

## 10.5. transcript_segments

```sql
CREATE TABLE transcript_segments (
    id TEXT PRIMARY KEY,
    transcript_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    cleaned_text TEXT,
    reviewed_text TEXT,
    confidence REAL,
    review_status TEXT NOT NULL DEFAULT 'UNREVIEWED',

    FOREIGN KEY(transcript_id) REFERENCES transcripts(id)
);
```

---

## 10.6. lessons

```sql
CREATE TABLE lessons (
    id TEXT PRIMARY KEY,
    inbox_item_id TEXT NOT NULL,
    transcript_id TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    topic TEXT,
    difficulty TEXT,
    status TEXT NOT NULL,
    lesson_json_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY(inbox_item_id) REFERENCES inbox_items(id),
    FOREIGN KEY(transcript_id) REFERENCES transcripts(id)
);
```

---

## 10.7. journal_entries

```sql
CREATE TABLE journal_entries (
    id TEXT PRIMARY KEY,
    lesson_id TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY(lesson_id) REFERENCES lessons(id)
);
```

`entry_type`:

```text
WHY_I_SAVED
MY_THOUGHT
FAVORITE_PHRASE
MY_EXAMPLE
GENERAL_NOTE
```

---

## 10.8. learning_progress

```sql
CREATE TABLE learning_progress (
    lesson_id TEXT PRIMARY KEY,
    learning_status TEXT NOT NULL,
    listen_count INTEGER NOT NULL DEFAULT 0,
    shadow_count INTEGER NOT NULL DEFAULT 0,
    last_opened_at TEXT,
    last_completed_at TEXT,

    FOREIGN KEY(lesson_id) REFERENCES lessons(id)
);
```

---

# 11. Filesystem Layout

Every inbox item receives one permanent directory.

```text
data/lessons/{lesson-id}/
│
├── source.json
│
├── media/
│   ├── original.mp4
│   ├── normalized.mp4
│   ├── audio.wav
│   └── poster.jpg
│
├── transcript/
│   ├── raw.json
│   ├── cleaned.json
│   └── reviewed.json
│
└── lesson/
    └── lesson.json
```

Rule:

```text
Database
    =
searchable state and relationships

Filesystem
    =
large assets and portable artifacts
```

---

# 12. Canonical lesson.json Contract

```json
{
  "schemaVersion": "1.0",

  "lesson": {
    "id": "lesson_01HXYZ",
    "title": "Doing What Actually Matters",
    "topic": "productivity",
    "difficulty": "B1",
    "createdAt": "2026-07-05T14:00:00+07:00"
  },

  "source": {
    "type": "facebook-reel",
    "platform": "facebook",
    "url": "https://example.com/source",
    "title": null,
    "author": null,
    "capturedAt": "2026-07-05T13:00:00+07:00"
  },

  "media": {
    "videoPath": "media/normalized.mp4",
    "audioPath": "media/audio.wav",
    "posterPath": "media/poster.jpg",
    "durationMs": 32000
  },

  "transcript": {
    "language": "en",
    "segments": [
      {
        "id": "seg_001",
        "startMs": 300,
        "endMs": 4200,
        "rawText": "I used to think being productive meant doing more",
        "cleanedText": "I used to think being productive meant doing more.",
        "reviewedText": null,
        "confidence": 0.94,
        "reviewStatus": "UNREVIEWED"
      }
    ]
  },

  "learning": {
    "summaryVi": "Video nói về sự thay đổi trong cách nhìn nhận năng suất.",

    "meaning": [
      {
        "segmentId": "seg_001",
        "vi": "Trước đây tôi từng nghĩ rằng làm việc năng suất nghĩa là làm nhiều hơn."
      }
    ],

    "keyPhrases": [
      {
        "phrase": "I used to think...",
        "meaningVi": "Trước đây tôi từng nghĩ rằng...",
        "whyUseful": "Dùng để nói về sự thay đổi trong suy nghĩ.",
        "sourceSegmentIds": [
          "seg_001"
        ]
      }
    ],

    "patterns": [
      {
        "pattern": "I used to think X, but now I think Y.",
        "explanationVi": "Mẫu câu diễn tả sự thay đổi quan điểm.",
        "example": "I used to think AI was just a chatbot, but now I think it is a new way of working."
      }
    ],

    "shadowingChunks": [
      {
        "segmentId": "seg_001",
        "chunks": [
          "I used to think",
          "being productive",
          "meant doing more"
        ]
      }
    ],

    "questions": [
      {
        "question": "What did the speaker use to think?",
        "answer": "Being productive meant doing more."
      }
    ]
  },

  "journal": {
    "whyISavedThis": "",
    "myThought": "",
    "favoritePhrase": "",
    "myExample": ""
  },

  "progress": {
    "status": "NEW",
    "listenCount": 0,
    "shadowCount": 0
  }
}
```

---

# 13. API Contract

Base path:

```text
/api
```

---

## 13.1. Create Inbox Item

```http
POST /api/inbox
```

Request:

```json
{
  "source": {
    "type": "facebook-reel",
    "url": "https://...",
    "title": "Optional page title",
    "platform": "facebook"
  },
  "personalNote": "I like the way this idea is explained."
}
```

Response:

```json
{
  "data": {
    "id": "inbox_001",
    "status": "WAITING_MEDIA"
  }
}
```

---

## 13.2. List Inbox

```http
GET /api/inbox
```

Optional:

```text
?status=WAITING_MEDIA
```

---

## 13.3. Upload Media

```http
POST /api/inbox/:id/media
```

Content type:

```text
multipart/form-data
```

Response:

```json
{
  "data": {
    "mediaAssetId": "media_001",
    "status": "READY_TO_PROCESS"
  }
}
```

---

## 13.4. Start Processing

```http
POST /api/inbox/:id/process
```

Response:

```json
{
  "data": {
    "status": "PROCESSING"
  }
}
```

---

## 13.5. Read Processing State

```http
GET /api/inbox/:id/status
```

Response:

```json
{
  "data": {
    "status": "PROCESSING",
    "stage": "TRANSCRIBING",
    "progress": 45
  }
}
```

Progress is informational only.

The pipeline must work correctly even without an exact percentage.

---

## 13.6. List Lessons

```http
GET /api/lessons
```

Supported query:

```text
?q=productivity
&status=NEW
&topic=ai
```

---

## 13.7. Read Lesson

```http
GET /api/lessons/:id
```

---

## 13.8. Update Transcript Segment

```http
PATCH /api/lessons/:lessonId/segments/:segmentId
```

Request:

```json
{
  "reviewedText": "Corrected sentence.",
  "reviewStatus": "REVIEWED"
}
```

---

## 13.9. Update Journal

```http
PATCH /api/lessons/:id/journal
```

Request:

```json
{
  "whyISavedThis": "...",
  "myThought": "...",
  "favoritePhrase": "...",
  "myExample": "..."
}
```

---

## 13.10. Update Progress

```http
POST /api/lessons/:id/progress
```

Request:

```json
{
  "action": "LISTEN_COMPLETED"
}
```

Allowed actions:

```text
OPENED
LISTEN_COMPLETED
SHADOW_COMPLETED
MARK_LEARNING
MARK_MASTERED
```

---

# 14. Standard API Response

Success:

```json
{
  "data": {},
  "error": null
}
```

Failure:

```json
{
  "data": null,
  "error": {
    "code": "MEDIA_INVALID",
    "message": "The uploaded media could not be processed."
  }
}
```

Never return raw Python exceptions or FFmpeg stderr directly to the browser.

---

# 15. Processing Pipeline

```text
VALIDATE
    ↓
PREPARE_MEDIA
    ↓
TRANSCRIBE
    ↓
CLEAN_SCRIPT
    ↓
GENERATE_LESSON
    ↓
QUALITY_CHECK
    ↓
READY
```

Each stage must:

1. Accept an explicit input contract.
2. Produce an explicit output artifact.
3. Be rerunnable.
4. Never depend on hidden global state.
5. Record success or failure.

---

# 16. Pipeline Job Contract

```json
{
  "jobId": "job_001",
  "inboxItemId": "inbox_001",
  "mediaAssetId": "media_001",
  "workingDirectory": "/absolute/path/to/item",
  "config": {
    "transcriptionProvider": "local-whisper",
    "sourceLanguage": "en",
    "targetLanguage": "vi"
  }
}
```

Worker output:

```json
{
  "success": true,
  "currentStage": "COMPLETE",
  "artifacts": {
    "audio": "media/audio.wav",
    "rawTranscript": "transcript/raw.json",
    "cleanedTranscript": "transcript/cleaned.json",
    "lesson": "lesson/lesson.json"
  }
}
```

---

# 17. Stage 1 — Validate Media

Validate:

* file exists
* supported media type
* duration can be read
* file is not empty
* FFmpeg can decode media

Output:

```json
{
  "valid": true,
  "durationMs": 32000,
  "detectedType": "video/mp4"
}
```

Error codes:

```text
MEDIA_NOT_FOUND
MEDIA_EMPTY
MEDIA_UNSUPPORTED
MEDIA_UNREADABLE
```

---

# 18. Stage 2 — Prepare Media

Input:

```text
Original media
```

Output:

```text
normalized.mp4
audio.wav
poster.jpg
```

Audio target:

```text
mono
16 kHz
WAV
```

Example command:

```bash
ffmpeg \
  -i input.mp4 \
  -vn \
  -ac 1 \
  -ar 16000 \
  output.wav
```

Media preparation must be isolated behind:

```python
prepare_media(input_path, output_directory)
```

The rest of the system must not execute FFmpeg commands directly.

---

# 19. Stage 3 — Transcription

Define one provider interface.

```python
class TranscriptionProvider:
    def transcribe(self, audio_path: str) -> dict:
        raise NotImplementedError
```

Implement:

```text
LocalWhisperProvider
OpenAITranscriptionProvider
```

Environment configuration:

```text
TRANSCRIPTION_PROVIDER=local-whisper
```

or:

```text
TRANSCRIPTION_PROVIDER=openai
```

The current OpenAI transcription API supports file-based transcription workflows and multiple transcription models, so the provider abstraction prevents the application from being tied to one model or service. ([OpenAI Developers][4])

Canonical provider output:

```json
{
  "language": "en",
  "text": "Full raw transcript",
  "segments": [
    {
      "startMs": 0,
      "endMs": 2500,
      "text": "Hello everyone",
      "confidence": 0.95
    }
  ]
}
```

All providers must return this exact internal format.

---

# 20. Stage 4 — Clean Script

Purpose:

* add punctuation
* fix obvious transcription formatting
* preserve original meaning
* preserve spoken style
* detect uncertain edits

Input:

```json
{
  "rawSegments": []
}
```

Output:

```json
{
  "segments": [
    {
      "segmentId": "seg_001",
      "rawText": "i wanna tell you something",
      "cleanedText": "I wanna tell you something.",
      "changeType": "FORMATTING",
      "needsReview": false
    }
  ]
}
```

Rules:

AI may:

* correct capitalization
* add punctuation
* fix clearly broken word boundaries

AI must not:

* rewrite the speaker's idea
* replace informal language with formal language
* add missing ideas
* invent unheard words

Example:

```text
Raw:
I wanna tell you something

Correct:
I wanna tell you something.

Incorrect:
I want to share an important insight with you.
```

---

# 21. Stage 5 — Generate Lesson

Lesson generation must use the cleaned transcript.

Input:

```text
Source metadata
Clean transcript
Personal note
```

Output:

```text
lesson.json
```

Generate only:

```text
Title
Short Vietnamese summary
Sentence meaning
Key phrases
Communication patterns
Shadowing chunks
Maximum 3 questions
```

Do not generate:

```text
20 vocabulary words
long grammar lectures
large essays
unrelated knowledge
generic motivational content
```

---

# 22. Lesson Generation Rules

## Rule 1 — Maximum Five Key Phrases

A 30-second video does not need 20 vocabulary items.

Target:

```text
1–5 useful phrases
```

---

## Rule 2 — Prefer Reusable Language

Good:

```text
I used to think...
What I mean is...
The problem is...
It turns out that...
The way I see it...
```

Less useful:

```text
rare noun
person name
random number
one-time product name
```

---

## Rule 3 — Personalization Must Match User Context

Prefer examples related to:

```text
software engineering
systems
AI
learning
work communication
technology
```

Example:

```text
I used to think AI was just a chatbot,
but now I think it changes how we build software.
```

---

## Rule 4 — Preserve Natural English

Do not turn all language into textbook English.

Example:

```text
Spoken:
I wanna show you something.

Learning note:
"wanna" is common in informal speech.

Formal equivalent:
I want to show you something.
```

---

# 23. Stage 6 — Quality Check

Before publishing a lesson:

```text
✓ Media exists
✓ Transcript has at least one segment
✓ Segments are ordered
✓ Start time < end time
✓ Timestamps fit media duration
✓ Lesson JSON matches schema
✓ Key phrases exist in source transcript
✓ Shadowing chunks come from the transcript
```

Failure:

```text
status = NEEDS_REVIEW
```

Do not automatically publish a lesson with structurally invalid output.

---

# 24. OCR Strategy

OCR is not a blocking MVP feature.

Create interface:

```python
class VisualTextProvider:
    def extract(self, video_path: str) -> dict:
        raise NotImplementedError
```

Future pipeline:

```text
Audio Transcript
        +
Visible Caption Text
        ↓
Alignment
        ↓
Mismatch Detection
        ↓
Suggested Correction
```

Example:

```text
Speech recognition:
I use too think

Visible caption:
I used to think

Result:
Possible correction detected
```

Important:

OCR suggestions must not automatically overwrite the reviewed transcript.

---

# 25. Chrome Extension

Use Manifest V3.

A content script can read page context and communicate with the extension, while the service worker handles extension-level events. Inputs received from page context must be validated before triggering privileged actions. ([Chrome for Developers][1])

## Extension Responsibility

Only:

```text
Read current URL
Read page title
Accept note
Send data to Enjoy Journal API
```

Not:

```text
Download video
Crawl feed
Read comments
Collect other posts
Monitor user activity
```

---

## Popup UI

```text
┌──────────────────────────────┐
│ Enjoy Journal                │
│                              │
│ Save this moment             │
│                              │
│ Facebook Reel                │
│                              │
│ Why are you saving this?     │
│ ┌──────────────────────────┐ │
│ │ Nice way to explain...   │ │
│ └──────────────────────────┘ │
│                              │
│        [ Save to Inbox ]     │
└──────────────────────────────┘
```

After save:

```text
✓ Saved

Add media later in Enjoy Journal.
```

---

# 26. Website Information Architecture

Exactly four primary sections:

```text
TODAY
INBOX
LIBRARY
JOURNAL
```

Header:

```text
Enjoy Journal

Today   Inbox   Library   Journal           Search
```

Do not add more top-level navigation during MVP development.

---

# 27. Screen 1 — Today

Purpose:

```text
Open app
    ↓
Immediately start learning
```

Layout:

```text
┌───────────────────────────────────────────────┐
│ Enjoy Journal                         Search  │
│ Today   Inbox   Library   Journal             │
├───────────────────────────────────────────────┤
│                                               │
│ TODAY                                         │
│ 3 small moments                               │
│                                               │
│ ┌───────────────────────────────────────────┐ │
│ │ Video poster                              │ │
│ │                                           │ │
│ │ Doing What Actually Matters              │ │
│ │                                           │ │
│ │ 32 sec · Productivity                    │ │
│ │                                           │ │
│ │ Continue listening →                     │ │
│ └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

MVP Today selection:

```text
READY or LEARNING lessons
ordered by last_opened_at ascending
limit 5
```

No recommendation AI needed.

---

# 28. Screen 2 — Inbox

```text
INBOX

Waiting for media    3
Processing           1
Needs review         1
```

Card:

```text
┌─────────────────────────────────────────┐
│ Facebook Reel                           │
│                                         │
│ Saved yesterday                         │
│                                         │
│ "Interesting explanation about AI..."  │
│                                         │
│ Status: Waiting for media               │
│                                         │
│ [ Attach video ]                        │
└─────────────────────────────────────────┘
```

After upload:

```text
[ Process video ]
```

---

# 29. Screen 3 — Lesson Player

This is the most important screen.

Desktop:

```text
┌─────────────────────────────────────────────────────────┐
│ ← Library                    Doing What Actually Matters │
├───────────────────────────┬─────────────────────────────┤
│                           │                             │
│                           │  TRANSCRIPT                 │
│         VIDEO             │                             │
│                           │  ● I used to think being    │
│                           │    productive meant doing   │
│                           │    more.                    │
│                           │                             │
│                           │    But now I think...       │
│                           │                             │
├───────────────────────────┴─────────────────────────────┤
│  Listen     Meaning     Phrases     Journal             │
└─────────────────────────────────────────────────────────┘
```

Mobile:

```text
VIDEO

Transcript sentence

Controls

Listen | Meaning | Phrases | Journal
```

---

# 30. Player Requirements

Controls:

```text
Play / Pause
Seek
0.75×
1×
1.25×
Previous sentence
Next sentence
Loop sentence
```

Click transcript:

```text
segment.startMs
        ↓
video.currentTime
```

Current sentence:

```text
video.currentTime
        ↓
find active segment
        ↓
highlight
```

---

# 31. Sentence Loop

State:

```js
{
  enabled: true,
  segmentId: "seg_001",
  repetitions: 3,
  pauseMs: 1000
}
```

Behavior:

```text
Seek start
    ↓
Play
    ↓
Reach segment end
    ↓
Pause
    ↓
Wait
    ↓
Repeat
```

Modes:

```text
LISTEN
LISTEN_WITH_SCRIPT
SHADOW
```

MVP implementation may use the same player behavior for all modes.

The difference is UI guidance.

---

# 32. Screen 4 — Library

Search across:

```text
Title
Summary
Transcript
Key phrase
Journal note
```

Filters:

```text
All
New
Learning
Mastered
```

Do not add advanced taxonomy initially.

---

# 33. Journal View

Purpose:

See collected thoughts instead of seeing videos.

```text
JOURNAL

"I used to think..."

From:
Doing What Actually Matters

My example:
I used to think AI was just a chatbot,
but now I think it changes how I work.
```

This view should make the application feel like a personal knowledge journal rather than a video collection.

---

# 34. Frontend Component Boundary

```text
components/
├── app-header.js
├── lesson-card.js
├── video-player.js
├── transcript-view.js
├── sentence-loop.js
├── phrase-card.js
├── journal-editor.js
├── status-badge.js
└── empty-state.js
```

Rule:

Create a component when:

```text
used more than once
OR
has independent state
OR
contains meaningful interaction logic
```

Do not create components for:

```text
simple heading
single paragraph
one button used once
```

---

# 35. Application State

No Redux.

No global state framework.

Use:

```js
const appState = {
  currentPage: "today",
  currentLesson: null
};
```

Component-specific state remains inside its component.

---

# 36. Visual Direction

Keywords:

```text
Calm
Warm
Editorial
Focused
Personal
```

Avoid:

```text
Corporate dashboard
Social feed
Bright gamification
Too many borders
Too many metrics
```

The main content should feel similar to:

```text
private reading journal
+
language listening player
```

---

# 37. Design Tokens

```css
:root {
  --page-max-width: 1180px;

  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 40px;

  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;

  --text-xs: 12px;
  --text-sm: 14px;
  --text-md: 16px;
  --text-lg: 20px;
  --text-xl: 32px;
}
```

Do not scatter random spacing values across CSS.

---

# 38. Background Job Strategy

MVP does not need Redis.

Use database state plus worker process.

```text
Express
    ↓
Creates processing job
    ↓
Starts worker
    ↓
Worker updates status file/database
    ↓
Browser polls status
```

Prevent duplicate processing:

```text
If status == PROCESSING
    reject second process request
```

Future versions may replace this with a real queue without changing the pipeline interface.

---

# 39. Error Handling

Errors must be actionable.

Bad:

```text
Something went wrong.
```

Good:

```text
We could not read this video.

Try:
1. Uploading the file again.
2. Converting it to MP4.
```

Internal error code:

```text
MEDIA_UNREADABLE
```

User message:

```text
We could not read this video.
```

Debug detail:

```text
logs only
```

---

# 40. Logging

Every pipeline job:

```text
job id
inbox item id
stage
started at
completed at
status
error code
```

Example:

```text
[JOB job_001]
[TRANSCRIBE]
Started

[JOB job_001]
[TRANSCRIBE]
Completed
segments=14
```

Do not log:

```text
API keys
full environment variables
private tokens
```

---

# 41. Configuration

`.env.example`:

```text
PORT=3000

DATA_DIR=./data

TRANSCRIPTION_PROVIDER=local-whisper

OPENAI_API_KEY=

SOURCE_LANGUAGE=en
TARGET_LANGUAGE=vi

MAX_UPLOAD_MB=200
```

Application must fail early with a clear message when required configuration is missing.

---

# 42. start.sh

Responsibilities:

```text
Check Node.js
Check Python
Check FFmpeg
Install Node dependencies when missing
Create Python virtual environment when missing
Install Python requirements when missing
Create data directories
Run migrations
Start worker
Start Express
```

Expected usage:

```bash
chmod +x start.sh
./start.sh
```

Do not require the user to remember multiple startup commands.

---

# 43. doctor.sh

Purpose:

Diagnose a new machine.

Output:

```text
Enjoy Journal Doctor

✓ Node.js
✓ npm
✓ Python
✓ FFmpeg
✓ SQLite database
✓ Data directory

Transcription provider:
✓ local-whisper

Ready.
```

Failure:

```text
✗ FFmpeg not found

Install FFmpeg and run again.
```

---

# 44. Implementation Order

## Phase 1 — Foundation

Build:

```text
Repository structure
start.sh
Express server
Static frontend
SQLite
Migrations
Health API
```

Acceptance:

```text
./start.sh
    ↓
Open browser
    ↓
Enjoy Journal home page loads
```

---

## Phase 2 — Inbox

Build:

```text
Source model
Inbox model
Create inbox API
Inbox list API
Create inbox UI
Upload media
```

Acceptance:

```text
Paste URL
Add note
Save
Attach MP4
Refresh browser
Data remains
```

---

## Phase 3 — Media Processing

Build:

```text
Media validation
FFmpeg adapter
Audio extraction
Poster generation
Job state
Processing status UI
```

Acceptance:

```text
Upload video
Process
audio.wav exists
poster.jpg exists
status is correct
```

---

## Phase 4 — Transcription

Build:

```text
Provider interface
One working provider
Raw transcript
Segments
Database persistence
```

Acceptance:

```text
Video
    ↓
Transcript with timestamps
    ↓
Click segment
    ↓
Player seeks correctly
```

---

## Phase 5 — Lesson Generator

Build:

```text
Transcript cleaning
Vietnamese meaning
Key phrases
Patterns
Shadowing chunks
lesson.json
```

Acceptance:

```text
Processed video
    ↓
Valid lesson.json
    ↓
Lesson page renders
```

---

## Phase 6 — Learning Player

Build:

```text
Video player
Transcript synchronization
Sentence seeking
Sentence loop
Playback speed
Meaning tab
Phrase tab
```

Acceptance:

```text
User can learn one entire video
without leaving the lesson page
```

---

## Phase 7 — Journal

Build:

```text
Journal fields
Auto-save
Journal index
Search
```

Acceptance:

```text
Save personal phrase
    ↓
Search phrase
    ↓
Find original lesson
    ↓
Play original sentence
```

---

## Phase 8 — Chrome Extension

Build:

```text
Manifest V3
Popup
Current URL
Page title
Personal note
POST /api/inbox
Success state
```

Acceptance:

```text
Open supported page
    ↓
Click extension
    ↓
Save
    ↓
Item appears in Enjoy Journal Inbox
```

---

## Phase 9 — Hardening

Build:

```text
Error states
Empty states
Retry
Processing lock
File validation
Backup
README
doctor.sh
```

---

# 45. Required Tests

## Unit Tests

Test:

```text
Status transitions
Lesson JSON validation
Transcript segment ordering
Storage paths
Provider normalization
```

---

## Integration Tests

Test:

```text
Create inbox
Upload media
Start processing
Read transcript
Edit sentence
Save journal
Search lesson
```

---

## Fixture

Repository must contain one small test fixture:

```text
tests/fixtures/sample-short.mp4
```

Expected:

```text
duration < 30 seconds
English speech
known expected phrase
```

Never use random external URLs in automated tests.

---

# 46. Status Transition Rules

Allowed:

```text
SAVED
    ↓
WAITING_MEDIA

WAITING_MEDIA
    ↓
READY_TO_PROCESS

READY_TO_PROCESS
    ↓
PROCESSING

PROCESSING
    ↓
READY

PROCESSING
    ↓
NEEDS_REVIEW

PROCESSING
    ↓
FAILED
```

Not allowed:

```text
READY
    ↓
PROCESSING
```

unless the user explicitly selects:

```text
Reprocess
```

Reprocessing must preserve:

```text
Reviewed transcript
Journal notes
```

---

# 47. Backup Strategy

Backup:

```text
data/journal.db
data/lessons/
```

Command:

```text
npm run backup
```

Output:

```text
backups/
└── enjoy-journal-YYYY-MM-DD-HHMM/
```

A backup must contain everything required to restore the personal library.

---

# 48. Privacy and Source Policy

The system must distinguish:

```text
Source reference
        versus
Owned local media
```

Rules:

1. A saved URL may exist without media.
2. The system does not automatically crawl social networks.
3. The Chrome Extension saves only the page the user explicitly requests.
4. The processing pipeline operates on media the user provides to the system.
5. Source attribution remains attached to the lesson.
6. The system is private by default.
7. A future public-sharing feature must not automatically publish source media.

---

# 49. Definition of MVP Done

The MVP is complete only when this exact journey works:

```text
1. User sees an interesting short video.

2. User saves the URL with the extension.

3. The item appears in Inbox.

4. User attaches a local video file.

5. User clicks Process.

6. The application:
   - prepares media
   - creates transcript
   - creates timestamps
   - creates Vietnamese meaning
   - extracts useful phrases
   - creates shadowing chunks

7. User opens the lesson.

8. User clicks one sentence.

9. Video jumps to that sentence.

10. User loops it three times.

11. User edits one incorrect word.

12. User saves one personal example.

13. User closes the application.

14. User opens it later.

15. All data is still available.

16. User searches the saved phrase.

17. The original lesson is found.
```

Anything not required for this journey is secondary.

---

# 50. Coding Agent Rules

The coding agent must follow these rules:

## Rule 1

Do not change the architecture without documenting the reason.

## Rule 2

Do not introduce a framework because it is popular.

## Rule 3

Do not implement future features before the current phase passes acceptance criteria.

## Rule 4

Every external AI service must be behind an internal provider interface.

## Rule 5

Every pipeline stage must be independently rerunnable.

## Rule 6

Never delete raw transcript data.

## Rule 7

Never allow AI-generated content to silently replace reviewed user content.

## Rule 8

Keep directory depth shallow.

## Rule 9

Prefer readable code over clever abstractions.

## Rule 10

At the end of every phase, update:

```text
README.md
docs/IMPLEMENTATION_STATUS.md
```

---

# 51. IMPLEMENTATION_STATUS Template

```markdown
# Implementation Status

## Current Phase

Phase 3 — Media Processing

## Completed

- [x] Express server
- [x] SQLite migrations
- [x] Create inbox item
- [x] Upload media

## In Progress

- [ ] Extract audio

## Not Started

- [ ] Transcription
- [ ] Lesson generation
- [ ] Learning player

## Known Issues

| Issue | Impact | Next Action |
| ----- | ------ | ----------- |
| None  | -      | -           |

## Architecture Decisions

| Decision   | Reason                         |
| ---------- | ------------------------------ |
| SQLite     | Single-user local-first system |
| Vanilla JS | MVP simplicity                 |
```

---

# 52. README Required Sections

```text
1. What is Enjoy Journal?
2. Product Flow
3. Architecture
4. Repository Map
5. Requirements
6. Quick Start
7. Configuration
8. Processing Pipeline
9. Data Storage
10. Chrome Extension
11. Development Commands
12. Backup and Restore
13. Troubleshooting
14. Current Implementation Status
```

README must prefer:

```text
tables
diagrams
commands
examples
```

over long prose.

---

# 53. Final Architecture Decision

The project must be implemented as:

```text
ONE PRODUCT
    │
    ├── Express Application
    ├── Python Processing Worker
    ├── Chrome Capture Extension
    └── Local Personal Library
```

Not:

```text
Downloader
+
Transcript Tool
+
Flashcard Tool
+
Journal Tool
+
Five disconnected applications
```

The central object is:

```text
A meaningful moment
```

The system enriches that moment over time:

```text
Moment
  ↓
Source
  ↓
Media
  ↓
Transcript
  ↓
Meaning
  ↓
Language Pattern
  ↓
Personal Thought
  ↓
Memory
```

That is the core of **Enjoy Journal**.

Bản này đủ chặt để giao thẳng cho coding agent mà không phải tự đoán kiến trúc. Điểm tôi cố ý giữ rất rõ là: **MVP phải hoàn thành một vòng học hoàn chỉnh trước**, sau đó mới thêm OCR, cloud sync hay spaced repetition.

Bước tiếp theo hợp lý là chuyển chính đặc tả này thành **repository skeleton thực tế**, gồm cấu trúc thư mục, `README.md`, `start.sh`, database migration, API contracts và bộ task triển khai theo từng phase.

[1]: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts?utm_source=chatgpt.com "Content scripts | Chrome for Developers"
[2]: https://ffmpeg.org/ffmpeg.html?utm_source=chatgpt.com "ffmpeg Documentation"
[3]: https://sqlite.org/json1.html?utm_source=chatgpt.com "JSON Functions And Operators"
[4]: https://developers.openai.com/api/docs/guides/speech-to-text?utm_source=chatgpt.com "Speech to text | OpenAI API"
