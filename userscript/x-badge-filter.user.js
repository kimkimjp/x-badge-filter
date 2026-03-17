// ==UserScript==
// @name         X Badge Filter
// @namespace    https://ultrathink.jp
// @version      2.7.0
// @description  Hide tweets from non-followed verified accounts on X/Twitter timeline
// @author       kimkimjp
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Phase 0: CSS Pre-hiding (MUST be first)
  //  Hides unprocessed timeline cells before they render.
  //  Prevents badge tweets from flashing before filter runs.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const preHideStyle = document.createElement('style');
  preHideStyle.id = 'xbf-prehide';
  preHideStyle.textContent =
    '[data-testid="cellInnerDiv"]:not([data-xbf-ok]) { visibility: hidden !important; }';
  (document.head || document.documentElement).appendChild(preHideStyle);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  i18n
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const XBF_I18N = {
    ja: {
      hiddenPost: 'の投稿を非表示にしました',
      show: '表示',
      alwaysShow: '常に表示',
      filterOn: 'フィルター ON/OFF',
      showPlaceholder: '非表示バーを表示',
      filterBlue: '青バッジ（個人課金）',
      filterGold: '金バッジ（企業公式）',
      filterGrey: '灰バッジ（政府機関）',
      whitelist: 'ホワイトリスト',
      add: '追加',
      exportBtn: 'エクスポート',
      importBtn: 'インポート',
    },
    en: {
      hiddenPost: "'s post was hidden",
      show: 'Show',
      alwaysShow: 'Always Show',
      filterOn: 'Filter ON/OFF',
      showPlaceholder: 'Show hidden bar',
      filterBlue: 'Blue (Premium)',
      filterGold: 'Gold (Business)',
      filterGrey: 'Grey (Government)',
      whitelist: 'Whitelist',
      add: 'Add',
      exportBtn: 'Export',
      importBtn: 'Import',
    },
  };

  function t(key) {
    const lang = (navigator.language || '').startsWith('ja') ? 'ja' : 'en';
    return (XBF_I18N[lang] || XBF_I18N.en)[key] || key;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Constants
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const SELECTORS = {
    tweet: 'article[data-testid="tweet"]',
    tweetFallback: 'article[role="article"]',
    verifiedBadge: 'svg[data-testid="icon-verified"]',
    verifiedBadgeFallback: '[aria-label*="erified"]',
    timeline: '[data-testid="primaryColumn"]',
    timelineFallback: 'main[role="main"]',
    cellInnerDiv: '[data-testid="cellInnerDiv"]',
    userName: '[data-testid="User-Name"]',
    userNameAlt: '[data-testid="User-Names"]',
    socialContext: '[data-testid="socialContext"]',
  };

  const STORAGE_KEY = 'xbf_settings';
  const USER_CACHE_MAX = 5000;
  const LOG_PREFIX = '[XBF]';
  const RESCAN_INTERVAL = 3000;
  const SAFETY_TIMEOUT = 3000;

  const DEFAULT_SETTINGS = {
    enabled: true,
    showPlaceholder: true,
    filterBlue: true,
    filterGold: false,
    filterGrey: false,
    whitelist: [],
  };

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Storage (localStorage-based)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const Storage = {
    get() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    },
    set(settings) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (e) {}
    },
    addToWhitelist(handle) {
      const s = this.get();
      const normalized = handle.replace(/^@/, '').toLowerCase();
      if (!s.whitelist.includes(normalized)) {
        s.whitelist.push(normalized);
        this.set(s);
      }
      return s;
    },
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Styles
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function injectStyles() {
    if (document.getElementById('xbf-styles')) return;
    const style = document.createElement('style');
    style.id = 'xbf-styles';
    style.textContent = `
      .xbf-placeholder {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 16px; font-size: 13px;
        color: rgb(113, 118, 123);
        border-bottom: 1px solid rgb(47, 51, 54);
        background: transparent; flex-wrap: wrap;
      }
      .xbf-placeholder-text { flex: 1; min-width: 150px; }
      .xbf-placeholder button {
        background: none; border: 1px solid rgb(83, 100, 113);
        color: rgb(139, 152, 165); border-radius: 9999px;
        padding: 2px 12px; font-size: 12px; cursor: pointer;
        white-space: nowrap; transition: background 0.2s, color 0.2s;
      }
      .xbf-placeholder button:hover {
        background: rgba(29, 155, 240, 0.1);
        color: rgb(29, 155, 240); border-color: rgb(29, 155, 240);
      }
      .xbf-hidden-cell {
        display: none !important; height: 0 !important; min-height: 0 !important;
        padding: 0 !important; margin: 0 !important; border: none !important;
        overflow: hidden !important;
      }
      .xbf-settings-panel {
        position: fixed; bottom: 20px; right: 20px; z-index: 99999;
        background: #15202b; color: #e7e9ea; border-radius: 12px;
        padding: 16px; width: 280px; max-width: calc(100vw - 40px); font-family: system-ui, sans-serif;
        font-size: 14px; box-shadow: 0 4px 24px rgba(0,0,0,0.5);
        border: 1px solid #38444d; display: none;
      }
      .xbf-settings-panel.open { display: block; }
      .xbf-settings-panel h3 { margin: 0 0 12px 0; font-size: 15px; }
      .xbf-settings-panel label {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 0; cursor: pointer; font-size: 13px;
      }
      .xbf-settings-panel input[type="checkbox"] { margin: 0; }
      .xbf-settings-panel .xbf-close {
        position: absolute; top: 8px; right: 12px;
        background: none; border: none; color: #8b98a5;
        font-size: 18px; cursor: pointer;
      }
      .xbf-settings-panel .xbf-section { margin-top: 10px; padding-top: 10px; border-top: 1px solid #38444d; }
      .xbf-settings-panel .xbf-wl-row { display: flex; gap: 6px; margin-top: 6px; }
      .xbf-settings-panel .xbf-wl-row input {
        flex: 1; padding: 4px 8px; border: 1px solid #38444d;
        border-radius: 6px; background: #1e2732; color: #e7e9ea; font-size: 12px;
      }
      .xbf-settings-panel .xbf-wl-row button {
        padding: 4px 10px; background: #1d9bf0; color: #fff; border: none;
        border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: 600;
      }
      .xbf-settings-panel .xbf-wl-item {
        display: flex; justify-content: space-between; align-items: center;
        padding: 3px 0; font-size: 12px; color: #8b98a5;
      }
      .xbf-settings-panel .xbf-wl-remove {
        background: none; border: none; color: #f4212e; cursor: pointer; font-size: 14px;
      }
      .xbf-settings-panel .xbf-ie-row {
        display: flex; gap: 6px; margin-top: 8px;
      }
      .xbf-settings-panel .xbf-ie-row button {
        flex: 1; padding: 4px 10px; background: #1e2732; color: #8b98a5;
        border: 1px solid #38444d; border-radius: 6px; font-size: 12px;
        cursor: pointer; transition: background 0.2s, color 0.2s;
      }
      .xbf-settings-panel .xbf-ie-row button:hover {
        background: rgba(29, 155, 240, 0.1); color: #1d9bf0; border-color: #1d9bf0;
      }
      .xbf-fab {
        position: fixed; bottom: 150px; right: 20px; z-index: 99998;
        width: 48px; height: 48px; border-radius: 50%;
        background: #1d9bf0; color: #fff; border: none;
        font-size: 18px; cursor: pointer; display: flex;
        align-items: center; justify-content: center;
        box-shadow: 0 2px 12px rgba(0,0,0,0.3);
        transition: opacity 0.2s;
        -webkit-tap-highlight-color: transparent;
      }
      .xbf-fab:hover { opacity: 0.85; }
      .xbf-fab .xbf-fab-count {
        position: absolute; top: -4px; right: -4px;
        background: #f4212e; color: #fff; font-size: 10px;
        min-width: 18px; height: 18px; border-radius: 9px;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; padding: 0 4px;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  API Interceptor - fetch monkey-patch
  //  Note: May not work on Firefox Android. DOM filtering is primary.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const userCache = new Map();
  let apiAvailable = false;
  let existingCellsProcessed = false;
  let deferUnknown = true; // defer filtering when follow status is unknown

  function setupFetchIntercept() {
    try {
      const origFetch = window.fetch;
      if (!origFetch) return;

      window.fetch = function (...args) {
        const result = origFetch.apply(this, args);
        try {
          const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
          if (url.includes('/graphql/') && (
            url.includes('HomeTimeline') ||
            url.includes('HomeLatestTimeline') ||
            url.includes('SearchTimeline') ||
            url.includes('UserTweets') ||
            url.includes('TweetDetail') ||
            url.includes('ListLatestTweetsTimeline')
          )) {
            result.then(response => {
              try {
                const clone = response.clone();
                clone.json().then(data => {
                  const users = extractUsersFromApi(data);
                  if (users.length > 0) receiveApiUsers(users);
                }).catch(() => {});
              } catch (e) {}
              return response;
            }).catch(() => {});
          }
        } catch (e) {}
        return result;
      };
    } catch (e) {}
  }

  function receiveApiUsers(users) {
    const wasFirstBatch = !apiAvailable;
    apiAvailable = true;
    for (const user of users) {
      if (typeof user.handle !== 'string' || !user.handle) continue;
      userCache.set(user.handle, {
        following: user.following === true,
        name: typeof user.name === 'string' ? user.name : '',
        isBlueVerified: user.isBlueVerified === true,
        verifiedType: user.verifiedType || null,
      });
    }
    if (userCache.size > USER_CACHE_MAX) {
      const excess = userCache.size - USER_CACHE_MAX;
      const iter = userCache.keys();
      for (let i = 0; i < excess; i++) userCache.delete(iter.next().value);
    }
    // On first API data, process existing cells with full cache
    if (wasFirstBatch && !existingCellsProcessed) {
      existingCellsProcessed = true;
      processExistingCells();
    }
    processPendingTweets();
    revalidateHiddenTweets();
  }

  function extractUsersFromApi(rootObj) {
    const results = [];
    const seen = new Set();
    const stack = [rootObj];
    while (stack.length > 0) {
      const obj = stack.pop();
      if (!obj || typeof obj !== 'object') continue;
      if (obj.legacy && obj.rest_id) {
        const handle = (obj.legacy.screen_name || '').toLowerCase();
        if (handle && !seen.has(handle)) {
          seen.add(handle);
          results.push({
            handle,
            name: obj.legacy.name || '',
            following: obj.legacy.following === true,
            isBlueVerified: obj.is_blue_verified === true,
            verifiedType: obj.legacy.verified_type || obj.verified_type || null,
          });
        }
      }
      if (Array.isArray(obj)) {
        for (let i = obj.length - 1; i >= 0; i--) {
          if (obj[i] && typeof obj[i] === 'object') stack.push(obj[i]);
        }
      } else {
        const keys = Object.keys(obj);
        for (let i = keys.length - 1; i >= 0; i--) {
          const val = obj[keys[i]];
          if (val && typeof val === 'object') stack.push(val);
        }
      }
    }
    return results;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Badge type detection and filtering
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function getBadgeType(userData) {
    if (!userData) return 'blue';
    if (userData.verifiedType === 'Business') return 'gold';
    if (userData.verifiedType === 'Government') return 'grey';
    if (userData.isBlueVerified) return 'blue';
    return 'blue';
  }

  function shouldFilterBadgeType(badgeType) {
    if (badgeType === 'blue') return settings.filterBlue !== false;
    if (badgeType === 'gold') return settings.filterGold === true;
    if (badgeType === 'grey') return settings.filterGrey === true;
    return true;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  RT/Repost detection
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function checkRepostByFollowed(article) {
    const socialContext = article.querySelector(SELECTORS.socialContext);
    if (!socialContext) return false;
    const contextText = socialContext.textContent || '';
    if (!contextText.includes('reposted') && !contextText.includes('\u30EA\u30DD\u30B9\u30C8')) return false;

    const rtLink = socialContext.querySelector('a[role="link"]');
    if (!rtLink) return false;
    const rtHref = rtLink.getAttribute('href');
    if (!rtHref || !rtHref.startsWith('/')) return false;
    const rtHandle = rtHref.slice(1).toLowerCase().split('/')[0];
    if (!rtHandle) return false;

    // Check if RT author is followed
    const rtUser = userCache.get(rtHandle);
    if (rtUser && rtUser.following) return true;

    // Check if RT author is whitelisted
    if (settings.whitelist.includes(rtHandle)) return true;

    return false;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Handle extraction - multiple strategies
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function extractHandle(article) {
    let handle = extractHandleFromUserName(article, SELECTORS.userName);
    if (handle) return handle;
    handle = extractHandleFromUserName(article, SELECTORS.userNameAlt);
    if (handle) return handle;
    handle = extractHandleFromLinks(article);
    if (handle) return handle;
    handle = extractHandleFromText(article);
    return handle;
  }

  function extractHandleFromUserName(article, selector) {
    const area = article.querySelector(selector);
    if (!area) return null;
    const links = area.querySelectorAll('a[href]');
    for (const link of links) {
      const h = handleFromHref(link);
      if (h) return h;
    }
    return null;
  }

  function extractHandleFromLinks(article) {
    const excludePaths = ['/status/', '/hashtag/', '/search', '/i/', '/compose', '/settings', '/home', '/explore', '/notifications', '/messages'];
    const links = article.querySelectorAll('a[href^="/"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href || href === '/') continue;
      if (excludePaths.some(p => href.includes(p))) continue;
      const match = href.match(/^\/([A-Za-z0-9_]{1,15})$/);
      if (match) return match[1].toLowerCase();
    }
    return null;
  }

  function extractHandleFromText(article) {
    const spans = article.querySelectorAll('span');
    for (const span of spans) {
      const text = (span.textContent || '').trim();
      const m = text.match(/^@([A-Za-z0-9_]{1,15})$/);
      if (m) return m[1].toLowerCase();
    }
    return null;
  }

  function handleFromHref(link) {
    const href = link.getAttribute('href');
    if (!href || !href.startsWith('/')) return null;
    if (href.includes('/status/')) return null;
    const h = href.slice(1).toLowerCase();
    if (h && !h.includes('/') && /^[a-z0-9_]{1,15}$/.test(h)) return h;
    return null;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  DOM-based follow detection
  //  IMPORTANT: Only check buttons near the tweet AUTHOR,
  //  not in the entire article (which may contain RT/quote buttons)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function detectFollowFromDom(article, handle) {
    const userNameArea = article.querySelector(SELECTORS.userName)
      || article.querySelector(SELECTORS.userNameAlt);

    if (userNameArea) {
      let headerRow = userNameArea.parentElement;
      for (let i = 0; i < 3 && headerRow && headerRow !== article; i++) {
        const result = checkFollowButtons(headerRow);
        if (result !== null) return result;
        headerRow = headerRow.parentElement;
      }
    }

    if (handle) {
      const profileLinks = article.querySelectorAll(`a[href="/${handle}" i], a[href="/${handle}"]`);
      for (const link of profileLinks) {
        let ancestor = link.parentElement;
        for (let i = 0; i < 4 && ancestor && ancestor !== article; i++) {
          const result = checkFollowButtons(ancestor);
          if (result !== null) return result;
          ancestor = ancestor.parentElement;
        }
      }
    }

    return null;
  }

  function checkFollowButtons(container) {
    const btns = container.querySelectorAll('[role="button"]');
    for (const btn of btns) {
      const text = (btn.textContent || '').trim();
      if (text === 'Follow' || (text === '\u30D5\u30A9\u30ED\u30FC' && text.length === 4)) return false;
      if (text === 'Following' || text === '\u30D5\u30A9\u30ED\u30FC\u4E2D') return true;
    }
    return null;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Tweet identity tracking (for React DOM reuse detection)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function getTweetKey(article) {
    const statusLink = article.querySelector('a[href*="/status/"]');
    if (statusLink) return statusLink.getAttribute('href');
    return (article.textContent || '').slice(0, 80);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Cell Processing - mark cells as OK to reveal
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function markCellOk(article) {
    const cell = article.closest(SELECTORS.cellInnerDiv);
    if (cell) cell.setAttribute('data-xbf-ok', '');
  }

  function markCellOkDirect(cell) {
    cell.setAttribute('data-xbf-ok', '');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Content Filter
  //  Logic: badge present + not following + not whitelisted + badge type enabled → hide
  //
  //  Processing strategy for zero-flash:
  //  Stage A (synchronous in MO callback): quick badge check
  //    - No article -> mark cell OK immediately
  //    - Article, no badge -> mark cell OK immediately
  //  Stage B (queueMicrotask): full follow/whitelist check
  //    - Runs before browser paint, but after MO callback
  //    - Decides hide or show
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  let settings = DEFAULT_SETTINGS;
  let pendingTweets = new Set();
  let hiddenCount = 0;
  let observer = null;
  let badgeFoundCount = 0;
  let followSkipCount = 0;
  let lastUrl = '';

  function initFilter() {
    settings = Storage.get();
    log('v2.7.0 | enabled=' + settings.enabled + ' | pre-hide active');

    if (!settings.enabled) {
      // Remove pre-hiding CSS if disabled
      removePreHideCSS();
      return;
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onDomReady);
    } else {
      onDomReady();
    }
  }

  function removePreHideCSS() {
    const el = document.getElementById('xbf-prehide');
    if (el) el.remove();
  }

  function onDomReady() {
    log('DOM ready');
    injectStyles();
    setupUI();
    setupObserver();
    // Don't process existing cells immediately — wait for first API data.
    lastUrl = location.href;

    // After 5s, stop deferring and process remaining pending tweets
    setTimeout(() => {
      deferUnknown = false;
      if (!existingCellsProcessed) {
        existingCellsProcessed = true;
        processExistingCells();
      }
      if (pendingTweets.size > 0) {
        const tweets = new Set(pendingTweets);
        pendingTweets.clear();
        for (const article of tweets) {
          if (document.contains(article)) {
            article.dataset.xbfProcessed = '';
            processTweet(article);
          }
        }
      }
    }, 5000);

    // Periodic re-scan + safety timeout for unprocessed cells
    setInterval(() => {
      if (!settings.enabled) return;

      // SPA navigation detection
      if (location.href !== lastUrl) {
        log('SPA navigation: ' + lastUrl + ' -> ' + location.href);
        lastUrl = location.href;
        setupObserver();
      }

      processExistingCells();
      releaseStaleCells();
    }, RESCAN_INTERVAL);
  }

  // -- Safety valve: force-show cells stuck without data-xbf-ok --
  function releaseStaleCells() {
    const now = Date.now();
    const cells = document.querySelectorAll('[data-testid="cellInnerDiv"]:not([data-xbf-ok])');
    for (const cell of cells) {
      const ts = parseInt(cell.dataset.xbfTs || '0', 10);
      if (ts > 0 && (now - ts) > SAFETY_TIMEOUT) {
        markCellOkDirect(cell);
      }
    }
  }

  function processPendingTweets() {
    if (pendingTweets.size === 0) return;
    const tweets = new Set(pendingTweets);
    pendingTweets.clear();
    for (const article of tweets) {
      if (document.contains(article)) processTweet(article);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  MutationObserver - SYNCHRONOUS cell processing
  //  No requestAnimationFrame deferral.
  //  Process cells immediately to prevent flash.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function setupObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      if (!settings.enabled) return;

      for (const mutation of mutations) {
        // Handle added nodes: find and process new cells
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          processNewNode(node);
        }

        // Handle DOM reuse: if children of a cellInnerDiv changed,
        // re-check the cell (React may have swapped tweet content)
        if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
          const cell = mutation.target.closest?.('[data-testid="cellInnerDiv"]');
          if (cell && cell.hasAttribute('data-xbf-ok')) {
            // Content changed in a previously processed cell -> re-process
            cell.removeAttribute('data-xbf-ok');
            const article = cell.querySelector(SELECTORS.tweet)
              || cell.querySelector(SELECTORS.tweetFallback);
            if (article) {
              article.dataset.xbfProcessed = '';
              article.dataset.xbfTweetKey = '';
            }
            processNewNode(cell);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // -- Stage A: Synchronous quick check --
  function processNewNode(node) {
    const cells = [];
    if (node.matches?.('[data-testid="cellInnerDiv"]')) {
      cells.push(node);
    } else if (node.querySelectorAll) {
      const found = node.querySelectorAll('[data-testid="cellInnerDiv"]');
      for (let i = 0; i < found.length; i++) cells.push(found[i]);
    }

    for (const cell of cells) {
      if (cell.hasAttribute('data-xbf-ok')) continue;

      // Timestamp for safety timeout
      if (!cell.dataset.xbfTs) {
        cell.dataset.xbfTs = String(Date.now());
      }

      const article = cell.querySelector(SELECTORS.tweet)
        || cell.querySelector(SELECTORS.tweetFallback);

      if (!article) {
        // Non-tweet cell (promotions, topics, etc.) -> show immediately
        markCellOkDirect(cell);
        continue;
      }

      // Quick badge check (synchronous, very fast)
      const badge = article.querySelector(SELECTORS.verifiedBadge)
        || article.querySelector(SELECTORS.verifiedBadgeFallback);

      if (!badge) {
        // No badge -> safe to show
        article.dataset.xbfProcessed = 'true';
        markCellOkDirect(cell);
        continue;
      }

      // Badge found -> need full check (handle, follow, whitelist, badge type, RT)
      queueMicrotask(() => {
        processVerifiedTweet(cell, article);
      });
    }

    // Also handle articles that aren't inside a cellInnerDiv (edge case)
    if (cells.length === 0) {
      const articles = node.matches?.(SELECTORS.tweet)
        ? [node]
        : Array.from(node.querySelectorAll?.(SELECTORS.tweet) || []);
      for (const article of articles) {
        processTweet(article);
      }
    }
  }

  // -- Stage B: Full verification for badge tweets --
  function processVerifiedTweet(cell, article) {
    if (cell.hasAttribute('data-xbf-ok')) return;

    // Skip inner (quoted) tweets
    if (article.parentElement && article.parentElement.closest('article[data-testid="tweet"]')) {
      article.dataset.xbfProcessed = 'true';
      markCellOkDirect(cell);
      return;
    }

    badgeFoundCount++;

    // Extract handle
    const handle = extractHandle(article);
    if (!handle) {
      pendingTweets.add(article);
      return;
    }

    // Check whitelist
    if (settings.whitelist.includes(handle)) {
      article.dataset.xbfProcessed = 'true';
      markCellOkDirect(cell);
      return;
    }

    // Check follow status
    const userData = userCache.get(handle);
    let following = null;

    if (userData) {
      following = userData.following;
    } else {
      following = detectFollowFromDom(article, handle);
      if (following === null) {
        if (deferUnknown) {
          pendingTweets.add(article);
          return;
        }
        following = false;
      }
    }

    if (following) {
      followSkipCount++;
      article.dataset.xbfProcessed = 'true';
      markCellOkDirect(cell);
      return;
    }

    // RT/Repost check: if reposted by a followed/whitelisted user, show
    if (checkRepostByFollowed(article)) {
      article.dataset.xbfProcessed = 'true';
      markCellOkDirect(cell);
      return;
    }

    // Badge type filter check
    const badgeType = getBadgeType(userData);
    if (!shouldFilterBadgeType(badgeType)) {
      article.dataset.xbfProcessed = 'true';
      markCellOkDirect(cell);
      return;
    }

    // Badge + not following + not whitelisted + not RT by followed + badge type filtered -> hide
    hideTweet(article, handle, cell);
    article.dataset.xbfProcessed = 'true';
  }

  // -- Process existing cells (for initial load and periodic rescan) --
  function processExistingCells() {
    const cells = document.querySelectorAll('[data-testid="cellInnerDiv"]:not([data-xbf-ok])');
    for (const cell of cells) {
      if (!cell.dataset.xbfTs) {
        cell.dataset.xbfTs = String(Date.now());
      }

      const article = cell.querySelector(SELECTORS.tweet)
        || cell.querySelector(SELECTORS.tweetFallback);

      if (!article) {
        markCellOkDirect(cell);
        continue;
      }

      processTweet(article);
    }
  }

  // -- Legacy processTweet (used by pending + rescan) --
  function processTweet(article) {
    if (!settings.enabled) return;

    const cell = article.closest(SELECTORS.cellInnerDiv);

    // Skip inner (quoted) tweets
    if (article.parentElement && article.parentElement.closest('article[data-testid="tweet"]')) {
      article.dataset.xbfProcessed = 'true';
      if (cell) markCellOkDirect(cell);
      return;
    }

    // React DOM reuse detection
    const currentKey = getTweetKey(article);
    const previousKey = article.dataset.xbfTweetKey || '';

    if (article.dataset.xbfProcessed === 'true') {
      if (currentKey === previousKey) return;
      resetArticle(article);
      if (cell) cell.removeAttribute('data-xbf-ok');
    }

    article.dataset.xbfTweetKey = currentKey;

    // Badge check
    const badge = article.querySelector(SELECTORS.verifiedBadge)
      || article.querySelector(SELECTORS.verifiedBadgeFallback);
    if (!badge) {
      article.dataset.xbfProcessed = 'true';
      if (cell) markCellOkDirect(cell);
      return;
    }

    badgeFoundCount++;

    const handle = extractHandle(article);
    if (!handle) {
      pendingTweets.add(article);
      return;
    }

    if (settings.whitelist.includes(handle)) {
      article.dataset.xbfProcessed = 'true';
      if (cell) markCellOkDirect(cell);
      return;
    }

    const userData = userCache.get(handle);
    let following = null;

    if (userData) {
      following = userData.following;
    } else {
      following = detectFollowFromDom(article, handle);
      if (following === null) {
        if (deferUnknown) {
          pendingTweets.add(article);
          return;
        }
        following = false;
      }
    }

    if (following) {
      followSkipCount++;
      article.dataset.xbfProcessed = 'true';
      if (cell) markCellOkDirect(cell);
      return;
    }

    // RT/Repost check
    if (checkRepostByFollowed(article)) {
      article.dataset.xbfProcessed = 'true';
      if (cell) markCellOkDirect(cell);
      return;
    }

    // Badge type filter check
    const badgeType = getBadgeType(userData);
    if (!shouldFilterBadgeType(badgeType)) {
      article.dataset.xbfProcessed = 'true';
      if (cell) markCellOkDirect(cell);
      return;
    }

    hideTweet(article, handle, cell);
    article.dataset.xbfProcessed = 'true';
  }

  function resetArticle(article) {
    article.dataset.xbfProcessed = '';
    article.dataset.xbfTweetKey = '';
    article.style.display = '';

    const cell = article.closest(SELECTORS.cellInnerDiv) || article.parentElement;
    if (cell && cell.dataset?.xbfHidden === 'true') {
      cell.classList.remove('xbf-hidden-cell');
      cell.style.display = cell.dataset.xbfOriginalDisplay || '';
      cell.dataset.xbfHidden = '';
      const placeholder = cell.querySelector('.xbf-placeholder');
      if (placeholder) placeholder.remove();
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ── Revalidate hidden tweets when new API data arrives ──
  // Safety net: restore tweets that were incorrectly hidden before API data was available
  function revalidateHiddenTweets() {
    document.querySelectorAll('[data-xbf-hidden="true"]').forEach(cell => {
      const handle = cell.dataset.xbfHandle;
      if (!handle) return;

      const userData = userCache.get(handle);
      if (!userData) return;

      if (userData.following) {
        const article = cell.querySelector(SELECTORS.tweet) || cell.querySelector(SELECTORS.tweetFallback);
        cell.classList.remove('xbf-hidden-cell');
        cell.style.display = cell.dataset.xbfOriginalDisplay || '';
        if (article) {
          article.style.display = '';
          article.dataset.xbfProcessed = 'true';
        }
        const placeholder = cell.querySelector('.xbf-placeholder');
        if (placeholder) placeholder.remove();
        cell.dataset.xbfHidden = 'false';
        if (hiddenCount > 0) hiddenCount--;
        updateFabCount();
      }
    });
  }

  //  Hide tweet - with container fallback
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function hideTweet(article, handle, preFoundCell) {
    let cell = preFoundCell || article.closest(SELECTORS.cellInnerDiv);

    // Fallback: walk up to find a reasonable container
    if (!cell) {
      cell = article.parentElement;
      let walk = 0;
      while (cell && walk < 5) {
        if (cell.getAttribute?.('data-testid')) break;
        if (cell.tagName === 'DIV' && cell.parentElement &&
            cell.parentElement.childElementCount > 1) break;
        cell = cell.parentElement;
        walk++;
      }
    }

    if (!cell || cell.dataset?.xbfHidden === 'true') {
      if (article.dataset.xbfHidden === 'true') return;
      article.dataset.xbfHidden = 'true';
      if (settings.showPlaceholder) {
        const placeholder = createPlaceholder(handle, article, article);
        article.style.display = 'none';
        article.parentElement?.insertBefore(placeholder, article);
      } else {
        article.style.display = 'none';
      }
      hiddenCount++;
      // Mark cell OK so pre-hide CSS doesn't interfere
      markCellOk(article);
      updateFabCount();
      return;
    }

    cell.dataset.xbfHidden = 'true';
    cell.dataset.xbfHandle = handle;
    cell.dataset.xbfOriginalDisplay = cell.style.display || '';

    if (settings.showPlaceholder) {
      const placeholder = createPlaceholder(handle, article, cell);
      article.style.display = 'none';
      cell.insertBefore(placeholder, article);
      // Cell is visible (showing placeholder), mark OK to lift pre-hide
      markCellOkDirect(cell);
    } else {
      // Complete hiding with !important CSS class
      cell.classList.add('xbf-hidden-cell');
      // Still mark OK so pre-hide CSS doesn't conflict
      markCellOkDirect(cell);
    }

    hiddenCount++;
    updateFabCount();
  }

  function createPlaceholder(handle, article, container) {
    const placeholder = document.createElement('div');
    placeholder.className = 'xbf-placeholder';

    const text = document.createElement('span');
    text.className = 'xbf-placeholder-text';
    text.textContent = `@${handle} ${t('hiddenPost')}`;

    const showBtn = document.createElement('button');
    showBtn.textContent = t('show');
    showBtn.addEventListener('click', () => {
      container.classList.remove('xbf-hidden-cell');
      container.style.display = container.dataset?.xbfOriginalDisplay || '';
      article.style.display = '';
      placeholder.remove();
      if (container.dataset) container.dataset.xbfHidden = 'false';
    });

    const wlBtn = document.createElement('button');
    wlBtn.textContent = t('alwaysShow');
    wlBtn.addEventListener('click', () => {
      Storage.addToWhitelist(handle);
      settings = Storage.get();
      container.classList.remove('xbf-hidden-cell');
      container.style.display = container.dataset?.xbfOriginalDisplay || '';
      article.style.display = '';
      placeholder.remove();
      if (container.dataset) container.dataset.xbfHidden = 'false';
    });

    placeholder.appendChild(text);
    placeholder.appendChild(showBtn);
    placeholder.appendChild(wlBtn);
    return placeholder;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Whitelist Export/Import
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function exportWhitelist() {
    const data = JSON.stringify(settings.whitelist, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'xbf-whitelist.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importWhitelist(renderCallback) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          if (!Array.isArray(imported)) {
            log('Import failed: not an array');
            return;
          }
          // Merge: add new handles that don't already exist
          for (const h of imported) {
            if (typeof h === 'string') {
              const normalized = h.replace(/^@/, '').toLowerCase();
              if (!settings.whitelist.includes(normalized)) {
                settings.whitelist.push(normalized);
              }
            }
          }
          Storage.set(settings);
          if (renderCallback) renderCallback();
          resetAndReprocess();
          log('Imported ' + imported.length + ' whitelist entries');
        } catch (e) {
          log('Import parse error:', e);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Floating Settings UI
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  let fab = null;
  let fabCount = null;
  let panel = null;

  function setupUI() {
    if (document.querySelector('.xbf-fab')) return;

    fab = document.createElement('button');
    fab.className = 'xbf-fab';
    fab.title = 'X Badge Filter';
    const fabLabel = document.createElement('span');
    fabLabel.style.fontSize = '16px';
    fabLabel.textContent = 'XBF';
    fab.appendChild(fabLabel);
    fabCount = document.createElement('span');
    fabCount.className = 'xbf-fab-count';
    fabCount.textContent = '0';
    fabCount.style.display = 'none';
    fab.appendChild(fabCount);
    fab.addEventListener('click', togglePanel);
    document.body.appendChild(fab);

    panel = document.createElement('div');
    panel.className = 'xbf-settings-panel';

    const title = document.createElement('h3');
    title.textContent = 'X Badge Filter v2.6.0';
    panel.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'xbf-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', togglePanel);
    panel.appendChild(closeBtn);

    // -- Filter ON/OFF toggle --
    panel.appendChild(createToggle('enabled', t('filterOn'), settings.enabled, (v) => {
      settings.enabled = v;
      Storage.set(settings);
      if (v) {
        injectPreHideCSS();
        setupObserver();
        processExistingCells();
      } else {
        removePreHideCSS();
        showAllHidden();
        document.querySelectorAll('[data-testid="cellInnerDiv"]:not([data-xbf-ok])').forEach(c => {
          markCellOkDirect(c);
        });
        if (observer) observer.disconnect();
      }
    }));

    // -- Display section --
    const dispSection = document.createElement('div');
    dispSection.className = 'xbf-section';
    dispSection.appendChild(createToggle('showPlaceholder', t('showPlaceholder'), settings.showPlaceholder, (v) => {
      settings.showPlaceholder = v;
      Storage.set(settings);
    }));
    panel.appendChild(dispSection);

    // -- Badge type filter section --
    const badgeSection = document.createElement('div');
    badgeSection.className = 'xbf-section';

    badgeSection.appendChild(createToggle('filterBlue', t('filterBlue'), settings.filterBlue, (v) => {
      settings.filterBlue = v;
      Storage.set(settings);
      resetAndReprocess();
    }));
    badgeSection.appendChild(createToggle('filterGold', t('filterGold'), settings.filterGold, (v) => {
      settings.filterGold = v;
      Storage.set(settings);
      resetAndReprocess();
    }));
    badgeSection.appendChild(createToggle('filterGrey', t('filterGrey'), settings.filterGrey, (v) => {
      settings.filterGrey = v;
      Storage.set(settings);
      resetAndReprocess();
    }));
    panel.appendChild(badgeSection);

    // -- Whitelist section --
    const wlSection = document.createElement('div');
    wlSection.className = 'xbf-section';
    const wlTitle = document.createElement('div');
    wlTitle.textContent = t('whitelist');
    wlTitle.style.cssText = 'font-size:12px;color:#8b98a5;margin-bottom:6px;';
    wlSection.appendChild(wlTitle);

    const wlRow = document.createElement('div');
    wlRow.className = 'xbf-wl-row';
    const wlInput = document.createElement('input');
    wlInput.type = 'text';
    wlInput.placeholder = '@handle';
    wlInput.spellcheck = false;
    const wlAddBtn = document.createElement('button');
    wlAddBtn.textContent = t('add');

    const wlList = document.createElement('div');
    wlList.style.cssText = 'max-height:100px;overflow-y:auto;margin-top:6px;';

    function renderWhitelist() {
      wlList.replaceChildren();
      for (const h of settings.whitelist) {
        const item = document.createElement('div');
        item.className = 'xbf-wl-item';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `@${h}`;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'xbf-wl-remove';
        removeBtn.textContent = '\u00d7';
        removeBtn.addEventListener('click', () => {
          settings.whitelist = settings.whitelist.filter(x => x !== h);
          Storage.set(settings);
          renderWhitelist();
          resetAndReprocess();
        });
        item.appendChild(nameSpan);
        item.appendChild(removeBtn);
        wlList.appendChild(item);
      }
    }

    function addWhitelist() {
      const raw = wlInput.value.trim();
      if (!raw) return;
      Storage.addToWhitelist(raw);
      settings = Storage.get();
      wlInput.value = '';
      renderWhitelist();
      resetAndReprocess();
    }

    wlAddBtn.addEventListener('click', addWhitelist);
    wlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addWhitelist(); });
    wlRow.appendChild(wlInput);
    wlRow.appendChild(wlAddBtn);
    wlSection.appendChild(wlRow);
    wlSection.appendChild(wlList);

    // -- Export/Import buttons --
    const ieRow = document.createElement('div');
    ieRow.className = 'xbf-ie-row';
    const exportBtn = document.createElement('button');
    exportBtn.textContent = t('exportBtn');
    exportBtn.addEventListener('click', exportWhitelist);
    const importBtn = document.createElement('button');
    importBtn.textContent = t('importBtn');
    importBtn.addEventListener('click', () => importWhitelist(renderWhitelist));
    ieRow.appendChild(exportBtn);
    ieRow.appendChild(importBtn);
    wlSection.appendChild(ieRow);

    panel.appendChild(wlSection);

    // Debug info
    const debugSection = document.createElement('div');
    debugSection.className = 'xbf-section';
    const debugInfo = document.createElement('div');
    debugInfo.style.cssText = 'font-size:10px;color:#536471;font-family:monospace;line-height:1.6;white-space:pre;';
    debugInfo.id = 'xbf-debug-info';
    debugSection.appendChild(debugInfo);
    panel.appendChild(debugSection);

    setInterval(() => {
      const el = document.getElementById('xbf-debug-info');
      if (el) {
        el.textContent =
          `API:${apiAvailable ? 'YES' : 'NO'} Cache:${userCache.size}\n` +
          `Hidden:${hiddenCount} Badges:${badgeFoundCount}\n` +
          `FollowSkip:${followSkipCount} Pend:${pendingTweets.size}`;
      }
    }, 2000);

    renderWhitelist();
    document.body.appendChild(panel);
  }

  function injectPreHideCSS() {
    if (document.getElementById('xbf-prehide')) return;
    const s = document.createElement('style');
    s.id = 'xbf-prehide';
    s.textContent =
      '[data-testid="cellInnerDiv"]:not([data-xbf-ok]) { visibility: hidden !important; }';
    (document.head || document.documentElement).appendChild(s);
  }

  function createToggle(id, label, checked, onChange) {
    const lbl = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.addEventListener('change', () => onChange(cb.checked));
    const txt = document.createTextNode(` ${label}`);
    lbl.appendChild(cb);
    lbl.appendChild(txt);
    return lbl;
  }

  function togglePanel() {
    if (panel) panel.classList.toggle('open');
    if (fab) fab.style.display = panel.classList.contains('open') ? 'none' : '';
  }

  function updateFabCount() {
    if (fabCount) {
      fabCount.textContent = String(hiddenCount);
      fabCount.style.display = hiddenCount > 0 ? '' : 'none';
    }
  }

  function showAllHidden() {
    document.querySelectorAll('[data-xbf-hidden="true"]').forEach(el => {
      el.classList.remove('xbf-hidden-cell');
      el.style.display = el.dataset.xbfOriginalDisplay || '';
      const article = el.querySelector(SELECTORS.tweet) || el.querySelector(SELECTORS.tweetFallback);
      if (article) { article.style.display = ''; article.dataset.xbfProcessed = ''; }
      const placeholder = el.querySelector('.xbf-placeholder');
      if (placeholder) placeholder.remove();
      el.dataset.xbfHidden = '';
    });
    hiddenCount = 0;
    updateFabCount();
  }

  function resetAndReprocess() {
    // Save current hiddenCount context - showAllHidden resets to 0
    showAllHidden();
    document.querySelectorAll('[data-xbf-ok]').forEach(el => {
      el.removeAttribute('data-xbf-ok');
    });
    document.querySelectorAll('[data-xbf-processed]').forEach(el => {
      el.dataset.xbfProcessed = '';
      el.dataset.xbfTweetKey = '';
    });
    pendingTweets.clear();
    badgeFoundCount = 0;
    followSkipCount = 0;
    // hiddenCount is already 0 from showAllHidden, will re-accumulate from processExistingCells
    processExistingCells();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Start
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  setupFetchIntercept();
  initFilter();

})();
