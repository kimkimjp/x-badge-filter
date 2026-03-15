// X Badge Filter - Main Content Script
// Runs in ISOLATED world, listens for API data via postMessage,
// observes DOM, filters tweets
//
// Logic: badge present + not following + not whitelisted + badge type enabled → hide

(function () {
  'use strict';

  const USER_CACHE_MAX = 5000;
  const MSG_TYPE = 'xbf-api-data';

  // ── State ──
  let settings = { ...XBF_DEFAULT_SETTINGS };
  let userCache = new Map(); // handle → { following, name, isBlueVerified, verifiedType }
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
          isBlueVerified: user.isBlueVerified === true,
          verifiedType: user.verifiedType || null,
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

  // ── Determine badge type from user data ──
  // Returns 'gold', 'grey', 'blue', or null (no badge)
  function getBadgeType(userData) {
    if (!userData) return 'blue'; // default when API info unavailable
    if (userData.verifiedType === 'Business') return 'gold';
    if (userData.verifiedType === 'Government') return 'grey';
    if (userData.isBlueVerified) return 'blue';
    return 'blue'; // badge exists but type unknown → default blue
  }

  // ── Check if badge type should be filtered based on settings ──
  function shouldFilterBadgeType(badgeType) {
    if (badgeType === 'blue') return settings.filterBlue !== false;
    if (badgeType === 'gold') return settings.filterGold === true;
    if (badgeType === 'grey') return settings.filterGrey === true;
    return true;
  }

  // ── Core: Process a single tweet ──
  // Logic: badge present + not following + not whitelisted + badge type enabled → hide
  function processTweet(article) {
    if (!settings.enabled) return;
    if (article.dataset.xbfProcessed === 'true') return;

    // Skip inner (quoted) tweets — only process outermost article
    if (article.parentElement && article.parentElement.closest('article[data-testid="tweet"]')) {
      // This article is nested inside another article (quote tweet)
      article.dataset.xbfProcessed = 'true';
      return;
    }

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

    // ── Retweet check: if RT'd by a followed user, don't filter ──
    const socialContext = article.querySelector(XBF_SELECTORS.socialContext);
    if (socialContext) {
      const contextText = socialContext.textContent || '';
      if (contextText.includes('reposted') || contextText.includes('リポスト')) {
        // Try to extract the RT author's handle from socialContext link
        const rtLink = socialContext.querySelector('a[role="link"]');
        if (rtLink) {
          const rtHref = rtLink.getAttribute('href');
          if (rtHref && rtHref.startsWith('/')) {
            const rtHandle = rtHref.slice(1).toLowerCase().split('/')[0];
            if (rtHandle) {
              const rtUser = userCache.get(rtHandle);
              if (rtUser && rtUser.following) {
                article.dataset.xbfProcessed = 'true';
                return;
              }
              // Also check whitelist for the RT author
              if (settings.whitelist.includes(rtHandle)) {
                article.dataset.xbfProcessed = 'true';
                return;
              }
            }
          }
        }
      }
    }

    // ── Badge type filter check ──
    const badgeType = getBadgeType(userData);
    if (!shouldFilterBadgeType(badgeType)) {
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
    cell.dataset.xbfOriginalHeight = cell.style.height || '';

    if (settings.showPlaceholder) {
      const placeholder = document.createElement('div');
      placeholder.className = 'xbf-placeholder';

      const text = document.createElement('span');
      text.className = 'xbf-placeholder-text';
      text.textContent = `@${handle} ${xbfT('hiddenPost')}`;

      const showBtn = document.createElement('button');
      showBtn.className = 'xbf-show-btn';
      showBtn.textContent = xbfT('show');
      showBtn.addEventListener('click', () => {
        restoreCell(cell, article, placeholder);
      });

      const whitelistBtn = document.createElement('button');
      whitelistBtn.className = 'xbf-whitelist-btn';
      whitelistBtn.textContent = xbfT('alwaysShow');
      whitelistBtn.addEventListener('click', () => {
        XBF_Storage.addToWhitelist(handle);
        settings.whitelist.push(handle);
        restoreCell(cell, article, placeholder);
      });

      placeholder.appendChild(text);
      placeholder.appendChild(showBtn);
      placeholder.appendChild(whitelistBtn);

      article.style.display = 'none';
      cell.insertBefore(placeholder, article);
    } else {
      // Complete hiding: collapse the cell entirely
      cell.classList.add('xbf-hidden-cell');
    }

    hiddenCount++;
    updateBadgeCount();
  }

  function restoreCell(cell, article, placeholder) {
    cell.classList.remove('xbf-hidden-cell');
    cell.style.display = cell.dataset.xbfOriginalDisplay || '';
    cell.style.height = cell.dataset.xbfOriginalHeight || '';
    if (article) article.style.display = '';
    if (placeholder) placeholder.remove();
    cell.dataset.xbfHidden = 'false';
  }

  // ── Badge count ──
  function updateBadgeCount() {
    try {
      chrome.runtime.sendMessage({
        type: 'updateBadge',
        count: 1, // send increment of 1 per hidden tweet
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
      cell.classList.remove('xbf-hidden-cell');
      cell.style.display = cell.dataset.xbfOriginalDisplay || '';
      cell.style.height = cell.dataset.xbfOriginalHeight || '';
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
