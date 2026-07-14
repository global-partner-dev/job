import type { Job } from '../types'
import { pct, timeAgo } from './format'

export interface DashboardStats {
  total: number
  new24h: number
  verifiedPct: number
  avgBids: number
  freshest: string // "time ago" of the most recently seen job
}

const DAY_MS = 24 * 60 * 60 * 1000

export function computeStats(jobs: Job[]): DashboardStats {
  const total = jobs.length
  const now = Date.now()

  let new24h = 0
  let verified = 0
  let bidsSum = 0
  let bidsCount = 0
  let freshestTs = 0

  for (const job of jobs) {
    const seen = job.first_seen_at ? new Date(job.first_seen_at).getTime() : 0
    if (seen && now - seen <= DAY_MS) new24h++
    if (seen > freshestTs) freshestTs = seen
    if (job.client_payment_verified) verified++
    if (job.bids_count != null) {
      bidsSum += job.bids_count
      bidsCount++
    }
  }

  return {
    total,
    new24h,
    verifiedPct: pct(verified, total),
    avgBids: bidsCount ? Math.round(bidsSum / bidsCount) : 0,
    freshest: freshestTs ? timeAgo(new Date(freshestTs).toISOString()) : '—',
  }
}
