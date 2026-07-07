import { useEffect } from 'react'
import type { ScoredJob } from '../types'
import {
  absoluteUrl,
  bestDescription,
  bestTitle,
  joinedLabel,
  skillsOf,
  timeAgo,
} from '../lib/format'
import { flagFor } from '../lib/flags'
import { tierColor } from '../lib/scoring'
import ScoreBadge from './ScoreBadge'
import AiSummary from './AiSummary'

interface JobDetailDrawerProps {
  job: ScoredJob | null
  isSaved: boolean
  onToggleSave: (id: string) => void
  onClose: () => void
}

/** One labeled fact row inside the client card. */
function ClientRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="stat-label shrink-0">{label}</span>
      <span className="text-content">{children}</span>
    </div>
  )
}

/**
 * Slide-in right-side drawer showing the full detail of a single scored job:
 * score reasoning, client trust facts, budget/bid meta, skills, AI analysis
 * and the full description. Closes on ESC, backdrop click or the X button.
 */
export default function JobDetailDrawer({
  job,
  isSaved,
  onToggleSave,
  onClose,
}: JobDetailDrawerProps) {
  useEffect(() => {
    if (!job) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [job, onClose])

  if (!job) return null

  const url = absoluteUrl(job)
  const reasons = job.scoring.reasons ?? []
  const dotColor = tierColor(job.scoring.tier)

  const skills = skillsOf(job)
  const description = bestDescription(job)

  const country = job.client_country
  const memberSince = joinedLabel(job.client_joined_month, job.client_joined_year)
  const rating = job.client_rating
  const published = job.client_published_projects
  const paid = job.client_paid_projects
  const lastReply = job.client_last_reply

  const hasClientInfo =
    !!job.client_name ||
    !!country ||
    !!memberSince ||
    job.client_payment_verified != null ||
    (rating != null && rating > 0) ||
    (published != null && published > 0) ||
    (paid != null && paid > 0) ||
    !!lastReply

  const postedLabel = job.posted_date_relative || timeAgo(job.first_seen_at)

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
      />
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-lg overflow-y-auto bg-surface shadow-drawer animate-slide-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-drawer-title"
      >
        <div className="space-y-5 p-5">
          {/* Header */}
          <div className="sticky top-0 z-10 -mx-5 -mt-5 flex items-start justify-between gap-3 bg-surface px-5 pb-3 pt-5">
            <div>
              <ScoreBadge scoring={job.scoring} />
              <h2 id="job-drawer-title" className="mt-2 text-lg font-semibold text-content">
                {bestTitle(job)}
              </h2>
            </div>
            <button
              type="button"
              className="btn-icon"
              aria-label="Close"
              onClick={onClose}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {url && (
              <a
                className="btn btn-accent"
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                Open on Workana ↗
              </a>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => onToggleSave(job.id)}
              aria-pressed={isSaved}
            >
              {isSaved ? '★ Saved' : '☆ Save'}
            </button>
          </div>

          {/* Why this score */}
          {reasons.length > 0 && (
            <section className="space-y-2">
              <h3 className="stat-label">Why this score</h3>
              <div className="space-y-1.5">
                {reasons.map((reason, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm text-muted"
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: dotColor }}
                      aria-hidden="true"
                    />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Client */}
          {hasClientInfo && (
            <section className="card space-y-2 p-3">
              <h3 className="stat-label">Client</h3>
              {job.client_name && (
                <ClientRow label="Name">{job.client_name}</ClientRow>
              )}
              {country && (
                <ClientRow label="Country">
                  <span aria-hidden="true">{flagFor(country)}</span> {country}
                </ClientRow>
              )}
              {memberSince && (
                <ClientRow label="Member since">{memberSince}</ClientRow>
              )}
              {job.client_payment_verified != null && (
                <ClientRow label="Payment">
                  {job.client_payment_verified ? (
                    <span style={{ color: tierColor('good') }}>Verified</span>
                  ) : (
                    <span className="text-subtle">Not verified</span>
                  )}
                </ClientRow>
              )}
              {rating != null && rating > 0 && (
                <ClientRow label="Rating">
                  <span aria-hidden="true">⭐</span> {rating.toFixed(1)}/5
                </ClientRow>
              )}
              {published != null && published > 0 && (
                <ClientRow label="Published">{published} projects</ClientRow>
              )}
              {paid != null && paid > 0 && (
                <ClientRow label="Paid">{paid} projects</ClientRow>
              )}
              {lastReply && (
                <ClientRow label="Last reply">{lastReply}</ClientRow>
              )}
            </section>
          )}

          {/* Meta chips */}
          <div className="flex flex-wrap gap-2">
            {job.budget && <span className="chip">{job.budget}</span>}
            {job.budget_type && <span className="chip">{job.budget_type}</span>}
            {job.bids_count != null && (
              <span className="chip">{job.bids_count} bids</span>
            )}
            {postedLabel && <span className="chip">{postedLabel}</span>}
          </div>

          {/* Skills */}
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {skills.map((skill, i) => (
                <span key={`${skill}-${i}`} className="chip">
                  {skill}
                </span>
              ))}
            </div>
          )}

          {/* AI analysis */}
          {job.ai_summary && (
            <section className="space-y-2">
              <h3 className="stat-label">AI analysis</h3>
              <AiSummary text={job.ai_summary} />
            </section>
          )}

          {/* Description */}
          {description && (
            <section className="space-y-2">
              <h3 className="stat-label">Description</h3>
              <p className="text-sm leading-relaxed text-muted whitespace-pre-line">
                {description}
              </p>
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}
