// ==UserScript==
// @name         X Badge Filter
// @namespace    https://ultrathink.jp
// @version      1.0.0
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
  //  Constants (from shared/constants.js)
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
    socialContext: '[data-testid="socialContext"]',
  };

  const BADGE_COLORS = {
    blue: { r: [0, 100], g: [130, 220], b: [200, 255] },
    gold: { r: [180, 255], g: [150, 200], b: [0, 50] },
    grey: { r: [100, 170], g: [100, 170], b: [100, 170] },
  };

  const STORAGE_KEY = 'xbf_settings';
  const USER_CACHE_MAX = 5000;

  const DEFAULT_SETTINGS = {
    enabled: true,
    filterBlue: true,
    filterGold: false,
    filterGrey: false,
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
        padding: 16px; width: 280px; font-family: system-ui, sans-serif;
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
        position: fixed; bottom: 20px; right: 20px; z-index: 99998;
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
  //  API Interceptor (same context, no postMessage needed)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const userCache = new Map();
  let onApiDataCallbacks = [];

  function setupApiInterceptor() {
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
            const users = extractUsers(data);
            if (users.length > 0) {
              processApiUsers(users);
            }
          }).catch(() => {});
        }
      } catch (e) {}
      return response;
    };
  }

  function extractUsers(rootObj) {
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

  function processApiUsers(users) {
    for (const user of users) {
      let badgeType = null;
      if (user.isBlueVerified) {
        if (user.verifiedType === 'Business') badgeType = 'gold';
        else if (user.verifiedType === 'Government') badgeType = 'grey';
        else badgeType = 'blue';
      }
      userCache.set(user.handle, {
        following: user.following,
        badgeType,
        name: user.name,
      });
    }
    // Enforce cache size limit
    if (userCache.size > USER_CACHE_MAX) {
      const excess = userCache.size - USER_CACHE_MAX;
      const iter = userCache.keys();
      for (let i = 0; i < excess; i++) userCache.delete(iter.next().value);
    }
    // Notify content filter
    for (const cb of onApiDataCallbacks) cb();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  DOM-based follow detection (fallback for mobile)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function detectFollowFromDom(article) {
    // Check for "Follow" button (non-followed accounts have this)
    const btns = article.querySelectorAll('[role="button"]');
    for (const btn of btns) {
      const text = btn.textContent.trim();
      // English and Japanese follow button texts
      if (text === 'Follow' || text === 'フォロー') {
        return false; // Has follow button = not following
      }
      if (text === 'Following' || text === 'フォロー中') {
        return true;
      }
    }
    // Check social context - "liked" / "retweeted by" someone you follow
    const context = article.querySelector(SELECTORS.socialContext);
    if (context) {
      // If there's social context, tweet may be from non-followed but shown via engagement
      return null; // Can't determine
    }
    return null; // Unknown
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Content Filter
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  let settings = DEFAULT_SETTINGS;
  let pendingTweets = new Set();
  let hiddenCount = 0;
  let observer = null;
  let processingScheduled = false;
  let pendingNodes = [];
  let apiAvailable = false;

  function initFilter() {
    settings = Storage.get();
    if (!settings.enabled) return;

    // Register for API data updates
    onApiDataCallbacks.push(() => {
      apiAvailable = true;
      processPendingTweets();
    });

    // Wait for DOM to be ready
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

    // Check if API interception is working after a delay
    setTimeout(() => {
      if (!apiAvailable) {
        // API intercept may not work (iOS Safari etc.), proceed with DOM-only mode
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

    const badge = article.querySelector(SELECTORS.verifiedBadge)
      || article.querySelector(SELECTORS.verifiedBadgeFallback);
    if (!badge) {
      article.dataset.xbfProcessed = 'true';
      return;
    }

    const handle = extractHandle(article);
    if (!handle) {
      pendingTweets.add(article);
      return;
    }

    if (settings.whitelist.includes(handle)) {
      article.dataset.xbfProcessed = 'true';
      return;
    }

    // Try API cache first, then DOM fallback
    const userData = userCache.get(handle);
    let following = null;
    let badgeType = null;

    if (userData) {
      following = userData.following;
      badgeType = userData.badgeType;
    } else {
      // DOM-based fallback (for mobile / when API intercept unavailable)
      following = detectFollowFromDom(article);
      badgeType = detectBadgeTypeFromDom(badge);

      if (following === null && apiAvailable) {
        // API is available but data not yet cached for this user
        pendingTweets.add(article);
        return;
      }
      if (following === null) {
        // No API, no DOM indication - assume non-followed if badge present
        // (conservative: may over-filter, but user can whitelist)
        following = false;
      }
    }

    if (following) {
      article.dataset.xbfProcessed = 'true';
      return;
    }

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

  function detectBadgeTypeFromDom(badgeEl) {
    try {
      const svg = badgeEl.closest('svg') || badgeEl;
      const paths = svg.querySelectorAll('path, circle');
      for (const p of paths) {
        const fill = p.getAttribute('fill');
        if (!fill) continue;
        const color = parseColor(fill);
        if (!color) continue;
        if (matchesColorRange(color, BADGE_COLORS.blue)) return 'blue';
        if (matchesColorRange(color, BADGE_COLORS.gold)) return 'gold';
        if (matchesColorRange(color, BADGE_COLORS.grey)) return 'grey';
      }
      const computed = window.getComputedStyle(svg);
      const fillColor = computed.color || computed.fill;
      if (fillColor) {
        const color = parseColor(fillColor);
        if (color) {
          if (matchesColorRange(color, BADGE_COLORS.blue)) return 'blue';
          if (matchesColorRange(color, BADGE_COLORS.gold)) return 'gold';
          if (matchesColorRange(color, BADGE_COLORS.grey)) return 'grey';
        }
      }
    } catch (e) {}
    return null;
  }

  function parseColor(str) {
    if (!str) return null;
    const rgbMatch = str.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
    const hexMatch = str.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (hexMatch) return { r: parseInt(hexMatch[1], 16), g: parseInt(hexMatch[2], 16), b: parseInt(hexMatch[3], 16) };
    return null;
  }

  function matchesColorRange(color, range) {
    return color.r >= range.r[0] && color.r <= range.r[1]
      && color.g >= range.g[0] && color.g <= range.g[1]
      && color.b >= range.b[0] && color.b <= range.b[1];
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
  //  Floating Settings UI (replaces popup)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  let fab = null;
  let fabCount = null;
  let panel = null;

  function setupUI() {
    // FAB (floating action button)
    fab = document.createElement('button');
    fab.className = 'xbf-fab';
    fab.title = 'X Badge Filter';
    fab.innerHTML = '<span style="font-size:16px;">XBF</span>';
    fabCount = document.createElement('span');
    fabCount.className = 'xbf-fab-count';
    fabCount.textContent = '0';
    fabCount.style.display = 'none';
    fab.appendChild(fabCount);
    fab.addEventListener('click', togglePanel);
    document.body.appendChild(fab);

    // Settings panel
    panel = document.createElement('div');
    panel.className = 'xbf-settings-panel';
    panel.innerHTML = ''; // Built with createElement below

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

    // Badge type section
    const badgeSection = document.createElement('div');
    badgeSection.className = 'xbf-section';
    const badgeTitle = document.createElement('div');
    badgeTitle.textContent = '非表示にするバッジ';
    badgeTitle.style.cssText = 'font-size:12px;color:#8b98a5;margin-bottom:6px;';
    badgeSection.appendChild(badgeTitle);
    badgeSection.appendChild(createToggle('filterBlue', '\u{1F535} 青バッジ (Premium)', settings.filterBlue, (v) => { settings.filterBlue = v; Storage.set(settings); resetAndReprocess(); }));
    badgeSection.appendChild(createToggle('filterGold', '\u{1F7E1} 金バッジ (企業)', settings.filterGold, (v) => { settings.filterGold = v; Storage.set(settings); resetAndReprocess(); }));
    badgeSection.appendChild(createToggle('filterGrey', '\u26AA 灰バッジ (政府)', settings.filterGrey, (v) => { settings.filterGrey = v; Storage.set(settings); resetAndReprocess(); }));
    panel.appendChild(badgeSection);

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
      wlList.innerHTML = '';
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

  // API interceptor must run at document-start (before Twitter's fetch calls)
  setupApiInterceptor();
  // Content filter initializes when DOM is ready
  initFilter();

})();
