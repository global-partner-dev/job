/**
 * Draws the bid bot's side panel on Workana pages: the right third of the
 * window, with the page squeezed into the left two thirds beside it.
 *
 * It stays dormant until the background worker says this tab should show the
 * panel (toolbar icon click). Tabs the queue opens to send proposals never show
 * it. The panel itself is an extension page in an iframe, so Workana's CSS and
 * scripts can't touch it and it can use chrome.* directly.
 */
(function () {
  if (window.top !== window || window.__wrAskbotPanel) return;
  window.__wrAskbotPanel = true;

  const HOST_ID = 'wr-askbot-panel-host';
  const OPEN_CLASS = 'wr-askbot-panel-open';
  const WIDTH = '33.333vw';

  let host = null;
  let frame = null;

  function injectPageStyle() {
    if (document.getElementById('wr-askbot-panel-style')) return;
    const style = document.createElement('style');
    style.id = 'wr-askbot-panel-style';
    style.textContent =
      `html.${OPEN_CLASS}{margin-right:max(${WIDTH},320px)!important;}` +
      `#${HOST_ID}{position:fixed!important;top:0!important;right:0!important;` +
      `width:max(${WIDTH},320px)!important;height:100vh!important;z-index:2147483647!important;` +
      `border:0!important;box-shadow:-1px 0 0 rgba(0,0,0,.18)!important;background:#fff!important;}` +
      `#${HOST_ID} iframe{width:100%!important;height:100%!important;border:0!important;display:block!important;}`;
    (document.head || document.documentElement).appendChild(style);
  }

  function show() {
    if (host) return;
    injectPageStyle();
    host = document.createElement('div');
    host.id = HOST_ID;
    frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('panel/panel.html');
    frame.title = 'Workana Radar bid bot';
    host.appendChild(frame);
    document.documentElement.appendChild(host);
    document.documentElement.classList.add(OPEN_CLASS);
  }

  function hide() {
    if (!host) return;
    host.remove();
    host = null;
    frame = null;
    document.documentElement.classList.remove(OPEN_CLASS);
  }

  // Toolbar icon click.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'WR_PANEL_SET') return false;
    if (msg.open) show();
    else hide();
    return false;
  });

  // The panel's own × button.
  window.addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow) return;
    if (e.data?.source === 'wr-askbot-panel' && e.data.type === 'close') {
      hide();
      chrome.runtime.sendMessage({ type: 'WR_PANEL_CLOSED' }, () => void chrome.runtime.lastError);
    }
  });

  // Page loaded (or navigated) in a tab that already has the panel open.
  chrome.runtime.sendMessage({ type: 'WR_PANEL_WANTED' }, (resp) => {
    void chrome.runtime.lastError;
    if (resp?.open) show();
  });
})();
