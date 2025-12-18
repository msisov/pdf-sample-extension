// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as pdfjsLib from './lib/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdf.worker.min.mjs';

const canvas = document.getElementById('pdf-canvas');
const context = canvas.getContext('2d');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const pageInfoEl = document.getElementById('page-info');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let rendering = false;

async function renderPage(pageNum) {
  if (rendering) return;
  rendering = true;

  try {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;

    currentPage = pageNum;
    pageInfoEl.textContent = `Page ${currentPage} of ${totalPages}`;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
  } finally {
    rendering = false;
  }
}

prevBtn.addEventListener('click', () => {
  if (currentPage > 1) renderPage(currentPage - 1);
});

nextBtn.addEventListener('click', () => {
  if (currentPage < totalPages) renderPage(currentPage + 1);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    if (currentPage > 1) renderPage(currentPage - 1);
  } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
    if (currentPage < totalPages) renderPage(currentPage + 1);
  }
});

chrome.mimeHandler.getStreamInfo(async (streamInfo) => {
  try {
    const response = await fetch(streamInfo.streamUrl);
    const reader = response.body.getReader();
    const chunks = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedLength += value.length;
    }

    const pdfData = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      pdfData.set(chunk, position);
      position += chunk.length;
    }

    pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
    totalPages = pdfDoc.numPages;

    loadingEl.style.display = 'none';
    canvas.style.display = 'block';

    await renderPage(1);
  } catch (err) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.textContent = `Failed to load PDF: ${err.message}`;
  }
});
