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

/** Prefer the English translation, fall back to the original. */
export function bestTitle(job: Job): string {
  return job.title_en || job.title || 'Untitled project'
}

export function bestDescription(job: Job): string {
  return job.description_en || job.description || ''
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0
  return Math.round((part / whole) * 100)
}

export function absoluteUrl(job: Job): string {
  const url = job.url || ''
  if (!url) return ''
  return url.startsWith('http') ? url : `https://www.workana.com${url}`
}
