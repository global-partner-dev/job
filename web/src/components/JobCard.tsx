import type { ChangeEvent, KeyboardEvent, MouseEvent } from 'react'
import type { Bid, ScoredJob } from '../types'
import { timeAgo, joinedLabel, skillsOf, bestTitle } from '../lib/format'
import { flagFor } from '../lib/flags'
import { token, type PaletteToken } from '../lib/palette'
import ScoreBadge from './ScoreBadge'
import AiSummary from './AiSummary'

interface JobCardProps {
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

export default function JobCard({
  job,
  isNew,
  isSaved,
  onToggleSave,
  onOpen,
  selectable = false,
  selected = false,
  onToggleSelect,
  bidStatus,
}: JobCardProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Only react to keys on the card itself, not on the nested Save button.
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(job)
    }
  }
  const handleSave = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onToggleSave(job.id)
  }
  const handleSelect = (e: ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    onToggleSelect?.(job.id)
  }
  const status = bidStatus ? BID_STATUS[bidStatus] : null

  const country = job.client_country || 'Unknown'
  const rating = job.client_rating != null ? job.client_rating.toFixed(1) : null
  const postedTime = job.posted_date_relative || timeAgo(job.first_seen_at)
  const joined = joinedLabel(job.client_joined_month, job.client_joined_year)
  const skills = skillsOf(job)
  const shownSkills = skills.slice(0, 6)
  const extraSkills = skills.length - shownSkills.length

  const meta = [
    `${flagFor(job.client_country)} ${country}`,
    job.client_name || null,
    job.budget ? `💰 ${job.budget}` : null,
    job.bids_count != null ? `📊 ${job.bids_count} bids` : null,
    rating ? `⭐ ${rating}` : null,
    postedTime || null,
  ].filter(Boolean) as string[]

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(job)}
      onKeyDown={handleKeyDown}
      className={
        'card group relative flex cursor-pointer flex-col gap-3 overflow-hidden p-4 pl-5 transition-all ' +
        'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-hover animate-fade-in' +
        (isNew ? ' ring-1 ring-primary/40' : '') +
        (selected ? ' ring-2 ring-primary' : '')
      }
    >
      {/* Tier accent strip */}
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: token(job.scoring.tier) }}
        aria-hidden
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={handleSelect}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary"
              aria-label="Select for bidding"
            />
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <ScoreBadge scoring={job.scoring} size="sm" />
              {isNew && (
                <span
                  className="pill animate-pulse-ring"
                  style={{ backgroundColor: token('primary', 0.16), color: token('primary') }}
                >
                  NEW
                </span>
              )}
              {status && (
                <span
                  className="pill"
                  style={{ backgroundColor: token(status.tone, 0.16), color: token(status.tone) }}
                >
                  {status.label}
                </span>
              )}
            </div>
            <h3 className="text-[15px] font-semibold leading-snug text-content line-clamp-2">
              {bestTitle(job)}
            </h3>
          </div>
        </div>

        <button
          type="button"
          className="btn-icon shrink-0"
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
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        {meta.map((m, i) => (
          <span key={i} className="inline-flex items-center">
            {i > 0 && <span className="mr-2 text-border">•</span>}
            {m}
          </span>
        ))}
      </div>

      {/* Verified + client stats */}
      <div className="flex flex-wrap items-center gap-1.5">
        {job.client_payment_verified ? (
          <span className="pill" style={{ backgroundColor: token('good', 0.14), color: token('good') }}>
            ✓ Verified
          </span>
        ) : (
          <span className="pill bg-surface-2 text-subtle">✕ Unverified</span>
        )}
        {job.client_published_projects != null && (
          <span className="chip">📢 {job.client_published_projects} published</span>
        )}
        {job.client_paid_projects != null && (
          <span className="chip">💳 {job.client_paid_projects} paid</span>
        )}
        {joined && <span className="chip">📆 {joined}</span>}
        {job.client_last_reply && (
          <span className="chip">💬 Last reply: {job.client_last_reply}</span>
        )}
      </div>

      {/* AI summary */}
      {job.ai_summary && <AiSummary text={job.ai_summary} className="line-clamp-3" />}

      {/* Skills */}
      {shownSkills.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1 pt-1">
          {shownSkills.map((skill, i) => (
            <span key={`${skill}-${i}`} className="chip">
              {skill}
            </span>
          ))}
          {extraSkills > 0 && <span className="chip text-subtle">+{extraSkills}</span>}
        </div>
      )}
    </div>
  )
}
