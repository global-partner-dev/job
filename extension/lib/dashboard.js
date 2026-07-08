import { parseClientStat } from './client-filter.js';

const API_BASE = 'https://workana-bot.fly.dev/api/jobs';

/**
 * @param {number} limit
 * @returns {Promise<Array<{ slug: string, title: string, url: string, budget: string, country: string, clientName: string, clientProjectsPublished: number|null, clientProjectsPaid: number|null, skills: string[], description?: string }>>}
 */
export async function fetchJobsFromApi(limit = 20) {
  const url = `${API_BASE}?limit=${limit}&bid=0`;
  let res;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch (e) {
    throw new Error(`Dashboard API unreachable (${e?.message || 'Failed to fetch'}). Check internet or try again.`);
  }
  if (!res.ok) throw new Error(`Dashboard API HTTP ${res.status}`);
  const data = await res.json();
  const list = data.jobs || [];
  return list.map((j) => ({
    slug: j.workana_id || j.slug,
    title: j.title || j.full_title || '',
    url: j.link || `https://www.workana.com/job/${j.workana_id}`,
    budget: j.budget || '',
    country: j.country || '',
    clientName: (j.client_name || j.clientName || '').trim(),
    clientProjectsPublished: parseClientStat(
      j.client_projects_published ?? j.clientProjectsPublished
    ),
    clientProjectsPaid: parseClientStat(j.client_projects_paid ?? j.clientProjectsPaid),
    skills: j.skills || [],
    description: j.description || j.full_description || '',
  }));
}

export async function fetchLatestJobFromApi() {
  const [job] = await fetchJobsFromApi(1);
  return job || null;
}
