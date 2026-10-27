-- ============================================================================
-- Workana Radar — `bidded` flag + extension queue functions
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL Editor AFTER 01–05. Safe to re-run (idempotent).
--
-- The web dashboard is gone; the Chrome extension now reads the queue straight
-- from this database with the project's PUBLISHABLE (anon) key. To keep that
-- key safe to ship inside an extension, the anon role gets NO table access:
-- it can only call the two functions below, which do exactly two things —
--   next_unbidded_job()   hand back the newest project with bidded = 0
--   mark_job_bidded(id)   set bidded = 1 on one project
-- The scraper keeps writing with the secret (service_role) key.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. jobs.bidded — 0 = not bid on yet, 1 = bid sent
-- ---------------------------------------------------------------------------
alter table public.jobs
    add column if not exists bidded smallint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_bidded_check'
  ) then
    alter table public.jobs
      add constraint jobs_bidded_check check (bidded in (0, 1));
  end if;
end $$;

comment on column public.jobs.bidded is '0 = not bid on yet, 1 = the extension sent the bid.';

-- Carry over projects the old dashboard flow already sent, so they are not
-- bid on a second time.
do $$
begin
  if to_regclass('public.bids') is not null then
    update public.jobs
       set bidded = 1
     where bidded = 0
       and id in (select job_id from public.bids where status = 'sent');
  end if;
end $$;

create index if not exists idx_jobs_unbidded
    on public.jobs (posted_date_timestamp desc nulls last)
    where bidded = 0;

-- ---------------------------------------------------------------------------
-- 2. Queue functions for the extension (callable with the publishable key)
-- ---------------------------------------------------------------------------
-- p_skip lets the extension step past a project it already failed on during
-- this run, so one bad project cannot block the whole queue.
create or replace function public.next_unbidded_job(p_skip text[] default '{}')
returns setof public.jobs
language sql
stable
security definer
set search_path = public
as $$
  select *
    from public.jobs
   where bidded = 0
     and not (id = any(coalesce(p_skip, '{}')))
   order by coalesce(posted_date_timestamp, first_seen_at) desc nulls last
   limit 1;
$$;

create or replace function public.mark_job_bidded(p_job_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.jobs set bidded = 1 where id = p_job_id;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.next_unbidded_job(text[]) from public;
revoke all on function public.mark_job_bidded(text)     from public;
grant execute on function public.next_unbidded_job(text[]) to anon, authenticated;
grant execute on function public.mark_job_bidded(text)     to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Daily cleanup — never delete a project we already bid on
-- ---------------------------------------------------------------------------
-- 03_cleanup.sql dropped every old job. A bidded row must stay: if it were
-- deleted while still listed on Workana, the scraper would store it again as a
-- brand-new bidded = 0 project and the extension would bid on it twice.
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
    and id not in (select job_id from public.bids);
  get diagnostics jobs_deleted = row_count;

  return jsonb_build_object('jobs_deleted', jobs_deleted, 'ran_at', now());
end;
$$;

-- ---------------------------------------------------------------------------
-- Handy checks:
--   select bidded, count(*) from public.jobs group by bidded;
--   select * from public.next_unbidded_job();
--   select public.mark_job_bidded('some-job-id');
-- ============================================================================
