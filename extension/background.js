/**
 * Workana Radar bid bot — background worker.
 *
 * Owns two things:
 *  1. The side panel's lifecycle: clicking the toolbar icon opens or closes the
 *     panel on the current Workana tab (content/panel.js draws it).
 *  2. The bid queue: it runs here (the only place with Workana cookies + tabs),
 *     independent of the panel, so reloading the page doesn't interrupt it. The
 *     panel connects over a port, receives state snapshots, and sends START/STOP.
 */
import { runBidQueue, noteQuestionSent } from './lib/bid-queue.js';
import { getRunSettings } from './lib/storage.js';

const WORKANA_JOBS_URL = 'https://www.workana.com/jobs';
const PANEL_TABS_KEY = 'panelTabs';
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
  log('Started.', 'info');
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
// Panel placement — which tabs currently show the side panel
// ---------------------------------------------------------------------------
async function panelTabs() {
  const { [PANEL_TABS_KEY]: ids = [] } = await chrome.storage.session.get(PANEL_TABS_KEY);
  return new Set(ids);
}

async function setPanelTab(tabId, open) {
  const ids = await panelTabs();
  if (open) ids.add(tabId);
  else ids.delete(tabId);
  await chrome.storage.session.set({ [PANEL_TABS_KEY]: [...ids] });
}

const isWorkana = (url) => /^https:\/\/www\.workana\.com\//i.test(url || '');

chrome.action.onClicked.addListener(async (tab) => {
  // Not on Workana: open it in a new tab with the panel already showing.
  if (!isWorkana(tab.url)) {
    const created = await chrome.tabs.create({ url: WORKANA_JOBS_URL });
    await setPanelTab(created.id, true);
    return;
  }

  const open = !(await panelTabs()).has(tab.id);
  await setPanelTab(tab.id, open);
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'WR_PANEL_SET', open });
  } catch {
    // Tab was open before the extension was installed/reloaded, so it has no
    // content script yet. Inject it; it asks WR_PANEL_WANTED and shows itself.
    if (open) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/panel.js'] });
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  setPanelTab(tabId, false);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'WR_QUESTION_SENT' && msg.slug) {
    noteQuestionSent(msg.slug);
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === 'WR_PANEL_WANTED') {
    const tabId = sender.tab?.id;
    panelTabs().then((ids) => sendResponse({ open: tabId != null && ids.has(tabId) }));
    return true; // async response
  }
  if (msg?.type === 'WR_PANEL_CLOSED') {
    if (sender.tab?.id != null) setPanelTab(sender.tab.id, false);
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
