# Changelog

## v0.2.0

### Added

- Media processing API
- FFprobe validation
- Audio normalization to 16 kHz mono WAV
- MP4 normalization
- Poster generation
- SQLite processing jobs
- Processing progress UI
- Retry and reprocess actions
- Interrupted-job recovery
- Deterministic media smoke test

### Changed

- Project workflow now uses Yarn instead of npm
- Startup script uses Yarn directly or through Corepack
- Machine diagnostics now check FFprobe and Yarn/Corepack
- Successful Phase 3 output uses `MEDIA_READY` instead of overloading final lesson status `READY`

### Verified

- Static JavaScript checks
- Shell syntax checks
- Python syntax checks
- FFmpeg smoke test producing all expected artifacts
