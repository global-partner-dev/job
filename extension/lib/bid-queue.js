import {
  fetchProjectDetails,
  fetchPlaceBidFormMeta,
  submitPlaceBid,
  normalizeFreelancerSlug,
  placeBidPageUrl,
} from './workana.js';
import { generateProposal } from './openai.js';
import { computeBidPricing } from './pricing.js';
import { getCachedBidForm } from './bid-cache.js';
import { updateBid } from './supabase-bids.js';
import { markSlugBidded, appendLog } from './storage.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sleep that keeps the MV3 service worker alive. An idle connected port does NOT
 * reset the ~30s idle timer (Chrome 114+), so we poke an extension API every
 * <30s to keep the worker running through long (10–40s) delays.
 */
async function keepAliveSleep(ms) {
  const PING_MS = 20000;
  const end = Date.now() + ms;
  while (Date.now() < end) {
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
    const done = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') done();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((t) => {
      if (t?.status === 'complete') done();
    });
    setTimeout(done, timeoutMs);
  });
}

/** Manual mode: open the Workana bid page and pre-fill it (never submits). */
async function openAndFill(slug, values) {
  const tab = await chrome.tabs.create({ url: placeBidPageUrl(slug), active: true });
  await waitForComplete(tab.id);
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, { type: 'WB_FILL_BID', ...values });
      if (resp?.ok) return true;
    } catch {
      /* content script not ready yet */
    }
    await sleep(700);
  }
  return false;
}

/**
 * Run the selection-driven bid queue sequentially with the configured delays.
 * @param {{jobs:Array, settings:object, auth:object}} payload
 * @param {{emit:(p:object)=>void, isStopped:()=>boolean}} hooks
 * @returns {Promise<{total:number, placed:number, failed:number}>}
 */
export async function runBidQueue(payload, { emit, isStopped }) {
  const { jobs = [], settings = {}, auth = {} } = payload;
  let placed = 0;
  let failed = 0;

  for (let i = 0; i < jobs.length; i++) {
    if (isStopped()) break;
    const job = jobs[i];
    const slug = job.slug;
    const emitP = (phase, extra = {}) => emit({ jobId: slug, phase, ...extra });

    try {
      emitP('prepare', { message: 'Writing proposal…' });

      // Enrich with the full detail page if the passed data is thin.
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
          /* use the data the web app sent */
        }
      }

      const proposal = await generateProposal({
        apiKey: settings.openaiApiKey,
        model: settings.model,
        systemPrompt: settings.systemPrompt,
        portfolioUrl: settings.portfolioUrl,
        project,
      });

      const { amount, deliveryTime } = await computeBidPricing({
        apiKey: settings.openaiApiKey,
        model: settings.model,
        project,
        settings,
      });

      // Delay after writing the proposal, before submitting.
      emitP('wait', { amount, deliveryTime, message: 'Waiting before submit…' });
      await keepAliveSleep(randMs(settings.genDelayMinSec, settings.genDelayMaxSec));
      if (isStopped()) break;

      if (settings.submitMode === 'manual') {
        const filled = await openAndFill(slug, {
          proposal,
          amount,
          deliveryTime,
          freelancerSlug: settings.freelancerSlug,
        });
        await updateBid(auth, slug, {
          status: 'manual',
          amount,
          delivery_time: deliveryTime,
          proposal,
        });
        emitP('manual', {
          amount,
          deliveryTime,
          message: filled
            ? 'Opened & pre-filled — review and click Place bid'
            : 'Opened — paste the proposal and place the bid',
        });
      } else {
        emitP('submit', { amount, deliveryTime, message: 'Placing bid…' });
        await updateBid(auth, slug, {
          status: 'placing',
          amount,
          delivery_time: deliveryTime,
          proposal,
        });
        const cached = await getCachedBidForm(slug);
        const form = await fetchPlaceBidFormMeta(slug, settings.freelancerSlug, cached);
        normalizeFreelancerSlug(settings.freelancerSlug, form.freelancerSlug);
        const result = await submitPlaceBid({ form, content: proposal, amount, deliveryTime, slug });
        await markSlugBidded(slug);
        await updateBid(auth, slug, {
          status: 'placed',
          amount,
          delivery_time: deliveryTime,
          proposal,
          bid_url: result.url,
          error: null,
        });
        placed++;
        emitP('placed', { amount, deliveryTime, message: `Bid placed (USD ${amount})` });
      }
    } catch (err) {
      failed++;
      const msg = err?.message || String(err);
      await updateBid(auth, slug, { status: 'failed', error: msg });
      emitP('failed', { message: msg });
      await appendLog({ type: 'error', slug, title: job.title, reason: msg });
    }

    // Delay between one bid and the next.
    if (i < jobs.length - 1 && !isStopped()) {
      await keepAliveSleep(randMs(settings.gapDelayMinSec, settings.gapDelayMaxSec));
    }
  }

  return { total: jobs.length, placed, failed };
}
