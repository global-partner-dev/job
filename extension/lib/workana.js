import { parseProjectPage } from './parse.js';
import { cookieHeaderFor } from './cookies.js';

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

/**
 * Read a project's detail page. Used to top up thin rows (short description,
 * missing client name) before the question is written.
 * @param {string} slug
 */
export async function fetchProjectDetails(slug) {
  const res = await workanaFetch(projectPageUrl(slug));
  if (!res.ok) throw new Error(`Project page HTTP ${res.status}`);
  const html = await res.text();
  if (/Inicia sesión|Log into your Workana|login-form|sign-in/i.test(html)) {
    throw new Error('Not logged in to Workana. Open workana.com and sign in in this browser.');
  }
  return parseProjectPage(html);
}
