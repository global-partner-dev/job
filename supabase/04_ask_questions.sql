-- ============================================================================
-- Workana Radar — place-bid ➜ ask-a-question migration
-- ----------------------------------------------------------------------------
-- Run this AFTER schema.sql, 02_auth_multiuser.sql and 03_cleanup.sql, in the
-- Supabase SQL Editor. Safe to re-run (idempotent).
--
-- What changed in the app:
--   * The "place bid" flow is gone. The extension now only pre-fills Workana's
--     "Ask a question" form and you press Send yourself, so a row in `bids`
--     records a QUESTION about a project, not a placed bid.
--   * The scraper no longer translates anything — project details are stored
--     exactly as posted, and `ai_summary` stays the one English field.
--
-- The `bids` table keeps its name so existing rows, RLS policies, realtime and
-- the 03_cleanup.sql "keep jobs the user acted on" rule all stay valid.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. bids → holds the asked question
-- ---------------------------------------------------------------------------
alter table public.bids add column if not exists question text;

-- Carry over any message text written by the old place-bid flow.
update public.bids
   set question = proposal
 where question is null
   and proposal is not null;

-- Status vocabulary:
--   queued    — claimed for this user, question not written yet
--   preparing — the question is being written
--   prepared  — Workana opened pre-filled, waiting for you to press Send
--   sent      — you sent it; the project leaves the dashboard queue
--   failed / skipped
-- Map the old place-bid statuses onto it. The app also normalizes these on read,
-- so a database that skipped this file still works.
update public.bids set status = 'queued'    where status = 'locked';
update public.bids set status = 'preparing' where status = 'placing';
update public.bids set status = 'prepared'  where status = 'manual';
update public.bids set status = 'sent'      where status = 'placed';

comment on table  public.bids            is 'One question asked per user per project (table name kept from the old place-bid flow).';
comment on column public.bids.status     is 'queued | preparing | prepared | sent | failed | skipped';
comment on column public.bids.question   is 'The clarifying question written for this project.';

-- Bid-only columns. Nothing writes them any more; they are left in place so no
-- history is lost. Drop them by hand once you are sure you do not want it:
--   alter table public.bids
--     drop column if exists amount,
--     drop column if exists delivery_time,
--     drop column if exists proposal,
--     drop column if exists bid_url;
comment on column public.bids.amount        is 'DEPRECATED — place-bid flow removed.';
comment on column public.bids.delivery_time is 'DEPRECATED — place-bid flow removed.';
comment on column public.bids.proposal      is 'DEPRECATED — superseded by bids.question.';
comment on column public.bids.bid_url       is 'DEPRECATED — place-bid flow removed.';

-- Dashboard queue reads "everything since the toggle was switched on that is not
-- yet sent", so status is filtered together with the job's first_seen_at.
create index if not exists idx_bids_user_status on public.bids (user_id, status);

-- ---------------------------------------------------------------------------
-- 2. jobs → no translation columns
-- ---------------------------------------------------------------------------
-- schema.sql still creates title_en / description_en for backwards
-- compatibility, but the scraper stopped writing them and the web app no longer
-- reads them. Left in place so existing data is not destroyed — drop them once
-- you are sure nothing else reads them:
--   alter table public.jobs
--     drop column if exists title_en,
--     drop column if exists description_en;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'title_en'
  ) then
    comment on column public.jobs.title_en is 'DEPRECATED — translation removed; title is stored as posted.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'description_en'
  ) then
    comment on column public.jobs.description_en is 'DEPRECATED — translation removed; description is stored as posted.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Handy checks:
--   select status, count(*) from public.bids group by status;
--   select count(*) from public.bids where question is not null;
-- ============================================================================
