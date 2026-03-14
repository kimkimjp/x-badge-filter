// X Badge Filter - Background Service Worker
// Manages badge count display and settings initialization

chrome.runtime.onInstalled.addListener(async () => {
  // Set default settings if not already set
  const data = await chrome.storage.local.get('xbf_settings');
  if (!data.xbf_settings) {
    await chrome.storage.local.set({
      xbf_settings: {
        enabled: true,
        filterBlue: true,
        filterGold: false,
        filterGrey: false,
        showPlaceholder: true,
        whitelist: [],
      }
    });
  }
});

// Handle badge count updates from content script
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'updateBadge' && sender.tab) {
    const count = message.count || 0;
    const text = count > 0 ? String(count > 999 ? '999+' : count) : '';
    chrome.action.setBadgeText({ text, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#1d9bf0', tabId: sender.tab.id });
  }
});
