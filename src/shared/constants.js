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
  filterBlue: true,
  filterGold: false,
  filterGrey: false,
  whitelist: [],
};

const XBF_EVENT_API_DATA = 'xbf-api-data';

// ── i18n ──
const XBF_I18N = {
  ja: {
    hiddenPost: 'の投稿を非表示にしました',
    show: '表示',
    alwaysShow: '常に表示',
    statsText: '件非表示',
    // popup
    displaySettings: '表示設定',
    showPlaceholderBar: '非表示バーを表示',
    filterSettings: 'フィルタ設定',
    filterBlue: '青バッジ（個人課金）',
    filterGold: '金バッジ（企業公式）',
    filterGrey: '灰バッジ（政府機関）',
    whitelist: 'ホワイトリスト',
    add: '追加',
    whitelistEmpty: 'ホワイトリストは空です',
    remove: '削除',
    exportBtn: 'エクスポート',
    importBtn: 'インポート',
  },
  en: {
    hiddenPost: "'s post was hidden",
    show: 'Show',
    alwaysShow: 'Always Show',
    statsText: 'hidden',
    displaySettings: 'Display Settings',
    showPlaceholderBar: 'Show hidden bar',
    filterSettings: 'Filter Settings',
    filterBlue: 'Blue badges (Premium)',
    filterGold: 'Gold badges (Business)',
    filterGrey: 'Grey badges (Government)',
    whitelist: 'Whitelist',
    add: 'Add',
    whitelistEmpty: 'Whitelist is empty',
    remove: 'Remove',
    exportBtn: 'Export',
    importBtn: 'Import',
  },
};

function xbfT(key) {
  const lang = (navigator.language || '').startsWith('ja') ? 'ja' : 'en';
  return (XBF_I18N[lang] || XBF_I18N.en)[key] || key;
}
