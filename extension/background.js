/**
 * Workana Radar bid bot — background worker.
 *
 * Owns two things:
 *  1. The side panel: Chrome's native side panel (panel/panel.html), opened from
 *     the toolbar icon. Chrome itself narrows the Workana page to make room, so
 *     the site's layout adapts instead of being covered.
 *  2. The bid queue: it runs here (the only place with Workana cookies + tabs),
 *     independent of the panel, so closing the panel or reloading the page
 *     doesn't interrupt it. The panel connects over a port, receives state
 *     snapshots, and sends START/STOP.
 */
import { runBidQueue, noteQuestionSent } from './lib/bid-queue.js';
import { getRunSettings } from './lib/storage.js';

const MAX_LOG = 60;

// ---------------------------------------------------------------------------
// Queue state, mirrored to every connected panel
// ---------------------------------------------------------------------------
const IDLE = { running: false, phase: 'idle', message: 'Ready.', current: null, sent: 0, failed: 0 };
let state = { ...IDLE };
let logs = [];
let stopFlag = false;
const ports = new Set();

function broadcast() {
  const msg = { type: 'SNAPSHOT', payload: { state, logs } };
  for (const port of ports) {
    try {
      port.postMessage(msg);
    } catch {
      ports.delete(port);
    }
  }
}

function update(patch) {
  state = { ...state, ...patch };
  broadcast();
}

function log(text, level = 'info') {
  logs = [{ at: Date.now(), level, text }, ...logs].slice(0, MAX_LOG);
  broadcast();
}

async function startRun() {
  if (state.running) return;

  const cfg = await getRunSettings();
  const missing = [];
  if (!cfg.supabaseUrl) missing.push('Supabase URL');
  if (!cfg.supabaseKey) missing.push('Supabase publishable key');
  if (!cfg.openaiApiKey) missing.push('OpenAI API key');
  if (missing.length) {
    log(`Fill in: ${missing.join(', ')}.`, 'error');
    update({ phase: 'error', message: `Missing ${missing.join(', ')}` });
    return;
  }

  stopFlag = false;
  state = { ...IDLE, running: true, phase: 'preparing', message: 'Starting…' };
  log(
    cfg.slot === 2
      ? `Started as the second bidder (waits ${cfg.delayMin} min after a project is stored).`
      : 'Started as the first bidder (bids right away).',
    'info',
  );
  broadcast();

  try {
    await runBidQueue(cfg, { update, log, isStopped: () => stopFlag });
    log('Stopped.', 'info');
    update({ running: false, phase: 'idle', message: 'Stopped.', current: null });
  } catch (err) {
    const msg = err?.message || String(err);
    log(msg, 'error');
    update({ running: false, phase: 'error', message: msg, current: null });
  }
}

function stopRun() {
  if (!state.running) return;
  stopFlag = true;
  update({ message: 'Stopping after the current step…' });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'panel') return;
  ports.add(port);
  port.postMessage({ type: 'SNAPSHOT', payload: { state, logs } });

  port.onMessage.addListener((msg) => {
    if (msg?.type === 'START') startRun();
    else if (msg?.type === 'STOP') stopRun();
  });
  port.onDisconnect.addListener(() => ports.delete(port));
});

// ---------------------------------------------------------------------------
// Toolbar icon opens/closes the side panel
// ---------------------------------------------------------------------------
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn('[BidBot] side panel setup failed', err));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'WR_QUESTION_SENT' && msg.slug) {
    noteQuestionSent(msg.slug);
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
