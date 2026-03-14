// X Badge Filter - Popup Script

const elements = {
  enabled: document.getElementById('enabled'),
  filterBlue: document.getElementById('filterBlue'),
  filterGold: document.getElementById('filterGold'),
  filterGrey: document.getElementById('filterGrey'),
  showPlaceholder: document.getElementById('showPlaceholder'),
  whitelistInput: document.getElementById('whitelistInput'),
  addWhitelist: document.getElementById('addWhitelist'),
  whitelistItems: document.getElementById('whitelistItems'),
  whitelistEmpty: document.getElementById('whitelistEmpty'),
  settingsSection: document.getElementById('settingsSection'),
  statsText: document.getElementById('statsText'),
};

// Use shared constants (loaded from constants.js)
const DEFAULT_SETTINGS = typeof XBF_DEFAULT_SETTINGS !== 'undefined'
  ? XBF_DEFAULT_SETTINGS
  : { enabled: true, filterBlue: true, filterGold: false, filterGrey: false, showPlaceholder: true, whitelist: [] };

// ── Load settings ──
async function loadSettings() {
  const data = await chrome.storage.local.get('xbf_settings');
  const settings = { ...DEFAULT_SETTINGS, ...(data.xbf_settings || {}) };

  elements.enabled.checked = settings.enabled;
  elements.filterBlue.checked = settings.filterBlue;
  elements.filterGold.checked = settings.filterGold;
  elements.filterGrey.checked = settings.filterGrey;
  elements.showPlaceholder.checked = settings.showPlaceholder;

  updateSectionState(settings.enabled);
  renderWhitelist(settings.whitelist);
}

// ── Save settings ──
async function saveSettings() {
  const settings = {
    enabled: elements.enabled.checked,
    filterBlue: elements.filterBlue.checked,
    filterGold: elements.filterGold.checked,
    filterGrey: elements.filterGrey.checked,
    showPlaceholder: elements.showPlaceholder.checked,
    whitelist: await getWhitelist(),
  };
  await chrome.storage.local.set({ xbf_settings: settings });
  updateSectionState(settings.enabled);
}

async function getWhitelist() {
  const data = await chrome.storage.local.get('xbf_settings');
  return (data.xbf_settings?.whitelist) || [];
}

function updateSectionState(enabled) {
  elements.settingsSection.classList.toggle('disabled', !enabled);
}

// ── Whitelist rendering ──
function renderWhitelist(list) {
  elements.whitelistItems.innerHTML = '';
  elements.whitelistEmpty.style.display = list.length === 0 ? '' : 'none';

  for (const handle of list) {
    const item = document.createElement('div');
    item.className = 'whitelist-item';
    item.innerHTML = `
      <span>@${escapeHtml(handle)}</span>
      <button class="remove-btn" title="削除">&times;</button>
    `;
    item.querySelector('.remove-btn').addEventListener('click', async () => {
      const data = await chrome.storage.local.get('xbf_settings');
      const settings = { ...DEFAULT_SETTINGS, ...(data.xbf_settings || {}) };
      settings.whitelist = settings.whitelist.filter(h => h !== handle);
      await chrome.storage.local.set({ xbf_settings: settings });
      renderWhitelist(settings.whitelist);
    });
    elements.whitelistItems.appendChild(item);
  }
}

// ── Add to whitelist ──
async function addToWhitelist() {
  const raw = elements.whitelistInput.value.trim();
  if (!raw) return;
  const handle = raw.replace(/^@/, '').toLowerCase();
  if (!handle) return;

  const data = await chrome.storage.local.get('xbf_settings');
  const settings = { ...DEFAULT_SETTINGS, ...(data.xbf_settings || {}) };
  if (!settings.whitelist.includes(handle)) {
    settings.whitelist.push(handle);
    await chrome.storage.local.set({ xbf_settings: settings });
    renderWhitelist(settings.whitelist);
  }
  elements.whitelistInput.value = '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Event listeners ──
elements.enabled.addEventListener('change', saveSettings);
elements.filterBlue.addEventListener('change', saveSettings);
elements.filterGold.addEventListener('change', saveSettings);
elements.filterGrey.addEventListener('change', saveSettings);
elements.showPlaceholder.addEventListener('change', saveSettings);
elements.addWhitelist.addEventListener('click', addToWhitelist);
elements.whitelistInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addToWhitelist();
});

// ── Init ──
loadSettings();
