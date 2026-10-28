import { loadSettings, saveSettings } from '../lib/storage.js';
import { DEFAULT_PROMPT } from '../lib/default-prompt.js';

const $ = (id) => document.getElementById(id);

const TEXT_FIELDS = ['bidderRole', 'openaiApiKey', 'supabaseUrl', 'supabaseKey', 'model', 'portfolioUrl'];
const NUMBER_FIELDS = ['secondDelayMin', 'genDelayMinSec', 'genDelayMaxSec', 'gapDelayMinSec', 'gapDelayMaxSec', 'sendWaitSec'];

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
/** The wait only applies to the second bidder. */
function syncRole() {
  $('delay-row').hidden = $('bidderRole').value !== 'second';
}

function promptNote() {
  const custom = $('prompt').value.trim() !== DEFAULT_PROMPT.trim();
  $('prompt-note').textContent = custom ? 'Edited prompt.' : 'Built-in prompt.';
  $('reset-prompt').disabled = !custom;
}

async function fillForm() {
  const s = await loadSettings();
  for (const id of TEXT_FIELDS) $(id).value = s[id] ?? '';
  for (const id of NUMBER_FIELDS) $(id).value = s[id];
  $('autoSend').checked = !!s.autoSend;
  $('prompt').value = s.customPrompt.trim() || DEFAULT_PROMPT;
  promptNote();
  syncRole();
}

function readForm() {
  const patch = {};
  for (const id of TEXT_FIELDS) patch[id] = $(id).value.trim();
  for (const id of NUMBER_FIELDS) {
    const n = Number($(id).value);
    // The second bidder's wait may be 0 (= no wait); every other number must be positive.
    if (Number.isFinite(n) && n >= (id === 'secondDelayMin' ? 0 : 1)) patch[id] = n;
  }
  patch.autoSend = $('autoSend').checked;
  // Leaving the prompt as the built-in one stores nothing, so a later update to
  // the built-in text reaches everyone who never customised it.
  const prompt = $('prompt').value.trim();
  patch.customPrompt = prompt === DEFAULT_PROMPT.trim() ? '' : prompt;
  return patch;
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSettings(readForm()), 300);
}

/** Write the form to storage immediately (the worker reads it on Start). */
async function flushSave() {
  clearTimeout(saveTimer);
  await saveSettings(readForm());
}

document.querySelectorAll('input, textarea, select').forEach((el) => {
  el.addEventListener('input', scheduleSave);
  el.addEventListener('change', scheduleSave);
});
$('prompt').addEventListener('input', promptNote);
$('bidderRole').addEventListener('change', syncRole);
$('reset-prompt').addEventListener('click', () => {
  $('prompt').value = DEFAULT_PROMPT;
  promptNote();
  scheduleSave();
});

// ---------------------------------------------------------------------------
// Run state, pushed by the background worker
// ---------------------------------------------------------------------------
// Chrome shuts the background worker down after ~30s of inactivity, which closes
// this port. So the port is opened on demand: a click on Start or Stop connects
// again (waking the worker) instead of talking to a dead connection.
let port = null;
let lastSnapshot = null;

function connect() {
  port = chrome.runtime.connect({ name: 'panel' });
  port.onMessage.addListener((msg) => {
    if (msg?.type === 'SNAPSHOT') {
      lastSnapshot = msg.payload;
      render(msg.payload);
    }
  });
  port.onDisconnect.addListener(() => {
    port = null;
    void chrome.runtime.lastError;
    // A run keeps the worker awake, so a disconnect mid-run means it died.
    if (lastSnapshot?.state.running) {
      render({
        state: {
          ...lastSnapshot.state,
          running: false,
          phase: 'error',
          message: 'Background worker stopped — press Start to resume.',
        },
        logs: lastSnapshot.logs,
      });
    }
  });
}

/** Send a command, reconnecting first if the worker went to sleep. */
function sendCommand(msg) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (!port) connect();
      port.postMessage(msg);
      return;
    } catch {
      port = null;
    }
  }
  render({
    state: { running: false, phase: 'error', message: 'Could not reach the background worker. Reload the extension.', current: null, sent: 0, failed: 0 },
    logs: [],
  });
}

function render({ state, logs }) {
  $('status').textContent = state.message || '';
  $('status').dataset.phase = state.phase;
  $('sent').textContent = state.sent;
  $('failed').textContent = state.failed;
  $('start').disabled = state.running;
  $('stop').disabled = !state.running;

  const cur = state.current;
  $('current').hidden = !cur;
  if (cur) {
    $('current-link').textContent = cur.title;
    $('current-link').href = cur.url;
  }

  const list = $('log');
  list.replaceChildren(
    ...logs.map((entry) => {
      const li = document.createElement('li');
      li.dataset.level = entry.level;
      const time = document.createElement('time');
      time.textContent = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      li.append(time, entry.text);
      return li;
    }),
  );
}

$('start').addEventListener('click', async () => {
  await flushSave();
  sendCommand({ type: 'START' });
});
$('stop').addEventListener('click', () => sendCommand({ type: 'STOP' }));

connect();
fillForm();
