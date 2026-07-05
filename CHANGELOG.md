# Changelog

## 0.7.0 — Automatic URL-to-Lesson Pipeline

### Changed

- Saving a URL now starts local analysis automatically by default.
- `Waiting for media` is no longer the primary workflow.
- Manual upload is retained only as a fallback.
- Chrome Extension CTA changed from **Save to Inbox** to **Save & analyze**.

### Added

- `source_acquisition_jobs` database table.
- `ACQUIRING_MEDIA` and `MEDIA_ACQUISITION_FAILED` states.
- Local media acquisition with `yt-dlp`.
- `yt-dlp` installation inside the project Python environment.
- Automatic orchestration across acquisition, FFmpeg processing, transcription and lesson generation.
- Retry automatic analysis endpoint and Inbox action.
- Optional explicit `MEDIA_COOKIE_BROWSER` configuration.
- `yarn smoke:auto`.

### Preserved

- Existing upload, media processing, transcription, lesson and Learning Player contracts.
- Existing v0.6.0 `data/` content.
- Manual media upload for unsupported or inaccessible sources.
- No browser cookies are read by default.

## 0.6.0 — Phase 7 Chrome Extension Capture

### Added

- Manifest V3 Chrome Extension in `extension/`.
- Explicit-click current-page capture using `activeTab`.
- One-time metadata extraction using `chrome.scripting`.
- Background service worker for local API requests.
- Popup UI for source review and personal note capture.
- Connected / Offline health indicator.
- Local Enjoy Journal URL settings.
- Facebook Reel source detection and URL normalization.
- YouTube Short source detection and URL normalization.
- Tracking-parameter cleanup for saved source URLs.
- Success state with direct **Open Inbox** action.
- Extension toolbar success badge.
- `docs/CHROME_EXTENSION.md`.
- `yarn smoke:extension`.
- `yarn extension:package`.
- `?page=inbox` web-app entry support.

### Changed

- Project version upgraded from `0.5.0` to `0.6.0`.
- `start.sh` now prints the exact unpacked-extension directory.
- Web navigation stores non-lesson page state in the URL.
- Capture workflow now starts from the browser toolbar instead of requiring the web app to be opened first.

### Security

- No persistent content script is used.
- Page access is temporary and begins only after an explicit extension click.
- The MVP extension only accepts local Enjoy Journal server URLs.
- No remote JavaScript is loaded.

### Preserved

- Existing v0.5.0 database and `data/` contents require no migration.
- Manual web-app capture remains available.
- Media, transcription, lesson and learning flows are unchanged.

## 0.5.0 — Phase 6 Learning Player

### Added

- Functional Today lesson queue.
- Searchable Library with New, Learning and Mastered filters.
- Dedicated lesson learning surface.
- Video/audio streaming routes with HTTP byte-range support.
- Timed transcript synchronization.
- Click sentence to seek and play.
- Active transcript sentence highlighting.
- Previous/next sentence navigation.
- Sentence Loop ×3 with pause between repetitions.
- 0.75×, 1× and 1.25× playback speed controls.
- Meaning tab linked to transcript segments.
- Phrases and communication patterns tab.
- Per-lesson Journal editor.
- `journal_entries` database table.
- `learning_progress` database table.
- NEW / LEARNING / MASTERED state.
- Listen and shadow counters.
- Journal/progress synchronization back into `lesson.json`.
- Journal/progress preservation when a lesson is regenerated.
- `yarn smoke:learning`.

### Changed

- Project version upgraded from `0.4.0` to `0.5.0`.
- Inbox lesson-ready cards now include `Open lesson`.
- Today excludes mastered lessons.
- Library only shows the latest lesson version for each Inbox item.
- Media remains outside `public/` and is served through application routes.

### Preserved

- Existing v0.4.0 sources, media, transcripts and lesson rows remain compatible.
- Raw transcript text remains immutable.
- Lesson generation remains versioned.
- Existing media/transcription/lesson smoke tests still pass.

## 0.4.0 — Phase 5 Transcript Review & Lesson Generation

### Added

- Automatic basic transcript cleaning for new transcription segments.
- Lazy cleaning support for transcripts created by v0.3.0.
- Per-segment transcript correction API and Inbox review UI.
- `lessons` and `lesson_generation_jobs` database tables.
- Lesson provider interface.
- Offline `local-basic` lesson provider.
- OpenAI lesson provider with structured output parsing.
- Deterministic mock lesson provider.
- Canonical `lesson.json` generation.
- Versioned lesson input/output artifacts.
- Lesson generation progress, retry and interrupted-job recovery.
- Lesson preview with phrases and communication patterns.
- `yarn smoke:lesson`.

### Changed

- Project version upgraded from `0.3.0` to `0.4.0`.
- Inbox polling now includes lesson generation jobs.
- Transcript preview is now an editable review surface.
- Python environment now explicitly installs Pydantic for structured lesson output.
- Default lesson generation mode is local-first: `LESSON_PROVIDER=local-basic`.

### Preserved

- Existing v0.3.0 SQLite data remains compatible.
- Raw transcript text is never modified by review.
- Re-transcription still creates a new raw transcript artifact.
- Re-generation creates a new lesson artifact instead of overwriting an older file.

## 0.3.0 — Phase 4 Transcription

### Added

- Local Whisper transcription provider.
- OpenAI transcription provider with timed segments.
- Provider factory and canonical transcript contract.
- `transcripts`, `transcript_segments`, and `transcription_jobs` database tables.
- Transcription progress and interrupted-job recovery.
- Inbox transcript preview.
