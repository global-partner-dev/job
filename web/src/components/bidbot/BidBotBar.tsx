import type { BidRunSummary } from '../../hooks/useBidBot'
import { token } from '../../lib/palette'

interface Props {
  selectedCount: number
  running: boolean
  extPresent: boolean | null
  submitMode: 'auto' | 'manual'
  progressDone: number
  summary: BidRunSummary | null
  onToggleMode: () => void
  onOpenSettings: () => void
  onClear: () => void
  onStart: () => void
  onStop: () => void
}

export default function BidBotBar({
  selectedCount,
  running,
  extPresent,
  submitMode,
  progressDone,
  summary,
  onToggleMode,
  onOpenSettings,
  onClear,
  onStart,
  onStop,
}: Props) {
  if (selectedCount === 0 && !running) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 lg:pl-64">
      <div className="pointer-events-auto mx-auto m-4 max-w-3xl rounded-xl border border-border bg-surface p-3 shadow-card-hover animate-fade-in">
        {extPresent === false && (
          <div className="mb-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
            BidBot browser extension not detected. Install/enable it and reload to place bids.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            {running ? (
              <div className="text-sm font-medium text-content">
                Bidding… <span className="text-muted">{progressDone} processed</span>
                {summary && (
                  <span className="text-subtle">
                    {' '}· {summary.placed} placed, {summary.failed} failed
                  </span>
                )}
              </div>
            ) : summary ? (
              <div className="text-sm font-medium" style={{ color: token('success') }}>
                Done — {summary.placed} placed, {summary.failed} failed of {summary.total}
              </div>
            ) : (
              <div className="text-sm font-medium text-content">
                {selectedCount} project{selectedCount === 1 ? '' : 's'} selected
              </div>
            )}
          </div>

          {!running && (
            <button
              className="chip"
              onClick={onToggleMode}
              title="Toggle automated vs manual bidding"
            >
              {submitMode === 'auto' ? '🤖 Automated' : '✍️ Manual'}
            </button>
          )}

          <button className="btn-icon" aria-label="BidBot settings" onClick={onOpenSettings}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          {!running && (
            <button className="btn btn-ghost text-sm" onClick={onClear}>
              Clear
            </button>
          )}

          {running ? (
            <button className="btn text-sm" onClick={onStop}>
              Stop
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={onStart}
              disabled={selectedCount === 0 || extPresent === false}
            >
              Start bidding
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
