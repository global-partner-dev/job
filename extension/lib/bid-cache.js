export const FORM_CACHE_KEY = 'bidFormCache';

/** @param {string} slug */
export async function getCachedBidForm(slug) {
  const { [FORM_CACHE_KEY]: cache = {} } = await chrome.storage.local.get(FORM_CACHE_KEY);
  const entry = cache[slug];
  if (!entry || Date.now() - (entry.capturedAt || 0) > 30 * 60 * 1000) return null;
  return entry;
}

/** @param {string} slug @param {object} form */
export async function setCachedBidForm(slug, form) {
  const { [FORM_CACHE_KEY]: cache = {} } = await chrome.storage.local.get(FORM_CACHE_KEY);
  cache[slug] = { ...form, capturedAt: Date.now() };
  await chrome.storage.local.set({ [FORM_CACHE_KEY]: cache });
}
