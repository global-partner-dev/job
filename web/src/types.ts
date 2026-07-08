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

export type ScoreTier = 'hot' | 'good' | 'fair' | 'low'

export interface JobScore {
  score: number // 0–100 opportunity score
  tier: ScoreTier
  reasons: string[] // human-readable explanation of the score
}

/** A job augmented with its computed opportunity score. */
export type ScoredJob = Job & { scoring: JobScore }

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

/** One row of the `bids` table (per-user bid record / lock). */
export interface Bid {
  id: string
  user_id: string
  job_id: string
  status: 'locked' | 'placing' | 'placed' | 'manual' | 'failed' | 'skipped'
  amount: number | null
  delivery_time: string | null
  proposal: string | null
  bid_url: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export type SortKey = 'newest' | 'score' | 'fewest_bids' | 'budget' | 'rating'

export interface Filters {
  search: string
  budgetType: BudgetType | 'all'
  verifiedOnly: boolean
  savedOnly: boolean
  country: string // '' = all
  minScore: number // 0–100
  minBudget: number // USD, 0 = no minimum
  maxBudget: number // USD, 0 = no maximum
  lastReplyMaxHours: number // client replied within N hours; 0 = any
  sort: SortKey
}
