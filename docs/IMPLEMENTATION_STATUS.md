# Implementation Status

## Current Release

v0.7.1 — Python environment self-repair

## Completed

- [x] Automatic URL → media → transcript → lesson orchestration
- [x] Source acquisition with local `yt-dlp`
- [x] FFmpeg media processing
- [x] Local Whisper transcription
- [x] Lesson generation and Learning Player
- [x] Chrome Extension capture
- [x] Detect `.venv` with missing `pip`
- [x] Bootstrap `pip` using `ensurepip`
- [x] Recreate an unrecoverable `.venv`
- [x] Manual `yarn repair:python` command
- [x] Missing-pip smoke test

## Fixed Failure Mode

```text
.venv/bin/python exists
        ↓
pip module missing
        ↓
old behavior: crash
        ↓
new behavior:
ensurepip
        ↓
verify pip
        ↓
recreate .venv when necessary
        ↓
continue installation
```

## Data Safety

Python repair is isolated to `.venv` and never modifies user content under `data/`.

## Next Verification

Run on the user's Mac:

```text
./start.sh
    ↓
missing pip detected
    ↓
pip restored or .venv recreated
    ↓
requirements installed
    ↓
server starts
```
