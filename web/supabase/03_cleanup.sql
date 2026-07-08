-- ============================================================================
-- Workana Radar — daily cleanup (pg_cron)
-- ----------------------------------------------------------------------------
-- Runs once a day and deletes jobs first seen more than 24h ago, so the feed
-- stays a rolling 24-hour window. Jobs a user has already bid on are kept (so
-- bid history + the job detail remain available). Old scrape_history is trimmed
-- too. Run this in the Supabase SQL Editor after schema.sql + 02_auth_multiuser.sql.
--
-- pg_cron is available on all Supabase projects. If `cron.schedule` errors as
-- "schema cron does not exist", enable "pg_cron" first under
-- Dashboard → Database → Extensions, then re-run this file.
-- ============================================================================

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Cleanup function — SECURITY DEFINER so it runs as owner and bypasses RLS.
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_old_data()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  jobs_deleted integer;
begin
  -- Jobs first seen more than 24 hours ago, EXCEPT any a user has bid on.
  -- (Remove the `and id not in (...)` line if you want to delete ALL old jobs —
  --  note that cascades and removes those users' bid records too.)
  delete from public.jobs
  where first_seen_at < now() - interval '24 hours'
    and id not in (select job_id from public.bids);
  get diagnostics jobs_deleted = row_count;

  return jsonb_build_object('jobs_deleted', jobs_deleted, 'ran_at', now());
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedule: once a day at 03:00 UTC. Idempotent — re-running this file just
-- updates the schedule. Change '0 3 * * *' to '0 * * * *' for an hourly sweep
-- (tighter 24h window), or another time to suit your timezone.
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('workana-radar-cleanup');
exception
  when others then null; -- not scheduled yet
end $$;

select cron.schedule(
  'workana-radar-cleanup',
  '0 3 * * *',
  $$ select public.cleanup_old_data(); $$
);

-- ---------------------------------------------------------------------------
-- Handy checks:
--   select * from cron.job;                                   -- confirm it's scheduled
--   select public.cleanup_old_data();                          -- run it once, right now
--   select * from cron.job_run_details order by start_time desc limit 10;  -- run log
-- ============================================================================
