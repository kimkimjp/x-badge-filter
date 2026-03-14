// X Badge Filter - Shared Constants
// All DOM selectors and badge colors centralized here for easy maintenance

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

// Badge color ranges (RGB) - used to determine badge type
const XBF_BADGE_COLORS = {
  blue: { r: [0, 100], g: [130, 220], b: [200, 255] },   // Twitter Blue/Premium
  gold: { r: [180, 255], g: [150, 200], b: [0, 50] },     // Business/Organization
  grey: { r: [100, 170], g: [100, 170], b: [100, 170] },   // Government/Official
};

const XBF_DEFAULT_SETTINGS = {
  enabled: true,
  filterBlue: true,
  filterGold: false,
  filterGrey: false,
  showPlaceholder: true,
  whitelist: [],
};

const XBF_EVENT_API_DATA = 'xbf-api-data';
