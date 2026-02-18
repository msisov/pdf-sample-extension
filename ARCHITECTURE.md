# Architecture: Sample PDF Extension

## Overview

A Chrome extension that intercepts `application/pdf` responses and renders
them in an external pdf.js-based viewer hosted on GitHub Pages. It uses
Chrome's MIME handler API to replace the built-in PDF viewer.

## File Map

| File | Role |
|------|------|
| `manifest.json` | Extension manifest — permissions, CSP, MIME handler declaration |
| `index.html` | UI shell (settings toggles, fallback button, iframe container) |
| `main.js` | Core logic (stream fetch, settings, frame communication, fallback) |

## MIME Handler

Declared in `manifest.json:13-16`. Chrome routes all `application/pdf`
responses through `index.html`. The extension receives a stream URL via
`chrome.mimeHandler.getStreamInfo()` (`main.js:146`) and fetches the PDF
binary from that internal stream.

Fallback uses `chrome.mimeHandler.abortAndFallbackToNativeHandler()`
(`main.js:44-55`) to hand off to Chrome's built-in PDF handler.

## Frame Tree

```
┌──────────────────────────────────────────────────┐
│  Extension Page (top frame)                      │
│  chrome-extension://<id>/index.html              │
│                                                  │
│  Responsibilities:                               │
│  - Fetch PDF binary data from stream             │
│  - Manage settings UI                            │
│  - Hold pdfData in memory                        │
│                                                  │
│  ┌──────────────────────────────────────────────┐│
│  │  <iframe id="viewer-frame">                  ││
│  │  src: https://msisov.github.io/              ││
│  │       pdf_viewer/viewer.html                 ││
│  │                                              ││
│  │  Responsibilities:                           ││
│  │  - Receive PDF bytes via postMessage         ││
│  │  - Render PDF using pdf.js                   ││
│  │  - Report status back to parent              ││
│  └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

The iframe is **cross-origin** (`chrome-extension://` → `https://`).
Direct DOM access is blocked by the same-origin policy. The CSP directive
`frame-src https://*.github.io` in `manifest.json:11` explicitly allows
embedding this origin.

The iframe starts hidden (`style="display: none"` in `index.html:121`)
and is shown after the PDF data is fetched.

## Frame Communication Protocol

All communication uses `window.postMessage`. Messages are plain objects
with a `type` field for routing.

### Iframe → Parent

Listener: `main.js:84-93`

| `type` | Payload | Meaning |
|--------|---------|---------|
| `viewerReady` | — | Viewer loaded, ready to receive PDF data |
| `pdfLoaded` | `{ numPages: number }` | PDF parsed and rendered |
| `pdfError` | `{ message: string }` | PDF parsing/rendering failed |

### Parent → Iframe

Sender: `main.js:97-101`

| `type` | Payload | Meaning |
|--------|---------|---------|
| `loadPdf` | `{ pdfData: number[] }` | PDF binary as a plain array (converted from `Uint8Array` via `Array.from()`) |

Target origin is `'*'` (wildcard) in both directions.

## Preference Storage

Uses `chrome.storage.local` (permission declared at `manifest.json:8`).
No options page — settings are inline toggles in the viewer UI.

### Storage Keys

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `autoFallback` | `boolean` | `false` | Skip custom viewer, use native handler |

### Load/Save Pattern

- **Load**: Promise-wrapped `chrome.storage.local.get()` with `|| false`
  fallback. Syncs the checkbox UI on load. (`main.js:17-25`)

- **Save**: `chrome.storage.local.set()` triggered by checkbox `change`
  event listener. (`main.js:29-38`)

### UI Element

| Element ID | HTML Location | Setting |
|-----------|---------------|---------|
| `auto-fallback-toggle` | `index.html:114` | `autoFallback` |

## Initialization Flow

Entry point: `chrome.mimeHandler.getStreamInfo()` (`main.js:146-179`)

```
chrome.mimeHandler.getStreamInfo()
  │
  ├─ await loadAutoFallbackSetting()
  │    └─ if enabled → abortAndFallbackToNativeHandler() → return
  │
  ├─ fetch PDF from streamInfo.streamUrl
  ├─ logLocalFileLinks(pdfData)
  ├─ set viewerFrame.src = VIEWER_URL
  │
  └─ (async) iframe sends 'viewerReady'
       └─ sendPdfToViewer() → postMessage({ type: 'loadPdf', pdfData })
            └─ iframe sends 'pdfLoaded' or 'pdfError'
```

### Race Condition Handling

The `sendPdfToViewer()` function (`main.js:95-102`) guards on both
`pdfData` and `viewerReady` being truthy. It is called in two places:

1. After the iframe sends `viewerReady` (normal case)
2. Immediately after setting `viewerFrame.src` (defensive no-op)

This ensures the PDF is sent regardless of whether the data fetch or the
iframe load completes first.

## Security Considerations

| Area | Current State | Risk |
|------|--------------|------|
| postMessage origin | Wildcard `'*'` | Any origin can receive/send messages to the parent. Should be locked to `https://msisov.github.io`. |
| External viewer | Loaded from GitHub Pages | Viewer code is not bundled — depends on external host availability and integrity. |
| CSP | `frame-src https://*.github.io` | Allows any `github.io` subdomain, not just `msisov.github.io`. |
| Local file access | `logLocalFileLinks()` attempts `fetch(file://...)` | Probes local file links found in PDF data (`main.js:127-144`). |
