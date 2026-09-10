/**
 * Runs on Workana's project message pages.
 *
 * On WR_FILL_QUESTION it switches to the "Ask a question" tab and pre-fills the
 * message box — it never clicks Send. When you do press Send it reports the
 * submit back to the worker, which is what removes the project from the
 * dashboard queue.
 */
(function () {
  const LOG = '[Workana Radar AskBot]';
  const QUESTION_TAB_RE = /(ask a question|make a question|question|pergunta|dúvida|duvida|pregunta|duda|consulta)/i;
  const BID_TAB_RE = /(make (a )?bid|place (a )?bid|proposta|propuesta|ofertar|hacer una oferta)/i;

  let filledSlug = null;
  let reported = false;

  function getRuntime() {
    const api =
      typeof chrome !== 'undefined' && chrome.runtime
        ? chrome
        : typeof browser !== 'undefined' && browser.runtime
          ? browser
          : null;
    return api?.runtime?.id ? api.runtime : null;
  }

  function slugFromPath() {
    const bid = location.pathname.match(/\/messages\/(?:bid|index)\/([^/]+)/i);
    if (bid) return bid[1];
    const inbox = location.pathname.match(/\/inbox\/([^/]+)/i);
    return inbox ? inbox[1] : null;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));

  function setNativeValue(el, value) {
    if (!el) return false;
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /** Click the "Ask a question" tab if the page has one. */
  async function activateQuestionTab() {
    const candidates = [
      ...document.querySelectorAll(
        'a[href*="question"], a[href*="pergunta"], a[href*="pregunta"], ' +
          '[role="tab"], .nav-tabs a, .tabs a, ul.nav a, button[data-toggle="tab"]',
      ),
    ];
    const tab = candidates.find((el) => {
      const text = (el.textContent || '').trim();
      return text && QUESTION_TAB_RE.test(text) && !BID_TAB_RE.test(text) && visible(el);
    });
    if (!tab) return false;
    tab.click();
    await sleep(500);
    return true;
  }

  /**
   * The message box of the question form — explicitly NOT the place-bid
   * proposal box (`bid[content]`), which belongs to the other tab.
   */
  function findQuestionField() {
    const direct =
      document.querySelector('textarea[name="message[content]"]') ||
      document.querySelector('#add-message textarea') ||
      document.querySelector('form[action*="/messages/index/"] textarea') ||
      document.querySelector('form[action*="/inbox/"] textarea');
    if (direct && visible(direct)) return direct;

    const others = [...document.querySelectorAll('textarea')].filter(
      (t) => t.name !== 'bid[content]' && !t.closest('#bidForm') && visible(t),
    );
    if (others.length) return others[0];

    // Last resort: a hidden-but-present question textarea (tab not switched).
    return direct || null;
  }

  function questionFormOf(field) {
    return field?.closest('form') || document.querySelector('#add-message form') || null;
  }

  function reportSent() {
    if (reported || !filledSlug) return;
    reported = true;
    const runtime = getRuntime();
    if (!runtime) return;
    runtime.sendMessage({ type: 'WR_QUESTION_SENT', slug: filledSlug }, () => {
      void runtime.lastError;
    });
    console.log(LOG, 'Question sent for', filledSlug);
  }

  /**
   * Watch for the real send. Workana submits the question form either natively
   * or over AJAX, so we treat both a form submit and a click on its send button
   * as "sent" — the click is the user's own action either way.
   */
  function watchForSend(field) {
    const form = questionFormOf(field);

    document.addEventListener(
      'submit',
      (e) => {
        if (!form || e.target === form || form.contains(e.target)) reportSent();
      },
      true,
    );

    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target?.closest?.(
          'button, input[type="submit"], a.btn, [role="button"]',
        );
        if (!btn) return;
        const inQuestionForm = form ? form.contains(btn) : false;
        const label = (btn.textContent || btn.value || '').trim();
        const looksLikeSend = /^(send|enviar|submit|ask|preguntar|perguntar)\b/i.test(label);
        if (inQuestionForm && (looksLikeSend || btn.type === 'submit')) reportSent();
      },
      true,
    );
  }

  async function fillQuestion(question) {
    await activateQuestionTab();

    let field = null;
    for (let attempt = 0; attempt < 8 && !field; attempt++) {
      field = findQuestionField();
      if (!field) await sleep(500);
    }
    if (!field) return false;

    setNativeValue(field, question);
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field.focus();
    watchForSend(field);
    return true;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'WR_FILL_QUESTION') return false;
    filledSlug = msg.slug || slugFromPath();
    reported = false;
    fillQuestion(msg.question || '').then(
      (ok) => sendResponse({ ok }),
      () => sendResponse({ ok: false }),
    );
    return true; // async response
  });
})();
