import {
  parsePlaceBidForm,
  parseProjectPage,
  detectBidPageIssue,
} from './parse.js';
import { cookieHeaderFor } from './cookies.js';
import { getCachedBidForm } from './bid-cache.js';
import { captureBidFormViaTab } from './bid-tab.js';

const HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export function placeBidPageUrl(slug) {
  return `https://www.workana.com/messages/bid/${slug}`;
}

async function workanaFetch(url, options = {}) {
  const cookie = await cookieHeaderFor('https://www.workana.com/');
  const headers = { ...HEADERS, ...options.headers };
  if (cookie) headers.Cookie = cookie;
  try {
    return await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
      redirect: 'follow',
    });
  } catch (e) {
    throw new Error(`Workana request failed (${e?.message || 'Failed to fetch'}): ${url}`);
  }
}

/** 32-char hex = company hash, not profile slug */
export function isLikelyCompanyHash(value) {
  return /^[a-f0-9]{32}$/i.test((value || '').trim());
}

export function normalizeFreelancerSlug(settingsSlug, formSlug) {
  const fromSettings = (settingsSlug || '').trim();
  if (fromSettings && !isLikelyCompanyHash(fromSettings)) return fromSettings;
  if (formSlug && !isLikelyCompanyHash(formSlug)) return formSlug;
  if (isLikelyCompanyHash(fromSettings)) {
    throw new Error(
      'Freelancer slug looks like a company hash. Use your profile slug (e.g. adrian-cecile) from workana.com/freelancer/YOUR-SLUG'
    );
  }
  return fromSettings || formSlug || '';
}

function mergeFormParts(...partials) {
  const out = {
    action: '',
    csrfName: '',
    csrfValue: '',
    dcstInput: '',
    freelancerSlug: '',
    skills: [],
    minAmount: 60,
    formType: 'place_bid',
  };
  for (const p of partials) {
    if (!p) continue;
    if (p.action) out.action = p.action;
    if (p.csrfName) out.csrfName = p.csrfName;
    if (p.csrfValue) out.csrfValue = p.csrfValue;
    if (p.dcstInput) out.dcstInput = p.dcstInput;
    if (p.freelancerSlug) out.freelancerSlug = p.freelancerSlug;
    if (p.skills?.length) out.skills = p.skills;
    if (p.minAmount) out.minAmount = p.minAmount;
  }
  return out;
}

function finalizePlaceBidForm(form, slug) {
  if (!form.action && slug) {
    form.action = placeBidPageUrl(slug);
  }
  if (form.action && slug && !form.action.includes(`/messages/bid/${slug}`)) {
    form.action = placeBidPageUrl(slug);
  }
  return form;
}

/** @param {string} slug @param {object} cached */
export function formFromCache(cached, slug) {
  if (!cached?.csrfName || !cached?.dcstInput) return null;
  return finalizePlaceBidForm({ ...cached }, slug);
}

/**
 * Fetch place-bid page and extract CSRF + dcst tokens (session cookies required).
 * @param {string} slug
 * @param {string} [freelancerSlugHint]
 * @param {object} [cachedForm]
 */
