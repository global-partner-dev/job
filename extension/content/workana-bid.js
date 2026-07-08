/**
 * Runs on Workana place-bid and inbox pages. Saves form tokens from the live DOM
 * (needed when the server returns a Vue shell without the form in HTML).
 */
(function () {
  const LOG = '[Workana Auto Bid]';

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

  function slugFromPath() {
    const bid = location.pathname.match(/\/messages\/bid\/([^/]+)/i);
    if (bid) return bid[1];
    const inbox = location.pathname.match(/\/inbox\/([^/]+)/i);
    return inbox ? inbox[1] : null;
  }

  function freelancerFromPath() {
    const inbox = location.pathname.match(/\/inbox\/[^/]+\/([^/]+)/i);
    return inbox ? inbox[1] : '';
  }

  function getHidden(name) {
    const el =
      document.querySelector(`#bidForm input[name="${name}"]`) ||
      document.querySelector(`#add-message input[name="${name}"]`) ||
      document.querySelector(`input[name="${name}"]`);
    return el?.value || '';
  }

  function readSkillsFromForm(form) {
    const skills = [];
    if (!form) return skills;
    form.querySelectorAll('input[name^="skill-"]').forEach((el) => {
      const selected =
        el.checked ||
        el.classList.contains('selected') ||
        el.closest('label')?.classList.contains('selected');
      if (selected && el.name && el.value) {
        skills.push({ name: el.name, value: el.value });
      }
    });
    return skills;
  }

  function readFormFromDom() {
    const form =
      document.querySelector('#bidForm') ||
      document.querySelector('form.bid-form') ||
      document.querySelector('#add-message form') ||
      document.querySelector('form[action*="/messages/bid/"]') ||
      document.querySelector('form[action*="/messages/index/"]') ||
      document.querySelector('form[action*="/inbox/"]');

    const get = (name) => {
      if (form) {
        const el = form.querySelector(`input[name="${name}"]`);
        if (el?.value) return el.value;
      }
      return getHidden(name);
    };

    const slug = slugFromPath();
    let action = form?.getAttribute('action') || '';
    if (!action && slug && location.pathname.includes('/messages/bid/')) {
      action = `https://www.workana.com/messages/bid/${slug}`;
    }
    if (!action && slug) {
      const fl =
        freelancerFromPath() ||
        (typeof Workana !== 'undefined' && Workana.me?.info?.slug) ||
        '';
      if (fl) {
        action = location.pathname.includes('/inbox/')
          ? `https://www.workana.com/inbox/${slug}/${fl}`
          : `https://www.workana.com/messages/index/${slug}/${fl}`;
      }
    }
    if (action && !action.startsWith('http')) {
      action = `https://www.workana.com${action.startsWith('/') ? '' : '/'}${action}`;
    }

    let freelancerSlug = freelancerFromPath();
    const am = action.match(/\/(?:messages\/index|inbox)\/[^/]+\/([^/?#]+)/);
    if (am) freelancerSlug = am[1];
    if (typeof Workana !== 'undefined' && Workana.me?.info?.slug) {
      freelancerSlug = Workana.me.info.slug;
    }

    const amountInput = form?.querySelector('input[name="bid[amount]"]');
    const minAmount = amountInput ? Number(amountInput.min) || 60 : 60;

    return {
      action,
      csrfName: get('csrf_name'),
      csrfValue: get('csrf_value'),
      dcstInput: get('dcst-input'),
      freelancerSlug,
      skills: readSkillsFromForm(form),
      minAmount,
      formType: form?.id === 'bidForm' || form?.classList?.contains('bid-form') ? 'place_bid' : 'message',
      capturedAt: Date.now(),
    };
  }

  function tryCapture() {
    const slug = slugFromPath();
    if (!slug) return;
    const data = readFormFromDom();
    if (!data?.csrfName || !data?.dcstInput) return;

    const runtime = getRuntime();
    if (!runtime) return;

    runtime.sendMessage({ type: 'CACHE_BID_FORM', slug, form: data }, () => {
      void runtime.lastError;
    });
    console.log(LOG, 'Cached place-bid form tokens for', slug);
  }

  function init() {
    tryCapture();
    const observer = new MutationObserver(() => {
      clearTimeout(window.__wbBidDebounce);
      window.__wbBidDebounce = setTimeout(tryCapture, 500);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(tryCapture, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
