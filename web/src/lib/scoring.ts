import type { Job, JobScore, ScoreTier, ScoredJob } from '../types'

/**
 * Opportunity score (0–100): a heuristic lead-quality ranking so the best jobs
 * float to the top. It rewards trustworthy, paying clients with fresh, low-
 * competition posts. Every contribution is recorded as a human-readable reason.
 */
export function scoreJob(job: Job): JobScore {
  let score = 40
  const reasons: string[] = []

  // --- Client trust ---------------------------------------------------------
  if (job.client_payment_verified) {
    score += 20
    reasons.push('Payment method verified')
  } else {
    score -= 6
    reasons.push('Payment not verified')
  }

  const paid = job.client_paid_projects ?? 0
  if (paid > 0) {
    const bonus = Math.min(16, paid * 2)
    score += bonus
    reasons.push(`Client has paid for ${paid} project${paid === 1 ? '' : 's'}`)
  } else if ((job.client_published_projects ?? 0) === 0) {
    score -= 4
    reasons.push('New client with no history')
  }

  const rating = job.client_rating ?? 0
  if (rating > 0) {
    score += Math.round(rating * 2) // up to +10
    reasons.push(`Client rating ${rating.toFixed(1)}/5`)
  }

  // --- Competition ----------------------------------------------------------
  const bids = job.bids_count
  if (bids != null) {
    if (bids <= 3) {
      score += 15
      reasons.push(`Low competition — only ${bids} bid${bids === 1 ? '' : 's'}`)
    } else if (bids <= 8) {
      score += 8
      reasons.push(`Moderate competition — ${bids} bids`)
    } else if (bids <= 15) {
      reasons.push(`${bids} bids so far`)
    } else {
      score -= 8
      reasons.push(`Crowded — ${bids} bids`)
    }
  }

  // --- Budget ---------------------------------------------------------------
  if (job.budget) {
    score += 4
    const min = job.budget_min ?? 0
    if (job.budget_type === 'hourly' ? min >= 20 : min >= 500) {
      score += 6
      reasons.push('Strong budget')
    } else {
      reasons.push('Budget listed')
    }
  } else {
    reasons.push('No budget listed')
  }

  // --- Freshness ------------------------------------------------------------
  const ts = job.posted_date_timestamp || job.first_seen_at
  if (ts) {
    const hours = (Date.now() - new Date(ts).getTime()) / 3_600_000
    if (hours >= 0 && hours <= 3) {
      score += 6
      reasons.push('Posted in the last few hours')
    } else if (hours <= 12) {
      score += 3
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, tier: tierOf(score), reasons }
}

export function tierOf(score: number): ScoreTier {
  if (score >= 75) return 'hot'
  if (score >= 55) return 'good'
  if (score >= 35) return 'fair'
  return 'low'
}

export const TIER_LABEL: Record<ScoreTier, string> = {
  hot: 'Hot lead',
  good: 'Good',
  fair: 'Fair',
  low: 'Low',
}

/**
 * A ready-to-use CSS color for a tier, driven by the --hot/--good/--fair/--low
 * channel vars in index.css. Pass an alpha for tinted backgrounds.
 * e.g. tierColor('hot') → "rgb(var(--hot))", tierColor('hot', 0.14) for a tint.
 */
export function tierColor(tier: ScoreTier, alpha = 1): string {
  const v = `var(--${tier})`
  return alpha >= 1 ? `rgb(${v})` : `rgb(${v} / ${alpha})`
}

export function withScore(job: Job): ScoredJob {
  return { ...job, scoring: scoreJob(job) }
}
