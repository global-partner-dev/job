import type { AskRecord, Job } from '../types'
import JobRow from './JobRow'

interface JobListProps {
  jobs: Job[]
  liveIds: Set<string>
  savedIds: Set<string>
  onToggleSave: (id: string) => void
  loading: boolean
  selectable?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  asks?: Map<string, AskRecord>
  /** Shown instead of the default hint when the list is empty. */
  emptyHint?: string
}

const SKELETON_KEYS = ['s0', 's1', 's2', 's3', 's4', 's5']

export default function JobList({
  jobs,
  liveIds,
  savedIds,
  onToggleSave,
  loading,
  selectable = false,
  selectedIds,
  onToggleSelect,
  asks,
  emptyHint,
}: JobListProps) {
  if (loading && jobs.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {SKELETON_KEYS.map((key) => (
          <div key={key} className="card h-16 animate-pulse p-3">
            <div className="h-4 w-1/3 rounded bg-surface-2" />
            <div className="mt-2 h-3 w-2/3 rounded bg-surface-2" />
          </div>
        ))}
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="card mt-2 p-10 text-center text-muted">
        <div className="text-3xl" aria-hidden>
          🔍
        </div>
        <div className="mt-3 font-medium text-content">No jobs here yet</div>
        <div className="mt-1 text-sm text-subtle">
          {emptyHint ??
            'The scraper stores only projects that pass the country / price / payer filters.'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {jobs.map((job) => (
        <JobRow
          key={job.id}
          job={job}
          isNew={liveIds.has(job.id)}
          isSaved={savedIds.has(job.id)}
          onToggleSave={onToggleSave}
          selectable={selectable}
          selected={selectedIds?.has(job.id) ?? false}
          onToggleSelect={onToggleSelect}
          ask={asks?.get(job.id)}
        />
      ))}
    </div>
  )
}
