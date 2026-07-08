(function () {
  const LOG = '[Workana Auto Bid]';
  const DEFAULT_POLL_SEC = 15;
  const PANEL_ID = 'wb-dashboard-panel';

  function getRuntime() {
    const api =
      typeof chrome !== 'undefined' && chrome.runtime
        ? chrome
        : typeof browser !== 'undefined' && browser.runtime
          ? browser
          : null;
    if (!api?.runtime?.id) return null;
    return api.runtime;
  }

  function sendCheckLatest() {
    const runtime = getRuntime();
    if (!runtime) {
      console.warn(LOG, 'Extension not connected. Reload extension and refresh this page.');
      return;
    }
    runtime.sendMessage({ type: 'CHECK_LATEST' }, () => {
      void runtime.lastError;
    });
  }

  async function getPollIntervalMs() {
    try {
      const { pollIntervalSec = DEFAULT_POLL_SEC } = await chrome.storage.sync.get(['pollIntervalSec']);
      return Math.max(5, pollIntervalSec) * 1000;
    } catch {
      return DEFAULT_POLL_SEC * 1000;
    }
  }

  function countByType(entries) {
    const counts = { bid: 0, skip: 0, error: 0, info: 0 };
    for (const e of entries) {
      if (counts[e.type] !== undefined) counts[e.type] += 1;
    }
    return counts;
  }

  function formatLogLine(e) {
    if (e.type === 'bid') return `Bid placed: ${e.title || e.slug || ''}`;
    if (e.type === 'skip') return `Skipped: ${e.title || e.slug || ''} — ${e.reason || ''}`;
    if (e.type === 'error') return `Error: ${e.reason || e.title || ''}`;
    if (e.type === 'info') return `${e.title || e.slug || 'Info'}: ${e.reason || ''}`;
    return JSON.stringify(e);
  }

  function formatTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return (iso || '').slice(11, 19);
    }
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="wb-panel-head" data-wb-toggle>
        <span class="wb-title">Workana Auto Bid</span>
        <span>
          <span class="wb-badge off" data-wb-enabled>Off</span>
          <button type="button" class="wb-toggle" data-wb-collapse aria-label="Collapse">−</button>
        </span>
      </div>
      <div class="wb-panel-body">
        <div class="wb-meta" data-wb-meta>Loading…</div>
        <div class="wb-stats">
          <div class="wb-stat sent"><div class="wb-stat-val" data-wb-sent>0</div><div class="wb-stat-lbl">Sent</div></div>
          <div class="wb-stat skip"><div class="wb-stat-val" data-wb-skip>0</div><div class="wb-stat-lbl">Skip</div></div>
          <div class="wb-stat error"><div class="wb-stat-val" data-wb-error>0</div><div class="wb-stat-lbl">Error</div></div>
          <div class="wb-stat info"><div class="wb-stat-val" data-wb-info>0</div><div class="wb-stat-lbl">Info</div></div>
        </div>
        <div class="wb-recent-title">Recent activity</div>
        <ul class="wb-recent" data-wb-recent></ul>
      </div>
    `;

    document.body.appendChild(panel);

    const collapseBtn = panel.querySelector('[data-wb-collapse]');
    const head = panel.querySelector('[data-wb-toggle]');
    const toggle = () => {
      panel.classList.toggle('wb-collapsed');
      collapseBtn.textContent = panel.classList.contains('wb-collapsed') ? '+' : '−';
    };
    collapseBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggle();
    });
    head.addEventListener('click', (ev) => {
      if (ev.target === collapseBtn) return;
      toggle();
    });

    return panel;
  }

  async function refreshPanel() {
    if (!getRuntime()) return;

    const panel = ensurePanel();
    const { enabled = false, pollIntervalSec = DEFAULT_POLL_SEC } = await chrome.storage.sync.get([
      'enabled',
      'pollIntervalSec',
    ]);
    const { activityLog = [], biddedSlugs = [] } = await chrome.storage.local.get([
      'activityLog',
      'biddedSlugs',
    ]);

    const counts = countByType(activityLog);
    const badge = panel.querySelector('[data-wb-enabled]');
    badge.textContent = enabled ? 'On' : 'Off';
    badge.classList.toggle('on', enabled);
    badge.classList.toggle('off', !enabled);

    panel.querySelector('[data-wb-meta]').textContent = enabled
      ? `Polling every ${pollIntervalSec}s · ${biddedSlugs.length} project(s) tracked as bid`
      : 'Bot disabled — enable in extension popup';

    panel.querySelector('[data-wb-sent]').textContent = String(counts.bid);
    panel.querySelector('[data-wb-skip]').textContent = String(counts.skip);
    panel.querySelector('[data-wb-error]').textContent = String(counts.error);
    panel.querySelector('[data-wb-info]').textContent = String(counts.info);

    const recentEl = panel.querySelector('[data-wb-recent]');
    const recent = activityLog.slice(0, 12);
    if (!recent.length) {
      recentEl.innerHTML = '<li class="wb-empty">No activity yet. Stats reset when you clear the log in the popup.</li>';
    } else {
      recentEl.innerHTML = recent
        .map((e) => {
          const cls = e.type || 'info';
          const line = formatLogLine(e);
          return `<li class="${cls}"><span class="wb-time">${formatTime(e.at)}</span>${escapeHtml(line)}</li>`;
        })
        .join('');
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let pollTimer = null;

  async function scheduleTick() {
    if (pollTimer) clearTimeout(pollTimer);
    const ms = await getPollIntervalMs();
    pollTimer = setTimeout(async () => {
      sendCheckLatest();
      scheduleTick();
    }, ms);
  }

  function init() {
    refreshPanel();
    sendCheckLatest();
    scheduleTick();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.pollIntervalSec) {
        scheduleTick();
      }
      if (
        (area === 'sync' && (changes.enabled || changes.pollIntervalSec)) ||
        (area === 'local' && (changes.activityLog || changes.biddedSlugs))
      ) {
        refreshPanel();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
