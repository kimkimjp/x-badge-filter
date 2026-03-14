// ==UserScript==
// @name         X Badge Filter
// @namespace    https://ultrathink.jp
// @version      2.0.0
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
  };

  const STORAGE_KEY = 'xbf_settings';
  const USER_CACHE_MAX = 5000;
  const MSG_TYPE = 'xbf-api-data';

  const DEFAULT_SETTINGS = {
    enabled: true,
    showPlaceholder: true,
    whitelist: [],
  };

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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
        width: 40px; height: 40px; border-radius: 50%;
        background: #1d9bf0; color: #fff; border: none;
        font-size: 18px; cursor: pointer; display: flex;
        align-items: center; justify-content: center;
        box-shadow: 0 2px 12px rgba(0,0,0,0.3);
        transition: opacity 0.2s;
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
  //  API Interceptor - Dual approach for maximum compatibility
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const userCache = new Map();
  let apiAvailable = false;

  // Approach 1: Direct fetch patch
  function setupDirectFetchPatch() {
    try {
      const originalFetch = window.fetch;
      window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
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
            const clone = response.clone();
            clone.json().then(data => {
              const users = extractUsersFromApi(data);
              if (users.length > 0) receiveApiUsers(users);
            }).catch(() => {});
          }
        } catch (e) {}
        return response;
      };
    } catch (e) {}
  }

  // Approach 2: Inject <script> tag into page context
  function injectPageInterceptor() {
    const script = document.createElement('script');
    script.textContent = `(function() {
      var MSG_TYPE = '${MSG_TYPE}';
      var origFetch = window.fetch;
      window.fetch = function() {
        var args = arguments;
        return origFetch.apply(this, args).then(function(response) {
          try {
            var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
            if (url.indexOf('/graphql/') !== -1 && (
              url.indexOf('HomeTimeline') !== -1 ||
              url.indexOf('HomeLatestTimeline') !== -1 ||
              url.indexOf('SearchTimeline') !== -1 ||
              url.indexOf('UserTweets') !== -1 ||
              url.indexOf('TweetDetail') !== -1 ||
              url.indexOf('ListLatestTweetsTimeline') !== -1
            )) {
              var clone = response.clone();
              clone.json().then(function(data) {
                var results = [];
                var seen = {};
                var stack = [data];
                while (stack.length > 0) {
                  var obj = stack.pop();
                  if (!obj || typeof obj !== 'object') continue;
                  if (obj.legacy && obj.rest_id) {
                    var handle = (obj.legacy.screen_name || '').toLowerCase();
                    if (handle && !seen[handle]) {
                      seen[handle] = true;
                      results.push({
                        handle: handle,
                        name: obj.legacy.name || '',
                        following: obj.legacy.following === true
                      });
                    }
                  }
                  if (Array.isArray(obj)) {
                    for (var i = obj.length - 1; i >= 0; i--) {
                      if (obj[i] && typeof obj[i] === 'object') stack.push(obj[i]);
                    }
                  } else {
                    var keys = Object.keys(obj);
                    for (var j = keys.length - 1; j >= 0; j--) {
                      var val = obj[keys[j]];
                      if (val && typeof val === 'object') stack.push(val);
                    }
                  }
                }
                if (results.length > 0) {
                  window.postMessage({ type: MSG_TYPE, users: results }, '*');
                }
              }).catch(function() {});
            }
          } catch(e) {}
          return response;
        });
      };
    })();`;
    const target = document.documentElement || document.head || document.body;
    if (target) {
      target.appendChild(script);
      script.remove();
    }
  }

  // Listen for postMessage from injected script
  function setupPostMessageListener() {
    window.addEventListener('message', (e) => {
      if (e.source !== window) return;
      if (!e.data || e.data.type !== MSG_TYPE) return;
      if (!Array.isArray(e.data.users)) return;
      receiveApiUsers(e.data.users);
    });
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
  //  DOM-based follow detection (fallback)
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

  function initFilter() {
    settings = Storage.get();
    if (!settings.enabled) return;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        injectStyles();
        setupUI();
        setupObserver();
        processExistingTweets();
      });
    } else {
      injectStyles();
      setupUI();
      setupObserver();
      processExistingTweets();
    }

    // Timeout: if API hasn't responded, use DOM fallback
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
      if (!apiAvailable) {
        processExistingTweets();
      }
    }, 5000);
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
        const tweets = node.matches?.(SELECTORS.tweet)
          ? [node]
          : Array.from(node.querySelectorAll?.(SELECTORS.tweet) || []);
        for (const tweet of tweets) processTweet(tweet);
      }
      processingScheduled = false;
    });
  }

  function processExistingTweets() {
    document.querySelectorAll(SELECTORS.tweet).forEach(processTweet);
  }

  function processTweet(article) {
    if (!settings.enabled) return;
    if (article.dataset.xbfProcessed === 'true') return;

    // Check for verified badge
    const badge = article.querySelector(SELECTORS.verifiedBadge)
      || article.querySelector(SELECTORS.verifiedBadgeFallback);
    if (!badge) {
      article.dataset.xbfProcessed = 'true';
      return;
    }

    // Extract handle
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
        following = false;
      }
    }

    if (following) {
      article.dataset.xbfProcessed = 'true';
      return;
    }

    // Badge present + not following + not whitelisted → hide
    hideTweet(article, handle);
    article.dataset.xbfProcessed = 'true';
  }

  function extractHandle(article) {
    const userNameArea = article.querySelector(SELECTORS.userName);
    if (!userNameArea) return null;
    const links = userNameArea.querySelectorAll('a[role="link"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/') && !href.includes('/status/')) {
        const handle = href.slice(1).toLowerCase();
        if (handle && !handle.includes('/')) return handle;
      }
    }
    return null;
  }

  function hideTweet(article, handle) {
    const cell = article.closest(SELECTORS.cellInnerDiv);
    if (!cell || cell.dataset.xbfHidden === 'true') return;

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
      showBtn.textContent = '表示';
      showBtn.addEventListener('click', () => {
        cell.style.display = cell.dataset.xbfOriginalDisplay;
        article.style.display = '';
        placeholder.remove();
        cell.dataset.xbfHidden = 'false';
      });

      const wlBtn = document.createElement('button');
      wlBtn.textContent = '常に表示';
      wlBtn.addEventListener('click', () => {
        Storage.addToWhitelist(handle);
        settings = Storage.get();
        cell.style.display = cell.dataset.xbfOriginalDisplay;
        article.style.display = '';
        placeholder.remove();
        cell.dataset.xbfHidden = 'false';
      });

      placeholder.appendChild(text);
      placeholder.appendChild(showBtn);
      placeholder.appendChild(wlBtn);
      article.style.display = 'none';
      cell.insertBefore(placeholder, article);
    } else {
      cell.style.display = 'none';
    }

    hiddenCount++;
    updateFabCount();
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
    title.textContent = 'X Badge Filter';
    panel.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'xbf-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', togglePanel);
    panel.appendChild(closeBtn);

    // Enabled toggle
    panel.appendChild(createToggle('enabled', 'フィルター ON/OFF', settings.enabled, (v) => {
      settings.enabled = v;
      Storage.set(settings);
      if (v) { setupObserver(); processExistingTweets(); }
      else { showAllHidden(); if (observer) observer.disconnect(); }
    }));

    // Placeholder toggle
    const dispSection = document.createElement('div');
    dispSection.className = 'xbf-section';
    dispSection.appendChild(createToggle('showPlaceholder', '非表示バーを表示', settings.showPlaceholder, (v) => { settings.showPlaceholder = v; Storage.set(settings); }));
    panel.appendChild(dispSection);

    // Whitelist section
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
    document.querySelectorAll('[data-xbf-hidden="true"]').forEach(cell => {
      cell.style.display = cell.dataset.xbfOriginalDisplay || '';
      const article = cell.querySelector(SELECTORS.tweet);
      if (article) { article.style.display = ''; article.dataset.xbfProcessed = ''; }
      const placeholder = cell.querySelector('.xbf-placeholder');
      if (placeholder) placeholder.remove();
      cell.dataset.xbfHidden = '';
    });
    hiddenCount = 0;
    updateFabCount();
  }

  function resetAndReprocess() {
    showAllHidden();
    document.querySelectorAll('[data-xbf-processed]').forEach(el => { el.dataset.xbfProcessed = ''; });
    pendingTweets.clear();
    processExistingTweets();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Start
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  setupDirectFetchPatch();
  injectPageInterceptor();
  setupPostMessageListener();
  initFilter();

})();
