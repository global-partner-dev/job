import { askQuestionPageUrl } from './workana.js';
import { sleep } from './timing.js';

/**
 * Putting a message on Workana: open the project's message page in a real tab,
 * let the content script fill the box (and press Send), and watch for the real
 * submit. Shared by the bid queue and the follow-ups.
 */

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
export function waitForSend(slug, tabId, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      sentWaiters.delete(slug);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(timer);
      clearInterval(pinger);
      resolve(outcome);
    };
    const onRemoved = (id) => {
      if (id === tabId) finish('closed');
    };

    sentWaiters.set(slug, () => finish('sent'));
    chrome.tabs.onRemoved.addListener(onRemoved);
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    // No extension event fires while we wait for the click, so poke an API every
    // <30s or Chrome shuts the worker (and the whole run) down mid-wait.
    const pinger = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), 20000);
  });
}

/**
 * Open the project's message page, fill `text`, and (when autoSend is on) press
 * Send.
 * @returns {Promise<{tabId:number|null, filled:boolean, sent:boolean}>}
 */
export async function openAndFill(slug, text, autoSend) {
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

export async function closeTab(tabId) {
  if (tabId == null) return;
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    /* already gone */
  }
}
