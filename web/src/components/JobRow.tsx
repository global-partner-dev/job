import { useState, type ChangeEvent, type MouseEvent } from 'react'
import type { AskRecord, AskStatus, Job } from '../types'
import {
  timeAgo,
  bestTitle,
  bestDescription,
  joinedLabel,
  skillsOf,
  lastReplyHours,
  absoluteUrl,
} from '../lib/format'
import { flagFor } from '../lib/flags'
import { token, type PaletteToken } from '../lib/palette'
import AiSummary from './AiSummary'

interface JobRowProps {
  job: Job
  isNew: boolean
  isSaved: boolean
  onToggleSave: (id: string) => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
  ask?: AskRecord
}

const ASK_STATUS: Record<AskStatus, { label: string; tone: PaletteToken }> = {
  queued: { label: 'Queued', tone: 'warning' },
  preparing: { label: 'Writing…', tone: 'info' },
  prepared: { label: '✎ Ready to send', tone: 'info' },
  sent: { label: '✓ Question sent', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'low' },
}

/** Full-width list row (one per project) for the Job Feed, with inline expand. */
export default function JobRow({
  job,
  isNew,
  isSaved,
  onToggleSave,
  selectable = false,
  selected = false,
  onToggleSelect,
  ask,
}: JobRowProps) {
  const [expanded, setExpanded] = useState(false)

  const handleSave = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onToggleSave(job.id)
  }
  const handleSelect = (e: ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    onToggleSelect?.(job.id)
  }

  const rating = job.client_rating != null ? job.client_rating.toFixed(1) : null
  const status = ask ? ASK_STATUS[ask.status] : null

  const lrHours = lastReplyHours(job.client_last_reply)
  const lrTone: PaletteToken = lrHours == null ? 'low' : lrHours <= 6 ? 'good' : lrHours <= 24 ? 'fair' : 'low'

  const meta = [
    `${flagFor(job.client_country)} ${job.client_country || 'Unknown'}`,
    job.client_name || null,
    job.budget ? `💰 ${job.budget}` : null,
    job.bids_count != null ? `📊 ${job.bids_count} bids` : null,
    rating ? `⭐ ${rating}` : null,
    job.posted_date_relative || timeAgo(job.first_seen_at) || null,
    job.client_payment_verified ? '✓ Verified' : '✕ Unverified',
  ].filter(Boolean) as string[]

  const skills = skillsOf(job)
  const description = bestDescription(job)
  const joined = joinedLabel(job.client_joined_month, job.client_joined_year)
  const url = absoluteUrl(job)

  return (
    <div
      className={
        'card relative flex flex-col overflow-hidden transition-colors ' +
        'hover:border-primary/40 animate-fade-in' +
        (selected ? ' ring-2 ring-primary' : isNew ? ' ring-1 ring-primary/40' : '')
      }
    >
      {/* Main row */}
      <div className="flex items-center gap-3 p-3 pl-4">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={handleSelect}
            className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
            aria-label="Select project"
          />
        )}

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
          </div>
        </div>

        {/* Last reply — prominent, important signal */}
        <span
          className="pill shrink-0 whitespace-nowrap"
          style={{ backgroundColor: token(lrTone, 0.16), color: token(lrTone) }}
          title="How long ago the client last replied to a bid"
        >
          💬 {job.client_last_reply ? job.client_last_reply : 'No reply yet'}
        </span>

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
          <button
            type="button"
            className="btn whitespace-nowrap text-sm"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            Details
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={'transition-transform ' + (expanded ? 'rotate-180' : '')}
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* Inline expanded detail */}
      {expanded && (
        <div className="space-y-3 border-t border-border/60 bg-surface-2/40 px-4 py-4 pl-5">
          {job.ai_summary && (
            <div>
              <div className="stat-label mb-1">AI analysis</div>
              <AiSummary text={job.ai_summary} />
            </div>
          )}

          {ask?.question && (
            <div>
              <div className="stat-label mb-1">
                {ask.status === 'sent' ? 'Question you sent' : 'Question ready to send'}
              </div>
              <p className="whitespace-pre-line rounded-md border border-border/60 bg-surface px-3 py-2 text-sm leading-relaxed text-content">
                {ask.question}
              </p>
            </div>
          )}

          {ask?.status === 'failed' && ask.error && (
            <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
              {ask.error}
            </p>
          )}

          <div>
            <div className="stat-label mb-1">Description</div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
              {description || 'No description available yet.'}
            </p>
          </div>

          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {skills.map((s, i) => (
                <span key={`${s}-${i}`} className="chip">
                  {s}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {job.client_published_projects != null && <span>📢 {job.client_published_projects} published</span>}
            {job.client_paid_projects != null && <span>💳 {job.client_paid_projects} paid</span>}
            {joined && <span>📆 Member since {joined}</span>}
          </div>

          {url && (
            <a className="btn btn-primary text-sm" href={url} target="_blank" rel="noreferrer">
              Open on Workana ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}
