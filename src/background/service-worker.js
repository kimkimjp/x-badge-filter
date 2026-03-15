// X Badge Filter - Background Service Worker
// Manages badge count display and settings initialization

let sessionHiddenCount = 0;

chrome.runtime.onInstalled.addListener(async () => {
  // Set default settings if not already set
  const data = await chrome.storage.local.get('xbf_settings');
  if (!data.xbf_settings) {
    await chrome.storage.local.set({
      xbf_settings: {
        enabled: true,
        showPlaceholder: true,
        filterBlue: true,
        filterGold: false,
        filterGrey: false,
        whitelist: [],
      }
    });
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'updateBadge' && sender.tab) {
    const count = message.count || 0;
    sessionHiddenCount += count;
    const text = sessionHiddenCount > 0 ? String(sessionHiddenCount > 999 ? '999+' : sessionHiddenCount) : '';
    chrome.action.setBadgeText({ text, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#1d9bf0', tabId: sender.tab.id });
  }

  if (message.type === 'getSessionCount') {
    sendResponse({ count: sessionHiddenCount });
    return true;
  }
});
