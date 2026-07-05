# Implementation Status

## Current Phase

Phase 6 — Learning Player

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
- [x] Offline and OpenAI lesson providers
- [x] Canonical versioned `lesson.json`
- [x] Today lesson queue
- [x] Searchable Library
- [x] Dedicated Learning Player
- [x] Video/audio byte-range streaming
- [x] Timed transcript synchronization
- [x] Click sentence to seek
- [x] Active sentence highlighting
- [x] Previous/next sentence navigation
- [x] Sentence Loop ×3
- [x] Playback speed controls
- [x] Meaning tab
- [x] Phrases and patterns tab
- [x] Per-lesson Journal editing
- [x] Journal SQLite persistence
- [x] NEW / LEARNING / MASTERED progress
- [x] Listen and shadow counters
- [x] Journal/progress synchronization into lesson artifact
- [x] Journal/progress copy-forward on lesson regeneration
- [x] v0.4.0 → v0.5.0 migration compatibility test
- [x] Media, transcription, lesson and learning smoke tests

## In Progress

- [ ] End-to-end verification with a real user video and local Whisper on the user's Mac
- [ ] End-to-end usability feedback for sentence loop timing

## Not Started

- [ ] Chrome Extension capture
- [ ] Top-level Journal index
- [ ] Keyboard shortcuts
- [ ] Mobile interaction refinement
- [ ] Spaced review scheduling

## Current Flow

```text
Save URL
  ↓
Attach media
  ↓
Process media
  ↓
Create transcript
  ↓
Review incorrect segments
  ↓
Generate lesson
  ↓
Open Today / Library
  ↓
Open lesson
  ↓
Listen + Seek + Loop
  ↓
Meaning + Phrases
  ↓
Journal
```

## Learning Surface Contract

```text
Media
  +
Timed transcript
  +
Meaning by segment
  +
Reusable phrases
  +
Personal journal
  +
Progress
```

## Data Preservation Rules

| Layer | Can change? | Rule |
|---|---:|---|
| Original media | No | User-provided source is preserved |
| Raw transcript | No | Never overwritten by cleaning or review |
| Cleaned transcript | Yes, generated | Basic formatting layer |
| Reviewed transcript | Yes, user action | Only explicit corrections |
| Lesson artifact | Versioned | Regeneration creates another JSON file |
| Journal | Yes, user action | Stored in DB and synchronized to artifact |
| Learning progress | Yes | Stored in DB and synchronized to artifact |

## Today Selection

```text
NEW
  ↓
LEARNING
```

Limit:

```text
5 lessons
```

MASTERED lessons are excluded from Today.

## Library Search Coverage

- title
- Vietnamese summary
- topic
- effective transcript text
- generated key phrases and patterns
- journal content

## Known Constraints

| Constraint | Impact | Handling |
|---|---|---|
| Local-basic meaning may be empty | Meaning tab can be empty | Use OpenAI lesson provider |
| Loop timing is fixed at 900 ms | Pause may not suit every sentence | Make timing configurable later |
| Native browser media controls remain visible | UI is less custom | Keeps MVP reliable and accessible |
| Top-level Journal is still a placeholder | Journal is currently lesson-centric | Build Journal index after Extension |
| Search uses SQLite `LIKE` | Not optimized for huge libraries | Sufficient for personal MVP |

## Phase 6 Acceptance Criteria

```text
LESSON_READY
    ↓
Open lesson
    ↓
Video or audio loads
    ↓
Click transcript sentence
    ↓
Media seeks correctly
    ↓
Current sentence highlights
    ↓
Loop ×3 completes
    ↓
Shadow count increments
    ↓
Save journal note
    ↓
Refresh
    ↓
Journal and progress remain
    ↓
Search phrase/journal in Library
    ↓
Original lesson is found
```
