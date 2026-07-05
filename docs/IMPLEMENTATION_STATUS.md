# Implementation Status

## Current Phase

**Phase 3 — Media Processing: Complete**

**Environment hardening v0.2.2: Complete**

## Completed

### Foundation

- [x] Repository structure
- [x] Express server
- [x] Static frontend
- [x] SQLite initialization
- [x] Health API

### Inbox

- [x] Create inbox item
- [x] List and filter Inbox
- [x] Attach local media
- [x] Replace previously attached media
- [x] Persist data across restarts
- [x] Responsive Inbox UI

### Media Processing

- [x] FFprobe media validation
- [x] Reject files without usable audio
- [x] Extract 16 kHz mono WAV
- [x] Normalize video to MP4
- [x] Generate poster image
- [x] Store artifact metadata
- [x] Processing job table
- [x] Stage and progress updates
- [x] Prevent duplicate processing
- [x] Retry failed jobs
- [x] Explicit reprocess action
- [x] Recover interrupted jobs after restart
- [x] Frontend polling while processing
- [x] Media smoke test fixture

### Package Manager

- [x] Replace npm workflow with Yarn
- [x] Add Corepack fallback
- [x] Update startup script
- [x] Update doctor script
- [x] Update documentation commands

### Environment Hardening

- [x] Upgrade `better-sqlite3` for Node.js 26 prebuilt support
- [x] Detect Node ABI changes
- [x] Fingerprint package files and runtime
- [x] Reinstall native modules when fingerprint changes
- [x] Verify SQLite binding before migration
- [x] Automatically repair stale native bindings
- [x] Automatically install FFmpeg / FFprobe when missing
- [x] Automatically install system dependencies on supported package managers
- [x] Add `doctor --fix` workflow

## Verified

The following checks pass in the build environment:

```text
✓ JavaScript syntax
✓ Shell syntax
✓ Python syntax
✓ Node.js present
✓ Python present
✓ FFmpeg present
✓ FFprobe present
✓ Yarn available through Corepack
✓ Automatic dependency installer check mode
✓ Runtime compatibility check
✓ audio.wav generated
✓ normalized.mp4 generated
✓ poster.jpg generated
```

## Not Fully Runtime-Verified

The complete Express + SQLite HTTP flow was not started in the build environment because dependency installation requires registry access and the environment has no outbound package-registry access.

This means:

```text
Static code checks: passed
FFmpeg pipeline commands: passed
Full HTTP runtime after yarn install: verify on development machine
```

## Not Started

- [ ] Transcription provider interface
- [ ] Local Whisper provider
- [ ] Raw timed transcript persistence
- [ ] Transcript review UI
- [ ] Lesson generation
- [ ] Learning player
- [ ] Journal search
- [ ] Chrome Extension

## Architecture Decisions

| Decision | Reason |
|---|---|
| Yarn-only documented workflow | Match project preference and keep one package-manager path |
| Runtime fingerprint | Prevent stale native bindings after Node upgrades |
| Automatic system setup | Reduce first-run failures on a new machine |
| `better-sqlite3` 12.11.1 | Support current Node runtimes including Node.js 26 |
| Corepack fallback | Avoid requiring global Yarn when Node already provides package-manager mediation |
| `MEDIA_READY` status | Keep media completion distinct from future lesson completion |
| FFmpeg in Node service | Phase 3 is deterministic media work and does not need the Python AI worker yet |
| 16 kHz mono WAV contract | Stable input for speech-to-text providers |
| Processing jobs in SQLite | No Redis needed for single-user local-first MVP |
| Restart recovery | Avoid permanently stuck `PROCESSING` items |
| No absolute paths in public API | Avoid leaking local machine filesystem details |

## Phase 4 Acceptance Criteria

Phase 4 is done when:

```text
MEDIA_READY
    ↓
Start transcription
    ↓
Raw timed transcript exists
    ↓
Segments are ordered
    ↓
Clicking a segment can seek by startMs
```

Required provider contract:

```python
class TranscriptionProvider:
    def transcribe(self, audio_path: str) -> dict:
        raise NotImplementedError
```

Canonical output:

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
