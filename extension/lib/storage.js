import { DEFAULT_PROMPT } from './default-prompt.js';

/**
 * Extension-local storage.
 *
 * Settings are typed into the side panel and kept in chrome.storage.local, so
 * the OpenAI key and the Supabase keys never leave this browser profile. The
 * background worker reads them from here when a run starts, which is why the
 * queue keeps going even if the panel is closed or its page reloads.
 */

const SETTINGS_KEY = 'settings';
const SENT_KEY = 'sentSlugs';
const LOG_KEY = 'activityLog';

export const DEFAULT_SETTINGS = {
  openaiApiKey: '',
  model: 'gpt-4o-mini',
  /** Empty = use the built-in prompt (DEFAULT_PROMPT). */
  customPrompt: '',
  portfolioUrl: '',
  supabaseUrl: '',
  /** Supabase publishable (anon) key — the queue functions in 06_bidded.sql. */
  supabaseKey: '',
  /** Random pause after the proposal is written, before the tab opens. */
  genDelayMinSec: 2,
  genDelayMaxSec: 5,
  /** Random pause between one project and the next. */
  gapDelayMinSec: 5,
  gapDelayMaxSec: 10,
  /** Press Send for you. Off = fill the form and wait for your click. */
  autoSend: true,
  /** How long to wait for your click when autoSend is off. */
  sendWaitSec: 300,
};

/** Raw settings as stored (what the panel edits). */
export async function loadSettings() {
  const { [SETTINGS_KEY]: saved = {} } = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(patch) {
  const next = { ...(await loadSettings()), ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/** Settings as the queue uses them, with the effective system prompt resolved. */
export async function getRunSettings() {
  const s = await loadSettings();
  return {
    ...s,
    openaiApiKey: s.openaiApiKey.trim(),
    supabaseUrl: s.supabaseUrl.trim().replace(/\/+$/, ''),
    supabaseKey: s.supabaseKey.trim(),
    systemPrompt: s.customPrompt.trim() || DEFAULT_PROMPT,
  };
}

// ---------------------------------------------------------------------------
// Slugs we have already sent. Belt and braces for `jobs.bidded`: if Workana
// accepted a proposal but the database update failed, the next run must not
// send the same project a second time.
// ---------------------------------------------------------------------------
export async function getSentSlugs() {
  const { [SENT_KEY]: sent = [] } = await chrome.storage.local.get(SENT_KEY);
  return new Set(sent);
}

export async function markSlugSent(slug) {
  const set = await getSentSlugs();
  set.add(slug);
  await chrome.storage.local.set({ [SENT_KEY]: [...set].slice(-1000) });
}

export async function appendLog(entry) {
  const { [LOG_KEY]: log = [] } = await chrome.storage.local.get(LOG_KEY);
  log.unshift({ ...entry, at: new Date().toISOString() });
  await chrome.storage.local.set({ [LOG_KEY]: log.slice(0, 100) });
}
