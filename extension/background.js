import { parseBudgetRange } from './lib/parse.js';
import { isCountryAllowed } from './lib/countries.js';
import { passesClientHistoryFilter, needsClientStats } from './lib/client-filter.js';
import {
  getSettings,
  markSlugBidded,
  getBiddedSlugs,
  getLastSeenLatestSlug,
  setLastSeenLatestSlug,
  clearBidTracking,
  appendLog,
  getPendingSend,
  setPendingSend,
  removePendingSend,
  DEFAULT_SETTINGS,
} from './lib/storage.js';
import { generateProposal } from './lib/openai.js';
import { computeBidAmount } from './lib/bid-amount.js';
import {
  fetchPlaceBidFormMeta,
  fetchProjectDetails,
  submitPlaceBid,
  normalizeFreelancerSlug,
} from './lib/workana.js';
import { fetchLatestJobFromApi } from './lib/dashboard.js';
import { cookieHeaderFor } from './lib/cookies.js';
import { getCachedBidForm, setCachedBidForm } from './lib/bid-cache.js';

let bidInProgress = false;
let pollTimeoutId = null;
/** Alarm name prefix for delayed proposal sends ("send:<slug>"). */
const SEND_ALARM_PREFIX = 'send:';
/** Max retries when a delayed send can't run yet (e.g. not logged in). */
const MAX_SEND_ATTEMPTS = 5;
/** Latest job that arrived while a bid was running; processed when the lock clears. */
let pendingLatestJob = null;
const PENDING_LATEST_KEY = 'pendingLatestJob';

async function setPendingLatestJob(job) {
  pendingLatestJob = job || null;
  await chrome.storage.local.set({ [PENDING_LATEST_KEY]: pendingLatestJob });
}

async function getPendingLatestJob() {
  if (pendingLatestJob) return pendingLatestJob;
  const { [PENDING_LATEST_KEY]: stored } = await chrome.storage.local.get(PENDING_LATEST_KEY);
  pendingLatestJob = stored || null;
  return pendingLatestJob;
}

async function clearPendingLatestJob() {
  pendingLatestJob = null;
  await chrome.storage.local.remove(PENDING_LATEST_KEY);
}

function passesFilters(job, settings) {
  const { min, max } = parseBudgetRange(job.budget);
  if (max < settings.minBudget || min > settings.maxBudget) {
    return { ok: false, reason: `Budget ${job.budget} outside ${settings.minBudget}-${settings.maxBudget}` };
  }
  if (!isCountryAllowed(job.country)) {
    return { ok: false, reason: `Country not allowed: ${job.country}` };
  }
  return { ok: true };
}

/**
 * Filter + bid for one project (no lock; caller owns concurrency).
 */
async function attemptLatestProject(job, settings) {
  const bidded = await getBiddedSlugs();
  if (bidded.has(job.slug)) {
    await appendLog({
      type: 'skip',
      slug: job.slug,
      title: job.title,
      reason: 'Already bid on this project',
    });
    return { status: 'skip', reason: 'already_bidded' };
  }
  return processJob(job, settings);
}

/** Process jobs that were queued while bidInProgress was true. */
async function drainPendingQueue(settings) {
  while (true) {
    const job = await getPendingLatestJob();
    if (!job) break;
    await clearPendingLatestJob();

    await appendLog({
      type: 'info',
      slug: job.slug,
      title: job.title,
      reason: 'Processing queued project (previous bid finished)',
    });

    bidInProgress = true;
    try {
      await attemptLatestProject(job, settings);
    } catch (err) {
      await appendLog({
        type: 'error',
        slug: job.slug,
        title: job.title,
        reason: err.message || String(err),
      });
    } finally {
      bidInProgress = false;
    }
  }
}

/**
 * Runs when dashboard latest job slug changes. Bids at most once per slug.
 */
async function onLatestProjectChanged(job, settings) {
  if (bidInProgress) {
    await setPendingLatestJob(job);
    await appendLog({
      type: 'info',
      slug: job.slug,
      title: job.title,
      reason: 'Queued — bid in progress; will run when current bid finishes',
    });
    return { status: 'queued', reason: 'bid_in_progress' };
  }

  bidInProgress = true;
  try {
    return await attemptLatestProject(job, settings);
  } finally {
    bidInProgress = false;
    await drainPendingQueue(settings);
  }
}

function applyClientHistorySkip(job) {
  const clientFilter = passesClientHistoryFilter(job);
  if (!clientFilter.ok) {
    return { status: 'skip', reason: clientFilter.reason, logReason: clientFilter.reason };
  }
  return null;
}

