import { useEffect } from 'react'
import type { AskBotSettings } from '../../lib/askbot'
import { QUESTION_PROMPT } from '../../lib/askbot'

interface Props {
  open: boolean
  settings: AskBotSettings
  onChange: (s: AskBotSettings) => void
  onClose: () => void
  sentCount: number
  onDeleteSent: () => void
}

export default function AskBotSettingsDrawer({
  open,
  settings,
  onChange,
  onClose,
  sentCount,
  onDeleteSent,
}: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const set = <K extends keyof AskBotSettings>(key: K, value: AskBotSettings[K]) =>
    onChange({ ...settings, [key]: value })
  const num = (v: string, min: number) => Math.max(min, Number(v) || min)

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-surface shadow-drawer animate-slide-in"
        role="dialog"
        aria-modal="true"
        aria-label="AskBot settings"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-surface px-5 py-4">
          <h2 className="card-title">AskBot settings</h2>
          <button className="btn-icon" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 p-5">
          <p className="rounded-md border border-border bg-surface-2/50 px-3 py-2 text-[11px] text-muted">
            AskBot never sends anything on its own. It writes a short question, opens the project
            on Workana's <b>Ask a question</b> form with the text already in place, and waits for
            you to press Send.
          </p>

          <section className="space-y-3">
            <h3 className="stat-label">OpenAI</h3>
            <div>
              <label className="text-xs text-muted">API key</label>
              <input
                className="input mt-1"
                type="password"
                autoComplete="off"
                placeholder="sk-…"
                value={settings.openaiApiKey}
                onChange={(e) => set('openaiApiKey', e.target.value)}
              />
              <p className="mt-1 text-[11px] text-subtle">
                Stored locally in this browser. Used only to write the question.
              </p>
            </div>
            <div>
              <label className="text-xs text-muted">Model</label>
              <input
                className="input mt-1"
                value={settings.model}
                onChange={(e) => set('model', e.target.value)}
                placeholder="gpt-4o-mini"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Portfolio link (optional)</label>
              <input
                className="input mt-1"
                value={settings.portfolioUrl}
                onChange={(e) => set('portfolioUrl', e.target.value)}
                placeholder="https://your-portfolio.com"
              />
              <p className="mt-1 text-[11px] text-subtle">
                Referenced at most once, only when it fits. Your name is never included.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="stat-label">Queue filter</h3>
            <div>
              <label className="text-xs text-muted">Only queue projects with budget ≥ (USD)</label>
              <input
                className="input mt-1"
                type="number"
                min={0}
                step={50}
                value={settings.minBudget || ''}
                placeholder="0 = no extra floor"
                onChange={(e) => set('minBudget', num(e.target.value, 0))}
              />
              <p className="mt-1 text-[11px] text-subtle">
                On top of the archive filters (Americas + Spain/Portugal, $101+, payers only),
                which run in the scraper and are unchanged. Hourly and budget-less projects are
                always kept.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="stat-label">Pacing (seconds)</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted">
                Before opening (min)
                <input className="input mt-1" type="number" min={1} value={settings.genDelayMinSec}
                  onChange={(e) => set('genDelayMinSec', num(e.target.value, 1))} />
              </label>
              <label className="text-xs text-muted">
                Before opening (max)
                <input className="input mt-1" type="number" min={1} value={settings.genDelayMaxSec}
                  onChange={(e) => set('genDelayMaxSec', num(e.target.value, 1))} />
              </label>
              <label className="text-xs text-muted">
                Between projects (min)
                <input className="input mt-1" type="number" min={1} value={settings.gapDelayMinSec}
                  onChange={(e) => set('gapDelayMinSec', num(e.target.value, 1))} />
              </label>
              <label className="text-xs text-muted">
                Between projects (max)
                <input className="input mt-1" type="number" min={1} value={settings.gapDelayMaxSec}
                  onChange={(e) => set('gapDelayMaxSec', num(e.target.value, 1))} />
              </label>
            </div>
            <div>
              <label className="text-xs text-muted">Wait for you to press Send</label>
              <input
                className="input mt-1"
                type="number"
                min={30}
                step={30}
                value={settings.sendWaitSec}
                onChange={(e) => set('sendWaitSec', num(e.target.value, 30))}
              />
              <p className="mt-1 text-[11px] text-subtle">
                After this the queue moves on to the next project. The one you skipped stays in the
                list — closing the Workana tab moves on immediately.
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="stat-label">Question prompt</h3>
              <button
                className="text-[11px] text-primary hover:underline"
                onClick={() => set('systemPrompt', QUESTION_PROMPT)}
              >
                Reset to default
              </button>
            </div>
            <textarea
              className="input font-mono text-xs"
              rows={8}
              value={settings.systemPrompt}
              onChange={(e) => set('systemPrompt', e.target.value)}
            />
          </section>

          <section className="space-y-2 border-t border-border/60 pt-4">
            <h3 className="stat-label">Maintenance</h3>
            <button
              className="btn w-full"
              onClick={onDeleteSent}
              disabled={sentCount === 0}
              style={sentCount > 0 ? { color: 'rgb(var(--danger))', borderColor: 'rgb(var(--danger) / 0.4)' } : undefined}
            >
              🗑 Clear sent questions{sentCount ? ` (${sentCount})` : ''}
            </button>
            <p className="text-[11px] text-subtle">
              Forgets which projects you already asked about, so they can come back into the queue.
              It does not touch the messages on Workana.
            </p>
          </section>
        </div>
      </aside>
    </div>
  )
}
