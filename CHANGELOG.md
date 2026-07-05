# Changelog

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
