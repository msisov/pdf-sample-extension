// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// External viewer URL - change this to your GitHub Pages URL
const VIEWER_URL = 'https://msisov.github.io/pdf_viewer/viewer.html';

const loadingEl = document.getElementById('loading');
const viewerFrame = document.getElementById('viewer-frame');
const fallbackBtn = document.getElementById('fallback-btn');
const autoFallbackToggle = document.getElementById('auto-fallback-toggle');

let pdfData = null;
let viewerReady = false;
let pdfTabId = null;

// Load auto-fallback setting from storage
function loadAutoFallbackSetting() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['autoFallback'], (result) => {
      const enabled = result.autoFallback || false;
      autoFallbackToggle.checked = enabled;
      console.log('Auto-fallback setting loaded:', enabled);
      resolve(enabled);
    });
  });
}

// Save auto-fallback setting to storage
function saveAutoFallbackSetting(enabled) {
  chrome.storage.local.set({ autoFallback: enabled }, () => {
    console.log('Auto-fallback setting saved:', enabled);
  });
}

// Toggle change event listener
autoFallbackToggle.addEventListener('change', () => {
  saveAutoFallbackSetting(autoFallbackToggle.checked);
});

// Sync settings across instances via chrome.storage.
chrome.storage.onChanged.addListener((changes, areaName) => {
  console.log('storage.onChanged:', areaName, changes);
  if (areaName !== 'local') return;
  if (changes.autoFallback) {
    const enabled = changes.autoFallback.newValue || false;
    console.log('autoFallback changed externally:', enabled);
    autoFallbackToggle.checked = enabled;
  }
  if (changes.theme && viewerReady) {
    const theme = changes.theme.newValue;
    console.log('Theme changed externally:', theme);
    viewerFrame.contentWindow.postMessage(
      { type: 'themeChange', theme }, '*'
    );
  }
});

// Execute auto-fallback to native handler
function executeAutoFallback() {
  console.log('Auto-fallback enabled, switching to native handler...');

  if (typeof chrome.mimeHandler.abortAndFallbackToNativeHandler !== 'function') {
    console.error('abortAndFallbackToNativeHandler is not available in this Chrome version');
    return;
  }

  chrome.mimeHandler.abortAndFallbackToNativeHandler((success) => {
    if (success) {
      console.log('Auto-fallback initiated - page will reload with native handler');
    } else {
      console.error('Auto-fallback failed - no stream or operation error');
    }
  });
}

// Handle fallback button click
fallbackBtn.addEventListener('click', () => {
  console.log('Requesting fallback to native handler...');
  fallbackBtn.disabled = true;
  fallbackBtn.textContent = 'Falling back...';

  // Check if the API is available (requires newer Chrome version)
  if (typeof chrome.mimeHandler.abortAndFallbackToNativeHandler !== 'function') {
    console.error('abortAndFallbackToNativeHandler is not available in this Chrome version');
    fallbackBtn.disabled = false;
    fallbackBtn.textContent = 'Fallback Not Supported';
    return;
  }

  chrome.mimeHandler.abortAndFallbackToNativeHandler((success) => {
    if (success) {
      console.log('Fallback initiated - page will reload with native handler');
    } else {
      console.error('Fallback failed - no stream or operation error');
      fallbackBtn.disabled = false;
      fallbackBtn.textContent = 'Fallback Failed - Retry';
    }
  });
});

