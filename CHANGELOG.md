# Changelog

## 0.3.0 — Phase 4 Transcription

### Added

- Local Whisper transcription provider.
- OpenAI transcription provider with timed segments.
- Provider factory and canonical transcript contract.
- `transcripts`, `transcript_segments`, and `transcription_jobs` database tables.
- `POST /api/inbox/:id/transcribe`.
- `GET /api/inbox/:id/transcription-status`.
- `GET /api/inbox/:id/transcript`.
- Automatic `.venv` creation and Python dependency installation.
- Python 3.11 provisioning on macOS when needed.
- Transcription progress and interrupted-job recovery.
- Inbox transcript preview.
- Deterministic mock-provider smoke test.

### Changed

- Project version upgraded from `0.2.2` to `0.3.0`.
- `start.sh` now prepares both Node and Python runtime dependencies.
- Inbox status flow now continues from `MEDIA_READY` to `TRANSCRIPT_READY`.

### Preserved

- Existing SQLite data remains compatible; new tables are created with `IF NOT EXISTS`.
- Original media and processed artifacts are unchanged.
- Re-transcription creates a new raw transcript artifact rather than overwriting prior raw JSON.