async function processJob(job, settings) {
  const filter = passesFilters(job, settings);
  if (!filter.ok) {
    await appendLog({ type: 'skip', slug: job.slug, title: job.title, reason: filter.reason });
    return { status: 'skip', reason: filter.reason };
  }

  const clientSkipEarly = applyClientHistorySkip(job);
  if (clientSkipEarly) {
    await appendLog({
      type: 'skip',
      slug: job.slug,
      title: job.title,
      reason: clientSkipEarly.logReason,
    });
    return clientSkipEarly;
  }

  let project = job;
  const needsDetails =
    !project.description ||
    !project.clientName ||
    needsClientStats(project);

  if (needsDetails) {
    try {
      const details = await fetchProjectDetails(job.slug);
      project = {
        ...job,
        ...details,
        country: details.country || job.country,
        clientName: details.clientName || job.clientName || '',
        clientProjectsPublished:
          details.clientProjectsPublished ?? job.clientProjectsPublished ?? null,
        clientProjectsPaid: details.clientProjectsPaid ?? job.clientProjectsPaid ?? null,
      };
    } catch (e) {
      console.warn('Project fetch failed, using dashboard data', e);
    }
  }

  const filter2 = passesFilters(project, settings);
  if (!filter2.ok) {
    await appendLog({ type: 'skip', slug: job.slug, title: project.title, reason: filter2.reason });
    return { status: 'skip', reason: filter2.reason };
  }

  const clientSkipLate = applyClientHistorySkip(project);
  if (clientSkipLate) {
    await appendLog({
      type: 'skip',
      slug: job.slug,
      title: project.title,
      reason: clientSkipLate.logReason,
    });
    return clientSkipLate;
  }

  const name = (settings.freelancerName || '').trim();
  if (!name) {
    throw new Error('Set your display name in Filters (used in proposal greetings, e.g. Danil Alexander).');
  }

  const proposal = await generateProposal({
    apiKey: settings.openaiApiKey,
    model: settings.model,
    systemPrompt: settings.systemPrompt,
    freelancerName: name,
    project,
  });

  // Defer the actual submission so it goes out ~sendDelaySec later, WITHOUT
  // holding the bid lock. The form (CSRF/dcst-input) is fetched at send time
  // because those tokens expire quickly.
  const delaySec = Math.max(5, Number(settings.sendDelaySec) || 60);
  await setPendingSend(job.slug, {
    slug: job.slug,
    title: project.title,
    budget: project.budget || '',
    proposal,
    freelancerSlug: settings.freelancerSlug || '',
    createdAt: Date.now(),
    attempts: 0,
  });
  chrome.alarms.create(`${SEND_ALARM_PREFIX}${job.slug}`, { when: Date.now() + delaySec * 1000 });
  await appendLog({
    type: 'info',
    slug: job.slug,
    title: project.title,
    reason: `Bid ready — submitting in ~${delaySec}s`,
  });
  return { status: 'scheduled', title: project.title, delaySec };
}

/**
 * Fires when a delayed-send alarm triggers. Fetches a fresh bid form and submits.
 * Runs independently of the bid lock, so it never blocks the next bid.
 * @param {string} slug
 */
async function runScheduledSend(slug) {
  const record = await getPendingSend(slug);
  if (!record) return;

  const bidded = await getBiddedSlugs();
  if (bidded.has(slug)) {
    await removePendingSend(slug);
    return;
  }

  const cookie = await cookieHeaderFor('https://www.workana.com/');
  if (!cookie) {
    const attempts = (record.attempts || 0) + 1;
    if (attempts >= MAX_SEND_ATTEMPTS) {
      await removePendingSend(slug);
      await appendLog({
        type: 'error',
        slug,
        title: record.title,
        reason: 'Delayed send aborted: not logged in to Workana after several retries.',
      });
      return;
    }
    await setPendingSend(slug, { ...record, attempts });
    chrome.alarms.create(`${SEND_ALARM_PREFIX}${slug}`, { when: Date.now() + 60 * 1000 });
    await appendLog({
      type: 'info',
      slug,
      title: record.title,
      reason: 'Delayed send waiting: not logged in to Workana; retrying in 60s.',
    });
    return;
  }

  try {
    const settings = await getSettings();
    const cachedForm = await getCachedBidForm(slug);
    const form = await fetchPlaceBidFormMeta(slug, record.freelancerSlug, cachedForm);
    normalizeFreelancerSlug(record.freelancerSlug, form.freelancerSlug);

    const amount = computeBidAmount(record.budget, settings, form.minAmount);
    const deliveryTime = (settings.bidDeliveryTime || '7 days').trim() || '7 days';

    const result = await submitPlaceBid({
      form,
      content: record.proposal,
      amount,
      deliveryTime,
      slug,
    });

    await markSlugBidded(slug);
    await removePendingSend(slug);
    await appendLog({
      type: 'bid',
      slug,
      title: record.title,
      message: `${record.proposal.slice(0, 100)}… (USD ${amount})`,
      url: result.url,
    });

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Workana bid placed',
      message: `${record.title} — USD ${amount}`,
    });
  } catch (err) {
    await removePendingSend(slug);
    await appendLog({
      type: 'error',
      slug,
      title: record.title,
      reason: `Delayed send failed: ${err.message || err}`,
    });
  }
}

