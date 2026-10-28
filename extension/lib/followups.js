import { getRunSettings, updateFollowUps, appendLog } from './storage.js';
import { sleep, randMs } from './timing.js';
import { openAndFill, waitForSend, closeTab } from './tab-send.js';

/**
 * Follow-ups: a second message into the same Workana conversation, a set number
 * of hours after a bid went out.
 *
 * scheduleFollowUp() is called by the bid queue after each sent bid. A timer in
 * background.js calls sendDueFollowUps() every minute; that runs whether or not
 * bidding is started, because Chrome may have been closed over the due time.
 */

const HOUR_MS = 3600 * 1000;
/** Pause before another try when the message box could not be filled. */
const RETRY_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

/** The follow-up the settings describe, or null when it is off. */
export function followUpPlan(cfg) {
  const hours = Number(cfg.followUpHours);
  const message = String(cfg.followUpMessage || '').trim();
  return message && hours > 0 ? { hours, message } : null;
}

/**
 * Queue the follow-up for a bid that was just sent. The message is captured now,
 * so what goes out is what was configured when the bid did.
 * @returns {Promise<boolean>} false when follow-ups are off or one is already queued
 */
export function scheduleFollowUp(cfg, { slug, title }) {
  const plan = followUpPlan(cfg);
  if (!plan) return Promise.resolve(false);
  return updateFollowUps((list) => {
    if (list.some((f) => f.slug === slug)) return false;
    list.push({
      slug,
      title,
      message: plan.message,
      dueAt: Date.now() + plan.hours * HOUR_MS,
      retryAt: 0,
      attempts: 0,
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

/** @returns {Promise<'sent'|'dropped'|'retry'>} */
async function deliver(entry, cfg, fail) {
  const autoSend = cfg.autoSend !== false;
  try {
    const { tabId, filled, sent } = await openAndFill(entry.slug, entry.message, autoSend);
    if (autoSend) {
      if (sent) await sleep(1500); // let the request leave before the tab closes
      await closeTab(tabId);
      if (sent) return 'sent';
    } else if (filled) {
      // Pre-filled for you: wait for your own Send click, as the bids do.
      const sendWaitMs = Math.max(30, Number(cfg.sendWaitSec) || 300) * 1000;
      return (await waitForSend(entry.slug, tabId, sendWaitMs)) === 'sent' ? 'sent' : 'dropped';
    } else {
      await closeTab(tabId);
    }
    fail('could not find the message box');
  } catch (err) {
    fail(err?.message || String(err));
  }
  return 'retry';
}

let busy = false;

/**
 * Send every follow-up that is due, one at a time.
 * @param {{log:(text:string, level?:string)=>void}} hooks
 */
export async function sendDueFollowUps({ log }) {
  if (busy) return;
  busy = true;
  try {
    const cfg = await getRunSettings();
    for (;;) {
      const now = Date.now();
      // Claim the next due one. retryAt is pushed out BEFORE Workana is touched,
      // so a worker that dies mid-send can't send the same message again at once.
      const entry = await updateFollowUps((list) => {
        const f = list.find((x) => x.dueAt <= now && x.retryAt <= now);
        if (!f) return null;
        f.attempts += 1;
        f.retryAt = now + RETRY_MS;
        return { ...f };
      });
      if (!entry) return;

      const label = entry.title || entry.slug;
      let reason = '';
      const outcome = await deliver(entry, cfg, (why) => (reason = why));

      if (outcome === 'sent') {
        await removeFollowUp(entry.slug);
        log(`Follow-up sent: ${label}`, 'ok');
        await appendLog({ type: 'followup', slug: entry.slug, title: entry.title });
      } else if (outcome === 'dropped') {
        await removeFollowUp(entry.slug);
        log(`Follow-up not sent (tab closed or timed out): ${label}`, 'warn');
      } else if (entry.attempts >= MAX_ATTEMPTS) {
        await removeFollowUp(entry.slug);
        log(`Follow-up given up after ${entry.attempts} tries: ${label} — ${reason}`, 'error');
        await appendLog({ type: 'error', slug: entry.slug, title: entry.title, reason });
      } else {
        log(`Follow-up not sent (${reason}): ${label} — trying again in 10 min`, 'warn');
      }
      await sleep(randMs(cfg.gapDelayMinSec, cfg.gapDelayMaxSec));
    }
  } catch (err) {
    log(`Follow-ups: ${err?.message || err}`, 'error');
  } finally {
    busy = false;
  }
}
