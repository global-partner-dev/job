import { fetchProjectDetails, askQuestionPageUrl } from './workana.js';
import { generateQuestion } from './openai.js';
import { updateAsk, ensureAsk } from './supabase-asks.js';
import { markSlugAsked, appendLog } from './storage.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
// "Question sent" signal — the content script reports the real form submit on
// the Workana page, so a project only leaves the dashboard queue once you have
// actually pressed Send.
// ---------------------------------------------------------------------------
const sentWaiters = new Map(); // slug → resolve fn

/** Called from background.js when a content script reports a submitted question. */
export function noteQuestionSent(slug) {
  const resolve = sentWaiters.get(slug);
  if (resolve) resolve('sent');
}

/**
 * Resolve once the question is sent, the tab is closed, or we give up waiting.
 * @returns {Promise<'sent'|'closed'|'timeout'>}
 */
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
 * Open the Workana project page on its "Ask a question" tab and pre-fill the
 * message. Never submits — that click stays yours.
 * @returns {Promise<{tabId:number|null, filled:boolean}>}
 */
async function openAndFill(slug, question) {
  const tab = await chrome.tabs.create({ url: askQuestionPageUrl(slug), active: true });
  await waitForComplete(tab.id);

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: 'WR_FILL_QUESTION',
        slug,
        question,
      });
      if (resp?.ok) return { tabId: tab.id, filled: true };
    } catch {
      /* content script not ready yet */
    }
    await sleep(700);
  }
  return { tabId: tab.id, filled: false };
}

/**
 * Run the ask queue sequentially: write a question, open it pre-filled, wait
 * for you to send it, then move on to the next project.
 *
 * @param {{jobs:Array, settings:object, auth:object}} payload
 * @param {{emit:(p:object)=>void, isStopped:()=>boolean}} hooks
 * @returns {Promise<{total:number, sent:number, prepared:number, failed:number}>}
 */
export async function runAskQueue(payload, { emit, isStopped }) {
  const { jobs = [], settings = {}, auth = {} } = payload;
  let sent = 0;
  let prepared = 0;
  let failed = 0;

  const sendWaitMs = Math.max(30, Number(settings.sendWaitSec) || 300) * 1000;

  for (let i = 0; i < jobs.length; i++) {
    if (isStopped()) break;
    const job = jobs[i];
    const slug = job.slug;
    const emitP = (phase, extra = {}) => emit({ jobId: slug, phase, ...extra });

    try {
      emitP('prepare', { message: 'Writing the question…' });
      await ensureAsk(auth, slug);
      await updateAsk(auth, slug, { status: 'preparing' });

      // Top up thin rows from the detail page before writing.
      let project = job;
      if (!project.description || project.description.length < 40 || !project.clientName) {
        try {
          const details = await fetchProjectDetails(slug);
          project = {
            ...job,
            ...details,
            country: details.country || job.country,
            clientName: details.clientName || job.clientName,
          };
        } catch {
          /* fall back to what the web app sent */
        }
      }

      const question = await generateQuestion({
        apiKey: settings.openaiApiKey,
        model: settings.model,
        systemPrompt: settings.systemPrompt,
        portfolioUrl: settings.portfolioUrl,
        project,
      });

      // Pause between writing and opening the tab, so tabs don't appear the
      // instant a project is scraped.
      emitP('wait', { message: 'Opening in a moment…' });
      await keepAliveSleep(randMs(settings.genDelayMinSec, settings.genDelayMaxSec), isStopped);
      if (isStopped()) break;

      emitP('opening', { message: 'Opening Workana…' });
      const { tabId, filled } = await openAndFill(slug, question);

      await updateAsk(auth, slug, { status: 'prepared', question });
      prepared++;
      emitP('prepared', {
        question,
        message: filled
          ? 'Pre-filled — review it and press Send on Workana'
          : 'Opened — paste the question and press Send',
      });

      // The project stays in the dashboard queue until the form is really sent.
      const outcome = await waitForSend(slug, tabId, sendWaitMs);
      if (outcome === 'sent') {
        prepared--;
        sent++;
        await markSlugAsked(slug);
        await updateAsk(auth, slug, { status: 'sent', question, error: null });
        emitP('sent', { question, message: 'Question sent' });
        await appendLog({ type: 'ask', slug, title: job.title });
      } else {
        emitP('prepared', {
          question,
          message:
            outcome === 'closed'
              ? 'Tab closed before sending — still in the queue'
              : 'Not sent yet — still in the queue',
        });
      }
    } catch (err) {
      failed++;
      const msg = err?.message || String(err);
      await updateAsk(auth, slug, { status: 'failed', error: msg });
      emitP('failed', { message: msg });
      await appendLog({ type: 'error', slug, title: job.title, reason: msg });
    }

    // Delay between one project and the next.
    if (i < jobs.length - 1 && !isStopped()) {
      await keepAliveSleep(randMs(settings.gapDelayMinSec, settings.gapDelayMaxSec), isStopped);
    }
  }

  return { total: jobs.length, sent, prepared, failed };
}