/**
 * Poll workana-bot API: bid only when the #1 latest project slug changes.
 */
export async function checkLatestJobUpdate() {
  const settings = await getSettings();
  if (!settings.enabled) {
    return { ok: false, error: 'Bot is disabled' };
  }
  if (!settings.openaiApiKey) {
    return { ok: false, error: 'OpenAI API key not set' };
  }

  const workanaCookies = await cookieHeaderFor('https://www.workana.com/');
  if (!workanaCookies) {
    await appendLog({
      type: 'error',
      reason: 'No Workana login cookies. Open workana.com and sign in.',
    });
    return { ok: false, error: 'Not logged in to Workana' };
  }

  // Recover queued jobs even if the service worker restarted.
  if (!bidInProgress) {
    const pending = await getPendingLatestJob();
    if (pending?.slug) {
      await appendLog({
        type: 'info',
        slug: pending.slug,
        title: pending.title,
        reason: 'Recovered queued project from storage',
      });
      bidInProgress = true;
      try {
        const result = await attemptLatestProject(pending, settings);
        return { ok: true, result, slug: pending.slug };
      } catch (err) {
        await appendLog({
          type: 'error',
          slug: pending.slug,
          title: pending.title,
          reason: err.message || String(err),
        });
        return { ok: false, error: err.message, slug: pending.slug };
      } finally {
        bidInProgress = false;
        await clearPendingLatestJob();
        await drainPendingQueue(settings);
      }
    }
  }

  const job = await fetchLatestJobFromApi();
  if (!job?.slug) {
    return { ok: true, note: 'No jobs from API' };
  }

  const previousSlug = await getLastSeenLatestSlug();

  if (previousSlug === job.slug) {
    return { ok: true, note: 'Latest project unchanged', slug: job.slug };
  }

  await setLastSeenLatestSlug(job.slug);
  await appendLog({
    type: 'info',
    slug: job.slug,
    title: job.title,
    reason: previousSlug
      ? `New latest project (was: ${previousSlug.slice(0, 40)}…)`
      : 'First latest project detected',
  });

  try {
    const result = await onLatestProjectChanged(job, settings);
    return { ok: true, result, slug: job.slug };
  } catch (err) {
    await appendLog({
      type: 'error',
      slug: job.slug,
      title: job.title,
      reason: err.message || String(err),
    });
    return { ok: false, error: err.message, slug: job.slug };
  }
}

export async function schedulePolling() {
  if (pollTimeoutId) {
    clearTimeout(pollTimeoutId);
    pollTimeoutId = null;
  }

  const settings = await getSettings();
  if (!settings.enabled) return;

  const intervalMs = Math.max(5, settings.pollIntervalSec || 15) * 1000;

  const tick = async () => {
    try {
      await checkLatestJobUpdate();
    } catch (e) {
      console.error('[Workana Auto Bid] poll error', e);
    }
    const s = await getSettings();
    if (!s.enabled) return;
    const ms = Math.max(5, s.pollIntervalSec || 15) * 1000;
    pollTimeoutId = setTimeout(tick, ms);
  };

  pollTimeoutId = setTimeout(tick, 500);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'CACHE_BID_FORM' && msg.slug && msg.form) {
    setCachedBidForm(msg.slug, msg.form).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'CHECK_LATEST') {
    checkLatestJobUpdate().then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'POLL_NOW') {
    checkLatestJobUpdate().then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'CLEAR_PROCESSED') {
    clearBidTracking().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'RESCHEDULE_POLL') {
    schedulePolling().then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(SEND_ALARM_PREFIX)) {
    const slug = alarm.name.slice(SEND_ALARM_PREFIX.length);
    runScheduledSend(slug).catch((e) => console.error('[Workana Auto Bid] send alarm error', e));
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.enabled || changes.pollIntervalSec)) {
    schedulePolling();
  }
});

async function migratePromptIfNeeded() {
  const { promptVersion = 0 } = await chrome.storage.sync.get(['promptVersion']);
  if (promptVersion < DEFAULT_SETTINGS.promptVersion) {
    await chrome.storage.sync.set({
      systemPrompt: DEFAULT_SETTINGS.systemPrompt,
      promptVersion: DEFAULT_SETTINGS.promptVersion,
    });
  }
}

chrome.runtime.onStartup.addListener(() => {
  migratePromptIfNeeded();
  schedulePolling();
});
chrome.runtime.onInstalled.addListener(() => {
  migratePromptIfNeeded();
  schedulePolling();
});

schedulePolling();
