import type { KeyboardEvent, MouseEvent } from 'react'
import type { ScoredJob } from '../types'
import { timeAgo, joinedLabel, skillsOf, bestTitle } from '../lib/format'
import { flagFor } from '../lib/flags'
import { tierColor } from '../lib/scoring'
import ScoreBadge from './ScoreBadge'
import AiSummary from './AiSummary'

interface JobCardProps {
  job: ScoredJob
  isNew: boolean
  isSaved: boolean
  onToggleSave: (id: string) => void
  onOpen: (job: ScoredJob) => void
}

export default function JobCard({
  job,
  isNew,
  isSaved,
  onToggleSave,
  onOpen,
}: JobCardProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(job)
    }
  }

  const handleSave = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onToggleSave(job.id)
  }

  const country = job.client_country || 'Unknown'
  const rating =
    job.client_rating != null ? job.client_rating.toFixed(1) : null
  const postedTime = job.posted_date_relative || timeAgo(job.first_seen_at)
  const joined = joinedLabel(job.client_joined_month, job.client_joined_year)
  const skills = skillsOf(job)
  const shownSkills = skills.slice(0, 6)
  const extraSkills = skills.length - shownSkills.length

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(job)}
      onKeyDown={handleKeyDown}
      className={
        'card p-4 cursor-pointer transition-colors hover:border-accent animate-fade-in relative flex flex-col gap-3' +
        (isNew ? ' ring-1 ring-accent' : '')
      }
    >
      {isNew && (
        <span
          className="badge animate-pulse-ring absolute right-3 top-3 z-10"
          style={{
            backgroundColor: 'rgb(var(--accent) / 0.16)',
            color: 'rgb(var(--accent))',
          }}
        >
          NEW
        </span>
      )}

      {/* Top row: score + title on the left, save star on the right */}
      <div className="flex items-start justify-between gap-3">
        <div className={'flex flex-col gap-1' + (isNew ? ' pr-12' : '')}>
          <div>
            <ScoreBadge scoring={job.scoring} size="sm" />
          </div>
          <h3 className="font-semibold text-content leading-snug line-clamp-2">
            {bestTitle(job)}
          </h3>
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
            fill={isSaved ? 'rgb(var(--accent))' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          {flagFor(job.client_country)} {country}
        </span>
        {job.client_name && <span>{job.client_name}</span>}
        {job.budget && <span>💰 {job.budget}</span>}
        {job.bids_count != null && <span>📊 {job.bids_count} bids</span>}
        {rating && <span>⭐ {rating}</span>}
        {postedTime && <span>{postedTime}</span>}
      </div>

      {/* Verified line */}
      <div>
        {job.client_payment_verified ? (
          <span
            className="badge"
            style={{
              backgroundColor: tierColor('good', 0.14),
              color: tierColor('good'),
            }}
          >
            ✅ Verified
          </span>
        ) : (
          <span className="badge text-subtle">❌ Unverified</span>
        )}
      </div>

      {/* Client stats chips */}
      {(job.client_published_projects != null ||
        job.client_paid_projects != null ||
        joined) && (
        <div className="flex flex-wrap gap-1">
          {job.client_published_projects != null && (
            <span className="chip">
              📢 {job.client_published_projects} published
            </span>
          )}
          {job.client_paid_projects != null && (
            <span className="chip">💳 {job.client_paid_projects} paid</span>
          )}
          {joined && <span className="chip">📆 {joined}</span>}
        </div>
      )}

      {/* AI summary */}
      {job.ai_summary && (
        <AiSummary text={job.ai_summary} className="line-clamp-3" />
      )}

      {/* Skills */}
      {shownSkills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {shownSkills.map((skill) => (
            <span key={skill} className="chip">
              {skill}
            </span>
          ))}
          {extraSkills > 0 && <span className="chip">+{extraSkills}</span>}
        </div>
      )}
    </div>
  )
}
