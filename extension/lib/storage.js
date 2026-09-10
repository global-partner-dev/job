/**
 * Extension-local bookkeeping.
 *
 * AskBot settings live in the web dashboard (localStorage there) and are handed
 * to the worker with every run, so nothing settings-shaped is stored here — only
 * the "already asked" slug set and the popup's activity log.
 */

const ASKED_KEY = 'askedSlugs';

export async function getAskedSlugs() {
  const { [ASKED_KEY]: askedSlugs = [] } = await chrome.storage.local.get(ASKED_KEY);
  return new Set(askedSlugs);
}

export async function markSlugAsked(slug) {
  const set = await getAskedSlugs();
  set.add(slug);
  await chrome.storage.local.set({ [ASKED_KEY]: [...set].slice(-500) });
}

export async function clearAskTracking() {
  await chrome.storage.local.remove([ASKED_KEY]);
}

export async function appendLog(entry) {
  const { activityLog = [] } = await chrome.storage.local.get('activityLog');
  activityLog.unshift({ ...entry, at: new Date().toISOString() });
  await chrome.storage.local.set({ activityLog: activityLog.slice(0, 100) });
}

export async function clearActivityLog() {
  await chrome.storage.local.set({ activityLog: [] });
}
