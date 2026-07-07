import { useId } from 'react'
import { timeAgo } from '../lib/format'
import { token } from '../lib/palette'
import type { ScrapeRun } from '../types'

interface ScrapeHistoryChartProps {
  runs: ScrapeRun[]
}

const W = 680
const H = 210
const PAD_X = 8
const PAD_TOP = 16
const PAD_BOTTOM = 22

/** Datta-style area chart: new jobs (filled) over total found (line). */
export default function ScrapeHistoryChart({ runs }: ScrapeHistoryChartProps) {
  const gradId = useId()
  const n = runs.length
  const innerW = W - PAD_X * 2
  const innerH = H - PAD_TOP - PAD_BOTTOM

  const maxVal =
    runs.reduce((m, r) => Math.max(m, r.jobs_found ?? 0, r.new_jobs_count ?? 0), 0) || 1

  const x = (i: number) => (n <= 1 ? PAD_X + innerW / 2 : PAD_X + (i / (n - 1)) * innerW)
  const y = (v: number) => PAD_TOP + innerH - (v / maxVal) * innerH

  const newPts = runs.map((r, i) => [x(i), y(r.new_jobs_count ?? 0)] as const)
  const foundPts = runs.map((r, i) => [x(i), y(r.jobs_found ?? 0)] as const)

  const line = (pts: readonly (readonly [number, number])[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')

  const areaPath =
    n > 0
      ? `${line(newPts)} L${x(n - 1).toFixed(1)},${(PAD_TOP + innerH).toFixed(1)} L${x(0).toFixed(1)},${(
          PAD_TOP + innerH
        ).toFixed(1)} Z`
      : ''

  const grid = [0, 0.5, 1]

  return (
    <div className="card">
      <div className="panel-header">
        <div>
          <h3 className="card-title">Scrape activity</h3>
          <p className="card-sub">New vs. total jobs per run</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: token('primary') }} /> New
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: token('info', 0.5) }} /> Found
          </span>
        </div>
      </div>

      <div className="card-pad">
        {n === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-subtle">
            No scrape runs yet.
          </div>
        ) : (
          <svg
            className="h-48 w-full"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Scrape activity chart"
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={token('primary', 0.28)} />
                <stop offset="100%" stopColor={token('primary', 0)} />
              </linearGradient>
            </defs>

            {/* gridlines */}
            {grid.map((g) => {
              const gy = PAD_TOP + innerH * g
              return (
                <line
                  key={g}
                  x1={PAD_X}
                  x2={W - PAD_X}
                  y1={gy}
                  y2={gy}
                  stroke="rgb(var(--border))"
                  strokeWidth="1"
                  strokeDasharray="3 4"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}

            {/* found line */}
            <path
              d={line(foundPts)}
              fill="none"
              stroke={token('info', 0.55)}
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />

            {/* new area + line */}
            <path d={areaPath} fill={`url(#${gradId})`} />
            <path
              d={line(newPts)}
              fill="none"
              stroke={token('primary')}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            {/* Single-run fallback: a line/area is invisible with one point,
                so draw explicit dots (non-scaling so they stay round). */}
            {n === 1 && (
              <>
                <circle cx={x(0)} cy={y(runs[0].jobs_found ?? 0)} r="3.5" fill={token('info', 0.6)} vectorEffect="non-scaling-stroke" />
                <circle cx={x(0)} cy={y(runs[0].new_jobs_count ?? 0)} r="4.5" fill={token('primary')} vectorEffect="non-scaling-stroke" />
              </>
            )}

            {/* transparent hover targets w/ tooltips (circles omitted: they'd
                distort under preserveAspectRatio=none) */}
            {runs.map((r, i) => (
              <rect
                key={r.id}
                x={x(i) - innerW / (2 * Math.max(n, 1))}
                y={PAD_TOP}
                width={innerW / Math.max(n, 1)}
                height={innerH}
                fill="transparent"
              >
                <title>{`${timeAgo(r.timestamp)} — new ${r.new_jobs_count ?? 0}, found ${r.jobs_found ?? 0}`}</title>
              </rect>
            ))}
          </svg>
        )}
      </div>
    </div>
  )
}
