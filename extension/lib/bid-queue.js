import { fetchProjectDetails, projectPageUrl } from './workana.js';
import { generateQuestion } from './openai.js';
import { fetchNextJob, markJobBidded, markJobSkipped, SupabaseConfigError } from './supabase-jobs.js';
import { getSentSlugs, markSlugSent, appendLog } from './storage.js';
import { sleep, keepAliveSleep, randMs } from './timing.js';
import { openAndFill, waitForSend, closeTab } from './tab-send.js';
import { scheduleFollowUp } from './followups.js';
import { CATEGORIES, isPreviewText, looksWorkanaWritten, screenProject } from './project-check.js';

/** How long to wait before looking again once the queue is empty. */
const EMPTY_POLL_MS = 30000;
/** The second bidder's wait before re-reading a project whose full brief it couldn't load. */
const FULL_TEXT_RETRY_MS = 15 * 60 * 1000;

/** Errors that mean every further project would fail the same way. */
function isFatalOpenAIError(msg) {
  return /OpenAI (401|403|404)\b|insufficient_quota|invalid_api_key|billing_not_active|model_not_found|does not exist or you do not have access|Unsupported (parameter|value)|No OpenAI API key/i.test(msg);
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
    clientName: row.client_name || '',
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
  // Second bidder: ids whose full brief couldn't be loaded, and when to try again.
  const retryAt = new Map();
  const skipNow = () => {
    for (const [id, at] of retryAt) if (at <= Date.now()) retryAt.delete(id);
    return [...skip, ...retryAt.keys()];
  };
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
      row = await fetchNextJob(cfg, skipNow());
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
      // The scraper often only gets the listing preview (~350 chars), so read
      // the full brief from Workana in this (logged-in) browser.
      let project = toProject(row);
      let fullText = row.ai_category !== 'unjudged_truncated' && !isPreviewText(project.description);
      let pageError = '';
      if (!fullText) {
        try {
          const details = await fetchProjectDetails(slug);
          for (const [k, v] of Object.entries(details || {})) {
            const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
            if (!empty) project[k] = v;
          }
          if (details?.description) fullText = true;
          else pageError = 'no description found on the project page';
        } catch (err) {
          pageError = err?.message || String(err); // the first bidder falls back to the database text
        }
      }

      // ---- 2b. second bidder: only bid where it is worth it ----------------
      if (cfg.slot === 2) {
        update({ phase: 'preparing', message: 'Checking the project…' });
        let verdict = null;
        if (looksWorkanaWritten(project.description)) {
          verdict = { bid: false, reason: 'written by Workana’s assistant ("The client is looking for…")' };
        } else if (fullText) {
          verdict = await screenProject({ apiKey: cfg.openaiApiKey, model: cfg.model, project });
        }

        if (!verdict) {
          // A preview can't show whether the scope is clear: try again later.
          retryAt.set(slug, Date.now() + FULL_TEXT_RETRY_MS);
          log(`${job.title}: could not read the full brief (${pageError}) — trying again in 15 min`, 'warn');
          await keepAliveSleep(randMs(2, 5), isStopped);
          continue;
        }
        if (!verdict.bid) {
          skip.push(slug);
          try {
            await markJobSkipped(cfg, slug, verdict.reason);
          } catch (err) {
            if (err instanceof SupabaseConfigError) throw err;
            log(`Could not mark ${slug} as skipped: ${err.message}`, 'warn');
          }
          log(`Skipped: ${job.title} — ${verdict.reason}`, 'info');
          await appendLog({ type: 'skip', slug, title: job.title, reason: verdict.reason });
          await keepAliveSleep(randMs(2, 5), isStopped);
          continue;
        }
        log(`Worth a bid (${CATEGORIES[verdict.category]}): ${job.title}`, 'info');
      }

      // ---- 3. write the proposal -----------------------------------------
      update({ phase: 'writing', message: 'Writing the proposal…' });
      const text = await generateQuestion({
        apiKey: cfg.openaiApiKey,
        model: cfg.model,
        systemPrompt: cfg.systemPrompt,
        portfolioUrl: cfg.portfolioUrl,
        project,
        greetByName: cfg.slot === 2,
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
        try {
          if (await scheduleFollowUp(cfg, { slug, title: job.title })) {
            log(`Follow-up queued in ${cfg.followUpHours} h: ${job.title}`, 'info');
          }
        } catch (err) {
          log(`Could not queue the follow-up for ${job.title}: ${err.message}`, 'warn');
        }
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
