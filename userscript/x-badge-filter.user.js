// ==UserScript==
// @name         X Badge Filter
// @namespace    https://ultrathink.jp
// @version      2.3.0
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
  };

  const STORAGE_KEY = 'xbf_settings';
  const USER_CACHE_MAX = 5000;
  const LOG_PREFIX = '[XBF]';

  const DEFAULT_SETTINGS = {
    enabled: true,
    showPlaceholder: true,
    whitelist: [],
  };

  let debugLogCount = 0;
  const DEBUG_LOG_LIMIT = 30;

  function log(...args) {
    if (debugLogCount < DEBUG_LOG_LIMIT) {
      debugLogCount++;
      console.log(LOG_PREFIX, ...args);
    }
  }

  function logAlways(...args) {
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
    const style = document.createElement('style');
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
      .xbf-fab {
        position: fixed; bottom: 80px; right: 20px; z-index: 99998;
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
    document.head.appendChild(style);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  API Interceptor - fetch monkey-patch
  //  Note: May not work on Firefox Android due to Tampermonkey
  //  sandbox issues. DOM-based filtering is the primary approach.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const userCache = new Map();
  let apiAvailable = false;

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
                  if (users.length > 0) {
                    log('API:', users.length, 'users');
                    receiveApiUsers(users);
                  }
                }).catch(() => {});
              } catch (e) {}
              return response;
            }).catch(() => {});
          }
        } catch (e) {}
        return result;
      };
      log('fetch interceptor installed');
    } catch (e) {
      log('fetch intercept failed:', e);
    }
  }

  function receiveApiUsers(users) {
    apiAvailable = true;
    for (const user of users) {
      if (typeof user.handle !== 'string' || !user.handle) continue;
      userCache.set(user.handle, {
        following: user.following === true,
        name: typeof user.name === 'string' ? user.name : '',
      });
    }
    if (userCache.size > USER_CACHE_MAX) {
      const excess = userCache.size - USER_CACHE_MAX;
      const iter = userCache.keys();
      for (let i = 0; i < excess; i++) userCache.delete(iter.next().value);
    }
    processPendingTweets();
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
  //  Handle extraction - multiple strategies
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function extractHandle(article) {
    let handle = null;
    let method = '';

    // Strategy 1: data-testid="User-Name" (desktop primary)
    handle = extractHandleFromUserName(article, SELECTORS.userName);
    if (handle) { method = 'User-Name'; }

    // Strategy 2: data-testid="User-Names" (possible alternate)
    if (!handle) {
      handle = extractHandleFromUserName(article, SELECTORS.userNameAlt);
      if (handle) { method = 'User-Names'; }
    }

    // Strategy 3: Find profile links in article (any a[href="/username"])
    if (!handle) {
      handle = extractHandleFromLinks(article);
      if (handle) { method = 'links'; }
    }

    // Strategy 4: Find @username text in spans
    if (!handle) {
      handle = extractHandleFromText(article);
      if (handle) { method = 'text'; }
    }

    if (handle && badgeFoundCount <= 5) {
      log('Handle: @' + handle + ' via ' + method);
    }

    return handle;
  }

  function extractHandleFromUserName(article, selector) {
    const area = article.querySelector(selector);
    if (!area) return null;

    // Try a[role="link"] first
    const roleLinks = area.querySelectorAll('a[role="link"]');
    for (const link of roleLinks) {
      const h = handleFromHref(link);
      if (h) return h;
    }

    // Fallback: any <a> with href
    const allLinks = area.querySelectorAll('a[href]');
    for (const link of allLinks) {
      const h = handleFromHref(link);
      if (h) return h;
    }

    return null;
  }

  function extractHandleFromLinks(article) {
    // Look for profile links: the first /username link in the tweet
    // Exclude known non-profile paths
    const excludePaths = ['/status/', '/hashtag/', '/search', '/i/', '/compose', '/settings', '/home', '/explore', '/notifications', '/messages'];
    const links = article.querySelectorAll('a[href^="/"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href || href === '/') continue;
      if (excludePaths.some(p => href.includes(p))) continue;

      // Match /username pattern (1-15 chars, alphanumeric + underscore)
      const match = href.match(/^\/([A-Za-z0-9_]{1,15})$/);
      if (match) {
        return match[1].toLowerCase();
      }
    }
    return null;
  }

  function extractHandleFromText(article) {
    // Find @handle text patterns in the first few spans
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
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Content Filter
  //  Logic: badge present + not following + not whitelisted → hide
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  let settings = DEFAULT_SETTINGS;
  let pendingTweets = new Set();
  let hiddenCount = 0;
  let observer = null;
  let processingScheduled = false;
  let pendingNodes = [];
  let processedCount = 0;
  let badgeFoundCount = 0;
  let handleFailCount = 0;
  let hideFailCount = 0;

  function initFilter() {
    settings = Storage.get();
    log('Settings:', JSON.stringify(settings));
    log('UA:', navigator.userAgent);

    if (!settings.enabled) {
      log('Filter disabled');
      return;
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onDomReady);
    } else {
      onDomReady();
    }
  }

  function onDomReady() {
    log('DOM ready');
    injectStyles();
    setupUI();
    setupObserver();
    processExistingTweets();

    // 5s: force process pending tweets without API
    setTimeout(() => {
      logAlways('5s: API=' + apiAvailable + ' cache=' + userCache.size +
          ' hidden=' + hiddenCount + ' badges=' + badgeFoundCount +
          ' pending=' + pendingTweets.size + ' handleFail=' + handleFailCount +
          ' hideFail=' + hideFailCount);

      if (pendingTweets.size > 0) {
        logAlways('Forcing ' + pendingTweets.size + ' pending tweets');
        const tweets = new Set(pendingTweets);
        pendingTweets.clear();
        for (const article of tweets) {
          if (document.contains(article)) {
            article.dataset.xbfProcessed = '';
            processTweet(article);
          }
        }
      }
      processExistingTweets();
    }, 5000);

    // 12s: second pass
    setTimeout(() => {
      logAlways('12s: hidden=' + hiddenCount + ' badges=' + badgeFoundCount +
          ' pending=' + pendingTweets.size + ' handleFail=' + handleFailCount);
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
      processExistingTweets();
    }, 12000);
  }

  function processPendingTweets() {
    if (pendingTweets.size === 0) return;
    const tweets = new Set(pendingTweets);
    pendingTweets.clear();
    for (const article of tweets) {
      if (document.contains(article)) processTweet(article);
    }
  }

  function setupObserver() {
    if (observer) observer.disconnect();
    const target = document.querySelector(SELECTORS.timeline)
      || document.querySelector(SELECTORS.timelineFallback)
      || document.body;

    log('Observer:', target.tagName);

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) pendingNodes.push(node);
        }
      }
      if (pendingNodes.length > 500) pendingNodes = pendingNodes.slice(-200);
      scheduleProcessing();
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function scheduleProcessing() {
    if (processingScheduled) return;
    processingScheduled = true;
    requestAnimationFrame(() => {
      const nodes = pendingNodes.splice(0);
      for (const node of nodes) {
        // Try primary selector
        let tweets = node.matches?.(SELECTORS.tweet)
          ? [node]
          : Array.from(node.querySelectorAll?.(SELECTORS.tweet) || []);
        // Try fallback selector if nothing found
        if (tweets.length === 0 && node.querySelectorAll) {
          tweets = Array.from(node.querySelectorAll(SELECTORS.tweetFallback) || []);
        }
        for (const tweet of tweets) processTweet(tweet);
      }
      processingScheduled = false;
    });
  }

  function processExistingTweets() {
    let tweets = document.querySelectorAll(SELECTORS.tweet);
    if (tweets.length === 0) {
      tweets = document.querySelectorAll(SELECTORS.tweetFallback);
      if (tweets.length > 0) log('Using fallback tweet selector, found:', tweets.length);
    }
    tweets.forEach(processTweet);
  }

  function processTweet(article) {
    if (!settings.enabled) return;
    if (article.dataset.xbfProcessed === 'true') return;

    processedCount++;

    // Check for verified badge
    const badge = article.querySelector(SELECTORS.verifiedBadge)
      || article.querySelector(SELECTORS.verifiedBadgeFallback);
    if (!badge) {
      article.dataset.xbfProcessed = 'true';
      return;
    }

    badgeFoundCount++;

    // Extract handle (with multiple fallback strategies)
    const handle = extractHandle(article);
    if (!handle) {
      handleFailCount++;
      if (handleFailCount <= 3) {
        // Log diagnostic info for first few failures
        const hasUN = !!article.querySelector(SELECTORS.userName);
        const hasUNs = !!article.querySelector(SELECTORS.userNameAlt);
        const linkCount = article.querySelectorAll('a[href^="/"]').length;
        const atSpans = Array.from(article.querySelectorAll('span'))
          .filter(s => (s.textContent || '').startsWith('@')).length;
        logAlways('HANDLE FAIL #' + handleFailCount +
          ': User-Name=' + hasUN + ' User-Names=' + hasUNs +
          ' links=' + linkCount + ' @spans=' + atSpans);
        // Log first few href values for debugging
        const hrefs = Array.from(article.querySelectorAll('a[href^="/"]'))
          .slice(0, 5)
          .map(a => a.getAttribute('href'));
        logAlways('  hrefs:', hrefs.join(', '));
      }
      pendingTweets.add(article);
      return;
    }

    // Check whitelist
    if (settings.whitelist.includes(handle)) {
      article.dataset.xbfProcessed = 'true';
      return;
    }

    // Check follow status
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
        // No API, no DOM clue → badge present, assume not following → hide
        following = false;
      }
    }

    if (following) {
      article.dataset.xbfProcessed = 'true';
      return;
    }

    // Badge + not following + not whitelisted → hide
    const success = hideTweet(article, handle);
    if (!success) {
      hideFailCount++;
      if (hideFailCount <= 3) {
        logAlways('HIDE FAIL for @' + handle + ': no container found');
      }
    }
    article.dataset.xbfProcessed = 'true';
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Hide tweet - with container fallback
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function hideTweet(article, handle) {
    // Find the container cell
    let cell = article.closest(SELECTORS.cellInnerDiv);

    // Fallback: walk up to find a reasonable container
    if (!cell) {
      cell = article.parentElement;
      // Walk up to find a div that's a direct timeline item
      // (usually 2-3 levels above the article)
      let walk = 0;
      while (cell && walk < 5) {
        if (cell.style && cell.style.display !== undefined) break;
        // If we find something that looks like a list item container, use it
        if (cell.getAttribute && (
          cell.getAttribute('data-testid') ||
          cell.tagName === 'DIV' && cell.parentElement &&
          cell.parentElement.childElementCount > 1
        )) break;
        cell = cell.parentElement;
        walk++;
      }
    }

    if (!cell || cell.dataset?.xbfHidden === 'true') {
      // Last resort: hide the article itself
      if (article.dataset.xbfHidden === 'true') return false;
      article.dataset.xbfHidden = 'true';

      if (settings.showPlaceholder) {
        const placeholder = createPlaceholder(handle, article, article);
        article.style.display = 'none';
        article.parentElement?.insertBefore(placeholder, article);
      } else {
        article.style.display = 'none';
      }
      hiddenCount++;
      updateFabCount();
      return true;
    }

    cell.dataset.xbfHidden = 'true';
    cell.dataset.xbfHandle = handle;
    cell.dataset.xbfOriginalDisplay = cell.style.display || '';

    if (settings.showPlaceholder) {
      const placeholder = createPlaceholder(handle, article, cell);
      article.style.display = 'none';
      cell.insertBefore(placeholder, article);
    } else {
      cell.style.display = 'none';
    }

    hiddenCount++;
    updateFabCount();
    return true;
  }

  function createPlaceholder(handle, article, container) {
    const placeholder = document.createElement('div');
    placeholder.className = 'xbf-placeholder';

    const text = document.createElement('span');
    text.className = 'xbf-placeholder-text';
    text.textContent = `@${handle} の投稿を非表示にしました`;

    const showBtn = document.createElement('button');
    showBtn.textContent = '表示';
    showBtn.addEventListener('click', () => {
      container.style.display = container.dataset?.xbfOriginalDisplay || '';
      article.style.display = '';
      placeholder.remove();
      if (container.dataset) container.dataset.xbfHidden = 'false';
    });

    const wlBtn = document.createElement('button');
    wlBtn.textContent = '常に表示';
    wlBtn.addEventListener('click', () => {
      Storage.addToWhitelist(handle);
      settings = Storage.get();
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
  //  Floating Settings UI
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  let fab = null;
  let fabCount = null;
  let panel = null;

  function setupUI() {
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
    title.textContent = 'X Badge Filter v2.3';
    panel.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'xbf-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', togglePanel);
    panel.appendChild(closeBtn);

    panel.appendChild(createToggle('enabled', 'フィルター ON/OFF', settings.enabled, (v) => {
      settings.enabled = v;
      Storage.set(settings);
      if (v) { setupObserver(); processExistingTweets(); }
      else { showAllHidden(); if (observer) observer.disconnect(); }
    }));

    const dispSection = document.createElement('div');
    dispSection.className = 'xbf-section';
    dispSection.appendChild(createToggle('showPlaceholder', '非表示バーを表示', settings.showPlaceholder, (v) => { settings.showPlaceholder = v; Storage.set(settings); }));
    panel.appendChild(dispSection);

    const wlSection = document.createElement('div');
    wlSection.className = 'xbf-section';
    const wlTitle = document.createElement('div');
    wlTitle.textContent = 'ホワイトリスト';
    wlTitle.style.cssText = 'font-size:12px;color:#8b98a5;margin-bottom:6px;';
    wlSection.appendChild(wlTitle);

    const wlRow = document.createElement('div');
    wlRow.className = 'xbf-wl-row';
    const wlInput = document.createElement('input');
    wlInput.type = 'text';
    wlInput.placeholder = '@handle';
    wlInput.spellcheck = false;
    const wlAddBtn = document.createElement('button');
    wlAddBtn.textContent = '追加';

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
    panel.appendChild(wlSection);

    // Debug info
    const debugSection = document.createElement('div');
    debugSection.className = 'xbf-section';
    const debugInfo = document.createElement('div');
    debugInfo.style.cssText = 'font-size:10px;color:#536471;font-family:monospace;line-height:1.6;';
    debugInfo.id = 'xbf-debug-info';
    debugSection.appendChild(debugInfo);
    panel.appendChild(debugSection);

    setInterval(() => {
      const el = document.getElementById('xbf-debug-info');
      if (el) {
        el.textContent =
          `API:${apiAvailable ? 'YES' : 'NO'} Cache:${userCache.size}\n` +
          `Hidden:${hiddenCount} Badges:${badgeFoundCount}\n` +
          `Pending:${pendingTweets.size} HandleFail:${handleFailCount}\n` +
          `HideFail:${hideFailCount}`;
      }
    }, 2000);

    renderWhitelist();
    document.body.appendChild(panel);
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
    showAllHidden();
    document.querySelectorAll('[data-xbf-processed]').forEach(el => { el.dataset.xbfProcessed = ''; });
    pendingTweets.clear();
    processedCount = 0;
    badgeFoundCount = 0;
    handleFailCount = 0;
    hideFailCount = 0;
    processExistingTweets();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Start
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  log('v2.3.0 starting');

  setupFetchIntercept();
  initFilter();

})();
