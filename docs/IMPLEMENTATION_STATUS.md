# Implementation Status

## Current Phase

Phase 7 — Chrome Extension Capture

## Completed

- [x] Repository structure
- [x] Express server and SQLite persistence
- [x] Inbox capture and media upload
- [x] FFmpeg validation and normalization
- [x] Local Whisper transcription
- [x] Optional OpenAI transcription provider
- [x] Timed transcript persistence
- [x] Raw / cleaned / reviewed transcript layers
- [x] Offline and OpenAI lesson providers
- [x] Versioned `lesson.json` artifacts
- [x] Today lesson queue
- [x] Searchable Library
- [x] Dedicated Learning Player
- [x] Timed transcript synchronization and sentence seek
- [x] Sentence Loop ×3 and playback speed controls
- [x] Meaning, phrases and lesson-centric Journal
- [x] Learning progress persistence
- [x] Manifest V3 Chrome Extension
- [x] Explicit-click page metadata capture
- [x] Facebook Reel detection and URL normalization
- [x] YouTube Short detection and URL normalization
- [x] Personal note capture in extension popup
- [x] Service-worker API submission
- [x] Connected / Offline server state
- [x] Configurable localhost server port
- [x] Open Inbox action after save
- [x] Extension package command
- [x] Extension smoke test
- [x] Existing media/transcription/lesson/learning smoke tests preserved

## In Progress

- [ ] End-to-end extension verification in Chrome on the user's Mac
- [ ] End-to-end verification with a real local Whisper transcript
- [ ] Usability feedback for popup wording and sentence-loop timing

## Not Started

- [ ] Top-level Journal index
- [ ] Keyboard shortcuts
- [ ] Mobile interaction refinement
- [ ] Spaced review scheduling
- [ ] Optional private remote access

## Current Flow

```text
Interesting Reel / Short
  ↓
Click extension
  ↓
Save URL + title + note
  ↓
Inbox
  ↓
Attach media
  ↓
Process media
  ↓
Create transcript
  ↓
Review incorrect segments
  ↓
Generate lesson
  ↓
Open Today / Library
  ↓
Listen + Seek + Loop
  ↓
Meaning + Phrases + Journal
```

## Extension Architecture

```text
Toolbar click
  ↓
activeTab permission
  ↓
Read page title + canonical URL once
  ↓
Popup note
  ↓
Service worker
  ↓
POST /api/inbox
```

No persistent page observer is installed.

## Extension Permissions

| Permission | Purpose |
|---|---|
| `activeTab` | Temporary access after an explicit toolbar click |
| `scripting` | Read current page title and canonical URL |
| `storage` | Remember local server URL |
| localhost host permissions | Send capture to Enjoy Journal |

## Security Boundaries

The Phase 7 extension does not:

- download social-media video,
- crawl feeds,
- collect comments,
- monitor browsing continuously,
- execute remotely hosted JavaScript,
- connect to arbitrary remote servers.

## Acceptance Criteria

```text
Enjoy Journal server running
    ↓
Open Facebook Reel
    ↓
Click extension
    ↓
Popup identifies Facebook Reel
    ↓
Add note
    ↓
Save to Inbox
    ↓
Success state appears
    ↓
Open Inbox
    ↓
Saved item exists with URL + title + note
```

The same capture path must also work for a YouTube Short and a generic HTTPS page.

## Known Constraints

| Constraint | Impact | Handling |
|---|---|---|
| Extension is loaded unpacked | Manual install after code update | Chrome Developer mode |
| MVP server is local-only | No capture to remote server yet | Intentional privacy boundary |
| Page title quality depends on source metadata | Some social pages may have generic titles | URL and personal note remain primary |
| Extension does not acquire media | User still attaches media manually | Preserve legal/architectural separation |
| Top-level Journal is still a placeholder | Reflection remains lesson-centric | Build in Phase 8 |
