# Implementation Status

## Current Phase

Phase 5 — Transcript Review & Lesson Generation

## Completed

- [x] Repository structure
- [x] Express server and SQLite persistence
- [x] Inbox capture and media upload
- [x] FFmpeg validation and normalization
- [x] Local Whisper transcription
- [x] Optional OpenAI transcription provider
- [x] Timed transcript persistence
- [x] Automatic basic transcript cleaning
- [x] Per-segment reviewed transcript editing
- [x] Raw/cleaned/reviewed layer preservation
- [x] `lessons` database table
- [x] `lesson_generation_jobs` database table
- [x] Lesson provider interface
- [x] Offline `local-basic` provider
- [x] OpenAI structured lesson provider
- [x] Deterministic mock lesson provider
- [x] Canonical `lesson.json` contract
- [x] Lesson generation progress and recovery
- [x] Lesson preview in Inbox
- [x] Versioned lesson artifacts
- [x] v0.3.0 → v0.4.0 migration compatibility test
- [x] Media, transcription and lesson smoke tests

## In Progress

- [ ] End-to-end verification with a real user video and local Whisper on the user's Mac
- [ ] End-to-end verification of OpenAI lesson generation when `OPENAI_API_KEY` is configured

## Not Started

- [ ] Synchronized video + transcript player
- [ ] Click sentence to seek
- [ ] Sentence loop
- [ ] Playback speed controls
- [ ] Meaning tab
- [ ] Phrase tab
- [ ] Journal editing and search
- [ ] Library view
- [ ] Chrome Extension

## Current Flow

```text
Save URL
  ↓
Attach media
  ↓
Process media
  ↓
MEDIA_READY
  ↓
Create transcript
  ↓
TRANSCRIPT_READY
  ↓
Review incorrect segments
  ↓
Generate lesson
  ↓
LESSON_GENERATING
  ↓
LESSON_READY
  ↓
Preview phrases and patterns
```

## Data Preservation Rules

| Layer | Can change? | Rule |
|---|---:|---|
| Original media | No | User-provided source is preserved |
| Raw transcript | No | Never overwritten by cleaning or review |
| Cleaned transcript | Yes, generated | Basic formatting layer |
| Reviewed transcript | Yes, user action | Only explicit corrections |
| Lesson artifact | Versioned | Regeneration creates another JSON file |

## Provider Modes

| Provider | Network | API key | Purpose |
|---|---:|---:|---|
| `local-basic` | No | No | Offline lesson contract and basic practice material |
| `openai` | Yes | Yes | Vietnamese meaning and deeper language analysis |
| `mock` | No | No | Deterministic automated tests |

## Known Constraints

| Constraint | Impact | Handling |
|---|---|---|
| Local-basic does not perform semantic translation | Vietnamese meaning may be empty | Switch to `LESSON_PROVIDER=openai` |
| AI lesson quality depends on transcript quality | Incorrect transcript can produce poor lesson | Review only incorrect segments first |
| OpenAI provider requires API key and network | Generation can fail offline | Local-basic remains the default fallback |
| Progress during model/API work is approximate | One stage may remain visible for a while | Progress is informational only |

## Phase 5 Acceptance Criteria

```text
TRANSCRIPT_READY
    ↓
Open Review transcript
    ↓
Correct one segment
    ↓
Refresh and correction remains
    ↓
Generate lesson
    ↓
lesson.json is saved
    ↓
Refresh and lesson preview remains
    ↓
Regenerate lesson
    ↓
Previous artifact is still preserved
```
