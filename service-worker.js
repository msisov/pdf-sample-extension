// Service worker: handles the "return to PDF" action that mirrors
// Adobe's sign-in completion redirect (session.js gotoPath).
//
// Flow:
//   1. main.js stores streamInfo.originalUrl into chrome.storage.local
//      as `lastPdfUrl` when the MIME handler intercepts a PDF.
//   2. Iframe button posts a 'signIn' message; main.js navigates the
//      tab to igalia.com via chrome.tabs.update.
//   3. User clicks the extension's toolbar action. We walk the tab's
//      session history backwards via chrome.tabs.goBack(tabId), one
//      step at a time, until the tab's URL matches lastPdfUrl. goBack
//      activates an existing history entry rather than initiating a
//      new navigation, so file:// PDFs work without the user-toggled
//      "Allow access to file URLs" flag.

const MAX_BACK_STEPS = 20;

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  const { lastPdfUrl } = await chrome.storage.local.get('lastPdfUrl');
  if (!lastPdfUrl) {
    console.warn('[sw] No saved PDF URL — open a PDF first to record one.');
    return;
  }
  console.log('[sw] Target PDF URL:', lastPdfUrl);

  for (let step = 0; step < MAX_BACK_STEPS; step++) {
    const current = await chrome.tabs.get(tab.id);
    console.log(
        `[sw] step=${step} url=${current.url} status=${current.status}`);
    if (current.url === lastPdfUrl) {
      console.log('[sw] Reached PDF URL after', step, 'goBack call(s)');
      return;
    }
    if (current.url === 'about:blank' || current.url === '') {
      console.warn('[sw] Hit about:blank — PDF entry was skipped or absent');
      return;
    }
    try {
      await chrome.tabs.goBack(tab.id);
      await waitForTabComplete(tab.id);
    } catch (err) {
      console.warn('[sw] goBack failed (start of history?):', err.message);
      return;
    }
  }
  console.warn('[sw] Hit MAX_BACK_STEPS without finding', lastPdfUrl);
});
