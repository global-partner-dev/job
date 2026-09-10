import type { AskRecord, AskStatus, Job } from '../types'
import { flagFor } from './flags'
import { jobInBudgetRange } from './format'

/**
 * Dashboard-side filtering.
 *
 * This narrows what YOU see; it does not replace the archive filters. The
 * scraper still decides what gets stored at all (country allowlist, $101+
 * floor, non-payer exclusion, AI category) — see parsers/filters.py.
 */

export type StatusFilter = 'all' | 'unasked' | 'prepared' | 'sent' | 'failed'
export type SortKey = 'newest' | 'budget' | 'fewest-bids' | 'replies'

/** A named budget interval. `max: null` means "no upper bound". */
export interface BudgetBand {
  id: string
  label: string
  min: number
  max: number | null
}

/** Picked so the bands butt up against each other with no gaps. */
export const BUDGET_BANDS: BudgetBand[] = [
  { id: 'any', label: 'Any budget', min: 0, max: null },
  { id: '101-250', label: '$101 – $250', min: 101, max: 250 },
  { id: '250-500', label: '$250 – $500', min: 250, max: 500 },
  { id: '500-1000', label: '$500 – $1,000', min: 500, max: 1000 },
  { id: '1000-2500', label: '$1,000 – $2,500', min: 1000, max: 2500 },
  { id: '2500-5000', label: '$2,500 – $5,000', min: 2500, max: 5000 },
  { id: '5000+', label: '$5,000 and up', min: 5000, max: null },
]

/** Sentinel band id that switches the filter to the two number inputs. */
export const CUSTOM_BUDGET = 'custom'

export interface JobFilterState {
  country: string // '' = any
  /** A BudgetBand id, or CUSTOM_BUDGET to use budgetMin/budgetMax. */
  budget: string
  budgetMin: number
  budgetMax: number | null
  status: StatusFilter
  sort: SortKey
}

export const DEFAULT_FILTERS: JobFilterState = {
  country: '',
  budget: 'any',
  budgetMin: 0,
  budgetMax: null,
  status: 'all',
  sort: 'newest',
}

/** The interval the current selection actually means. */
export function resolveBudgetRange(filters: JobFilterState): { min: number; max: number | null } {
  if (filters.budget === CUSTOM_BUDGET) {
    const min = Math.max(0, filters.budgetMin || 0)
    const max = filters.budgetMax == null ? null : Math.max(min, filters.budgetMax)
    return { min, max }
  }
  const band = BUDGET_BANDS.find((b) => b.id === filters.budget)
  return band ? { min: band.min, max: band.max } : { min: 0, max: null }
}

/** Human-readable form of the active interval, for the filter summary line. */
export function budgetRangeLabel(filters: JobFilterState): string | null {
  const { min, max } = resolveBudgetRange(filters)
  if (min <= 0 && max == null) return null
  const fmt = (n: number) => `$${n.toLocaleString()}`
  if (max == null) return `${fmt(min)} and up`
  if (min <= 0) return `up to ${fmt(max)}`
  return `${fmt(min)} – ${fmt(max)}`
}

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Any status' },
  { value: 'unasked', label: 'Not asked' },
  { value: 'prepared', label: 'Waiting to send' },
  { value: 'sent', label: 'Question sent' },
  { value: 'failed', label: 'Failed' },
]

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'budget', label: 'Highest budget' },
  { value: 'fewest-bids', label: 'Fewest bids' },
  { value: 'replies', label: 'Client replies fastest' },
]

export interface CountryOption {
  value: string
  label: string
  count: number
}

/** The countries actually present in the feed, most-common first. */
export function countryOptions(jobs: Job[]): CountryOption[] {
  const counts = new Map<string, number>()
  for (const job of jobs) {
    const name = job.client_country?.trim()
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ value: name, label: `${flagFor(name)} ${name}`, count }))
}

function statusMatches(filter: StatusFilter, status: AskStatus | undefined): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'unasked':
      return status == null || status === 'queued' || status === 'skipped'
    case 'prepared':
      return status === 'prepared' || status === 'preparing'
    case 'sent':
      return status === 'sent'
    case 'failed':
      return status === 'failed'
  }
}

const ts = (j: Job) => (j.first_seen_at ? new Date(j.first_seen_at).getTime() : 0)
const budgetOf = (j: Job) => j.budget_max ?? j.budget_min ?? 0

function sortJobs(jobs: Job[], sort: SortKey): Job[] {
  const out = jobs.slice()
  switch (sort) {
    case 'newest':
      return out.sort((a, b) => ts(b) - ts(a))
    case 'budget':
      return out.sort((a, b) => budgetOf(b) - budgetOf(a) || ts(b) - ts(a))
    case 'fewest-bids':
      return out.sort(
        (a, b) => (a.bids_count ?? Infinity) - (b.bids_count ?? Infinity) || ts(b) - ts(a),
      )
    case 'replies':
      return out.sort(
        (a, b) => Number(!!b.client_last_reply) - Number(!!a.client_last_reply) || ts(b) - ts(a),
      )
  }
}

export function applyJobFilters(
  jobs: Job[],
  filters: JobFilterState,
  asks: Map<string, AskRecord>,
): Job[] {
  const { min, max } = resolveBudgetRange(filters)
  const matched = jobs.filter((job) => {
    if (filters.country && job.client_country !== filters.country) return false
    if (!jobInBudgetRange(job, min, max)) return false
    if (!statusMatches(filters.status, asks.get(job.id)?.status)) return false
    return true
  })
  return sortJobs(matched, filters.sort)
}

export function activeFilterCount(filters: JobFilterState): number {
  let n = 0
  if (filters.country) n++
  if (budgetRangeLabel(filters)) n++
  if (filters.status !== 'all') n++
  if (filters.sort !== 'newest') n++
  return n
}