// Listen for messages from the viewer iframe
window.addEventListener('message', (event) => {
  if (event.data.type === 'viewerReady') {
    viewerReady = true;
    sendPdfToViewer();
    sendSavedThemeToViewer();
  } else if (event.data.type === 'pdfLoaded') {
    console.log(`PDF loaded: ${event.data.numPages} pages`);
  } else if (event.data.type === 'pdfError') {
    console.error('Viewer error:', event.data.message);
  } else if (event.data.type === 'themeChange') {
    console.log('Theme changed in settings panel:', event.data.theme);
    chrome.storage.local.set({ theme: event.data.theme });
  } else if (event.data.type === 'signIn') {
    // Iframe asked us to redirect the tab to the "sign-in" page.
    // chrome.tabs.update navigates the outer tab; window.location.href
    // does not (the MIME handler hosts this doc inside a stream-handler
    // frame). Tab id comes from streamInfo (chrome.tabs.getCurrent()
    // returns undefined in a MIME handler view).
    if (pdfTabId == null) {
      console.warn('Sign-in requested before streamInfo arrived.');
      return;
    }
    const signInUrl = event.data.url || 'https://igalia.com';
    console.log('Navigating tab', pdfTabId, 'to sign-in URL:', signInUrl);
    chrome.tabs.update(pdfTabId, { url: signInUrl });
  }
});

function sendPdfToViewer() {
  if (pdfData && viewerReady) {
    viewerFrame.contentWindow.postMessage({
      type: 'loadPdf',
      pdfData: Array.from(pdfData)
    }, '*');
  }
}

// Sends the saved theme to the viewer so the settings panel
// reflects the last known preference on load.
function sendSavedThemeToViewer() {
  chrome.storage.local.get(['theme'], (result) => {
    if (result.theme) {
      viewerFrame.contentWindow.postMessage(
        { type: 'themeChange', theme: result.theme }, '*'
      );
    }
  });
}

async function fetchPdf(streamUrl) {
  const response = await fetch(streamUrl);
  const reader = response.body.getReader();
  const chunks = [];
  let receivedLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    receivedLength += value.length;
  }

  const data = new Uint8Array(receivedLength);
  let position = 0;
  for (const chunk of chunks) {
    data.set(chunk, position);
    position += chunk.length;
  }

  return data;
}

// Scan PDF data for links to local files (file:// URIs) and try to access them.
async function logLocalFileLinks(data) {
  const text = new TextDecoder('latin1').decode(data);
  const pattern = /\/URI\s*\((file:\/\/[^)]*)\)/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const fileUrl = match[1];
    console.warn('[Local file link detected]', fileUrl);
    try {
      const response = await fetch(fileUrl);
      const contents = await response.text();
      console.warn('[Local file ACCESS SUCCEEDED]', fileUrl);
      console.warn('[File contents]', contents);
    } catch (err) {
      console.log('[Local file access denied]', fileUrl, err.message);
    }
  }
}

chrome.mimeHandler.getStreamInfo(async (streamInfo) => {
  console.log('=== StreamInfo ===');
  console.log('mimeType:', streamInfo.mimeType);
  console.log('originalUrl:', streamInfo.originalUrl);
  console.log('streamUrl:', streamInfo.streamUrl);
  console.log('tabId:', streamInfo.tabId);
  console.log('embedded:', streamInfo.embedded);
  console.log('responseHeaders:', streamInfo.responseHeaders);

  // Remember the tab id so the sign-in handler can navigate this tab
  // (chrome.tabs.getCurrent() returns undefined in a MIME handler view).
  pdfTabId = streamInfo.tabId;

  // Remember the PDF URL so the SW can navigate the tab back here via
  // chrome.tabs.update when the user clicks the toolbar action.
  chrome.storage.local.set({ lastPdfUrl: streamInfo.originalUrl });

  // Check auto-fallback setting
  const autoFallbackEnabled = await loadAutoFallbackSetting();
  if (autoFallbackEnabled) {
    executeAutoFallback();
    return;
  }

  try {
    // Fetch PDF data from stream
    loadingEl.textContent = 'Fetching PDF...';
    pdfData = await fetchPdf(streamInfo.streamUrl);
    await logLocalFileLinks(pdfData);

    // Load the external viewer
    loadingEl.textContent = 'Loading viewer...';
    viewerFrame.src = VIEWER_URL;
    viewerFrame.style.display = 'block';
    loadingEl.style.display = 'none';

    // If viewer is already ready, send the PDF
    sendPdfToViewer();
  } catch (err) {
    loadingEl.textContent = `Failed to load PDF: ${err.message}`;
  }
});
