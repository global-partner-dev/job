/**
 * BidBot background worker.
 *
 * The Workana Radar web app drives everything: it hands over the selected jobs,
 * settings, and the user's Supabase session through the bridge content script,
 * which opens a long-lived 'bidbot' port to this worker. We run the bid queue
 * here (only place with Workana cookies + tabs) and stream progress back over
 * the port. Long delays are covered by keepAliveSleep() in bid-queue.js, which
 * pokes an extension API every <30s so the MV3 worker isn't idle-terminated.
 */
import { setCachedBidForm } from './lib/bid-cache.js';
import { runBidQueue } from './lib/bid-queue.js';

let running = false;
let stopFlag = false;

// Token capture from workana-bid.js (live-DOM CSRF/dcst tokens).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'CACHE_BID_FORM' && msg.slug && msg.form) {
    setCachedBidForm(msg.slug, msg.form).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'bidbot') return;

  port.onMessage.addListener(async (msg) => {
    if (msg?.type === 'STOP') {
      stopFlag = true;
      return;
    }
    if (msg?.type !== 'START' || !msg.payload) return;

    if (running) {
      safePost(port, {
        type: 'DONE',
        payload: { total: 0, placed: 0, failed: 0, error: 'A bid run is already in progress.' },
      });
      return;
    }

    running = true;
    stopFlag = false;
    const emit = (p) => safePost(port, { type: 'PROGRESS', payload: p });

    try {
      const summary = await runBidQueue(msg.payload, { emit, isStopped: () => stopFlag });
      safePost(port, { type: 'DONE', payload: summary });
    } catch (err) {
      safePost(port, {
        type: 'DONE',
        payload: { total: 0, placed: 0, failed: 0, error: String(err?.message || err) },
      });
    } finally {
      running = false;
    }
  });

  // If the web app tab closes or navigates, stop the run.
  port.onDisconnect.addListener(() => {
    stopFlag = true;
  });
});

function safePost(port, message) {
  try {
    port.postMessage(message);
  } catch {
    /* port may have disconnected */
  }
}
