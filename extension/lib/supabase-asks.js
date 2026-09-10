/**
 * Updates the user's ask rows in Supabase using the session handed over by the
 * web app (JWT). RLS lets a user update only their own rows while approved.
 *
 * The table is still called `bids` (one row per user+project); a row now records
 * a question asked about the project rather than a placed bid.
 */

function restBase(url) {
  return url.replace(/\/+$/, '') + '/rest/v1';
}

/**
 * @param {{supabaseUrl:string, anonKey:string, accessToken:string, userId:string}} auth
 * @param {string} jobId
 * @param {object} patch  e.g. { status, question, error }
 */
export async function updateAsk(auth, jobId, patch) {
  if (!auth?.supabaseUrl || !auth?.accessToken) return;
  const url =
    `${restBase(auth.supabaseUrl)}/bids` +
    `?user_id=eq.${encodeURIComponent(auth.userId)}&job_id=eq.${encodeURIComponent(jobId)}`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        apikey: auth.anonKey,
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      console.warn('[AskBot] ask update failed', res.status, (await res.text()).slice(0, 160));
    }
  } catch (e) {
    console.warn('[AskBot] ask update error', e?.message || e);
  }
}

/**
 * Ensure a queued row exists (the web app normally inserts it, but this makes
 * the extension resilient if a run started without a prior claim).
 */
export async function ensureAsk(auth, jobId) {
  if (!auth?.supabaseUrl || !auth?.accessToken) return;
  const url = `${restBase(auth.supabaseUrl)}/bids?on_conflict=user_id,job_id`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        apikey: auth.anonKey,
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify({ user_id: auth.userId, job_id: jobId, status: 'queued' }),
    });
  } catch (e) {
    console.warn('[AskBot] ensureAsk error', e?.message || e);
  }
}
