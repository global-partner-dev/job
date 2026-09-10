import type { AskRecord, AskStatus, Job } from '../types'
import { flagFor } from './flags'
import { jobMeetsMinBudget } from './format'

/**
 * Dashboard-side filtering.
 *
 * This narrows what YOU see; it does not replace the archive filters. The
 * scraper still decides what gets stored at all (country allowlist, $101+
 * floor, non-payer exclusion, AI category) — see parsers/filters.py.
 */

export type BudgetFloor = 0 | 250 | 500 | 1000 | 2500
export type StatusFilter = 'all' | 'unasked' | 'prepared' | 'sent' | 'failed'
export type SortKey = 'newest' | 'budget' | 'fewest-bids' | 'replies'

export interface JobFilterState {
  country: string // '' = any
  budget: BudgetFloor
  status: StatusFilter
  sort: SortKey
}

export const DEFAULT_FILTERS: JobFilterState = {
  country: '',
  budget: 0,
  status: 'all',
  sort: 'newest',
}

export const BUDGET_OPTIONS: { value: BudgetFloor; label: string }[] = [
  { value: 0, label: 'Any budget' },
  { value: 250, label: '$250+' },
  { value: 500, label: '$500+' },
  { value: 1000, label: '$1,000+' },
  { value: 2500, label: '$2,500+' },
]

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
  const matched = jobs.filter((job) => {
    if (filters.country && job.client_country !== filters.country) return false
    if (!jobMeetsMinBudget(job, filters.budget)) return false
    if (!statusMatches(filters.status, asks.get(job.id)?.status)) return false
    return true
  })
  return sortJobs(matched, filters.sort)
}

export function activeFilterCount(filters: JobFilterState): number {
  let n = 0
  if (filters.country) n++
  if (filters.budget !== 0) n++
  if (filters.status !== 'all') n++
  if (filters.sort !== 'newest') n++
  return n
}
