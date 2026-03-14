// X Badge Filter - Storage Utility
// Wraps chrome.storage.local for settings management

const XBF_Storage = {
  async get() {
    try {
      const data = await chrome.storage.local.get('xbf_settings');
      return { ...XBF_DEFAULT_SETTINGS, ...(data.xbf_settings || {}) };
    } catch (e) {
      return { ...XBF_DEFAULT_SETTINGS };
    }
  },

  async set(settings) {
    await chrome.storage.local.set({ xbf_settings: settings });
  },

  async update(partial) {
    const current = await this.get();
    const updated = { ...current, ...partial };
    await this.set(updated);
    return updated;
  },

  async addToWhitelist(handle) {
    const settings = await this.get();
    const normalized = handle.replace(/^@/, '').toLowerCase();
    if (!settings.whitelist.includes(normalized)) {
      settings.whitelist.push(normalized);
      await this.set(settings);
    }
    return settings;
  },

  async removeFromWhitelist(handle) {
    const settings = await this.get();
    const normalized = handle.replace(/^@/, '').toLowerCase();
    settings.whitelist = settings.whitelist.filter(h => h !== normalized);
    await this.set(settings);
    return settings;
  },
};
