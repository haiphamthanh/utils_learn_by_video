# Chrome Extension Capture

## Purpose

The extension closes the capture gap:

```text
Interesting Reel / Short
        ↓
Click Enjoy Journal extension
        ↓
Review current source
        ↓
Add a short note
        ↓
Save to Inbox
```

It does not download video, crawl feeds, collect comments, or run a persistent content script.

## Architecture

```text
Current browser tab
        ↓ explicit user click
activeTab + scripting
        ↓
Popup
        ↓ message
Manifest V3 service worker
        ↓ local HTTP
Enjoy Journal API
        ↓
Inbox
```

## Permissions

| Permission | Why it exists |
|---|---|
| `activeTab` | Temporary access to the page the user explicitly opened the extension on |
| `scripting` | Read title and canonical URL at capture time |
| `storage` | Remember the local Enjoy Journal server URL |
| Local host permissions | POST captures to the local Enjoy Journal API |

The MVP only accepts:

```text
http://localhost:<port>
http://127.0.0.1:<port>
```

## Install in Chrome

1. Start Enjoy Journal:

```bash
./start.sh
```

2. Open:

```text
chrome://extensions
```

3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the repository's `extension/` directory.
6. Pin **Enjoy Journal Capture** to the toolbar.

## Use

1. Open a Facebook Reel, YouTube Short, or other useful web page.
2. Click the extension icon.
3. Add why the moment is worth saving.
4. Click **Save to Inbox**.
5. Open the Inbox and attach media later.

## Connection Settings

Default:

```text
http://localhost:3000
```

A different localhost port can be configured in the popup.

## Security Boundaries

The extension intentionally does not:

- scrape Facebook feeds
- read comments
- monitor browsing in the background
- download media
- execute remote JavaScript
- connect to arbitrary remote servers in the MVP

## Package the Extension

```bash
yarn extension:package
```

Output:

```text
dist/enjoy-journal-extension-v0.6.0.zip
```
