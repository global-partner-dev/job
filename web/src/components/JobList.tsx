import type { Bid, ScoredJob } from '../types'
import JobCard from './JobCard'
import JobRow from './JobRow'

interface JobListProps {
  jobs: ScoredJob[]
  liveIds: Set<string>
  savedIds: Set<string>
  onToggleSave: (id: string) => void
  onOpen: (job: ScoredJob) => void
  loading: boolean
  /** 'grid' = tiles (default), 'row' = full-width list rows. */
  variant?: 'grid' | 'row'
  // BidBot selection (optional)
  selectable?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  bidStatuses?: Map<string, Bid>
}

const SKELETON_KEYS = ['s0', 's1', 's2', 's3', 's4', 's5']

export default function JobList({
  jobs,
  liveIds,
  savedIds,
  onToggleSave,
  onOpen,
  loading,
  variant = 'grid',
  selectable = false,
  selectedIds,
  onToggleSelect,
  bidStatuses,
}: JobListProps) {
  if (loading && jobs.length === 0) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {SKELETON_KEYS.map((key) => (
          <div key={key} className="card p-4 h-40 animate-pulse">
            <div className="h-4 w-2/3 rounded bg-surface-2" />
            <div className="mt-3 h-3 w-full rounded bg-surface-2" />
            <div className="mt-2 h-3 w-5/6 rounded bg-surface-2" />
            <div className="mt-6 h-3 w-1/3 rounded bg-surface-2" />
          </div>
        ))}
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="card p-10 text-center text-muted mt-2">
        <div className="text-3xl" aria-hidden>
          🔍
        </div>
        <div className="mt-3 text-content font-medium">No jobs match your filters</div>
        <div className="mt-1 text-sm text-subtle">
          Try clearing filters or lowering the minimum score.
        </div>
      </div>
    )
  }

  if (variant === 'row') {
    return (
      <div className="flex flex-col gap-2">
        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            isNew={liveIds.has(job.id)}
            isSaved={savedIds.has(job.id)}
            onToggleSave={onToggleSave}
            onOpen={onOpen}
            selectable={selectable}
            selected={selectedIds?.has(job.id) ?? false}
            onToggleSelect={onToggleSelect}
            bidStatus={bidStatuses?.get(job.id)?.status}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          isNew={liveIds.has(job.id)}
          isSaved={savedIds.has(job.id)}
          onToggleSave={onToggleSave}
          onOpen={onOpen}
          selectable={selectable}
          selected={selectedIds?.has(job.id) ?? false}
          onToggleSelect={onToggleSelect}
          bidStatus={bidStatuses?.get(job.id)?.status}
        />
      ))}
    </div>
  )
}
