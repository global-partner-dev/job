/**
 * The project queue, read from Supabase with the project's PUBLISHABLE key.
 *
 * That key can only call the two functions defined in supabase/06_bidded.sql
 * and 07_two_bidders.sql — it has no table access — so it is safe to keep
 * inside an extension. Both take a bidder slot (1 = first, 2 = second):
 *   next_unbidded_job(p_skip, p_slot, p_delay_minutes)
 *       → newest project this slot has not bid on that is at least
 *         p_delay_minutes old
 *   mark_job_bidded(p_job_id, p_slot)  → sets bidded (slot 1) / bidded_second (slot 2)
 * and, for the second bidder's project filter (08_second_bidder_filter.sql):
 *   skip_job_second(p_job_id, p_reason) → sets bidded_second = 2 with the reason
 */

/** An error that will not fix itself on retry (bad key, function missing). */
export class SupabaseConfigError extends Error {}

function headers(cfg) {
  const h = { apikey: cfg.supabaseKey, 'Content-Type': 'application/json' };
  // Legacy anon keys are JWTs and are also sent as the bearer token. The newer
  // `sb_publishable_…` keys are not JWTs and go in the apikey header only.
  if (cfg.supabaseKey.startsWith('eyJ')) h.Authorization = `Bearer ${cfg.supabaseKey}`;
  return h;
}

async function rpc(cfg, fn, args) {
  if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    throw new SupabaseConfigError('Set the Supabase URL and publishable key in the panel.');
  }
  let res;
  try {
    res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify(args),
    });
  } catch (e) {
    throw new Error(`Supabase request failed (${e?.message || 'Failed to fetch'}).`);
  }
  if (res.ok) return res.json();

  const body = (await res.text()).slice(0, 200);
  if (res.status === 404 || /PGRST202/.test(body)) {
    throw new SupabaseConfigError(
      `Function ${fn} not found — run supabase/06_bidded.sql, 07_two_bidders.sql and 08_second_bidder_filter.sql in the Supabase SQL Editor.`,
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new SupabaseConfigError(`Supabase rejected the key (${res.status}). Check the publishable key.`);
  }
  throw new Error(`Supabase ${res.status}: ${body}`);
}

/**
 * The newest project this bidder has not bid on yet and that is old enough.
 * @param {object} cfg    run settings: supabaseUrl, supabaseKey, slot, delayMin
 * @param {string[]} skip project ids to step over (failed earlier in this run)
 * @returns {Promise<object|null>}
 */
export async function fetchNextJob(cfg, skip = []) {
  const rows = await rpc(cfg, 'next_unbidded_job', {
    p_skip: skip,
    p_slot: cfg.slot,
    p_delay_minutes: cfg.delayMin,
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/** Set this bidder's flag to 1. @returns {Promise<boolean>} whether a row was updated */
export async function markJobBidded(cfg, jobId) {
  return (await rpc(cfg, 'mark_job_bidded', { p_job_id: jobId, p_slot: cfg.slot })) === true;
}

/**
 * Take a project out of the second bidder's queue for good (bidded_second = 2).
 * @returns {Promise<boolean>} whether a waiting row was updated
 */
export async function markJobSkipped(cfg, jobId, reason) {
  return (await rpc(cfg, 'skip_job_second', { p_job_id: jobId, p_reason: reason || null })) === true;
}
