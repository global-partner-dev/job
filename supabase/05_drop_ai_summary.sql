-- ============================================================================
-- Workana Radar — remove the AI summary step
-- ----------------------------------------------------------------------------
-- Run this AFTER 04_ask_questions.sql, in the Supabase SQL Editor.
-- Safe to re-run (idempotent).
--
-- What changed in the app:
--   The scraper no longer generates `ai_summary`. Summarizing a project the
--   dashboard already shows in full added an OpenAI call per job without
--   telling you anything the description didn't, so the step is gone and the
--   dashboard's "AI analysis" block with it.
--
-- The ONE remaining AI step in the scrape pipeline is the category filter,
-- which writes `ai_category` / `ai_category_reason`. Those columns stay.
-- Turn that off too with AI_CATEGORY_FILTER=0 in .env — no schema change needed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- jobs.ai_summary is no longer written or read
-- ---------------------------------------------------------------------------
-- Left in place so existing summaries are not destroyed. Drop it once you are
-- sure you don't want the history:
--   alter table public.jobs drop column if exists ai_summary;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'ai_summary'
  ) then
    comment on column public.jobs.ai_summary is
      'DEPRECATED — AI summary step removed; the description is stored in full instead.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Handy checks:
--   select count(*) from public.jobs where ai_summary is not null;  -- old rows
--   select ai_category, count(*) from public.jobs group by ai_category;
-- ============================================================================
