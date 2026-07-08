import type { ChangeEvent, MouseEvent } from 'react'
import type { Bid, ScoredJob } from '../types'
import { timeAgo, bestTitle } from '../lib/format'
import { flagFor } from '../lib/flags'
import { token, type PaletteToken } from '../lib/palette'
import ScoreBadge from './ScoreBadge'

interface JobRowProps {
  job: ScoredJob
  isNew: boolean
  isSaved: boolean
  onToggleSave: (id: string) => void
  onOpen: (job: ScoredJob) => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
  bidStatus?: Bid['status']
}

const BID_STATUS: Record<Bid['status'], { label: string; tone: PaletteToken }> = {
  locked: { label: 'Queued', tone: 'warning' },
  placing: { label: 'Placing…', tone: 'info' },
  placed: { label: '✓ Bid placed', tone: 'success' },
  manual: { label: 'Prepared', tone: 'info' },
  failed: { label: 'Bid failed', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'low' },
}

/** Full-width list row (one per project) for the Job Feed. */
export default function JobRow({
  job,
  isNew,
  isSaved,
  onToggleSave,
  onOpen,
  selectable = false,
  selected = false,
  onToggleSelect,
  bidStatus,
}: JobRowProps) {
  const handleSave = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onToggleSave(job.id)
  }
  const handleSelect = (e: ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    onToggleSelect?.(job.id)
  }

  const rating = job.client_rating != null ? job.client_rating.toFixed(1) : null
  const status = bidStatus ? BID_STATUS[bidStatus] : null
  const meta = [
    `${flagFor(job.client_country)} ${job.client_country || 'Unknown'}`,
    job.client_name || null,
    job.budget ? `💰 ${job.budget}` : null,
    job.bids_count != null ? `📊 ${job.bids_count} bids` : null,
    rating ? `⭐ ${rating}` : null,
    job.client_last_reply ? `💬 ${job.client_last_reply}` : null,
    job.posted_date_relative || timeAgo(job.first_seen_at) || null,
  ].filter(Boolean) as string[]

  return (
    <div
      className={
        'card relative flex items-center gap-3 overflow-hidden p-3 pl-4 transition-colors ' +
        'hover:border-primary/40 animate-fade-in' +
        (selected ? ' ring-2 ring-primary' : isNew ? ' ring-1 ring-primary/40' : '')
      }
    >
      {/* Tier accent strip */}
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: token(job.scoring.tier) }}
        aria-hidden
      />

      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={handleSelect}
          className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
          aria-label="Select for bidding"
        />
      )}

      <div className="shrink-0">
        <ScoreBadge scoring={job.scoring} size="sm" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-content">{bestTitle(job)}</h3>
          {isNew && (
            <span
              className="pill shrink-0"
              style={{ backgroundColor: token('primary', 0.16), color: token('primary') }}
            >
              NEW
            </span>
          )}
          {status && (
            <span
              className="pill shrink-0"
              style={{ backgroundColor: token(status.tone, 0.16), color: token(status.tone) }}
            >
              {status.label}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {meta.map((m, i) => (
            <span key={i} className="inline-flex items-center">
              {i > 0 && <span className="mr-2 text-border">•</span>}
              {m}
            </span>
          ))}
          {job.client_payment_verified ? (
            <span className="ml-1" style={{ color: token('good') }}>· ✓ Verified</span>
          ) : (
            <span className="ml-1 text-subtle">· ✕ Unverified</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          className="btn-icon"
          aria-label={isSaved ? 'Unsave' : 'Save'}
          aria-pressed={isSaved}
          onClick={handleSave}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={isSaved ? token('warning') : 'none'}
            stroke={isSaved ? token('warning') : 'currentColor'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        <button type="button" className="btn btn-primary whitespace-nowrap text-sm" onClick={() => onOpen(job)}>
          View Details
        </button>
      </div>
    </div>
  )
}
