import type { Filters, ScoredJob } from '../types'
import { bestDescription, bestTitle, lastReplyHours, skillsOf } from './format'

function haystack(job: ScoredJob): string {
  return [
    bestTitle(job),
    bestDescription(job),
    job.ai_summary ?? '',
    job.client_name ?? '',
    job.client_country ?? '',
    skillsOf(job).join(' '),
  ]
    .join(' ')
    .toLowerCase()
}

export function applyFilters(
  jobs: ScoredJob[],
  filters: Filters,
  savedIds: Set<string>,
): ScoredJob[] {
  const q = filters.search.trim().toLowerCase()

  const filtered = jobs.filter((job) => {
    if (filters.verifiedOnly && !job.client_payment_verified) return false
    if (filters.savedOnly && !savedIds.has(job.id)) return false
    if (filters.budgetType !== 'all' && job.budget_type !== filters.budgetType) return false
    if (filters.country && job.client_country !== filters.country) return false
    if (job.scoring.score < filters.minScore) return false

    // Price range — a job passes if its budget overlaps [minBudget, maxBudget].
    // Jobs with no budget info are not excluded by the price filter.
    if (filters.minBudget > 0 || filters.maxBudget > 0) {
      const lo = job.budget_min ?? job.budget_max
      const hi = job.budget_max ?? job.budget_min
      if (lo != null || hi != null) {
        const jobLo = lo ?? 0
        const jobHi = hi ?? Number.POSITIVE_INFINITY
        if (filters.maxBudget > 0 && jobLo > filters.maxBudget) return false
        if (filters.minBudget > 0 && jobHi < filters.minBudget) return false
      }
    }

    // Last-reply recency — client must have replied within N hours.
    if (filters.lastReplyMaxHours > 0) {
      const h = lastReplyHours(job.client_last_reply)
      if (h == null || h > filters.lastReplyMaxHours) return false
    }

    if (q && !haystack(job).includes(q)) return false
    return true
  })

  const ts = (j: ScoredJob) =>
    j.first_seen_at ? new Date(j.first_seen_at).getTime() : 0

  const sorted = filtered.slice()
  switch (filters.sort) {
    case 'score':
      sorted.sort((a, b) => b.scoring.score - a.scoring.score || ts(b) - ts(a))
      break
    case 'fewest_bids':
      sorted.sort(
        (a, b) => (a.bids_count ?? 1e9) - (b.bids_count ?? 1e9) || ts(b) - ts(a),
      )
      break
    case 'budget':
      sorted.sort((a, b) => (b.budget_min ?? -1) - (a.budget_min ?? -1) || ts(b) - ts(a))
      break
    case 'rating':
      sorted.sort((a, b) => (b.client_rating ?? -1) - (a.client_rating ?? -1) || ts(b) - ts(a))
      break
    case 'newest':
    default:
      sorted.sort((a, b) => ts(b) - ts(a))
      break
  }

  return sorted
}

export function uniqueCountries(jobs: ScoredJob[]): string[] {
  const set = new Set<string>()
  for (const job of jobs) {
    if (job.client_country) set.add(job.client_country)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}
