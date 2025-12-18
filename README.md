# Sample PDF Extension

A minimal Chrome extension demonstrating the experimental `mimeHandler` API for handling PDF files.

## Overview

This extension acts as an external MIME handler for PDF files. When Chromium encounters a PDF (based on MIME type), it checks for registered MIME handlers and loads this extension to handle the content. The extension then renders PDFs using an external viewer hosted on GitHub Pages.

This serves as a test bed for the experimental MIME handler functionality in Chromium.

## Experimental APIs Used

### Manifest Key: `mime_types_handler`

```json
{
  "mime_types": ["application/pdf"],
  "mime_types_handler": "index.html"
}
```

This experimental manifest key allows the extension to register as a handler for specific MIME types. When Chrome navigates to a PDF, it loads the extension's `index.html` instead of the built-in PDF viewer.

### Extension API: `chrome.mimeHandler.getStreamInfo()`

```javascript
chrome.mimeHandler.getStreamInfo((streamInfo) => {
  // streamInfo.mimeType      - "application/pdf"
  // streamInfo.originalUrl   - Original PDF URL
  // streamInfo.streamUrl     - Internal URL to fetch PDF data
  // streamInfo.tabId         - Tab ID (-1 if not in a tab)
  // streamInfo.responseHeaders - HTTP response headers
  // streamInfo.embedded      - Whether PDF is embedded in another document
});
```

This experimental API provides access to the intercepted stream data, allowing the extension to fetch and process the PDF content.

## How It Works

1. User navigates to a PDF URL
2. Chromium detects `application/pdf` MIME type
3. Chromium finds this extension registered as a MIME handler
4. Chromium loads the extension's `index.html` and provides stream access
5. Extension fetches PDF data via `streamUrl`
6. Extension sends data to external viewer via `postMessage`
7. External viewer renders PDF using PDF.js

```
Chromium                           Extension
   │                                  │
   │ (detects application/pdf)        │
   │                                  │
   │──── loads mime_types_handler ───>│
   │                                  │
   │     getStreamInfo() ────────────>│
   │<─── streamInfo (with streamUrl) ─│
   │                                  │
   │     fetch(streamUrl) ───────────>│
   │<─── PDF data ────────────────────│
   │                                  │
   │                    ┌─────────────────────────────┐
   │                    │ iframe (GitHub Pages)       │
   │                    │                             │
   │                    │ ◄── postMessage(pdfData)    │
   │                    │                             │
   │                    │ PDF.js renders to canvas    │
   │                    └─────────────────────────────┘
```

## External Viewer

The PDF rendering is handled by an external viewer hosted at:

**https://msisov.github.io/pdf_viewer/viewer.html**

This viewer:
- Receives PDF data via `postMessage`
- Renders using [PDF.js](https://mozilla.github.io/pdf.js/) (loaded from CDN)
- Includes a settings sidebar for theme preferences

## Files

| File | Description |
|------|-------------|
| `manifest.json` | Extension manifest with experimental MIME handler config |
| `index.html` | Extension page containing iframe for external viewer |
| `main.js` | Fetches PDF stream and sends data to viewer via postMessage |

## Installation

1. Clone this repository
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder

## Requirements

- Chromium-based browser with experimental MIME handler support
- The `chrome.mimeHandler` API must be available

## Related

- [PDF Viewer (GitHub Pages)](https://github.com/msisov/msisov.github.io/tree/main/pdf_viewer) - External viewer source
