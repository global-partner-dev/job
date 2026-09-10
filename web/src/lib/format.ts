import type { Job } from '../types'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** Compact "time ago" from an ISO timestamp (e.g. "3h ago", "2d ago"). */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

/** "Member since" label from the stored month (1–12) + year. */
export function joinedLabel(month: number | null, year: number | null): string | null {
  if (!year) return null
  if (month && month >= 1 && month <= 12) return `${MONTHS[month - 1]} ${year}`
  return String(year)
}

/** Normalize skills which may arrive as an array, JSON string, or null. */
export function skillsOf(job: Pick<Job, 'skills'>): string[] {
  const raw = job.skills
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [raw]
    } catch {
      return [raw]
    }
  }
  return []
}

/** Title as posted — the scraper stores the original language, untranslated. */
export function bestTitle(job: Job): string {
  return job.title || 'Untitled project'
}

export function bestDescription(job: Job): string {
  return job.description || ''
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0
  return Math.round((part / whole) * 100)
}

/**
 * Parse a "last reply" relative-time string (EN/ES/PT) into hours.
 * e.g. "7 hours ago" → 7, "10 minutes ago" → 0.17, "Just now" → 0,
 * "2 days ago"/"hace 2 días"/"há 2 dias" → 48. Returns null if unparseable.
 */
export function lastReplyHours(text: string | null | undefined): number | null {
  if (!text) return null
  const t = text.trim().toLowerCase()
  if (!t) return null
  if (/(just now|ahora|agora)|^now$/.test(t)) return 0
  if (/(yesterday|ayer|ontem)/.test(t)) return 30
  const m = t.match(/(\d+)\s*([a-zà-ÿ]+)/)
  const n = m ? parseInt(m[1], 10) : 1 // "an hour ago" → 1
  const unit = m ? m[2] : t
  if (/^(min|minute|minuto)/.test(unit)) return n / 60
  if (/^(h|hr|hour|hora)/.test(unit)) return n
  if (/^(d|day|dia|día)/.test(unit)) return n * 24
  if (/^(w|week|semana)/.test(unit)) return n * 24 * 7
  if (/^(mo|month|mes|mês)/.test(unit)) return n * 24 * 30
  if (/^(year|ano|año)/.test(unit)) return n * 24 * 365
  return null
}

/**
 * Whether a job's posted budget overlaps the range [min, max].
 *
 * A job's own budget is usually a range too ("USD 500 - 1,000"), so this is an
 * interval-overlap test, not a point comparison: a $500–1,000 project shows up
 * under both "$250 – $500" and "$500 – $1,000" because it genuinely could land
 * in either. `max = null` means no ceiling.
 *
 * Hourly and no-budget jobs always pass — their "budget" isn't a fixed total,
 * so excluding them on a total would be misleading.
 */
export function jobInBudgetRange(job: Job, min: number, max: number | null): boolean {
  const hasFloor = min > 0
  const hasCeiling = max != null && Number.isFinite(max)
  if (!hasFloor && !hasCeiling) return true

  if (job.budget_type === 'hourly') return true
  if (job.budget_min == null && job.budget_max == null) return true

  // "Less than USD X" parses to (min=null, max=X): treat the floor as 0.
  const jobLow = job.budget_min ?? 0
  const jobHigh = job.budget_max ?? Infinity

  if (hasCeiling && jobLow > (max as number)) return false
  if (hasFloor && jobHigh < min) return false
  return true
}

export function absoluteUrl(job: Job): string {
  const url = job.url || ''
  if (!url) return ''
  return url.startsWith('http') ? url : `https://www.workana.com${url}`
}
