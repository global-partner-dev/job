import type { ScoredJob, ScoreTier } from '../types'
import { flagFor } from './flags'
import { skillsOf } from './format'
import { TIER_LABEL } from './scoring'

export interface CountryStat {
  name: string
  flag: string
  count: number
  pct: number // share of total, 0–100
}

export interface TierStat {
  tier: ScoreTier
  label: string
  count: number
  pct: number
}

export interface SkillStat {
  skill: string
  count: number
  pct: number
}

/** Top countries by job count (with % share of all jobs). */
export function countryBreakdown(jobs: ScoredJob[], limit = 6): CountryStat[] {
  const counts = new Map<string, number>()
  for (const job of jobs) {
    const name = job.client_country || 'Unknown'
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const total = jobs.length || 1
  return [...counts.entries()]
    .map(([name, count]) => ({ name, flag: flagFor(name), count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

const TIER_ORDER: ScoreTier[] = ['hot', 'good', 'fair', 'low']

/** Distribution of jobs across opportunity tiers. */
export function tierDistribution(jobs: ScoredJob[]): TierStat[] {
  const counts: Record<ScoreTier, number> = { hot: 0, good: 0, fair: 0, low: 0 }
  for (const job of jobs) counts[job.scoring.tier]++
  const total = jobs.length || 1
  return TIER_ORDER.map((tier) => ({
    tier,
    label: TIER_LABEL[tier],
    count: counts[tier],
    pct: Math.round((counts[tier] / total) * 100),
  }))
}

/** Most in-demand skills across all jobs. */
export function topSkills(jobs: ScoredJob[], limit = 10): SkillStat[] {
  const counts = new Map<string, number>()
  for (const job of jobs) {
    for (const skill of skillsOf(job)) {
      const key = skill.trim()
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const total = jobs.length || 1
  return [...counts.entries()]
    .map(([skill, count]) => ({ skill, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

/** Highest-scoring jobs first. */
export function topOpportunities(jobs: ScoredJob[], limit = 6): ScoredJob[] {
  return jobs
    .slice()
    .sort((a, b) => b.scoring.score - a.scoring.score)
    .slice(0, limit)
}
