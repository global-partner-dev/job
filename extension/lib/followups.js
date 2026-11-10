import { getRunSettings, updateFollowUps, appendLog, getOwnSlug, setOwnSlug } from './storage.js';
import { sleep, keepAliveSleep, randMs } from './timing.js';
import { openAndFill, waitForSend, closeTab } from './tab-send.js';
import { conversationUrl, fetchConversation, fetchOwnSlug } from './workana.js';
import { briefLanguage } from './openai.js';

/**
 * Follow-ups: one more message into the conversation with the client, sent
 * the moment they come back online.
 *
 * scheduleFollowUp() is called by the bid queue after each sent bid. A timer in
 * background.js calls sendDueFollowUps() every minute, whether or not bidding
 * is started. Each waiting conversation is read again every few minutes; once
 * Workana has shown the client offline and then shows them online (and the
 * minimum wait after the bid is over), the follow-up goes out, in the language
 * of their brief. It is dropped when the client replies first, or when they
 * don't come back within WATCH_MS.
 */

const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;
/** How often each waiting conversation is read again. */
const CHECK_EVERY_MS = 3 * MIN_MS;
/** At most this many conversations per minute, so a long list doesn't hammer Workana. */
const MAX_CHECKS_PER_TICK = 10;
/** Stop watching a client who hasn't come back online within this long. */
const WATCH_MS = 3 * 24 * HOUR_MS;
/** Wait after Workana couldn't be read at all (signed out, offline…). */
const ERROR_PAUSE_MS = 10 * MIN_MS;
const MAX_ATTEMPTS = 3;
/** Give up on a conversation Workana keeps saying isn't there. */
const MAX_NOT_FOUND = 10;

/** The setting holding the follow-up text for each language of a brief. */
export const FOLLOWUP_FIELDS = { Portuguese: 'followUpPt', Spanish: 'followUpEs', English: 'followUpEn' };

/** The follow-up text for a brief in `language`, or '' when there is none. */
export function followUpMessageFor(cfg, language) {
  return String(cfg[FOLLOWUP_FIELDS[language] || FOLLOWUP_FIELDS.Portuguese] || '').trim();
}

/**
 * Queue the follow-up for a bid that was just sent.
 * @param {{slug: string, title: string, language: string}} bid  language of the brief
 * @returns {Promise<boolean>} false when there is no message for that language or one is already queued
 */
export function scheduleFollowUp(cfg, { slug, title, language }) {
  if (!followUpMessageFor(cfg, language)) return Promise.resolve(false);
  const now = Date.now();
  const minHours = Math.max(0, Number(cfg.followUpMinHours) || 0);
  return updateFollowUps((list) => {
    if (list.some((f) => f.slug === slug)) return false;
    list.push({
      slug,
      title,
      language,
      bidAt: now,
      notBefore: now + minHours * HOUR_MS,
      nextCheckAt: now + MIN_MS,
      online: null, // as last seen on Workana
      seenOffline: false,
      checkedAt: 0,
      ownBaseline: null, // your messages in the conversation when a send was tried
      attempts: 0,
      errors: 0,
    });
    return true;
  });
}

/** Drop every queued follow-up. @returns {Promise<number>} how many were dropped */
export function cancelFollowUps() {
  return updateFollowUps((list) => list.splice(0).length);
}

const removeFollowUp = (slug) =>
  updateFollowUps((list) => {
    const i = list.findIndex((f) => f.slug === slug);
    if (i >= 0) list.splice(i, 1);
  });

const patchFollowUp = (slug, fields) =>
  updateFollowUps((list) => {
    const f = list.find((x) => x.slug === slug);
    if (f) Object.assign(f, fields);
  });

const postpone = (entries, ms) =>
  updateFollowUps((list) => {
    const at = Date.now() + ms;
    for (const f of list) if (entries.some((e) => e.slug === f.slug)) f.nextCheckAt = at;
  });

/** Entries queued by the previous version (sent at a fixed time) get the new fields. */
function upgrade(f, now) {
  if (f.bidAt) return;
  Object.assign(f, {
    language: f.language || briefLanguage(f.title || ''),
    bidAt: now,
    notBefore: 0,
    nextCheckAt: 0,
    online: null,
    seenOffline: false,
    checkedAt: 0,
    ownBaseline: null,
    attempts: 0,
    errors: 0,
  });
  delete f.dueAt;
  delete f.retryAt;
  delete f.message;
}

/** @returns {Promise<'sent'|'dropped'|'retry'>} */
async function deliver(entry, cfg, message, ownSlug, fail) {
  const autoSend = cfg.autoSend !== false;
  try {
    const { tabId, filled, sent } = await openAndFill(entry.slug, message, autoSend, {
      url: conversationUrl(entry.slug, ownSlug),
      mode: 'reply',
    });
    if (autoSend) {
      if (sent) await sleep(1500); // let the request leave before the tab closes
      await closeTab(tabId);
      if (sent) return 'sent';
      fail(filled ? 'the page did not take the message' : 'could not find the reply box');
    } else if (filled) {
      // Pre-filled for you: wait for your own Send click, as the bids do.
      const sendWaitMs = Math.max(30, Number(cfg.sendWaitSec) || 300) * 1000;
      return (await waitForSend(entry.slug, tabId, sendWaitMs)) === 'sent' ? 'sent' : 'dropped';
    } else {
      await closeTab(tabId);
      fail('could not find the reply box');
    }
  } catch (err) {
    fail(err?.message || String(err));
  }
  return 'retry';
}

