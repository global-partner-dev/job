import { fetchProjectDetails, askQuestionPageUrl, projectPageUrl } from './workana.js';
import { generateQuestion } from './openai.js';
import { fetchNextJob, markJobBidded, SupabaseConfigError } from './supabase-jobs.js';
import { getSentSlugs, markSlugSent, appendLog } from './storage.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** How long to wait before looking again once the queue is empty. */
const EMPTY_POLL_MS = 30000;

/**
 * Sleep that keeps the MV3 service worker alive. An idle connected port does NOT
 * reset the ~30s idle timer (Chrome 114+), so we poke an extension API every
 * <30s to keep the worker running through long waits.
 */
async function keepAliveSleep(ms, isStopped = () => false) {
  const PING_MS = 20000;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (isStopped()) return;
    await sleep(Math.min(PING_MS, end - Date.now()));
    try {
      await chrome.runtime.getPlatformInfo(); // resets the SW idle timer
    } catch {
      /* ignore */
    }
  }
}

/** Random delay in ms within [minSec, maxSec]. */
function randMs(minSec, maxSec) {
  const lo = Math.max(1, Number(minSec) || 1);
  const hi = Math.max(lo, Number(maxSec) || lo);
  return Math.round((lo + Math.random() * (hi - lo)) * 1000);
}

function waitForComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') done();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then(
      (t) => {
        if (t?.status === 'complete') done();
      },
      () => done(),
    );
    setTimeout(done, timeoutMs);
  });
}

// ---------------------------------------------------------------------------
// "Sent" signal — the content script reports the real form submit on the
// Workana page, which is what lets a manual-send run move on.
// ---------------------------------------------------------------------------
const sentWaiters = new Map(); // slug → resolve fn

/** Called from background.js when a content script reports a submitted form. */
export function noteQuestionSent(slug) {
  const resolve = sentWaiters.get(slug);
  if (resolve) resolve('sent');
}

/** @returns {Promise<'sent'|'closed'|'timeout'>} */
function waitForSend(slug, tabId, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      sentWaiters.delete(slug);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(timer);
      resolve(outcome);
    };
    const onRemoved = (id) => {
      if (id === tabId) finish('closed');
    };

    sentWaiters.set(slug, () => finish('sent'));
    chrome.tabs.onRemoved.addListener(onRemoved);
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
  });
}

/**
 * Open the project's message page on its "Ask a question" tab, fill the
 * proposal, and (when autoSend is on) press Send.
 * @returns {Promise<{tabId:number|null, filled:boolean, sent:boolean}>}
 */
async function openAndFill(slug, text, autoSend) {
  const tab = await chrome.tabs.create({
    url: askQuestionPageUrl(slug),
    active: !autoSend, // auto-send runs in the background, out of your way
  });
  await waitForComplete(tab.id);

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: 'WR_FILL_QUESTION',
        slug,
        question: text,
        autoSend,
      });
      if (resp?.ok) return { tabId: tab.id, filled: true, sent: !!resp.sent };
    } catch {
      /* content script not ready yet */
    }
    await sleep(700);
  }
  return { tabId: tab.id, filled: false, sent: false };
}

async function closeTab(tabId) {
  if (tabId == null) return;
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    /* already gone */
  }
}

/** Errors that mean every further project would fail the same way. */
function isFatalOpenAIError(msg) {
  return /OpenAI (401|403)\b|insufficient_quota|invalid_api_key|billing_not_active|No OpenAI API key/i.test(msg);
}

/** A database row, shaped the way generateQuestion() expects a project. */
function toProject(row) {
  return {
    slug: row.id,
    title: row.title || '',
    description: row.description || '',
    budget: row.budget || '',
    country: row.client_country || '',
    skills: Array.isArray(row.skills) ? row.skills : [],
  };
}

/**
 * Work through the database queue one project at a time:
 *   fetch the newest project this bidder hasn't bid on (and that is old enough
 *   for it) → write the proposal → send it on Workana → set this bidder's
 *   flag to 1 → next project.
 * When the queue is empty it keeps polling (the scraper adds jobs continuously)
 * until stopped.
 *
 * @param {object} cfg  run settings (see getRunSettings)
 * @param {{update:(patch:object)=>void, log:(text:string, level?:string)=>void, isStopped:()=>boolean}} hooks
 */
