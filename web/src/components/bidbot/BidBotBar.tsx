import type { ReactNode } from 'react'
import type { BidRunSummary } from '../../hooks/useBidBot'
import { token } from '../../lib/palette'

interface Props {
  selectedCount: number
  extPresent: boolean | null
  progressDone: number
  summary: BidRunSummary | null
  autoRunning: boolean
  autoEligibleCount: number
  onOpenSettings: () => void
  onClear: () => void
  onDeleteSelected: () => void
  onToggleAuto: () => void
}

function GearButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn-icon" aria-label="BidBot settings" onClick={onClick}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  )
}

function Shell({ warn, children }: { warn: boolean; children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 lg:pl-64">
      <div className="pointer-events-auto mx-auto m-4 max-w-3xl rounded-xl border border-border bg-surface p-3 shadow-card-hover animate-fade-in">
        {warn && (
          <div className="mb-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
            BidBot browser extension not detected. Install/enable it and reload to place bids.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">{children}</div>
      </div>
    </div>
  )
}

export default function BidBotBar(props: Props) {
  const { extPresent, progressDone, summary, autoRunning, selectedCount } = props

  return (
    <Shell warn={extPresent === false}>
      {selectedCount > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-content">{selectedCount} selected</span>
          <button className="btn btn-ghost text-sm" onClick={props.onClear}>
            Clear
          </button>
          <button
            className="btn text-sm"
            style={{ color: token('danger'), borderColor: token('danger', 0.4) }}
            onClick={props.onDeleteSelected}
            title="Remove the selected projects from your feed"
          >
            🗑 Delete
          </button>
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        {autoRunning ? (
          <div className="text-sm font-medium text-content">
            <span style={{ color: token('primary') }}>⚡ Fully automated</span> — bidding…{' '}
            <span className="text-muted">{progressDone} processed</span>
            {summary && (
              <span className="text-subtle">
                {' '}· {summary.placed} placed, {summary.failed} failed
              </span>
            )}
          </div>
        ) : (
          <div className="text-sm font-medium text-content">
            <span style={{ color: token('primary') }}>⚡ Fully automated</span> ·{' '}
            <span className="text-muted">{props.autoEligibleCount} project(s) to bid</span>
          </div>
        )}
      </div>

      <GearButton onClick={props.onOpenSettings} />

      {autoRunning ? (
        <button className="btn text-sm" onClick={props.onToggleAuto}>
          Stop
        </button>
      ) : (
        <button
          className="btn btn-primary"
          onClick={props.onToggleAuto}
          disabled={extPresent === false}
        >
          Start bidding
        </button>
      )}
    </Shell>
  )
}
