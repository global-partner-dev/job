import type { ScoredJob } from '../../types'
import { tierDistribution } from '../../lib/insights'
import { token } from '../../lib/palette'
import Icon from '../ui/Icon'

interface TierDistributionProps {
  jobs: ScoredJob[]
}

/** Opportunity-tier distribution: a stacked bar + a legend with counts. */
export default function TierDistribution({ jobs }: TierDistributionProps) {
  const rows = tierDistribution(jobs)
  const total = jobs.length || 1

  return (
    <div className="card h-full">
      <div className="panel-header">
        <div>
          <h3 className="card-title">Opportunity mix</h3>
          <p className="card-sub">Jobs by lead-quality tier</p>
        </div>
        <span className="text-subtle"><Icon name="target" /></span>
      </div>

      <div className="card-pad">
        {/* Stacked share bar */}
        <div className="mb-5 flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
          {rows.map((row) =>
            row.count > 0 ? (
              <div
                key={row.tier}
                style={{ width: `${(row.count / total) * 100}%`, backgroundColor: token(row.tier) }}
                title={`${row.label}: ${row.count}`}
              />
            ) : null,
          )}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-3">
          {rows.map((row) => (
            <div key={row.tier} className="flex items-center gap-2.5">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-md"
                style={{ backgroundColor: token(row.tier, 0.14) }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: token(row.tier) }}
                />
              </span>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-content">{row.count}</div>
                <div className="text-xs text-subtle">
                  {row.label} · {row.pct}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
