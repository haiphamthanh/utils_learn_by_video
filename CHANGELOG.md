# Changelog

## v0.2.2

### Fixed

- Upgrade `better-sqlite3` from the old v11 line to v12.11.1
- Detect Node platform, architecture and ABI changes before database startup
- Reinstall native dependencies when the runtime fingerprint changes
- Automatically repair a stale or missing SQLite native binding
- Stop treating an existing `node_modules` directory as proof that dependencies are valid

### Added

- Automatic system dependency installer
- macOS Homebrew support
- Debian/Ubuntu apt support
- Fedora dnf support
- Arch Linux pacman support
- Automatic FFmpeg and FFprobe installation
- Optional automatic Homebrew installation on macOS
- `./scripts/doctor.sh --fix`
- `yarn setup:system`
- Node runtime and ABI diagnostics

### Changed

- Node.js 22, 24 and 26 are explicitly supported
- Node.js 24 LTS is the recommended runtime
- Startup now performs environment setup before migration
- Yarn runner also supports the Debian `yarnpkg` command

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
