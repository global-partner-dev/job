import { DEFAULT_SETTINGS, clearActivityLog } from '../lib/storage.js';

const $ = (id) => document.getElementById(id);

function initTabs() {
  const buttons = document.querySelectorAll('#tabList [data-tab]');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      buttons.forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-pane').forEach((pane) => {
        pane.classList.toggle('active', pane.id === targetId);
      });
    });
  });
}

async function load() {
  const data = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  $('enabled').checked = !!data.enabled;
  $('enabledLabel').textContent = data.enabled ? 'Enabled' : 'Disabled';
  $('minBudget').value = data.minBudget;
  $('maxBudget').value = data.maxBudget;
  $('freelancerName').value = data.freelancerName || '';
  $('freelancerSlug').value = data.freelancerSlug || '';
  validateSlugField();
  $('pollIntervalSec').value = data.pollIntervalSec;
  $('sendDelaySec').value = data.sendDelaySec;
  $('bidAmountMode').value = data.bidAmountMode || 'budget_low';
  $('bidAmountFixed').value = data.bidAmountFixed ?? 150;
  $('bidDeliveryTime').value = data.bidDeliveryTime || '7 days';
  toggleBidAmountFixedRow();
  $('openaiApiKey').value = data.openaiApiKey || '';
  $('model').value = data.model;
  $('systemPrompt').value = data.systemPrompt;

  const { activityLog = [] } = await chrome.storage.local.get('activityLog');
  renderLog(activityLog);
  $('statusLine').textContent = data.enabled
    ? `Checking latest job every ${data.pollIntervalSec}s. Bids when the top project changes.`
    : 'Bot is off. Enable to start.';
}

function renderLog(entries) {
  const el = $('activityLog');
  if (!entries.length) {
    el.innerHTML = '<p class="text-muted mb-0">No activity yet.</p>';
    return;
  }
  el.innerHTML = entries
    .slice(0, 20)
    .map((e) => {
      const cls = e.type || 'info';
      const line =
        e.type === 'bid'
          ? `Bid placed: ${e.title}`
          : e.type === 'skip'
            ? `Skipped ${e.title}: ${e.reason}`
            : e.type === 'info'
              ? `${e.title}: ${e.reason}`
            : e.type === 'error'
              ? `Error: ${e.reason || e.title}`
              : JSON.stringify(e);
      return `<div class="log-entry ${cls}"><span class="text-muted">${(e.at || '').slice(11, 19)}</span> ${line}</div>`;
    })
    .join('');
}

function collect() {
  return {
    enabled: $('enabled').checked,
    minBudget: Number($('minBudget').value) || 0,
    maxBudget: Number($('maxBudget').value) || 99999,
    freelancerName: $('freelancerName').value.trim(),
    freelancerSlug: $('freelancerSlug').value.trim(),
    pollIntervalSec: Number($('pollIntervalSec').value) || 20,
    sendDelaySec: Math.max(5, Number($('sendDelaySec').value) || 60),
    bidAmountMode: $('bidAmountMode').value || 'budget_low',
    bidAmountFixed: Number($('bidAmountFixed').value) || 150,
    bidDeliveryTime: $('bidDeliveryTime').value.trim() || '7 days',
    openaiApiKey: $('openaiApiKey').value.trim(),
    model: $('model').value,
    systemPrompt: $('systemPrompt').value,
  };
}

function schedulePollingFromPopup() {
  chrome.runtime.sendMessage({ type: 'RESCHEDULE_POLL' }).catch(() => {});
}

$('enabled').addEventListener('change', async () => {
  const enabled = $('enabled').checked;
  $('enabledLabel').textContent = enabled ? 'Enabled' : 'Disabled';
  await chrome.storage.sync.set({ enabled });
  schedulePollingFromPopup();
});

$('saveKey').addEventListener('click', async () => {
  const key = $('openaiApiKey').value.trim();
  if (!key) return;
  await chrome.storage.sync.set({ openaiApiKey: key });
  $('statusLine').textContent = 'API key saved.';
});

$('saveAll').addEventListener('click', async () => {
  await chrome.storage.sync.set(collect());
  $('statusLine').textContent = 'Settings saved.';
  chrome.runtime.sendMessage({ type: 'RESCHEDULE_POLL' });
  chrome.runtime.sendMessage({ type: 'POLL_NOW' });
});

function toggleBidAmountFixedRow() {
  const show = $('bidAmountMode').value === 'fixed';
  $('bidAmountFixedRow').style.display = show ? '' : 'none';
}

$('bidAmountMode').addEventListener('change', toggleBidAmountFixedRow);

function validateSlugField() {
  const v = $('freelancerSlug').value.trim();
  const hint = $('slugHint');
  if (/^[a-f0-9]{32}$/i.test(v)) {
    hint.style.display = 'block';
    hint.textContent = 'This looks like a company hash. Use your short freelancer slug instead.';
  } else {
    hint.style.display = 'none';
  }
}

$('freelancerSlug').addEventListener('input', validateSlugField);

$('pollNow').addEventListener('click', async () => {
  $('statusLine').textContent = 'Running…';
  const res = await chrome.runtime.sendMessage({ type: 'POLL_NOW' });
  if (!res?.ok) {
    $('statusLine').textContent = res?.error || 'Check failed. See Log tab.';
  } else if (res.result?.status === 'bid' || res.result?.status === 'scheduled') {
    $('statusLine').textContent =
      res.result.status === 'scheduled'
        ? `Bid scheduled: ${res.result.title || res.slug}`
        : `Bid placed: ${res.result.title || res.slug}`;
  } else {
    $('statusLine').textContent = res.note || res.result?.reason || 'Check finished.';
  }
  const { activityLog = [] } = await chrome.storage.local.get('activityLog');
  renderLog(activityLog);
});

$('clearLog').addEventListener('click', async () => {
  await clearActivityLog();
  renderLog([]);
  $('statusLine').textContent = 'Log cleared.';
});

$('clearProcessed').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'CLEAR_PROCESSED' });
  $('statusLine').textContent = 'Bid tracking reset. Next new top project will be bid.';
});

initTabs();
load();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.activityLog) {
    renderLog(changes.activityLog.newValue || []);
  }
});
