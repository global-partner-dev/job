import { getCachedBidForm } from './bid-cache.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function placeBidUrl(slug) {
  return `https://www.workana.com/messages/bid/${slug}`;
}

/** @deprecated */
export const bidQuestionUrl = placeBidUrl;

export function threadInboxUrl(slug, freelancerSlug) {
  return `https://www.workana.com/inbox/${slug}/${freelancerSlug}`;
}

/**
 * Opens a Workana page in a background tab so workana-bid.js can read form tokens from the DOM.
 * @param {string} slug
 * @param {string} pageUrl
 * @param {number} timeoutMs
 */
export async function captureFormViaTab(slug, pageUrl, timeoutMs = 28000, { useCache = true } = {}) {
  if (useCache) {
    const existing = await getCachedBidForm(slug);
    if (existing?.csrfName && existing?.dcstInput) return existing;
  }

  const tab = await chrome.tabs.create({ url: pageUrl, active: false });

  try {
    await waitForTabComplete(tab.id, 20000);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const cached = await getCachedBidForm(slug);
      if (cached?.csrfName && cached?.dcstInput) return cached;
      await sleep(600);
    }
    throw new Error(
      `Timed out waiting for form on Workana. Confirm you are logged in, then open: ${pageUrl}`
    );
  } finally {
    if (tab?.id != null) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* tab may already be closed */
      }
    }
  }
}

/** @param {number} tabId @param {number} timeoutMs */
function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const check = async () => {
      try {
        const t = await chrome.tabs.get(tabId);
        if (t.status === 'complete') {
          resolve();
          return;
        }
      } catch (e) {
        reject(e);
        return;
      }
      if (Date.now() > deadline) {
        resolve();
        return;
      }
      setTimeout(check, 400);
    };

    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        setTimeout(resolve, 1200);
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    check();
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }, timeoutMs);
  });
}

/** Opens the place-bid page in a background tab. */
export async function captureBidFormViaTab(slug, timeoutMs = 28000) {
  return captureFormViaTab(slug, placeBidUrl(slug), timeoutMs);
}

/** Opens the inbox thread so workana-bid.js can read the reply form. */
export async function captureThreadFormViaTab(slug, freelancerSlug, timeoutMs = 28000) {
  return captureFormViaTab(slug, threadInboxUrl(slug, freelancerSlug), timeoutMs, {
    useCache: false,
  });
}
