import { clearActivityLog } from '../lib/storage.js';

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function lineFor(e) {
  if (e.type === 'ask') return `Question sent: ${e.title || e.slug || ''}`;
  if (e.type === 'error') return `Error: ${e.reason || e.title || ''}`;
  return `${e.title || e.slug || 'Info'}: ${e.reason || ''}`;
}

async function render() {
  const { activityLog = [] } = await chrome.storage.local.get('activityLog');
  const el = $('log');
  if (!activityLog.length) {
    el.innerHTML = '<p class="muted">No activity yet.</p>';
    return;
  }
  el.innerHTML = activityLog
    .slice(0, 25)
    .map((e) => {
      const t = (e.at || '').slice(11, 19);
      return `<div class="entry ${e.type || 'info'}"><span class="muted">${t}</span> ${escapeHtml(lineFor(e))}</div>`;
    })
    .join('');
}

$('clear').addEventListener('click', async () => {
  await clearActivityLog();
  render();
});

render();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.activityLog) render();
});
