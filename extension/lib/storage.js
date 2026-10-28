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
  model: 'gpt-6-luna',
  /** Empty = use the built-in prompt (DEFAULT_PROMPT). */
  customPrompt: '',
  portfolioUrl: '',
  supabaseUrl: '',
  /** Supabase publishable (anon) key — the queue functions in 06_bidded.sql. */
  supabaseKey: '',
  /**
   * Which of the two bidders this browser is. The first bids right away; the
   * second waits `secondDelayMin` minutes after a project was stored. Each has
   * its own flag in the database, so both bid on every project.
   */
  bidderRole: 'first',
  secondDelayMin: 20,
  /** Random pause after the proposal is written, before the tab opens. */
  genDelayMinSec: 2,
  genDelayMaxSec: 5,
  /** Random pause between one project and the next. */
  gapDelayMinSec: 5,
  gapDelayMaxSec: 10,
  /**
   * Follow-up message sent into the same Workana conversation this many hours
   * after each bid goes out. An empty message turns follow-ups off.
   */
  followUpHours: 24,
  followUpMessage: '',
  /** Press Send for you. Off = fill the form and wait for your click. */
  autoSend: true,
  /** How long to wait for your click when autoSend is off. */
  sendWaitSec: 300,
};

/** Bump when a default changes in a way that saved settings should follow. */
const SETTINGS_VERSION = 2;

/** Raw settings as stored (what the panel edits). */
export async function loadSettings() {
  const { [SETTINGS_KEY]: saved = {} } = await chrome.storage.local.get(SETTINGS_KEY);
  if ((saved.settingsVersion || 1) < SETTINGS_VERSION) {
    // v2: the default model moved from gpt-4o-mini to gpt-6-luna. The panel saves
    // the whole form, so an old profile still carries the old default. Move it
    // across once; a model picked afterwards is left alone.
    const upgraded = {
      ...saved,
      settingsVersion: SETTINGS_VERSION,
      ...(saved.model === 'gpt-4o-mini' ? { model: DEFAULT_SETTINGS.model } : {}),
    };
    await chrome.storage.local.set({ [SETTINGS_KEY]: upgraded });
    return { ...DEFAULT_SETTINGS, ...upgraded };
  }
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
  const slot = s.bidderRole === 'second' ? 2 : 1;
  return {
    ...s,
    slot,
    /** Minutes a project must have been stored before this bidder takes it. */
    delayMin: slot === 2 ? Math.max(0, Number(s.secondDelayMin) || 0) : 0,
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

// ---------------------------------------------------------------------------
// Follow-ups still to send, one per bid:
//   { slug, title, message, dueAt, retryAt, attempts }
// Kept per browser, so each Workana account follows up on its own bids. The
// bid loop, the sender and the panel's Cancel all change the list, hence the
// lock around every read-modify-write.
// ---------------------------------------------------------------------------
export const FOLLOWUP_KEY = 'followUps';
const MAX_FOLLOWUPS = 500;
let followUpLock = Promise.resolve();

export async function getFollowUps() {
  const { [FOLLOWUP_KEY]: list = [] } = await chrome.storage.local.get(FOLLOWUP_KEY);
  return list;
}

/** Run `change(list)` on a copy of the list, save it, and return what `change` returned. */
export function updateFollowUps(change) {
  const run = followUpLock.then(async () => {
    const list = [...(await getFollowUps())];
    const result = change(list);
    await chrome.storage.local.set({ [FOLLOWUP_KEY]: list.slice(-MAX_FOLLOWUPS) });
    return result;
  });
  followUpLock = run.catch(() => {});
  return run;
}

export async function appendLog(entry) {
  const { [LOG_KEY]: log = [] } = await chrome.storage.local.get(LOG_KEY);
  log.unshift({ ...entry, at: new Date().toISOString() });
  await chrome.storage.local.set({ [LOG_KEY]: log.slice(0, 100) });
}
