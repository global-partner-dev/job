import { loadSettings, saveSettings, getFollowUps, FOLLOWUP_KEY } from '../lib/storage.js';
import { defaultPromptFor } from '../lib/default-prompt.js';

const $ = (id) => document.getElementById(id);

const TEXT_FIELDS = ['openaiApiKey', 'supabaseUrl', 'supabaseKey', 'model', 'portfolioUrl', 'followUpMessage'];
const NUMBER_FIELDS = ['secondDelayMin', 'followUpHours', 'genDelayMinSec', 'genDelayMaxSec', 'gapDelayMinSec', 'gapDelayMaxSec', 'sendWaitSec'];

/** Whether `n` is acceptable for a field: the second bidder's wait may be 0 (= no wait), the follow-up delay is any positive number of hours, the rest at least 1. */
const validNumber = (id, n) =>
  Number.isFinite(n) && (id === 'secondDelayMin' ? n >= 0 : id === 'followUpHours' ? n > 0 : n >= 1);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const roleRadios = () => [...document.querySelectorAll('input[name="bidderRole"]')];
const getRole = () => roleRadios().find((r) => r.checked)?.value ?? 'first';

/** The wait only applies to the second bidder. */
function syncRole() {
  $('delay-row').hidden = getRole() !== 'second';
}

/** The built-in prompt for the bidder role currently chosen. */
const builtIn = () => defaultPromptFor(getRole());
let shownRole = 'first'; // the role whose built-in prompt the box was last filled for

function promptNote() {
  const custom = $('prompt').value.trim() !== builtIn().trim();
  $('prompt-note').textContent = custom ? 'Edited prompt.' : `Built-in prompt (${getRole()} bidder).`;
  $('reset-prompt').disabled = !custom;
}

/** Switching role swaps an untouched prompt for the other built-in; an edited one stays. */
function followRoleWithPrompt() {
  const previous = defaultPromptFor(shownRole);
  shownRole = getRole();
  if ($('prompt').value.trim() === previous.trim()) $('prompt').value = builtIn();
  promptNote();
}

async function fillForm() {
  const s = await loadSettings();
  for (const r of roleRadios()) r.checked = r.value === (s.bidderRole === 'second' ? 'second' : 'first');
  for (const id of TEXT_FIELDS) $(id).value = s[id] ?? '';
  for (const id of NUMBER_FIELDS) $(id).value = s[id];
  $('autoSend').checked = !!s.autoSend;
  shownRole = getRole();
  $('prompt').value = s.customPrompt.trim() || builtIn();
  promptNote();
  syncRole();
}

function readForm() {
  const patch = { bidderRole: getRole() };
  for (const id of TEXT_FIELDS) patch[id] = $(id).value.trim();
  for (const id of NUMBER_FIELDS) {
    const n = Number($(id).value);
    if (validNumber(id, n)) patch[id] = n;
  }
  patch.autoSend = $('autoSend').checked;
  // Leaving the prompt as the built-in one stores nothing, so a later update to
  // the built-in text reaches everyone who never customised it.
  const prompt = $('prompt').value.trim();
  patch.customPrompt = prompt === builtIn().trim() ? '' : prompt;
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

document.querySelectorAll('input, textarea').forEach((el) => {
  el.addEventListener('input', scheduleSave);
  el.addEventListener('change', scheduleSave);
});
$('prompt').addEventListener('input', promptNote);
roleRadios().forEach((r) =>
  r.addEventListener('change', () => {
    syncRole();
    followRoleWithPrompt();
  }),
);
$('reset-prompt').addEventListener('click', () => {
  $('prompt').value = builtIn();
  promptNote();
  scheduleSave();
});

// ---------------------------------------------------------------------------
// Follow-ups waiting to go out (read straight from storage; the worker owns them)
// ---------------------------------------------------------------------------
function formatIn(ms) {
  const min = Math.ceil(ms / 60000);
  if (min <= 1) return 'under a minute';
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

async function renderFollowUps() {
  const list = await getFollowUps();
  $('cancel-followups').disabled = !list.length;
  if (!list.length) {
    $('followup-note').textContent = 'None waiting.';
    return;
  }
  const next = Math.min(...list.map((f) => Math.max(f.dueAt, f.retryAt)));
  const wait = next - Date.now();
  $('followup-note').textContent =
    `${list.length} waiting — next ${wait > 0 ? `in ${formatIn(wait)}` : 'due now'}`;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[FOLLOWUP_KEY]) renderFollowUps();
});
setInterval(renderFollowUps, 30000);
$('cancel-followups').addEventListener('click', async () => {
  const n = (await getFollowUps()).length;
  if (n && confirm(`Cancel ${n} pending follow-up${n === 1 ? '' : 's'}? They will not be sent.`)) {
    sendCommand({ type: 'CANCEL_FOLLOWUPS' });
  }
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
renderFollowUps();
