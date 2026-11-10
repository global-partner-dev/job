import { defaultPromptFor } from './default-prompt.js';

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
  /** Empty = use the built-in prompt for the chosen bidder role. */
  customPrompt: '',
  portfolioUrl: '',
  /**
   * Second bidder: the work you have actually delivered, one item per line. Its
   * proposals mention past work only from this list; empty = no such claims.
   */
  pastWork: '',
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
  /**
   * Projects posted longer ago than this are passed over (both bidders), so a
   * restart after a pause doesn't bid on stale projects. 0 = no limit.
   */
  maxAgeHours: 5,
  /** Random pause after the proposal is written, before the tab opens. */
  genDelayMinSec: 2,
  genDelayMaxSec: 5,
  /** Random pause between one project and the next. */
  gapDelayMinSec: 5,
  gapDelayMaxSec: 10,
  /**
   * Follow-up: one more message into the conversation, sent when the client
   * comes back online (seen offline, then online), and no sooner than this
   * many hours after the bid. One text per language of the brief; an empty one
   * sends no follow-ups to clients writing in that language.
   */
  followUpMinHours: 1,
  followUpPt:
    'Olá! Passando para saber se você teve a chance de ver minha proposta. Se tiver qualquer dúvida sobre o escopo, o prazo ou o valor, posso esclarecer por aqui mesmo. E se algum ponto não se encaixar no que você precisa, ajusto a proposta sem problema.',
  followUpEs:
    '¡Hola! Quería saber si tuvo la oportunidad de ver mi propuesta. Si tiene alguna duda sobre el alcance, el plazo o el presupuesto, con gusto la aclaro por aquí. Y si algún punto no se ajusta a lo que necesita, puedo adaptar la propuesta sin problema.',
  followUpEn:
    "Hi! Just checking whether you had a chance to look at my proposal. If you have any questions about the scope, timeline or price, I'm happy to answer them here. And if anything doesn't quite fit what you need, I can adjust the proposal.",
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
    /** Minutes after which a project is too old to bid on; 0 = no limit. */
    maxAgeMin: Math.max(0, Number(s.maxAgeHours) || 0) * 60,
    openaiApiKey: s.openaiApiKey.trim(),
    supabaseUrl: s.supabaseUrl.trim().replace(/\/+$/, ''),
    supabaseKey: s.supabaseKey.trim(),
    systemPrompt: s.customPrompt.trim() || defaultPromptFor(s.bidderRole),
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
// Follow-ups still to send, one per bid (see followups.js):
//   { slug, title, language, bidAt, notBefore, nextCheckAt, online, seenOffline,
//     checkedAt, ownBaseline, attempts, errors }
// Kept per browser, so each Workana account follows up on its own bids. The
// bid loop, the sender and the panel's Cancel all change the list, hence the
// lock around every read-modify-write.
// ---------------------------------------------------------------------------
export const FOLLOWUP_KEY = 'followUps';
const OWN_SLUG_KEY = 'workanaOwnSlug';

/** Your Workana user name as last read from Workana ('' = not known yet). */
export async function getOwnSlug() {
  const { [OWN_SLUG_KEY]: slug = '' } = await chrome.storage.local.get(OWN_SLUG_KEY);
  return slug;
}

export function setOwnSlug(slug) {
  return chrome.storage.local.set({ [OWN_SLUG_KEY]: slug || '' });
}

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
