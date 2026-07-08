/**
 * Runs on the Workana Radar web app. Bridges the page (which cannot touch
 * Workana or chrome.* APIs) to the extension background worker.
 *
 * Page → bridge (window.postMessage, source 'workana-radar'):
 *   PING · START_BIDDING{payload} · STOP_BIDDING
 * bridge → page (window.postMessage, source 'workana-radar-ext'):
 *   PONG · BID_PROGRESS{payload} · BID_DONE{payload}
 *
 * While a bid run is active the bridge holds an open port to the background,
 * which keeps the MV3 service worker alive for the duration.
 */
(function () {
  const CH = 'workana-radar';
  const REPLY = 'workana-radar-ext';
  const VERSION = '2.0.0';

  // SECURITY: only your real Workana Radar origin(s) may drive the extension.
  // Set PROD_ORIGIN to your deployed app origin (must match the manifest match).
  // localhost/127.0.0.1 (any port) are allowed for local dev — they are the
  // user's own machine.
  const PROD_ORIGIN = 'https://job-six-nu.vercel.app';
  function originAllowed(origin) {
    if (origin === PROD_ORIGIN) return true;
    try {
      const h = new URL(origin).hostname;
      return h === 'localhost' || h === '127.0.0.1';
    } catch {
      return false;
    }
  }

  let port = null;

  const reply = (type, payload) =>
    window.postMessage({ source: REPLY, type, payload }, window.location.origin);

  function ensurePort() {
    if (port) return port;
    port = chrome.runtime.connect({ name: 'bidbot' });
    port.onMessage.addListener((msg) => {
      if (msg?.type === 'PROGRESS') reply('BID_PROGRESS', msg.payload);
      else if (msg?.type === 'DONE') reply('BID_DONE', msg.payload);
    });
    port.onDisconnect.addListener(() => {
      port = null;
    });
    return port;
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (!originAllowed(e.origin)) return; // reject any non-app origin
    const data = e.data;
    if (!data || data.source !== CH) return;

    if (data.type === 'PING') {
      reply('PONG', { version: VERSION });
    } else if (data.type === 'START_BIDDING') {
      try {
        ensurePort().postMessage({ type: 'START', payload: data.payload });
      } catch (err) {
        reply('BID_DONE', { total: 0, placed: 0, failed: 0, error: String(err) });
      }
    } else if (data.type === 'STOP_BIDDING') {
      try {
        if (port) port.postMessage({ type: 'STOP' });
      } catch {
        /* ignore */
      }
    }
  });

  // Announce presence only on a trusted origin (avoid fingerprinting other sites).
  if (originAllowed(window.location.origin)) reply('PONG', { version: VERSION });
})();
