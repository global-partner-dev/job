import type { ReactNode } from 'react'
import type { AskRunSummary } from '../../lib/askbot'
import { token } from '../../lib/palette'

interface Props {
  autoOn: boolean
  enabledAt: string | null
  /** Projects published since the toggle went on that haven't been sent yet. */
  pendingCount: number
  sentCount: number
  /** What the extension is doing right now, if anything. */
  activity: string | null
  extPresent: boolean | null
  summary: AskRunSummary | null
  selectedCount: number
  onToggleAuto: () => void
  onOpenSettings: () => void
  onClear: () => void
  onDeleteSelected: () => void
}

function GearButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn-icon" aria-label="AskBot settings" onClick={onClick}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  )
}

/** The one control that runs the whole flow. */
function Switch({ on, disabled, onClick }: { on: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Auto-ask newest projects"
      disabled={disabled}
      onClick={onClick}
      className={
        'relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-50 ' +
        (on ? 'border-transparent' : 'border-border bg-surface-2')
      }
      style={on ? { backgroundColor: token('primary') } : undefined}
    >
      <span
        className={
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ' +
          (on ? 'left-[26px]' : 'left-0.5')
        }
      />
    </button>
  )
}

function Shell({ warn, children }: { warn: boolean; children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 lg:pl-64">
      <div className="pointer-events-auto mx-auto m-4 max-w-3xl rounded-xl border border-border bg-surface p-3 shadow-card-hover animate-fade-in">
        {warn && (
          <div className="mb-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
            AskBot browser extension not detected. Install/enable it and reload to ask questions.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">{children}</div>
      </div>
    </div>
  )
}

function sinceLabel(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function AskBotBar(props: Props) {
  const { autoOn, extPresent, pendingCount, sentCount, activity, summary, selectedCount } = props

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

      <Switch on={autoOn} disabled={extPresent === false} onClick={props.onToggleAuto} />

      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-content">
          <span style={{ color: autoOn ? token('primary') : undefined }}>
            {autoOn ? '💬 Auto-ask on' : '💬 Auto-ask off'}
          </span>
          {autoOn ? (
            <span className="text-muted">
              {' '}· {pendingCount} waiting since {sinceLabel(props.enabledAt)}
              {sentCount > 0 && <span className="text-subtle"> · {sentCount} sent</span>}
            </span>
          ) : (
            <span className="text-muted"> · switch on to queue newly published projects</span>
          )}
        </div>
        <div className="truncate text-xs text-subtle">
          {activity ||
            (autoOn
              ? 'Watching for new projects — each one opens on Workana for you to send.'
              : 'Nothing queued. The feed shows the whole archive.')}
          {summary?.error && <span style={{ color: token('danger') }}> · {summary.error}</span>}
        </div>
      </div>

      <GearButton onClick={props.onOpenSettings} />
    </Shell>
  )
}
