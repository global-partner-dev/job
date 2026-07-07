import type { ScoredJob } from '../../types'
import { countryBreakdown } from '../../lib/insights'
import { token } from '../../lib/palette'
import Icon from '../ui/Icon'

interface CountryBreakdownProps {
  jobs: ScoredJob[]
}

/** "Top client countries" panel with share bars. */
export default function CountryBreakdown({ jobs }: CountryBreakdownProps) {
  const rows = countryBreakdown(jobs, 6)
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0) || 1

  return (
    <div className="card h-full">
      <div className="panel-header">
        <div>
          <h3 className="card-title">Top client countries</h3>
          <p className="card-sub">Where the work is coming from</p>
        </div>
        <span className="text-subtle"><Icon name="globe" /></span>
      </div>

      <div className="card-pad space-y-3.5">
        {rows.length === 0 && <p className="text-sm text-subtle">No data yet.</p>}
        {rows.map((row) => (
          <div key={row.name}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="truncate text-content">
                <span className="mr-1.5">{row.flag}</span>
                {row.name}
              </span>
              <span className="shrink-0 text-xs text-muted">
                {row.count} · {row.pct}%
              </span>
            </div>
            <div className="progress">
              <div
                className="progress-bar"
                style={{
                  width: `${Math.round((row.count / max) * 100)}%`,
                  backgroundColor: token('primary'),
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