export async function fetchPlaceBidFormMeta(slug, freelancerSlugHint = '', cachedForm = null) {
  if (cachedForm) {
    const fromCache = formFromCache(cachedForm, slug);
    if (fromCache?.csrfName && fromCache?.dcstInput) return fromCache;
  }

  const parseOpts = { projectSlug: slug };
  const urls = [placeBidPageUrl(slug), `https://www.workana.com/job/${slug}`];

  const partials = [];
  let lastIssue = null;

  for (const url of urls) {
    const res = await workanaFetch(url);
    if (!res.ok) {
      lastIssue = `HTTP ${res.status} for ${url}`;
      continue;
    }
    const html = await res.text();
    const issue = detectBidPageIssue(html);
    if (issue === 'not_logged_in') {
      throw new Error('Not logged in to Workana. Open workana.com and sign in in this browser.');
    }
    if (issue) lastIssue = issue;

    const part = parsePlaceBidForm(html, parseOpts);
    if (part) partials.push(part);
    const merged = mergeFormParts(...partials);
    if (merged.csrfName && merged.csrfValue && merged.dcstInput) {
      return finalizePlaceBidForm(merged, slug);
    }
  }

  let merged = mergeFormParts(...partials);
  if (merged.csrfName && merged.csrfValue && !merged.dcstInput) {
    try {
      const captured = await captureBidFormViaTab(slug);
      merged = mergeFormParts(merged, captured);
    } catch (e) {
      throw new Error(
        `${e.message || e}. Or open while logged in: ${placeBidPageUrl(slug)}`
      );
    }
  }

  if (merged.csrfName && merged.csrfValue && merged.dcstInput) {
    return finalizePlaceBidForm(merged, slug);
  }

  if (!merged.dcstInput || !merged.csrfName) {
    try {
      const captured = await captureBidFormViaTab(slug);
      merged = mergeFormParts(merged, captured);
      if (merged.csrfName && merged.dcstInput) {
        return finalizePlaceBidForm(merged, slug);
      }
    } catch (e) {
      if (!merged.csrfName) {
        throw new Error(
          `${e.message || e}. Log in at workana.com in this Chrome profile.`
        );
      }
    }
  }

  if (lastIssue === 'spa_shell') {
    throw new Error(
      'Place-bid form not in page HTML (Workana loads it in the browser). Open the bid page once manually, then retry: ' +
        placeBidPageUrl(slug)
    );
  }

  throw new Error(
    lastIssue
      ? `Could not parse place-bid form (${lastIssue}). Log in to Workana and open the bid page once.`
      : 'Could not parse place-bid form. Log in to Workana and set your freelancer slug.'
  );
}

/** @deprecated Use fetchPlaceBidFormMeta */
export const fetchQuestionFormMeta = fetchPlaceBidFormMeta;

/** @param {string} slug */
export async function fetchProjectDetails(slug) {
  const url = `https://www.workana.com/job/${slug}`;
  const res = await workanaFetch(url);
  if (!res.ok) throw new Error(`Project page HTTP ${res.status}`);
  const html = await res.text();
  return parseProjectPage(html);
}

/**
 * POST a full place-bid proposal (Make bid tab).
 * @param {{ form: object, content: string, amount: number, deliveryTime: string, slug: string }} opts
 */
export async function submitPlaceBid({ form, content, amount, deliveryTime, slug }) {
  const body = new URLSearchParams();
  body.set('csrf_name', form.csrfName);
  body.set('csrf_value', form.csrfValue);
  body.set('dcst-input', form.dcstInput);
  body.set('bid[content]', content);
  body.set('bid[amount]', String(amount));
  body.set('bid[deliveryTime]', deliveryTime || '7 days');
  body.set('jsonAttachments', '[]');

  for (const skill of form.skills || []) {
    if (skill.name && skill.value) body.set(skill.name, skill.value);
  }

  const csrfToken = `${form.csrfName}/${form.csrfValue}`;
  const refererUrl = placeBidPageUrl(slug);
  const action = form.action || refererUrl;

  const res = await workanaFetch(action, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Csrf-Token': csrfToken,
      Referer: refererUrl,
    },
    body: body.toString(),
    redirect: 'follow',
  });

  const finalUrl = res.url || '';
  const ok =
    res.ok ||
    finalUrl.includes('/messages/index/') ||
    finalUrl.includes('/messages/bid/') ||
    finalUrl.includes('/inbox/') ||
    finalUrl.includes('/job/');

  if (!ok) {
    const snippet = (await res.text()).slice(0, 300);
    throw new Error(`Place bid failed HTTP ${res.status}: ${snippet}`);
  }

  return { ok: true, url: finalUrl, amount };
}

/** @deprecated Use submitPlaceBid */
export async function submitQuestion(opts) {
  return submitPlaceBid({
    form: opts.form,
    content: opts.message,
    amount: opts.amount || 60,
    deliveryTime: opts.deliveryTime || '7 days',
    slug: opts.slug,
  });
}
