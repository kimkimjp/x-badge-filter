// X Badge Filter - API Interceptor
// Runs in MAIN world to intercept Twitter/X fetch responses
// Extracts user follow/verified status from GraphQL API responses
// Communicates with ISOLATED world via window.postMessage

(function () {
  'use strict';

  const MSG_TYPE = 'xbf-api-data';

  // Store original fetch
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

      // Only intercept Twitter GraphQL timeline endpoints
      if (url.includes('/graphql/') && (
        url.includes('HomeTimeline') ||
        url.includes('HomeLatestTimeline') ||
        url.includes('SearchTimeline') ||
        url.includes('UserTweets') ||
        url.includes('TweetDetail') ||
        url.includes('ListLatestTweetsTimeline')
      )) {
        // Clone response so original stream is not consumed
        const clone = response.clone();
        clone.json().then(data => {
          const users = extractUsers(data);
          if (users.length > 0) {
            // P0 fix: Use postMessage instead of CustomEvent
            // postMessage works across MAIN and ISOLATED worlds
            window.postMessage({ type: MSG_TYPE, users }, '*');
          }
        }).catch(() => {});
      }
    } catch (e) {
      // Never break Twitter's own functionality
    }

    return response;
  };

  // Stack-based (iterative) extraction of user data from GraphQL response
  // P1 fix: Avoids stack overflow from deep recursion
  function extractUsers(rootObj) {
    const results = [];
    const seen = new Set();
    const stack = [rootObj];

    while (stack.length > 0) {
      const obj = stack.pop();
      if (!obj || typeof obj !== 'object') continue;

      // Look for user_results.result pattern
      if (obj.legacy && obj.rest_id) {
        const handle = (obj.legacy.screen_name || '').toLowerCase();
        if (handle && !seen.has(handle)) {
          seen.add(handle);
          results.push({
            id: obj.rest_id,
            handle,
            name: obj.legacy.name || '',
            following: obj.legacy.following === true,
            isBlueVerified: obj.is_blue_verified === true,
            verifiedType: obj.legacy.verified_type || obj.verified_type || null,
          });
        }
      }

      // Push children onto stack (iterative traversal)
      if (Array.isArray(obj)) {
        for (let i = obj.length - 1; i >= 0; i--) {
          if (obj[i] && typeof obj[i] === 'object') {
            stack.push(obj[i]);
          }
        }
      } else {
        const keys = Object.keys(obj);
        for (let i = keys.length - 1; i >= 0; i--) {
          const val = obj[keys[i]];
          if (val && typeof val === 'object') {
            stack.push(val);
          }
        }
      }
    }

    return results;
  }
})();
