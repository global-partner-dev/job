-- ============================================================================
-- Workana Radar — multi-user auth, approval, and per-user bid dedup
-- ----------------------------------------------------------------------------
-- Run this AFTER schema.sql, in the Supabase SQL Editor.
-- Adds: profiles (role + approval status), a bids claim table (unique per
-- user+project), signup trigger, and RLS that gates jobs to APPROVED users.
--
-- Bootstrap the first admin AFTER you sign up once in the web app:
--   update public.profiles set role='admin', status='approved' where email='you@example.com';
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'user',      -- 'user' | 'admin'
  status      text not null default 'pending',   -- 'pending' | 'approved' | 'rejected'
  created_at  timestamptz not null default now()
);

create index if not exists idx_profiles_status on public.profiles (status);

-- Auto-create a profile whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- SECURITY DEFINER helpers (bypass RLS → avoid recursive policy checks).
create or replace function public.is_approved()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'approved'
  );
$$;

-- ---------------------------------------------------------------------------
-- bids — per-user bid record / lock (one per user per project)
-- ---------------------------------------------------------------------------
create table if not exists public.bids (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  job_id         text not null references public.jobs(id) on delete cascade,
  status         text not null default 'locked',  -- locked | placing | placed | manual | failed | skipped
  amount         numeric,
  delivery_time  text,
  proposal       text,
  bid_url        text,
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, job_id)                          -- dedup: never bid the same project twice
);

create index if not exists idx_bids_user   on public.bids (user_id);
create index if not exists idx_bids_job     on public.bids (job_id);
create index if not exists idx_bids_status  on public.bids (status);

-- Realtime so the dashboard reflects bid status as the extension updates it.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bids'
  ) then
    alter publication supabase_realtime add table public.bids;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.bids     enable row level security;

-- profiles: read own; admins read all. Update: admins only (approval/role).
drop policy if exists "read own or admin" on public.profiles;
create policy "read own or admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "admin updates profiles" on public.profiles;
create policy "admin updates profiles" on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- bids: a user owns their own rows, but only while approved (so revoking a user
-- fully cuts off read/write). Admins can read all.
drop policy if exists "own bids select" on public.bids;
create policy "own bids select" on public.bids
  for select to authenticated
  using ((user_id = auth.uid() and public.is_approved()) or public.is_admin());

drop policy if exists "own bids insert" on public.bids;
create policy "own bids insert" on public.bids
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_approved());

drop policy if exists "own bids update" on public.bids;
create policy "own bids update" on public.bids
  for update to authenticated
  using (user_id = auth.uid() and public.is_approved())
  with check (user_id = auth.uid() and public.is_approved());

drop policy if exists "own bids delete" on public.bids;
create policy "own bids delete" on public.bids
  for delete to authenticated
  using (user_id = auth.uid() and public.is_approved());

-- ---------------------------------------------------------------------------
-- Re-gate jobs: APPROVED users only (was public/anon read).
-- The scraper keeps writing via the service_role key (bypasses RLS).
-- ---------------------------------------------------------------------------
drop policy if exists "public read jobs" on public.jobs;
drop policy if exists "approved read jobs" on public.jobs;
create policy "approved read jobs" on public.jobs
  for select to authenticated
  using (public.is_approved());
