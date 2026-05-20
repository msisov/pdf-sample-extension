// Service worker: handles the "return to PDF" action that mirrors
// Adobe's sign-in completion redirect (session.js gotoPath).
//
// Flow:
//   1. main.js stores streamInfo.originalUrl into chrome.storage.local
//      as `lastPdfUrl` when the MIME handler intercepts a PDF.
//   2. Iframe button posts a 'signIn' message; main.js navigates the
//      tab to igalia.com via chrome.tabs.update.
//   3. User clicks the extension's toolbar action. We read the saved
//      PDF URL and call chrome.tabs.update(tabId, { url: pdfUrl }) to
//      navigate the tab back. Note: for file:// PDFs this requires the
//      user to enable "Allow access to file URLs" in chrome://extensions
//      for this extension.

chrome.action.onClicked.addListener(async (tab) => {
  const { lastPdfUrl } = await chrome.storage.local.get('lastPdfUrl');
  if (!lastPdfUrl) {
    console.warn('[sw] No saved PDF URL — open a PDF first to record one.');
    return;
  }
  console.log('[sw] Returning tab', tab.id, 'to', lastPdfUrl);
  chrome.tabs.update(tab.id, { url: lastPdfUrl });
});
