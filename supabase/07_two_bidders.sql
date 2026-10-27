-- ============================================================================
-- Workana Radar — two bidders
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL Editor AFTER 06_bidded.sql. Safe to re-run.
--
-- Up to two people run the extension, each from their own browser/Workana
-- account, and BOTH bid on every project:
--   slot 1 (first bidder)   bids right away             → jobs.bidded
--   slot 2 (second bidder)  bids N minutes after the project was stored
--                           (default 20, set in the panel) → jobs.bidded_second
-- Each slot has its own 0/1 flag, so one bidder finishing never hides the
-- project from the other. The N-minute wait is counted from jobs.first_seen_at
-- (when the scraper stored the project), so it doesn't depend on the first
-- bidder being online.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Second bidder's flag
-- ---------------------------------------------------------------------------
alter table public.jobs
    add column if not exists bidded_second smallint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_bidded_second_check'
  ) then
    alter table public.jobs
      add constraint jobs_bidded_second_check check (bidded_second in (0, 1));
  end if;
end $$;

comment on column public.jobs.bidded        is 'First bidder: 0 = not bid on yet, 1 = bid sent.';
comment on column public.jobs.bidded_second is 'Second bidder: 0 = not bid on yet, 1 = bid sent.';

create index if not exists idx_jobs_unbidded_second
    on public.jobs (first_seen_at)
    where bidded_second = 0;

-- ---------------------------------------------------------------------------
-- 2. Queue functions, now slot-aware (replace the 06 versions)
-- ---------------------------------------------------------------------------
drop function if exists public.next_unbidded_job(text[]);
drop function if exists public.mark_job_bidded(text);

-- Newest project this slot has not bid on yet and that is old enough for it.
-- p_skip steps over projects that already failed during this run.
create or replace function public.next_unbidded_job(
    p_skip          text[]  default '{}',
    p_slot          integer default 1,
    p_delay_minutes integer default 0
)
returns setof public.jobs
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_slot not in (1, 2) then
    raise exception 'p_slot must be 1 or 2';
  end if;

  return query
    select *
      from public.jobs j
     where case when p_slot = 2 then j.bidded_second = 0 else j.bidded = 0 end
       and not (j.id = any(coalesce(p_skip, '{}')))
       -- Only enforce the wait when one is asked for, so a scraper clock a few
       -- seconds ahead of the database can't hide a fresh project from slot 1.
       and (coalesce(p_delay_minutes, 0) <= 0
            or j.first_seen_at is null
            or j.first_seen_at <= now() - make_interval(mins => p_delay_minutes))
     order by coalesce(j.posted_date_timestamp, j.first_seen_at) desc nulls last
     limit 1;
end;
$$;

create or replace function public.mark_job_bidded(p_job_id text, p_slot integer default 1)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_slot not in (1, 2) then
    raise exception 'p_slot must be 1 or 2';
  end if;

  if p_slot = 2 then
    update public.jobs set bidded_second = 1 where id = p_job_id;
  else
    update public.jobs set bidded = 1 where id = p_job_id;
  end if;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.next_unbidded_job(text[], integer, integer) from public;
revoke all on function public.mark_job_bidded(text, integer)              from public;
grant execute on function public.next_unbidded_job(text[], integer, integer) to anon, authenticated;
grant execute on function public.mark_job_bidded(text, integer)              to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Daily cleanup — keep a project until BOTH bidders are done with it
-- ---------------------------------------------------------------------------
-- A bidded row must not be deleted while the project is still listed: the
-- scraper would store it again as new and a bidder would bid on it twice.
create or replace function public.cleanup_old_data()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  jobs_deleted integer;
begin
  delete from public.jobs
  where first_seen_at < now() - interval '24 hours'
    and bidded = 0
    and bidded_second = 0
    and id not in (select job_id from public.bids);
  get diagnostics jobs_deleted = row_count;

  return jsonb_build_object('jobs_deleted', jobs_deleted, 'ran_at', now());
end;
$$;

-- ---------------------------------------------------------------------------
-- Handy checks:
--   select bidded, bidded_second, count(*) from public.jobs group by 1, 2;
--   select * from public.next_unbidded_job('{}', 1, 0);    -- first bidder
--   select * from public.next_unbidded_job('{}', 2, 20);   -- second bidder
-- ============================================================================
