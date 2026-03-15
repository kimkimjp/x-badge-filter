// X Badge Filter - Popup Script

const elements = {
  enabled: document.getElementById('enabled'),
  showPlaceholder: document.getElementById('showPlaceholder'),
  filterBlue: document.getElementById('filterBlue'),
  filterGold: document.getElementById('filterGold'),
  filterGrey: document.getElementById('filterGrey'),
  whitelistInput: document.getElementById('whitelistInput'),
  addWhitelist: document.getElementById('addWhitelist'),
  whitelistItems: document.getElementById('whitelistItems'),
  whitelistEmpty: document.getElementById('whitelistEmpty'),
  settingsSection: document.getElementById('settingsSection'),
  statsText: document.getElementById('statsText'),
  exportWhitelist: document.getElementById('exportWhitelist'),
  importWhitelist: document.getElementById('importWhitelist'),
  importFileInput: document.getElementById('importFileInput'),
};

const DEFAULT_SETTINGS = typeof XBF_DEFAULT_SETTINGS !== 'undefined'
  ? XBF_DEFAULT_SETTINGS
  : { enabled: true, showPlaceholder: true, filterBlue: true, filterGold: false, filterGrey: false, whitelist: [] };

// ── i18n helper (available from constants.js) ──
function t(key) {
  return typeof xbfT === 'function' ? xbfT(key) : key;
}

// ── Apply i18n to all elements with data-i18n ──
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
}

// ── Load settings ──
async function loadSettings() {
  applyI18n();

  const data = await chrome.storage.local.get('xbf_settings');
  const settings = { ...DEFAULT_SETTINGS, ...(data.xbf_settings || {}) };

  elements.enabled.checked = settings.enabled;
  elements.showPlaceholder.checked = settings.showPlaceholder;
  elements.filterBlue.checked = settings.filterBlue !== false;
  elements.filterGold.checked = settings.filterGold === true;
  elements.filterGrey.checked = settings.filterGrey === true;

  updateSectionState(settings.enabled);
  renderWhitelist(settings.whitelist);

  // Load session count
  loadSessionCount();
}

// ── Load session hidden count from service worker ──
async function loadSessionCount() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getSessionCount' });
    const count = response?.count || 0;
    elements.statsText.textContent = `${count} ${t('statsText')}`;
  } catch (e) {
    elements.statsText.textContent = `0 ${t('statsText')}`;
  }
}

// ── Save settings ──
async function saveSettings() {
  const settings = {
    enabled: elements.enabled.checked,
    showPlaceholder: elements.showPlaceholder.checked,
    filterBlue: elements.filterBlue.checked,
    filterGold: elements.filterGold.checked,
    filterGrey: elements.filterGrey.checked,
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
      <button class="remove-btn" title="${t('remove')}">&times;</button>
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

// ── Export whitelist ──
async function exportWhitelist() {
  const data = await chrome.storage.local.get('xbf_settings');
  const whitelist = data.xbf_settings?.whitelist || [];
  const json = JSON.stringify(whitelist, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'xbf-whitelist.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import whitelist ──
function importWhitelist() {
  elements.importFileInput.click();
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const imported = JSON.parse(text);

    if (!Array.isArray(imported)) {
      alert('Invalid whitelist file format.');
      return;
    }

    // Normalize and validate
    const normalized = imported
      .filter(h => typeof h === 'string' && h.trim())
      .map(h => h.replace(/^@/, '').toLowerCase().trim());

    const data = await chrome.storage.local.get('xbf_settings');
    const settings = { ...DEFAULT_SETTINGS, ...(data.xbf_settings || {}) };

    // Merge: add new handles without duplicates
    const existing = new Set(settings.whitelist);
    for (const handle of normalized) {
      if (!existing.has(handle)) {
        settings.whitelist.push(handle);
        existing.add(handle);
      }
    }

    await chrome.storage.local.set({ xbf_settings: settings });
    renderWhitelist(settings.whitelist);
  } catch (e) {
    alert('Failed to import whitelist: ' + e.message);
  }

  // Reset file input so the same file can be re-imported
  elements.importFileInput.value = '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Event listeners ──
elements.enabled.addEventListener('change', saveSettings);
elements.showPlaceholder.addEventListener('change', saveSettings);
elements.filterBlue.addEventListener('change', saveSettings);
elements.filterGold.addEventListener('change', saveSettings);
elements.filterGrey.addEventListener('change', saveSettings);
elements.addWhitelist.addEventListener('click', addToWhitelist);
elements.whitelistInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addToWhitelist();
});
elements.exportWhitelist.addEventListener('click', exportWhitelist);
elements.importWhitelist.addEventListener('click', importWhitelist);
elements.importFileInput.addEventListener('change', handleImportFile);

// ── Init ──
loadSettings();