export async function runBidQueue(cfg, { update, log, isStopped }) {
  const skip = []; // ids that failed / were not sent during this run
  const sentBefore = await getSentSlugs();
  // First bidder keeps the bare slug (as before); the second is namespaced so
  // switching roles in one browser never makes it skip projects it hasn't sent.
  const sentKey = (slug) => (cfg.slot === 2 ? `2:${slug}` : slug);
  const sendWaitMs = Math.max(30, Number(cfg.sendWaitSec) || 300) * 1000;
  let sent = 0;
  let failed = 0;

  const stats = () => update({ sent, failed });

  while (!isStopped()) {
    // ---- 1. next project from the database --------------------------------
    let row;
    try {
      row = await fetchNextJob(cfg, skip);
    } catch (err) {
      if (err instanceof SupabaseConfigError) throw err;
      log(`Could not read the queue: ${err.message}`, 'warn');
      update({ phase: 'waiting', current: null, message: 'Database unreachable — retrying…' });
      await keepAliveSleep(EMPTY_POLL_MS, isStopped);
      continue;
    }

    if (!row) {
      update({
        phase: 'waiting',
        current: null,
        message:
          cfg.slot === 2
            ? `No project is ${cfg.delayMin} min old yet — checking again in 30s`
            : 'Queue empty — checking again in 30s',
      });
      await keepAliveSleep(EMPTY_POLL_MS, isStopped);
      continue;
    }

    const slug = row.id;
    const job = { id: slug, title: row.title || slug, url: projectPageUrl(slug) };
    update({ current: job, phase: 'preparing', message: 'Reading the project…' });

    // Already sent in an earlier run but the database never got the flag.
    if (sentBefore.has(sentKey(slug))) {
      log(`${job.title}: already sent earlier — marking bidded`, 'info');
      try {
        await markJobBidded(cfg, slug);
      } catch (err) {
        if (err instanceof SupabaseConfigError) throw err;
        log(`Could not mark ${slug} bidded: ${err.message}`, 'warn');
        skip.push(slug);
      }
      continue;
    }

    try {
      // ---- 2. top up a thin row from the detail page ----------------------
      let project = toProject(row);
      if (project.description.length < 40 || row.ai_category === 'unjudged_truncated') {
        try {
          const details = await fetchProjectDetails(slug);
          for (const [k, v] of Object.entries(details || {})) {
            const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
            if (!empty) project[k] = v;
          }
        } catch {
          /* fall back to what the database has */
        }
      }

      // ---- 3. write the proposal -----------------------------------------
      update({ phase: 'writing', message: 'Writing the proposal…' });
      const text = await generateQuestion({
        apiKey: cfg.openaiApiKey,
        model: cfg.model,
        systemPrompt: cfg.systemPrompt,
        portfolioUrl: cfg.portfolioUrl,
        project,
      });

      update({ phase: 'waiting', message: 'Opening in a moment…' });
      await keepAliveSleep(randMs(cfg.genDelayMinSec, cfg.genDelayMaxSec), isStopped);
      if (isStopped()) break;

      // ---- 4. send it on Workana -----------------------------------------
      const autoSend = cfg.autoSend !== false;
      update({ phase: 'sending', message: autoSend ? 'Sending on Workana…' : 'Opening Workana…' });
      const { tabId, filled, sent: submittedNow } = await openAndFill(slug, text, autoSend);

      let outcome = 'unsent';
      if (autoSend && submittedNow) {
        await sleep(1500); // let the request leave before the tab closes
        await closeTab(tabId);
        outcome = 'sent';
      } else if (filled) {
        // Either autoSend couldn't find the button, or autoSend is off: leave
        // the tab open and wait for the real submit.
        update({
          phase: 'sending',
          message: autoSend
            ? 'Filled, but Send could not be pressed — finish it on Workana'
            : 'Pre-filled — review it and press Send on Workana',
        });
        outcome = (await waitForSend(slug, tabId, sendWaitMs)) === 'sent' ? 'sent' : 'unsent';
      } else {
        update({ phase: 'sending', message: 'Opened — paste the proposal and press Send' });
        outcome = (await waitForSend(slug, tabId, sendWaitMs)) === 'sent' ? 'sent' : 'unsent';
      }

      // ---- 5. set bidded = 1 ---------------------------------------------
      if (outcome === 'sent') {
        sent++;
        await markSlugSent(sentKey(slug)); // local guard first: never send twice
        skip.push(slug); // and don't re-fetch it if the DB update below fails
        try {
          const ok = await markJobBidded(cfg, slug);
          if (!ok) log(`Sent ${job.title}, but no row matched ${slug} to mark bidded`, 'warn');
        } catch (err) {
          if (err instanceof SupabaseConfigError) throw err;
          log(`Sent ${job.title}, but could not set bidded = 1: ${err.message}`, 'warn');
        }
        log(`Bid sent: ${job.title}`, 'ok');
        await appendLog({ type: 'bid', slug, title: job.title });
        stats();
      } else {
        skip.push(slug);
        log(`Not sent (left at bidded = 0): ${job.title}`, 'warn');
      }
    } catch (err) {
      if (err instanceof SupabaseConfigError) throw err;
      const msg = err?.message || String(err);
      failed++;
      skip.push(slug);
      log(`Failed: ${job.title} — ${msg}`, 'error');
      await appendLog({ type: 'error', slug, title: job.title, reason: msg });
      stats();
      if (isFatalOpenAIError(msg)) throw new Error(`Stopped: ${msg}`);
    }

    // ---- 6. pause, then the next project -----------------------------------
    update({ phase: 'waiting', message: 'Next project in a moment…' });
    await keepAliveSleep(randMs(cfg.gapDelayMinSec, cfg.gapDelayMaxSec), isStopped);
  }
}
