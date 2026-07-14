import { useEffect } from 'react'
import type { BidBotSettings } from '../../lib/bidbot'
import { NO_NAME_PROMPT } from '../../lib/bidbot'

interface Props {
  open: boolean
  settings: BidBotSettings
  onChange: (s: BidBotSettings) => void
  onClose: () => void
  placedCount: number
  onDeletePlaced: () => void
}

export default function BidBotSettings({
  open,
  settings,
  onChange,
  onClose,
  placedCount,
  onDeletePlaced,
}: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const set = <K extends keyof BidBotSettings>(key: K, value: BidBotSettings[K]) =>
    onChange({ ...settings, [key]: value })
  const num = (v: string, min: number) => Math.max(min, Number(v) || min)

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-surface shadow-drawer animate-slide-in"
        role="dialog"
        aria-modal="true"
        aria-label="BidBot settings"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-surface px-5 py-4">
          <h2 className="card-title">BidBot settings</h2>
          <button className="btn-icon" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 p-5">
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
                Stored locally in this browser. Used to write proposals and compute price/delivery.
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
          </section>

          <section className="space-y-3">
            <h3 className="stat-label">Identity</h3>
            <div>
              <label className="text-xs text-muted">Workana freelancer slug</label>
              <input
                className="input mt-1"
                value={settings.freelancerSlug}
                onChange={(e) => set('freelancerSlug', e.target.value)}
                placeholder="your-profile-slug"
              />
              <p className="mt-1 text-[11px] text-subtle">
                From workana.com/freelancer/<b>your-profile-slug</b> (not the 32-char hash).
              </p>
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
                Woven into the proposal if set. Your name is never included.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="stat-label">Bid filter</h3>
            <div>
              <label className="text-xs text-muted">Only bid on projects with budget ≥ (USD)</label>
              <input
                className="input mt-1"
                type="number"
                min={0}
                step={50}
                value={settings.minBidBudget || ''}
                placeholder="0 = no extra floor"
                onChange={(e) => set('minBidBudget', num(e.target.value, 0))}
              />
              <p className="mt-1 text-[11px] text-subtle">
                The archive already stores $101+. Raise this to conserve bid credits (hourly and
                budget-less projects are always kept).
              </p>
            </div>
            <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[11px] text-danger">
              ⚠️ Fully automated bids without review and places one bid per matching project (new
              ones too, as they’re published). Use the budget filter to control credit use.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="stat-label">Price &amp; delivery</h3>
            <div className="flex gap-2">
              {(['ai', 'fixed'] as const).map((p) => (
                <button
                  key={p}
                  className={'btn flex-1 ' + (settings.priceStrategy === p ? 'btn-primary' : '')}
                  onClick={() => set('priceStrategy', p)}
                >
                  {p === 'ai' ? 'AI-computed' : 'Fixed'}
                </button>
              ))}
            </div>
            {settings.priceStrategy === 'ai' ? (
              <p className="text-[11px] text-subtle">
                OpenAI picks a competitive amount within the posted budget and a fast delivery.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted">Fixed amount (USD)</label>
                  <input
                    className="input mt-1"
                    type="number"
                    min={60}
                    value={settings.bidAmountFixed}
                    onChange={(e) => set('bidAmountFixed', num(e.target.value, 60))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted">Delivery</label>
                  <input
                    className="input mt-1"
                    value={settings.bidDeliveryTime}
                    onChange={(e) => set('bidDeliveryTime', e.target.value)}
                    placeholder="7 days"
                  />
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="stat-label">Delays (seconds)</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted">
                After writing (min)
                <input className="input mt-1" type="number" min={1} value={settings.genDelayMinSec}
                  onChange={(e) => set('genDelayMinSec', num(e.target.value, 1))} />
              </label>
              <label className="text-xs text-muted">
                After writing (max)
                <input className="input mt-1" type="number" min={1} value={settings.genDelayMaxSec}
                  onChange={(e) => set('genDelayMaxSec', num(e.target.value, 1))} />
              </label>
              <label className="text-xs text-muted">
                Between bids (min)
                <input className="input mt-1" type="number" min={1} value={settings.gapDelayMinSec}
                  onChange={(e) => set('gapDelayMinSec', num(e.target.value, 1))} />
              </label>
              <label className="text-xs text-muted">
                Between bids (max)
                <input className="input mt-1" type="number" min={1} value={settings.gapDelayMaxSec}
                  onChange={(e) => set('gapDelayMaxSec', num(e.target.value, 1))} />
              </label>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="stat-label">Proposal prompt</h3>
              <button
                className="text-[11px] text-primary hover:underline"
                onClick={() => set('systemPrompt', NO_NAME_PROMPT)}
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
              onClick={onDeletePlaced}
              disabled={placedCount === 0}
              style={placedCount > 0 ? { color: 'rgb(var(--danger))', borderColor: 'rgb(var(--danger) / 0.4)' } : undefined}
            >
              🗑 Delete already-bid projects{placedCount ? ` (${placedCount})` : ''}
            </button>
            <p className="text-[11px] text-subtle">
              Clears the “Bid placed” records for projects you've already bid on, removing them
              from your bid list. It does not touch your bids on Workana.
            </p>
          </section>
        </div>
      </aside>
    </div>
  )
}
