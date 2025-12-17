// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

document.getElementById('pdf-url').textContent = window.location.href;

// Use the new public mimeHandler API to get stream info
chrome.mimeHandler.getStreamInfo(function(streamInfo) {
  console.log('Stream info received:', streamInfo);

  document.getElementById('mime-type').textContent = streamInfo.mimeType;
  document.getElementById('original-url').textContent = streamInfo.originalUrl;
  document.getElementById('stream-url').textContent = streamInfo.streamUrl;
  document.getElementById('tab-id').textContent = streamInfo.tabId;
  document.getElementById('embedded').textContent = streamInfo.embedded;

  // Display response headers
  const headersEl = document.getElementById('response-headers');
  const headers = streamInfo.responseHeaders;
  if (headers && Object.keys(headers).length > 0) {
    headersEl.textContent = JSON.stringify(headers, null, 2);
  } else {
    headersEl.textContent = '(none)';
  }
});
