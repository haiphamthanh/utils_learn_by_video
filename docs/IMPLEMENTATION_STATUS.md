# Implementation Status

## Current Phase

Phase 4 — Transcription

## Completed

- [x] Repository structure
- [x] Express server
- [x] SQLite persistence
- [x] Inbox capture and media upload
- [x] FFmpeg validation and normalization
- [x] Audio extraction and poster generation
- [x] Media processing jobs with retry/recovery
- [x] Transcription provider interface
- [x] Local Whisper provider
- [x] OpenAI transcription provider
- [x] Timed transcript persistence
- [x] Transcript segment persistence
- [x] Transcription job progress and recovery
- [x] Transcript preview in Inbox
- [x] Automatic Python virtual environment setup
- [x] Deterministic transcription smoke test

## In Progress

- [ ] End-to-end local Whisper verification on the user's Mac

## Not Started

- [ ] Transcript editing UI
- [ ] Transcript cleaning
- [ ] Vietnamese meaning
- [ ] Key phrase extraction
- [ ] Lesson generation
- [ ] Synchronized learning player
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
TRANSCRIBING
  ↓
TRANSCRIPT_READY
  ↓
Timed transcript preview
```

## Known Constraints

| Constraint | Impact | Handling |
|---|---|---|
| First local transcription downloads model weights | First run is slower | Model is cached for later runs |
| Local Whisper officially targets Python 3.8-3.11 | Newer Python may fail | Setup script provisions Python 3.11 on macOS |
| OpenAI timestamp mode uses `whisper-1` | Newer transcription models have different output capabilities | OpenAI provider intentionally defaults to `whisper-1` |
| Progress during model inference is approximate | UI may remain on one stage for a while | Stages are informational, not exact time estimates |

## Next Acceptance Criteria

Phase 4 is done when:

```text
MEDIA_READY
    ↓
Click Create transcript
    ↓
Timed segments are saved
    ↓
Refresh app
    ↓
Transcript remains available
```
