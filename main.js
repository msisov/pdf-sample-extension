// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// External viewer URL - change this to your GitHub Pages URL
const VIEWER_URL = 'https://msisov.github.io/pdf_viewer/viewer.html';

const loadingEl = document.getElementById('loading');
const viewerFrame = document.getElementById('viewer-frame');

let pdfData = null;
let viewerReady = false;

// Listen for messages from the viewer iframe
window.addEventListener('message', (event) => {
  if (event.data.type === 'viewerReady') {
    viewerReady = true;
    sendPdfToViewer();
  } else if (event.data.type === 'pdfLoaded') {
    console.log(`PDF loaded: ${event.data.numPages} pages`);
  } else if (event.data.type === 'pdfError') {
    console.error('Viewer error:', event.data.message);
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

chrome.mimeHandler.getStreamInfo(async (streamInfo) => {
  console.log('=== StreamInfo ===');
  console.log('mimeType:', streamInfo.mimeType);
  console.log('originalUrl:', streamInfo.originalUrl);
  console.log('streamUrl:', streamInfo.streamUrl);
  console.log('tabId:', streamInfo.tabId);
  console.log('embedded:', streamInfo.embedded);
  console.log('responseHeaders:', streamInfo.responseHeaders);

  try {
    // Fetch PDF data from stream
    loadingEl.textContent = 'Fetching PDF...';
    pdfData = await fetchPdf(streamInfo.streamUrl);

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