/**
 * Read one conversation and send its follow-up if the client is back online.
 * @returns {Promise<'stop'|undefined>} 'stop' when Workana can't be read at all
 */
async function checkOne(entry, cfg, ownSlug, log) {
  const label = entry.title || entry.slug;
  const now = Date.now();
  const done = async (text, level = 'info') => {
    await removeFollowUp(entry.slug);
    log(text, level);
  };

  if (now - entry.bidAt > WATCH_MS) return done(`Follow-up dropped: ${label} — the client didn't come back online within 3 days`);
  const message = followUpMessageFor(cfg, entry.language);
  if (!message) return done(`Follow-up dropped: ${label} — the ${entry.language} follow-up message is empty`);

  let conv;
  try {
    conv = await fetchConversation(entry.slug, ownSlug);
  } catch (err) {
    const errors = entry.errors + 1;
    await patchFollowUp(entry.slug, { errors });
    if (errors === 1 || errors % 20 === 0) {
      log(`Follow-up: could not read the conversation for ${label} (${err.message}) — will keep trying`, 'warn');
    }
    return /Not logged in/.test(err.message) ? 'stop' : undefined;
  }
  if (!conv.found) {
    await setOwnSlug(''); // perhaps another account is signed in now: read the user name again
    const errors = entry.errors + 1;
    if (errors >= MAX_NOT_FOUND) return done(`Follow-up dropped: ${label} — Workana shows no conversation for it`, 'warn');
    await patchFollowUp(entry.slug, { errors });
    return undefined;
  }

  // A send the page didn't confirm, which Workana shows went through after all.
  if (entry.attempts > 0 && entry.ownBaseline != null && conv.ownMessages > entry.ownBaseline) {
    await done(`Follow-up sent: ${label}`, 'ok');
    await appendLog({ type: 'followup', slug: entry.slug, title: entry.title });
    return undefined;
  }
  if (conv.clientReplied) return done(`Follow-up not needed: ${label} — the client already replied`);
  if (conv.canAddMessage === false) {
    return done(`Follow-up dropped: ${label} — Workana doesn't allow another message in this conversation`, 'warn');
  }

  const seenOffline = entry.seenOffline || conv.online === false;
  await patchFollowUp(entry.slug, { online: conv.online, seenOffline, checkedAt: now, errors: 0 });
  if (!(conv.online === true && seenOffline && now >= entry.notBefore)) return undefined;

  // Offline before, online now: this is the moment.
  const attempts = entry.attempts + 1;
  await patchFollowUp(entry.slug, { attempts, ownBaseline: conv.ownMessages });
  log(`Client is back online: ${label} — sending the follow-up (${entry.language})`, 'info');
  let reason = '';
  const outcome = await deliver(entry, cfg, message, ownSlug, (why) => (reason = why));

  if (outcome === 'sent') {
    await done(`Follow-up sent: ${label}`, 'ok');
    await appendLog({ type: 'followup', slug: entry.slug, title: entry.title });
  } else if (outcome === 'dropped') {
    await done(`Follow-up not sent (tab closed or timed out): ${label}`, 'warn');
  } else if (attempts >= MAX_ATTEMPTS) {
    await done(`Follow-up given up after ${attempts} tries: ${label} — ${reason}`, 'error');
    await appendLog({ type: 'error', slug: entry.slug, title: entry.title, reason });
  } else {
    log(`Follow-up not confirmed (${reason}): ${label} — reading the conversation again in 3 min`, 'warn');
  }
  await keepAliveSleep(randMs(cfg.gapDelayMinSec, cfg.gapDelayMaxSec));
  return undefined;
}

let busy = false;

/**
 * Read the conversations that are due for a look and send the follow-ups whose
 * client just came back online, one at a time.
 * @param {{log:(text:string, level?:string)=>void}} hooks
 */
export async function sendDueFollowUps({ log }) {
  if (busy) return;
  busy = true;
  try {
    const cfg = await getRunSettings();
    const now = Date.now();
    // Claim the ones due. nextCheckAt moves on BEFORE Workana is touched, so a
    // worker that dies mid-way can't repeat them at once.
    const due = await updateFollowUps((list) => {
      for (const f of list) upgrade(f, now);
      const picked = list
        .filter((f) => f.nextCheckAt <= now)
        .sort((a, b) => a.nextCheckAt - b.nextCheckAt)
        .slice(0, MAX_CHECKS_PER_TICK);
      for (const f of picked) f.nextCheckAt = now + CHECK_EVERY_MS;
      return picked.map((f) => ({ ...f }));
    });
    if (!due.length) return;

    let ownSlug = await getOwnSlug();
    if (!ownSlug) {
      try {
        ownSlug = await fetchOwnSlug();
        await setOwnSlug(ownSlug);
      } catch (err) {
        await postpone(due, ERROR_PAUSE_MS);
        log(`Follow-ups paused for 10 min: ${err.message}`, 'warn');
        return;
      }
    }
    for (let i = 0; i < due.length; i++) {
      if ((await checkOne(due[i], cfg, ownSlug, log)) === 'stop') {
        await postpone(due.slice(i), ERROR_PAUSE_MS);
        break;
      }
    }
  } catch (err) {
    log(`Follow-ups: ${err?.message || err}`, 'error');
  } finally {
    busy = false;
  }
}
