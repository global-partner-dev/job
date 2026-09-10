/**
 * AskBot background worker.
 *
 * The Workana Radar web app drives everything: while its auto-ask toggle is on
 * it hands over the newest unasked project, the settings, and the user's
 * Supabase session through the bridge content script, which opens a long-lived
 * 'askbot' port to this worker. We run the ask queue here (only place with
 * Workana cookies + tabs) and stream progress back over the port. Long delays
 * are covered by keepAliveSleep() in ask-queue.js, which pokes an extension API
 * every <30s so the MV3 worker isn't idle-terminated.
 */
import { runAskQueue, noteQuestionSent } from './lib/ask-queue.js';

let running = false;
let stopFlag = false;

// The Workana content script reports the real form submit, which is what moves a
// project out of the dashboard queue.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'WR_QUESTION_SENT' && msg.slug) {
    noteQuestionSent(msg.slug);
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'askbot') return;

  port.onMessage.addListener(async (msg) => {
    if (msg?.type === 'STOP') {
      stopFlag = true;
      return;
    }
    if (msg?.type !== 'START' || !msg.payload) return;

    if (running) {
      safePost(port, {
        type: 'DONE',
        payload: { total: 0, sent: 0, prepared: 0, failed: 0, error: 'A run is already in progress.' },
      });
      return;
    }

    running = true;
    stopFlag = false;
    const emit = (p) => safePost(port, { type: 'PROGRESS', payload: p });

    try {
      const summary = await runAskQueue(msg.payload, { emit, isStopped: () => stopFlag });
      safePost(port, { type: 'DONE', payload: summary });
    } catch (err) {
      safePost(port, {
        type: 'DONE',
        payload: { total: 0, sent: 0, prepared: 0, failed: 0, error: String(err?.message || err) },
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
