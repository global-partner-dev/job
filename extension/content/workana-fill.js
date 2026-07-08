/**
 * Runs on Workana place-bid pages. On WB_FILL_BID it pre-fills the proposal,
 * amount and delivery fields (for MANUAL mode) — it never clicks "Place bid".
 */
(function () {
  function setNativeValue(el, value) {
    if (!el) return false;
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function fill({ proposal, amount, deliveryTime }) {
    const content =
      document.querySelector('textarea[name="bid[content]"]') ||
      document.querySelector('#bidForm textarea') ||
      document.querySelector('form textarea') ||
      document.querySelector('textarea');
    const amountEl = document.querySelector('input[name="bid[amount]"]');
    const deliveryEl =
      document.querySelector('[name="bid[deliveryTime]"]') ||
      document.querySelector('input[name*="delivery"]');

    let ok = false;
    if (content && proposal != null) ok = setNativeValue(content, proposal) || ok;
    if (amountEl && amount != null) setNativeValue(amountEl, String(amount));
    if (deliveryEl && deliveryTime != null) setNativeValue(deliveryEl, deliveryTime);

    if (content) {
      content.scrollIntoView({ behavior: 'smooth', block: 'center' });
      content.focus();
    }
    return ok;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'WB_FILL_BID') {
      const ok = fill(msg);
      sendResponse({ ok });
      return true;
    }
    return false;
  });
})();
