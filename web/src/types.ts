export type BudgetType = 'fixed' | 'hourly' | null

/**
 * One row of the Supabase `jobs` table.
 *
 * Text is stored exactly as posted (Portuguese / Spanish / English). The scraper
 * neither translates nor summarizes — the only AI step is the category filter,
 * whose verdict is kept out of this type because the UI doesn't show it.
 */
export interface Job {
  id: string
  title: string | null
  description: string | null
  url: string | null
  posted_date_relative: string | null
  posted_date_timestamp: string | null
  bids_count: number | null
  budget: string | null
  budget_min: number | null
  budget_max: number | null
  budget_type: BudgetType
  skills: string[] | null
  client_name: string | null
  client_country: string | null
  client_rating: number | null
  client_payment_verified: boolean | null
  client_last_reply: string | null
  client_published_projects: number | null
  client_paid_projects: number | null
  client_joined_month: number | null
  client_joined_year: number | null
  is_featured: boolean | null
  is_max_project: boolean | null
  scraped_at: string | null
  first_seen_at: string | null
  last_seen_at: string | null
}

export type View = 'dashboard' | 'jobs' | 'saved' | 'admin'

export type UserRole = 'user' | 'admin'
export type UserStatus = 'pending' | 'approved' | 'rejected'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: UserRole
  status: UserStatus
  created_at: string
}

/**
 * Where a project stands in the ask flow.
 *
 *   queued    — claimed for this user, question not written yet
 *   preparing — the question is being written
 *   prepared  — Workana opened pre-filled, waiting for you to press Send
 *   sent      — you sent it; the project leaves the queue
 */
export type AskStatus = 'queued' | 'preparing' | 'prepared' | 'sent' | 'failed' | 'skipped'

/**
 * One row of the `bids` table — kept under its original name, but a row now
 * records a question asked about a project (unique per user + project).
 */
export interface AskRecord {
  id: string
  user_id: string
  job_id: string
  status: AskStatus
  question: string | null
  error: string | null
  created_at: string
  updated_at: string
}

/** Statuses written by the older place-bid flow, mapped onto the ask flow. */
const LEGACY_STATUS: Record<string, AskStatus> = {
  locked: 'queued',
  placing: 'preparing',
  manual: 'prepared',
  placed: 'sent',
}

/** Normalize a row from Supabase, tolerating rows written before the ask flow. */
export function toAskRecord(row: Record<string, unknown>): AskRecord {
  const raw = String(row.status ?? 'queued')
  return {
    id: String(row.id ?? ''),
    user_id: String(row.user_id ?? ''),
    job_id: String(row.job_id ?? ''),
    status: LEGACY_STATUS[raw] ?? (raw as AskStatus),
    question: (row.question ?? row.proposal ?? null) as string | null,
    error: (row.error ?? null) as string | null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}
