import { parseConversation, parseOwnSlug, parseProjectPage } from './parse.js';
import { cookieHeaderFor } from './cookies.js';
import { keepAliveWhile } from './timing.js';

const HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Page that hosts both Workana tabs for a project — "Make a bid" and
 * "Ask a question". AskBot only ever uses the question tab.
 * @param {string} slug
 */
export function askQuestionPageUrl(slug) {
  return `https://www.workana.com/messages/bid/${slug}`;
}

/** @param {string} slug */
export function projectPageUrl(slug) {
  return `https://www.workana.com/job/${slug}`;
}

/** Your conversation with the client about a project, once you have written to them. */
export function conversationUrl(projectSlug, ownSlug) {
  return `https://www.workana.com/inbox/${projectSlug}/${ownSlug}`;
}

const LOGIN_PAGE_RE = /Inicia sesión|Log into your Workana|login-form|sign-in/i;
const NOT_LOGGED_IN = 'Not logged in to Workana. Open workana.com and sign in in this browser.';

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
      signal: options.signal || AbortSignal.timeout(25000), // under Chrome's 30s limit
    });
  } catch (e) {
    throw new Error(`Workana request failed (${e?.message || 'Failed to fetch'}): ${url}`);
  }
}

/**
 * Read a project's detail page. Used to top up thin rows (short description,
 * missing client name) before the question is written.
 * @param {string} slug
 */
export function fetchProjectDetails(slug) {
  return keepAliveWhile(fetchProjectDetailsOnce(slug));
}

async function fetchProjectDetailsOnce(slug) {
  const res = await workanaFetch(projectPageUrl(slug));
  if (!res.ok) throw new Error(`Project page HTTP ${res.status}`);
  const html = await res.text();
  if (LOGIN_PAGE_RE.test(html)) throw new Error(NOT_LOGGED_IN);
  return parseProjectPage(html);
}

/** Your own Workana user name, read from your inbox page. */
export function fetchOwnSlug() {
  return keepAliveWhile(
    (async () => {
      const res = await workanaFetch('https://www.workana.com/inbox');
      if (!res.ok) throw new Error(`Inbox page HTTP ${res.status}`);
      const slug = parseOwnSlug(await res.text());
      if (!slug) throw new Error(NOT_LOGGED_IN);
      return slug;
    })(),
  );
}

/**
 * Read a conversation page: is the client online, have they replied, how many
 * messages are yours. See parseConversation().
 */
export function fetchConversation(projectSlug, ownSlug) {
  return keepAliveWhile(
    (async () => {
      const res = await workanaFetch(conversationUrl(projectSlug, ownSlug));
      if (!res.ok) throw new Error(`Conversation page HTTP ${res.status}`);
      const html = await res.text();
      const conv = parseConversation(html);
      // Check the conversation first: a logged-in page can also mention "sign-in".
      if (!conv.found && LOGIN_PAGE_RE.test(html)) throw new Error(NOT_LOGGED_IN);
      return conv;
    })(),
  );
}
