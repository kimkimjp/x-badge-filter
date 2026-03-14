// X Badge Filter - Main Content Script
// Runs in ISOLATED world, listens for API data via postMessage,
// observes DOM, filters tweets
//
// Logic: badge present + not following + not whitelisted → hide

(function () {
  'use strict';

  const USER_CACHE_MAX = 5000;
  const MSG_TYPE = 'xbf-api-data';

  // ── State ──
  let settings = { ...XBF_DEFAULT_SETTINGS };
  let userCache = new Map(); // handle → { following, name }
  let pendingTweets = new Set();
  let hiddenCount = 0;
  let observer = null;
  let processingScheduled = false;
  let pendingNodes = [];
  let apiAvailable = false;

  // ── Initialize ──
  async function init() {
    settings = await XBF_Storage.get();

    setupApiListener();
    setupSettingsListener();

    if (!settings.enabled) return;
    setupObserver();
    processExistingTweets();

    // Timeout: if API interceptor hasn't sent data after 3s,
    // re-process pending tweets using DOM-based fallback.
    setTimeout(() => {
      if (!apiAvailable && pendingTweets.size > 0) {
        const tweets = new Set(pendingTweets);
        pendingTweets.clear();
        for (const article of tweets) {
          if (document.contains(article)) {
            article.dataset.xbfProcessed = '';
            processTweet(article);
          }
        }
      }
    }, 3000);
  }

  // ── Listen for API interceptor data via postMessage ──
  function setupApiListener() {
    window.addEventListener('message', (e) => {
      if (e.source !== window) return;
      if (!e.data || e.data.type !== MSG_TYPE) return;
      if (!Array.isArray(e.data.users)) return;

      apiAvailable = true;

      for (const user of e.data.users) {
        if (typeof user.handle !== 'string' || !user.handle) continue;

        userCache.set(user.handle, {
          following: user.following === true,
          name: typeof user.name === 'string' ? user.name : '',
        });
      }

      // Enforce cache size limit
      if (userCache.size > USER_CACHE_MAX) {
        const excess = userCache.size - USER_CACHE_MAX;
        const iter = userCache.keys();
        for (let i = 0; i < excess; i++) {
          userCache.delete(iter.next().value);
        }
      }

      processPendingTweets();
    });
  }

  // ── Process tweets that were waiting for API data ──
  function processPendingTweets() {
    if (pendingTweets.size === 0) return;
    const tweets = new Set(pendingTweets);
    pendingTweets.clear();
    for (const article of tweets) {
      if (document.contains(article)) {
        processTweet(article);
      }
    }
  }

  // ── MutationObserver ──
  function setupObserver() {
    if (observer) observer.disconnect();

    const target = document.querySelector(XBF_SELECTORS.timeline)
      || document.querySelector(XBF_SELECTORS.timelineFallback)
      || document.body;

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            pendingNodes.push(node);
          }
        }
      }
      if (pendingNodes.length > 500) {
        pendingNodes = pendingNodes.slice(-200);
      }
      scheduleProcessing();
    });

    observer.observe(target, { childList: true, subtree: true });
  }

  function scheduleProcessing() {
    if (processingScheduled) return;
    processingScheduled = true;
    requestAnimationFrame(() => {
      processPendingNodesNow();
      processingScheduled = false;
    });
  }

  function processPendingNodesNow() {
    const nodes = pendingNodes.splice(0);
    for (const node of nodes) {
      const tweets = node.matches?.(XBF_SELECTORS.tweet)
        ? [node]
        : Array.from(node.querySelectorAll?.(XBF_SELECTORS.tweet) || []);
      for (const tweet of tweets) {
        processTweet(tweet);
      }
    }
  }

  function processExistingTweets() {
    const tweets = document.querySelectorAll(XBF_SELECTORS.tweet);
    tweets.forEach(processTweet);
  }

  // ── Core: Process a single tweet ──
  // Simple logic: badge present + not following + not whitelisted → hide
  function processTweet(article) {
    if (!settings.enabled) return;
    if (article.dataset.xbfProcessed === 'true') return;

    // Find the verified badge
    const badge = article.querySelector(XBF_SELECTORS.verifiedBadge)
      || article.querySelector(XBF_SELECTORS.verifiedBadgeFallback);

    if (!badge) {
      article.dataset.xbfProcessed = 'true';
      return;
    }

    // Extract handle from the tweet
    const handle = extractHandle(article);
    if (!handle) {
      pendingTweets.add(article);
      return;
    }

    // Check whitelist
    if (settings.whitelist.includes(handle)) {
      article.dataset.xbfProcessed = 'true';
      return;
    }

    // Check follow status: API cache or DOM fallback
    const userData = userCache.get(handle);
    let following = null;

    if (userData) {
      following = userData.following;
    } else {
      following = detectFollowFromDom(article);

      if (following === null && apiAvailable) {
        pendingTweets.add(article);
        return;
      }
      if (following === null) {
        following = false;
      }
    }

    if (following) {
      article.dataset.xbfProcessed = 'true';
      return;
    }

    // Hide the tweet
    hideTweet(article, handle, userData?.name || handle);
    article.dataset.xbfProcessed = 'true';
  }

  // ── Extract handle from tweet ──
  function extractHandle(article) {
    const userNameArea = article.querySelector(XBF_SELECTORS.userName);
    if (!userNameArea) return null;

    const links = userNameArea.querySelectorAll('a[role="link"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/') && !href.includes('/status/')) {
        const handle = href.slice(1).toLowerCase();
        if (handle && !handle.includes('/')) {
          return handle;
        }
      }
    }
    return null;
  }

  // ── Detect follow status from DOM (fallback) ──
  function detectFollowFromDom(article) {
    const btns = article.querySelectorAll('[role="button"]');
    for (const btn of btns) {
      const text = (btn.textContent || '').trim();
      if (text === 'Follow') return false;
      if (text === 'Following') return true;
      if (text === 'フォロー' && text.length === 4) return false;
      if (text === 'フォロー中') return true;
    }
    return null;
  }

  // ── Hide tweet ──
  function hideTweet(article, handle, displayName) {
    const cell = article.closest(XBF_SELECTORS.cellInnerDiv);
    if (!cell) return;
    if (cell.dataset.xbfHidden === 'true') return;

    cell.dataset.xbfHidden = 'true';
    cell.dataset.xbfHandle = handle;
    cell.dataset.xbfOriginalDisplay = cell.style.display || '';

    if (settings.showPlaceholder) {
      const placeholder = document.createElement('div');
      placeholder.className = 'xbf-placeholder';

      const text = document.createElement('span');
      text.className = 'xbf-placeholder-text';
      text.textContent = `@${handle} の投稿を非表示にしました`;

      const showBtn = document.createElement('button');
      showBtn.className = 'xbf-show-btn';
      showBtn.textContent = '表示';
      showBtn.addEventListener('click', () => {
        cell.style.display = cell.dataset.xbfOriginalDisplay;
        article.style.display = '';
        placeholder.remove();
        cell.dataset.xbfHidden = 'false';
      });

      const whitelistBtn = document.createElement('button');
      whitelistBtn.className = 'xbf-whitelist-btn';
      whitelistBtn.textContent = '常に表示';
      whitelistBtn.addEventListener('click', () => {
        XBF_Storage.addToWhitelist(handle);
        settings.whitelist.push(handle);
        cell.style.display = cell.dataset.xbfOriginalDisplay;
        article.style.display = '';
        placeholder.remove();
        cell.dataset.xbfHidden = 'false';
      });

      placeholder.appendChild(text);
      placeholder.appendChild(showBtn);
      placeholder.appendChild(whitelistBtn);

      article.style.display = 'none';
      cell.insertBefore(placeholder, article);
    } else {
      cell.style.display = 'none';
    }

    hiddenCount++;
    updateBadgeCount();
  }

  // ── Badge count ──
  function updateBadgeCount() {
    try {
      chrome.runtime.sendMessage({
        type: 'updateBadge',
        count: hiddenCount,
      });
    } catch (e) {}
  }

  // ── Settings change listener ──
  function setupSettingsListener() {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.xbf_settings) {
        const newSettings = { ...XBF_DEFAULT_SETTINGS, ...(changes.xbf_settings.newValue || {}) };
        const wasEnabled = settings.enabled;
        settings = newSettings;

        if (!settings.enabled && wasEnabled) {
          showAllHidden();
          if (observer) observer.disconnect();
        } else if (settings.enabled && !wasEnabled) {
          setupObserver();
          processExistingTweets();
        } else if (settings.enabled) {
          resetAndReprocess();
        }
      }
    });
  }

  function showAllHidden() {
    document.querySelectorAll('[data-xbf-hidden="true"]').forEach(cell => {
      cell.style.display = cell.dataset.xbfOriginalDisplay || '';
      const article = cell.querySelector(XBF_SELECTORS.tweet);
      if (article) {
        article.style.display = '';
        article.dataset.xbfProcessed = '';
      }
      const placeholder = cell.querySelector('.xbf-placeholder');
      if (placeholder) placeholder.remove();
      cell.dataset.xbfHidden = '';
    });
    hiddenCount = 0;
    updateBadgeCount();
  }

  function resetAndReprocess() {
    showAllHidden();
    document.querySelectorAll('[data-xbf-processed]').forEach(el => {
      el.dataset.xbfProcessed = '';
    });
    pendingTweets.clear();
    processExistingTweets();
  }

  // ── Start ──
  init();
})();
