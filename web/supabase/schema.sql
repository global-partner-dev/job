-- ============================================================================
-- Workana Job Scraper — Supabase schema
-- ----------------------------------------------------------------------------
-- Run this once in the Supabase SQL Editor (Dashboard → SQL → New query).
-- The scraper writes with the service-role key (bypasses RLS).
-- The React web app reads with the anon key under the read-only policies below.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
    id                          text primary key,           -- Workana job slug
    title                       text,
    title_en                    text,                        -- AI/Google translation
    description                 text,
    description_en              text,                        -- AI/Google translation
    ai_summary                  text,                        -- OpenAI analysis (**bold** markdown kept)
    url                         text,
    posted_date_relative        text,
    posted_date_timestamp       timestamptz,
    bids_count                  integer,
    budget                      text,
    budget_min                  numeric,
    budget_max                  numeric,
    budget_type                 text,                        -- 'fixed' | 'hourly'
    skills                      jsonb default '[]'::jsonb,
    client_name                 text,
    client_country              text,
    client_rating               numeric,
    client_payment_verified     boolean default false,
    client_last_reply           text,
    client_published_projects   integer,
    client_paid_projects        integer,
    client_joined_month         integer,
    client_joined_year          integer,
    is_featured                 boolean default false,
    is_max_project              boolean default false,
    scraped_at                  timestamptz,
    first_seen_at               timestamptz default now(),
    last_seen_at                timestamptz
);

create index if not exists idx_jobs_first_seen        on public.jobs (first_seen_at desc);
create index if not exists idx_jobs_posted_timestamp  on public.jobs (posted_date_timestamp desc);
create index if not exists idx_jobs_client_country     on public.jobs (client_country);
create index if not exists idx_jobs_budget_type        on public.jobs (budget_type);
create index if not exists idx_jobs_payment_verified   on public.jobs (client_payment_verified);
create index if not exists idx_jobs_skills             on public.jobs using gin (skills);

-- ---------------------------------------------------------------------------
-- scrape_history
-- ---------------------------------------------------------------------------
create table if not exists public.scrape_history (
    id                bigint generated always as identity primary key,
    timestamp         timestamptz default now(),
    jobs_found        integer,
    new_jobs_count    integer,
    pages_scraped     integer,
    duration_seconds  numeric,
    category          text,
    language          text
);

create index if not exists idx_history_timestamp on public.scrape_history (timestamp desc);

-- ---------------------------------------------------------------------------
-- Realtime — let the web app receive live INSERT/UPDATE events on jobs.
-- Guarded so re-running this whole script stays idempotent (adding a table
-- already in the publication would otherwise error and abort the batch).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'jobs'
  ) then
    alter publication supabase_realtime add table public.jobs;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security — anon key gets read-only access; writes need service role
-- ---------------------------------------------------------------------------
alter table public.jobs           enable row level security;
alter table public.scrape_history enable row level security;

drop policy if exists "public read jobs" on public.jobs;
create policy "public read jobs"
    on public.jobs for select
    to anon, authenticated
    using (true);

drop policy if exists "public read scrape_history" on public.scrape_history;
create policy "public read scrape_history"
    on public.scrape_history for select
    to anon, authenticated
    using (true);
