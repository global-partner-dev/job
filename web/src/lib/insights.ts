import type { Job } from '../types'
import { flagFor } from './flags'
import { skillsOf } from './format'

export interface CountryStat {
  name: string
  flag: string
  count: number
  pct: number // share of total, 0–100
}

export interface SkillStat {
  skill: string
  count: number
  pct: number
}

/** Top countries by job count (with % share of all jobs). */
export function countryBreakdown(jobs: Job[], limit = 6): CountryStat[] {
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

/** Most in-demand skills across all jobs. */
export function topSkills(jobs: Job[], limit = 10): SkillStat[] {
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

/** Newest jobs first (feed default now that scoring is gone). */
export function latestJobs(jobs: Job[], limit = 6): Job[] {
  const ts = (j: Job) => (j.first_seen_at ? new Date(j.first_seen_at).getTime() : 0)
  return jobs.slice().sort((a, b) => ts(b) - ts(a)).slice(0, limit)
}
