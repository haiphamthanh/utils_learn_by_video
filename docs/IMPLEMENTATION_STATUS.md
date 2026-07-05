# Implementation Status

## Current Phase

Phase 2 — Inbox

## Completed

- [x] Repository structure
- [x] Express server
- [x] Static frontend
- [x] SQLite initialization
- [x] Health API
- [x] Create inbox item
- [x] List inbox items
- [x] Filter Inbox by status
- [x] Attach local media
- [x] Replace previously attached media
- [x] Persist data across restarts
- [x] Responsive MVP UI

## In Progress

- [ ] Manual end-to-end verification on the user's machine

## Not Started

- [ ] Media validation with FFmpeg
- [ ] Audio extraction
- [ ] Poster generation
- [ ] Processing jobs
- [ ] Transcription
- [ ] Lesson generation
- [ ] Learning player
- [ ] Journal search
- [ ] Chrome Extension

## Known Issues

| Issue | Impact | Next Action |
|---|---|---|
| Dependencies are not vendored | `npm install` needs network access once | Run `./start.sh` on the development machine |
| Media is stored before FFmpeg validation exists | Unsupported/corrupt media may still be saved | Add Phase 3 validation |
| Upload progress is minimal | Large files have limited feedback | Add explicit progress UI after core flow works |

## Architecture Decisions

| Decision | Reason |
|---|---|
| SQLite | Single-user local-first system |
| Vanilla JS | Keep MVP understandable and small |
| Media on filesystem | Avoid storing large binary data in SQLite |
| Python worker scaffold only | Prevent premature AI complexity |
| No social-network scraping | Keep capture separate from learning pipeline |

## Next Acceptance Criteria

Phase 3 is done when:

```text
Upload valid video
    ↓
Click Process
    ↓
audio.wav exists
poster.jpg exists
status is correct
```
