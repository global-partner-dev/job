-- ============================================================================
-- Workana Job Scraper — Supabase schema
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query), THEN run
-- 02_auth_multiuser.sql.
-- The scraper writes with the service-role key (bypasses RLS).
-- Read access for the web app is defined in 02_auth_multiuser.sql (approved,
-- authenticated users only). This file grants NO anon/public read — re-running
-- it is fail-closed.
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
    ai_category                 text,                        -- AI target-type verdict (saas_platform, corporate_service_website, custom_crm_erp, python_app_or_api_integration, shopify_project)
    ai_category_reason          text,                        -- AI justification for the category verdict
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

-- Backfill columns onto pre-existing tables (create-table-if-not-exists above
-- does not add columns to a table that already exists). Safe to re-run.
alter table public.jobs add column if not exists ai_category        text;
alter table public.jobs add column if not exists ai_category_reason text;

create index if not exists idx_jobs_first_seen        on public.jobs (first_seen_at desc);
create index if not exists idx_jobs_ai_category        on public.jobs (ai_category);
create index if not exists idx_jobs_posted_timestamp  on public.jobs (posted_date_timestamp desc);
create index if not exists idx_jobs_client_country     on public.jobs (client_country);
create index if not exists idx_jobs_budget_type        on public.jobs (budget_type);
create index if not exists idx_jobs_payment_verified   on public.jobs (client_payment_verified);
create index if not exists idx_jobs_skills             on public.jobs using gin (skills);

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
-- Row Level Security — deny by default. The read policy for jobs is defined in
-- 02_auth_multiuser.sql (approved authenticated users only). The scraper writes
-- with the service_role key, which bypasses RLS. Re-running this file must NEVER
-- re-open anon read, so here we only DROP any legacy public policy (no-op if
-- already gone) and never (re)create an anon-readable one.
-- ---------------------------------------------------------------------------
alter table public.jobs enable row level security;

drop policy if exists "public read jobs" on public.jobs;
