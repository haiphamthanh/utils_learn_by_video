# Implementation Status

## Current Phase

Phase 8 — Automatic URL-to-Lesson Pipeline

## Completed

- [x] Repository structure
- [x] Express server and SQLite persistence
- [x] Browser and web source capture
- [x] Automatic URL media acquisition with `yt-dlp`
- [x] Automatic URL → media → transcript → lesson orchestration
- [x] Source acquisition job persistence and progress
- [x] Retry automatic analysis from the failed step
- [x] Manual media upload fallback
- [x] Optional explicit browser-cookie source configuration
- [x] FFmpeg validation and normalization
- [x] Local Whisper transcription
- [x] Optional OpenAI transcription provider
- [x] Timed transcript persistence and correction
- [x] Offline and OpenAI lesson providers
- [x] Versioned lesson artifacts
- [x] Today and searchable Library
- [x] Learning Player with seek, highlight and Loop ×3
- [x] Per-lesson Journal and learning progress
- [x] Manifest V3 Chrome Extension
- [x] Automatic acquisition smoke test
- [x] Existing media/transcription/lesson/learning/extension regressions preserved

## Default Flow

```text
Reel / Short URL
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

No manual upload is required when the source can be imported automatically.

## Fallback Flow

```text
MEDIA_ACQUISITION_FAILED
  ↓
Retry automatic analysis
  or
Attach media manually
  ↓
Automatic pipeline resumes from the next unfinished step
```

## Current Source Acquisition Architecture

```text
Source URL
  ↓
source_acquisition_jobs
  ↓
yt-dlp in project .venv
  ↓
local acquired media
  ↓
existing media_assets contract
  ↓
existing Phase 3–6 pipeline
```

## Privacy Boundary

Default:

```text
MEDIA_COOKIE_BROWSER=
```

The application does not read browser cookies unless the user explicitly configures a browser source. The automatic importer only runs for a URL the user explicitly saves or retries.

## In Progress

- [ ] End-to-end verification against the user's real Facebook Reel on the user's Mac
- [ ] Tune Facebook authentication fallback if the Reel is login-gated
- [ ] Observe local Whisper speed with real short videos

## Not Started

- [ ] Top-level Journal index
- [ ] Keyboard shortcuts
- [ ] Mobile interaction refinement
- [ ] Spaced review scheduling
- [ ] Optional private remote access

## Acceptance Criteria

```text
Open Reel / Short
    ↓
Click extension
    ↓
Save & analyze
    ↓
No manual upload
    ↓
Local media appears
    ↓
Transcript appears
    ↓
Lesson becomes ready
```

If automatic acquisition cannot access the source, the item must show an actionable error and retain manual upload as fallback.

## Known Constraints

| Constraint | Impact | Handling |
|---|---|---|
| Social platforms change frequently | A source extractor can break | Keep `yt-dlp` current and retain manual fallback |
| Some videos require login | Anonymous acquisition may fail | Optional explicit `MEDIA_COOKIE_BROWSER` |
| First Whisper run may download a model | Initial transcription takes longer | Model is cached locally afterward |
| Background pipeline stops if server is closed | Current step is marked interrupted | Retry automatic analysis |
