# Architecture: Sample PDF Extension

## Overview

A Chrome Manifest V3 extension that intercepts `application/pdf` responses
and renders them in an external pdf.js-based viewer hosted on GitHub Pages.
It uses Chrome's experimental MIME handler API to replace the built-in PDF
viewer.

The extension also serves as a testbed for **localStorage partitioning**
behavior in extension iframes. A settings panel embedded inside the viewer
persists theme preferences to `localStorage`, which is partitioned by
default when loaded inside a Chrome extension iframe (see
[Storage Partitioning](#storage-partitioning)).

## Repository Structure

```
pdf-sample-extension/
├── manifest.json          Extension manifest
├── index.html             Extension page (MIME handler shell)
├── main.js                Extension logic
└── msisov.github.io/      Git submodule (GitHub Pages site)
    └── pdf_viewer/
        ├── viewer.html        PDF viewer (pdf.js + sidebar + toolbar)
        ├── settings-panel.html Theme preference UI
        └── README.md          Viewer documentation and message protocol
```

The `msisov.github.io` submodule is defined in `.gitmodules` and tracks
`https://github.com/msisov/msisov.github.io.git`. The viewer is served
live at `https://msisov.github.io/pdf_viewer/viewer.html`.

## Manifest Configuration

`manifest.json` — all fields:

| Field | Value | Purpose |
|-------|-------|---------|
| `manifest_version` | `3` | Manifest V3 extension |
| `name` | `"Sample PDF Extension"` | Display name |
| `version` | `"1"` | Extension version |
| `description` | `"Sample PDF extension for testing theme preferences"` | |
| `offline_enabled` | `true` | Works offline |
| `incognito` | `"split"` | Separate incognito process with own storage |
| `permissions` | `["storage"]` | Enables `chrome.storage.local` API |
| `content_security_policy` | see below | Allows wasm and GitHub Pages iframes |
| `mime_types` | `["application/pdf"]` | Intercepts PDF responses |
| `mime_types_handler` | `"index.html"` | Page loaded for intercepted PDFs |

### Content Security Policy (`manifest.json:10-12`)

```
script-src 'self' 'wasm-unsafe-eval';
object-src 'self';
frame-src https://*.github.io
```

- `'wasm-unsafe-eval'`: Allows pdf.js WebAssembly execution in the viewer
- `frame-src https://*.github.io`: Permits embedding the viewer iframe

### Incognito Split Mode

`"incognito": "split"` means incognito windows get a separate extension
process with isolated `chrome.storage.local`. Settings changed in normal
mode do not affect incognito and vice versa.

## MIME Handler

Declared via `mime_types` and `mime_types_handler` (`manifest.json:13-16`).
When Chrome receives a response with `Content-Type: application/pdf`,
it loads `index.html` in place of the default PDF viewer. The extension
receives stream metadata via `chrome.mimeHandler.getStreamInfo()`
(`main.js:174`).

### StreamInfo Object

Provided by the callback at `main.js:174`. Fields logged at
`main.js:175-181`:

| Field | Type | Description |
|-------|------|-------------|
| `mimeType` | `string` | `"application/pdf"` |
| `originalUrl` | `string` | URL the user navigated to |
| `streamUrl` | `string` | Internal `chrome-extension://` URL for fetching the PDF bytes |
| `tabId` | `number` | Tab that triggered the load |
| `embedded` | `boolean` | Whether the PDF is in an `<embed>` or `<object>` tag |
| `responseHeaders` | `object` | HTTP response headers from the original request |

### Fallback to Native Handler

Two ways to fall back to Chrome's built-in PDF viewer:

1. **Manual button** (`index.html:118`): "Fallback to Native" button.
   Handler at `main.js:71-93` calls
   `chrome.mimeHandler.abortAndFallbackToNativeHandler()`.

2. **Auto-fallback setting**: If `autoFallback` is `true` in
   `chrome.storage.local`, the extension calls
   `abortAndFallbackToNativeHandler()` immediately on stream info
   receipt (`main.js:184-188`) without loading the viewer.

`abortAndFallbackToNativeHandler()` (`main.js:53-67`) aborts the
extension's stream and tells Chrome to reload the URL with its native
handler. It takes a callback with a `success` boolean.

## Frame Tree

Three nested levels, spanning two origins:

```
┌──────────────────────────────────────────────────────────────┐
│  Level 0: Extension Page                                     │
│  chrome-extension://<id>/index.html                          │
│  Script: main.js                                             │
│                                                              │
│  Responsibilities:                                           │
│  - Receive PDF stream via chrome.mimeHandler                 │
│  - Fetch PDF binary from streamUrl                           │
│  - Bridge theme settings via chrome.storage.local            │
│  - Auto-fallback decision                                    │
│  - Scan PDF for local file links                             │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  Level 1: Viewer                                         ││
│  │  <iframe id="viewer-frame">                              ││
│  │  src: msisov.github.io/pdf_viewer/viewer.html            ││
│  │  Script: inline <script type="module">                   ││
│  │                                                          ││
│  │  Responsibilities:                                       ││
│  │  - Render PDF pages on <canvas> via pdf.js               ││
│  │  - Toolbar: page navigation (Prev/Next + keyboard)       ││
│  │  - Toggle collapsible sidebar                            ││
│  │  - Route messages between extension and settings panel   ││
│  │                                                          ││
│  │  ┌──────────────────────────────────────────────────────┐││
│  │  │  Level 2: Settings Panel                             │││
│  │  │  <iframe> inside #sidebar-content                    │││
│  │  │  src: msisov.github.io/pdf_viewer/settings-panel.html│││
│  │  │  Script: inline <script>                             │││
│  │  │                                                      │││
│  │  │  Responsibilities:                                   │││
│  │  │  - Theme preference UI (Light / Dark / Auto radios)  │││
│  │  │  - Persist to localStorage (key: pdf_viewer_theme)   │││
│  │  │  - Notify parent (viewer) on change via postMessage  │││
│  │  └──────────────────────────────────────────────────────┘││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### Origins

| Frame | Origin | Storage Scope |
|-------|--------|---------------|
| Extension page | `chrome-extension://<id>` | `chrome.storage.local` (extension-wide) |
| Viewer | `https://msisov.github.io` | Partitioned (see below) |
| Settings panel | `https://msisov.github.io` | Partitioned (see below) |

The viewer and settings panel share the same origin
(`msisov.github.io`) but their `localStorage` is **partitioned** when
embedded inside a `chrome-extension://` top-level frame (see
[Storage Partitioning](#storage-partitioning)).

### Iframe Visibility

The viewer iframe (`index.html:121`) starts with `style="display: none"`
and is shown after the PDF data is fetched (`main.js:199-200`).

The sidebar in the viewer (`viewer.html:107-111`) is visible by default
(250px wide) and toggled via the hamburger button
(`viewer.html:115, 151-153`). The `.collapsed` CSS class sets
`width: 0; min-width: 0` (`viewer.html:27-31`).

## Frame Communication Protocol

All communication uses `window.postMessage`. Messages are plain objects
with a `type` field for routing.

### Settings Panel → Viewer (`settings-panel.html:110-112`)

The settings panel posts to `window.parent` (the viewer):

| `type` | Payload | Trigger |
|--------|---------|---------|
| `themeChange` | `{ theme: "light" \| "dark" \| "auto" }` | User clicks a radio button |

### Viewer → Extension Page (`viewer.html:226-228, 209, 215`)

The viewer posts to `window.parent` (the extension page):

| `type` | Payload | Trigger |
|--------|---------|---------|
| `viewerReady` | — | Viewer script loaded (fires once on init) |
| `pdfLoaded` | `{ numPages: number }` | PDF parsed and first page rendered |
| `pdfError` | `{ message: string }` | pdf.js failed to parse the data |

The viewer also receives `themeChange` from the settings panel
(`viewer.html:220-222`) and logs it. Currently, the viewer does **not**
forward `themeChange` up to the extension page — only the extension page
receives it because `postMessage` propagation depends on `event.source`,
and the settings panel's `window.parent` is the viewer, not the extension.

### Extension Page → Viewer (`main.js:111-117, 122-129`)

The extension page posts to `viewerFrame.contentWindow` (the viewer):

| `type` | Payload | Trigger |
|--------|---------|---------|
| `loadPdf` | `{ pdfData: number[] }` | PDF binary fetched from stream |
| `themeChange` | `{ theme: string }` | Saved theme on load, or cross-instance sync |

### Viewer → Settings Panel

No direct messages. The viewer does not currently forward `themeChange`
down to the settings panel.

### Message Flow Diagrams

**PDF loading:**

```
Extension                    Viewer                Settings Panel
    │                           │                        │
    │  set iframe.src           │                        │
    ├──────────────────────────>│                        │
    │                           │  load settings-panel   │
    │                           ├───────────────────────>│
    │   { viewerReady }         │                        │
    │<──────────────────────────┤                        │
    │                           │                        │
    │   { loadPdf, pdfData }    │                        │
    ├──────────────────────────>│                        │
    │                           │  pdf.js render         │
    │   { pdfLoaded, numPages } │                        │
    │<──────────────────────────┤                        │
```

**Theme change (current, single instance):**

```
Extension                    Viewer                Settings Panel
    │                           │                        │
    │                           │  { themeChange, theme } │
    │                           │<───────────────────────┤
    │                           │  console.log           │
    │                           │                        │
    │  (not received — settings │                        │
    │   panel posts to viewer,  │                        │
    │   not to extension)       │                        │
```

**Theme change (with chrome.storage bridge, cross-instance):**

```
Extension (Tab A)            Viewer (Tab A)        Settings Panel (Tab A)
    │                           │                        │
    │                           │  { themeChange, theme } │
    │   { themeChange, theme }  │<───────────────────────┤
    │<──────────────────────────┤                        │
    │  chrome.storage.local.set │                        │
    │  ({ theme })              │                        │
    │                           │                        │

Extension (Tab B)            Viewer (Tab B)
    │                           │
    │  onChanged fires          │
    │  { themeChange, theme }   │
    ├──────────────────────────>│
```

**Note:** The bridge in Tab A only works if the viewer forwards
`themeChange` to the extension page. Currently `viewer.html:220-222`
only logs the theme — it does not call
`window.parent.postMessage(...)`. The extension's `themeChange`
handler (`main.js:105-107`) will never fire unless the viewer is
modified to forward the message.

## PDF Rendering

### pdf.js Integration (`viewer.html:131-133`)

The viewer loads pdf.js from CDN:

| Resource | URL |
|----------|-----|
| Library | `cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs` |
| Worker | `cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs` |

### Page Navigation

The viewer renders one page at a time on a `<canvas>` element
(`viewer.html:124`) at 1.5x scale (`viewer.html:161`).

Navigation controls:

| Control | Element | Handler |
|---------|---------|---------|
| Previous button | `viewer.html:116` | `viewer.html:177-179` |
| Next button | `viewer.html:118` | `viewer.html:181-183` |
| Left arrow / PageUp | keyboard | `viewer.html:185-191` |
| Right arrow / PageDown | keyboard | `viewer.html:185-191` |

Button state is updated after each render: `prevBtn.disabled` when on
page 1, `nextBtn.disabled` when on the last page (`viewer.html:170-171`).

A `rendering` flag (`viewer.html:148`) prevents concurrent render calls.

## Preference Storage

Two independent storage systems serve different purposes:

### 1. `chrome.storage.local` (Extension)

Permission: `manifest.json:8`. Accessible from all extension contexts.
Persists across browser restarts and extension updates.

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `autoFallback` | `boolean` | `false` | Skip custom viewer, use native PDF handler |
| `theme` | `string` | — | Theme preference bridge for cross-instance sync |

**Auto-fallback setting:**

- **Load**: `loadAutoFallbackSetting()` (`main.js:17-25`) — Promise-wrapped
  `get()` with `|| false` default. Syncs `auto-fallback-toggle` checkbox
  (`index.html:114`).
- **Save**: `saveAutoFallbackSetting()` (`main.js:29-33`) — called by
  checkbox `change` listener (`main.js:36-38`).
- **Read on init**: First action inside `getStreamInfo()` callback
  (`main.js:184`). If `true`, aborts immediately.

**Theme setting:**

- **Save**: When a `themeChange` message arrives from the viewer
  (`main.js:105-107`), the theme value is written to
  `chrome.storage.local`.
- **Load on viewer ready**: `sendSavedThemeToViewer()` (`main.js:122-129`)
  reads the saved theme and posts it to the viewer iframe. Called when
  `viewerReady` is received (`main.js:100`).
- **Cross-instance sync**: `chrome.storage.onChanged` listener
  (`main.js:41-49`) detects theme changes from other tabs and forwards
  to the local viewer iframe.

### 2. `localStorage` (Settings Panel)

Used by `settings-panel.html:89-113`. Scoped to the `msisov.github.io`
origin, but **partitioned** when embedded in a Chrome extension iframe.

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `pdf_viewer_theme` | `string` | — (radios default to `"auto"`) | Theme preference |

**Load on init** (`settings-panel.html:93-99`): Reads
`localStorage.getItem(THEME_KEY)`, selects the matching radio button,
updates status text to `"Current: <theme>"`.

**Save on change** (`settings-panel.html:102-113`): Each radio button's
`change` event writes `localStorage.setItem(THEME_KEY, theme)`, updates
status text to `"Saved: <theme>"`, and posts `themeChange` to
`window.parent`.

## Storage Partitioning

Due to Chrome's [storage partitioning](https://developer.chrome.com/docs/privacy-sandbox/storage-partitioning/),
`localStorage` in iframes is isolated by the top-level origin. Since the
settings panel iframe (`msisov.github.io`) is embedded inside a
`chrome-extension://` top-level page, its `localStorage` is partitioned
per extension context.

**Consequences:**

- Theme saved in Tab A's settings panel is **not visible** to Tab B's
  settings panel, even though both are on the same `msisov.github.io`
  origin.
- `window.addEventListener('storage', ...)` events (which normally fire
  cross-tab for same-origin `localStorage` changes) do **not** fire
  across different extension page contexts.

**Workarounds:**

1. **`chrome.storage.local` bridge** (implemented in `main.js`): The
   extension page receives `themeChange` via postMessage, persists to
   `chrome.storage.local`, and other instances pick it up via
   `chrome.storage.onChanged`.

2. **Chromium feature flag** (upstream fix, not yet landed):
   ```
   --enable-features=PdfOopifStoragePartitionFix
   ```
   Resolves the partitioning so `localStorage` works as expected for
   MIME handler iframes.

## Initialization Flow

Entry point: `chrome.mimeHandler.getStreamInfo()` (`main.js:174-207`)

```
chrome.mimeHandler.getStreamInfo(streamInfo)
  │
  ├─ Log streamInfo fields (main.js:175-181)
  │
  ├─ await loadAutoFallbackSetting() (main.js:184)
  │    ├─ chrome.storage.local.get(['autoFallback'])
  │    ├─ sync checkbox UI
  │    └─ if true → abortAndFallbackToNativeHandler() → return
  │
  ├─ fetchPdf(streamInfo.streamUrl) (main.js:193)
  │    └─ ReadableStream → chunked read → Uint8Array
  │
  ├─ logLocalFileLinks(pdfData) (main.js:194)
  │    └─ regex scan for /URI (file://...) → attempt fetch()
  │
  ├─ viewerFrame.src = VIEWER_URL (main.js:198)
  │    └─ shows iframe, hides loading text
  │
  ├─ sendPdfToViewer() (main.js:203) — no-op (viewerReady still false)
  │
  └─ (async) viewer iframe loads
       ├─ viewer.html loads pdf.js from CDN
       ├─ viewer.html loads settings-panel.html in sidebar iframe
       ├─ settings-panel.html reads localStorage, selects saved radio
       │
       └─ viewer posts { viewerReady } to extension (viewer.html:226-228)
            │
            ├─ sendPdfToViewer() (main.js:99)
            │    └─ postMessage({ loadPdf, pdfData }) to viewer
            │         └─ viewer parses with pdf.js, renders page 1
            │              └─ posts { pdfLoaded, numPages } back
            │
            └─ sendSavedThemeToViewer() (main.js:100)
                 └─ chrome.storage.local.get(['theme'])
                      └─ if saved, postMessage({ themeChange }) to viewer
```

### Race Condition Handling

`sendPdfToViewer()` (`main.js:111-117`) guards on both `pdfData` and
`viewerReady`. Called in two places:

1. When `viewerReady` is received (`main.js:99`) — normal path
2. Immediately after setting `viewerFrame.src` (`main.js:203`) — defensive
   no-op since `viewerReady` is still `false`

### viewerReady Guard (`viewer.html:226-228`)

The viewer only sends `viewerReady` if it's actually inside a frame:

```js
if (window.parent !== window) {
  window.parent.postMessage({ type: 'viewerReady' }, '*');
}
```

This prevents errors when `viewer.html` is opened directly in a browser
tab (not embedded).

## Local File Link Detection

`logLocalFileLinks()` (`main.js:155-172`) scans the raw PDF binary for
`file://` URIs embedded in PDF link annotations:

1. Decodes the binary as `latin1` text (`main.js:157`)
2. Matches `/URI (file://...)` patterns via regex (`main.js:158`)
3. Attempts `fetch()` on each matched URL (`main.js:164`)
4. Logs whether access succeeded or was denied

This is a security probe — it tests whether the extension's
`chrome-extension://` origin can access local files referenced in PDFs.

## Auto-Fallback Lock-out

When `autoFallback` is `true`, the viewer calls
`abortAndFallbackToNativeHandler()` and returns (`main.js:185-188`).
The custom viewer UI never renders, so the toggle is unreachable.

Recovery via DevTools console on any extension page:

```js
chrome.storage.local.set({ autoFallback: false });
```

## Security Considerations

| Area | Current State | Risk |
|------|--------------|------|
| postMessage origin | Wildcard `'*'` in all frames | Any origin can receive/send messages. Should be locked to `https://msisov.github.io` for extension→viewer, and `event.origin` validated for viewer→extension. |
| External viewer | Loaded from GitHub Pages CDN | Not bundled — depends on external host availability and integrity. |
| pdf.js CDN | `cdnjs.cloudflare.com/.../4.0.379/` | Pinned version, but loaded from third-party CDN. Supply chain risk. |
| CSP frame-src | `https://*.github.io` | Allows any `github.io` subdomain, not just `msisov.github.io`. |
| Local file probing | `logLocalFileLinks()` fetches `file://` URLs | Tests local filesystem access from the extension origin. |
| Incognito split | Separate storage per mode | Settings don't leak between normal and incognito, but no explicit wipe on exit. |

## External Dependencies

| Dependency | Version | Loaded From | Used By |
|-----------|---------|-------------|---------|
| pdf.js | 4.0.379 | cdnjs.cloudflare.com | `viewer.html:131` |
| pdf.js worker | 4.0.379 | cdnjs.cloudflare.com | `viewer.html:133` |
