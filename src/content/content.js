// X Badge Filter - Main Content Script
// Runs in ISOLATED world, listens for API data via postMessage,
// observes DOM, filters tweets

(function () {
  'use strict';

  const USER_CACHE_MAX = 5000;
  const MSG_TYPE = 'xbf-api-data';

  // ── State ──
  let settings = { ...XBF_DEFAULT_SETTINGS };
  let userCache = new Map(); // handle → { following, badgeType, name }
  let pendingTweets = new Set(); // tweets waiting for API data
  let hiddenCount = 0;
  let observer = null;
  let processingScheduled = false;
  let pendingNodes = [];
  let apiAvailable = false; // Set true when first API data arrives via postMessage

  // ── Initialize ──
  async function init() {
    settings = await XBF_Storage.get();

    setupApiListener();
    setupSettingsListener();

    if (!settings.enabled) return;
    setupObserver();
    processExistingTweets();

    // Timeout: if API interceptor hasn't sent data after 3s,
    // it likely means "world": "MAIN" is not supported (Android browsers).
    // Re-process pending tweets using DOM-based fallback.
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
  // P0 fix: postMessage works across MAIN and ISOLATED worlds
  function setupApiListener() {
    window.addEventListener('message', (e) => {
      // Validate message origin and structure
      if (e.source !== window) return;
      if (!e.data || e.data.type !== MSG_TYPE) return;
      if (!Array.isArray(e.data.users)) return;

      apiAvailable = true;

      for (const user of e.data.users) {
        // Validate user data structure
        if (typeof user.handle !== 'string' || !user.handle) continue;

        let badgeType = null;
        if (user.isBlueVerified) {
          if (user.verifiedType === 'Business') {
            badgeType = 'gold';
          } else if (user.verifiedType === 'Government') {
            badgeType = 'grey';
          } else {
            badgeType = 'blue';
          }
        }

        userCache.set(user.handle, {
          following: user.following === true,
          badgeType,
          name: typeof user.name === 'string' ? user.name : '',
        });
      }

      // P1 fix: Enforce cache size limit (LRU-like eviction)
      if (userCache.size > USER_CACHE_MAX) {
        const excess = userCache.size - USER_CACHE_MAX;
        const iter = userCache.keys();
        for (let i = 0; i < excess; i++) {
          userCache.delete(iter.next().value);
        }
      }

      // P1 fix: Only re-process tweets that were pending API data
      processPendingTweets();
    });
  }

  // ── Process tweets that were waiting for API data ──
  function processPendingTweets() {
    if (pendingTweets.size === 0) return;
    const tweets = new Set(pendingTweets);
    pendingTweets.clear();
    for (const article of tweets) {
      // Check if still in DOM
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
      // P2 fix: Cap pendingNodes to prevent memory growth in background tabs
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
      // DOM not ready yet, add to pending
      pendingTweets.add(article);
      return;
    }

    // Check whitelist
    if (settings.whitelist.includes(handle)) {
      article.dataset.xbfProcessed = 'true';
      return;
    }

    // Check user cache (from API interceptor) or fall back to DOM detection
    const userData = userCache.get(handle);
    let following = null;
    let badgeType = null;

    if (userData) {
      // Path 1: API data available (most accurate)
      following = userData.following;
      badgeType = userData.badgeType;
    } else {
      // Path 2: No API data → DOM-based fallback
      // This handles Android browsers where "world": "MAIN" is not supported
      following = detectFollowFromDom(article);
      badgeType = detectBadgeTypeFromDom(badge);

      if (following === null && apiAvailable) {
        // API is working but this user's data hasn't arrived yet
        pendingTweets.add(article);
        return;
      }
      if (following === null) {
        // Neither API nor DOM can determine follow state → treat as not following
        following = false;
      }
    }

    // If following, don't hide
    if (following) {
      article.dataset.xbfProcessed = 'true';
      return;
    }

    // Check badge type against filter settings
    badgeType = badgeType || detectBadgeTypeFromDom(badge);
    if (!badgeType) {
      article.dataset.xbfProcessed = 'true';
      return;
    }

    const shouldFilter =
      (badgeType === 'blue' && settings.filterBlue) ||
      (badgeType === 'gold' && settings.filterGold) ||
      (badgeType === 'grey' && settings.filterGrey);

    if (!shouldFilter) {
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

  // ── Detect follow status from DOM (fallback for Android/unsupported browsers) ──
  function detectFollowFromDom(article) {
    const btns = article.querySelectorAll('[role="button"]');
    for (const btn of btns) {
      const text = (btn.textContent || '').trim();
      // English
      if (text === 'Follow') return false;
      if (text === 'Following') return true;
      // Japanese
      if (text === 'フォロー' && text.length === 4) return false;
      if (text === 'フォロー中') return true;
    }
    return null; // Cannot determine
  }

  // ── Detect badge type from DOM (fallback when API data lacks badge info) ──
  function detectBadgeTypeFromDom(badgeEl) {
    try {
      const svg = badgeEl.closest('svg') || badgeEl;
      const paths = svg.querySelectorAll('path, circle');
      for (const p of paths) {
        const fill = p.getAttribute('fill');
        if (!fill) continue;
        const color = parseColor(fill);
        if (!color) continue;
        if (matchesColorRange(color, XBF_BADGE_COLORS.blue)) return 'blue';
        if (matchesColorRange(color, XBF_BADGE_COLORS.gold)) return 'gold';
        if (matchesColorRange(color, XBF_BADGE_COLORS.grey)) return 'grey';
      }

      const computed = window.getComputedStyle(svg);
      const fillColor = computed.color || computed.fill;
      if (fillColor) {
        const color = parseColor(fillColor);
        if (color) {
          if (matchesColorRange(color, XBF_BADGE_COLORS.blue)) return 'blue';
          if (matchesColorRange(color, XBF_BADGE_COLORS.gold)) return 'gold';
          if (matchesColorRange(color, XBF_BADGE_COLORS.grey)) return 'grey';
        }
      }
    } catch (e) {}
    // P3 fix: Return null instead of defaulting to 'blue'
    return null;
  }

  function parseColor(str) {
    if (!str) return null;
    const rgbMatch = str.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
    }
    const hexMatch = str.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (hexMatch) {
      return { r: parseInt(hexMatch[1], 16), g: parseInt(hexMatch[2], 16), b: parseInt(hexMatch[3], 16) };
    }
    return null;
  }

  function matchesColorRange(color, range) {
    return color.r >= range.r[0] && color.r <= range.r[1]
      && color.g >= range.g[0] && color.g <= range.g[1]
      && color.b >= range.b[0] && color.b <= range.b[1];
  }

  // ── Hide tweet ──
  // P0 fix: Use createElement + textContent instead of innerHTML
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
