// X Badge Filter - Shared Constants
// All DOM selectors centralized here for easy maintenance

const XBF_SELECTORS = {
  tweet: 'article[data-testid="tweet"]',
  tweetFallback: 'article[role="article"]',
  verifiedBadge: 'svg[data-testid="icon-verified"]',
  verifiedBadgeFallback: '[aria-label*="erified"]',
  timeline: '[data-testid="primaryColumn"]',
  timelineFallback: 'main[role="main"]',
  cellInnerDiv: '[data-testid="cellInnerDiv"]',
  userName: '[data-testid="User-Name"]',
  socialContext: '[data-testid="socialContext"]',
  tweetText: '[data-testid="tweetText"]',
};

const XBF_DEFAULT_SETTINGS = {
  enabled: true,
  showPlaceholder: true,
  whitelist: [],
};

const XBF_EVENT_API_DATA = 'xbf-api-data';
