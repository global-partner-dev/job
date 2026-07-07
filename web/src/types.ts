export type BudgetType = 'fixed' | 'hourly' | null

/** One row of the Supabase `jobs` table. */
export interface Job {
  id: string
  title: string | null
  title_en: string | null
  description: string | null
  description_en: string | null
  ai_summary: string | null
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

/** One row of the Supabase `scrape_history` table. */
export interface ScrapeRun {
  id: number
  timestamp: string | null
  jobs_found: number | null
  new_jobs_count: number | null
  pages_scraped: number | null
  duration_seconds: number | null
  category: string | null
  language: string | null
}

export type ScoreTier = 'hot' | 'good' | 'fair' | 'low'

export interface JobScore {
  score: number // 0–100 opportunity score
  tier: ScoreTier
  reasons: string[] // human-readable explanation of the score
}

/** A job augmented with its computed opportunity score. */
export type ScoredJob = Job & { scoring: JobScore }

export type SortKey = 'newest' | 'score' | 'fewest_bids' | 'budget' | 'rating'

export interface Filters {
  search: string
  budgetType: BudgetType | 'all'
  verifiedOnly: boolean
  savedOnly: boolean
  country: string // '' = all
  minScore: number // 0–100
  sort: SortKey
}
