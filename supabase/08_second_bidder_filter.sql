-- ============================================================================
-- Workana Radar — the second bidder's project filter
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL Editor AFTER 07_two_bidders.sql. Safe to re-run.
--
-- The second bidder reads each project before bidding and passes on the ones
-- that don't fit: a scope too vague to estimate, a brief written by Workana's
-- own assistant ("The client is looking for…"), or a project type it doesn't
-- bid on. Those are set to bidded_second = 2 so the queue never hands them out
-- again, and the reason is kept for review:
--   0 = not handled yet, 1 = bid sent, 2 = skipped by the filter
-- next_unbidded_job() already only returns bidded_second = 0, so it needs no
-- change.
-- ============================================================================

alter table public.jobs
    add column if not exists second_skip_reason text;

alter table public.jobs drop constraint if exists jobs_bidded_second_check;
alter table public.jobs
    add constraint jobs_bidded_second_check check (bidded_second in (0, 1, 2));

comment on column public.jobs.bidded_second is
  'Second bidder: 0 = not handled yet, 1 = bid sent, 2 = skipped by its project filter (reason in second_skip_reason).';

-- Only moves a project that is still waiting (0), so a bid that already went
-- out is never relabelled as skipped.
create or replace function public.skip_job_second(p_job_id text, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.jobs
     set bidded_second = 2,
         second_skip_reason = left(p_reason, 300)
   where id = p_job_id
     and bidded_second = 0;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.skip_job_second(text, text) from public;
grant execute on function public.skip_job_second(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Handy checks:
--   select bidded_second, count(*) from public.jobs group by 1;
--   select title, second_skip_reason from public.jobs
--    where bidded_second = 2 order by first_seen_at desc;
--   update public.jobs set bidded_second = 0, second_skip_reason = null
--    where id = 'some-job-id';   -- give a skipped project back to the queue
-- ============================================================================
