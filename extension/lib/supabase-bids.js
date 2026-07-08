/**
 * Updates the user's bid rows in Supabase using the session handed over by the
 * web app (JWT). RLS lets a user update only their own rows while approved.
 */

function restBase(url) {
  return url.replace(/\/+$/, '') + '/rest/v1';
}

/**
 * @param {{supabaseUrl:string, anonKey:string, accessToken:string, userId:string}} auth
 * @param {string} jobId
 * @param {object} patch  e.g. { status, amount, delivery_time, proposal, bid_url, error }
 */
export async function updateBid(auth, jobId, patch) {
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
      console.warn('[BidBot] bid update failed', res.status, (await res.text()).slice(0, 160));
    }
  } catch (e) {
    console.warn('[BidBot] bid update error', e?.message || e);
  }
}

/**
 * Ensure a locked row exists (the web app normally inserts it, but this makes
 * the extension resilient if it was started without a prior lock).
 */
export async function ensureBid(auth, jobId) {
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
      body: JSON.stringify({ user_id: auth.userId, job_id: jobId, status: 'locked' }),
    });
  } catch (e) {
    console.warn('[BidBot] ensureBid error', e?.message || e);
  }
}
