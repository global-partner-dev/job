import { timeAgo } from '../lib/format'
import type { ScrapeRun } from '../types'

interface ScrapeHistoryChartProps {
  runs: ScrapeRun[]
}

const VIEW_W = 600
const VIEW_H = 120
const TOP_PAD = 8
const BASELINE = VIEW_H
const USABLE_H = VIEW_H - TOP_PAD

export default function ScrapeHistoryChart({ runs }: ScrapeHistoryChartProps) {
  const count = runs.length

  const maxFound = runs.reduce((acc, run) => {
    const found = run.jobs_found ?? 0
    return found > acc ? found : acc
  }, 0)
  const scaleMax = maxFound > 0 ? maxFound : 1

  const slot = count > 0 ? VIEW_W / count : VIEW_W
  const gap = Math.min(6, slot * 0.3)
  const barWidth = Math.max(1, slot - gap)
  const rx = Math.min(2, barWidth / 2)

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-content">Scrape activity</h2>
        <span className="text-subtle text-xs">last {count} runs</span>
      </div>

      {count === 0 ? (
        <div className="text-muted flex h-28 items-center justify-center text-sm">
          No scrape runs yet.
        </div>
      ) : (
        <svg
          className="w-full h-28 mt-3"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label="Bar chart of jobs found and new jobs per scrape run"
        >
          {runs.map((run, i) => {
            const found = run.jobs_found ?? 0
            const newCount = run.new_jobs_count ?? 0
            const foundH = (found / scaleMax) * USABLE_H
            const newH = (Math.min(newCount, found || newCount) / scaleMax) * USABLE_H
            const x = i * slot + gap / 2

            return (
              <g key={run.id}>
                <title>
                  {`${timeAgo(run.timestamp)} — found ${found}, new ${newCount}`}
                </title>
                <rect
                  x={x}
                  y={BASELINE - foundH}
                  width={barWidth}
                  height={foundH}
                  rx={rx}
                  fill="rgb(var(--border))"
                />
                <rect
                  x={x}
                  y={BASELINE - newH}
                  width={barWidth}
                  height={newH}
                  rx={rx}
                  fill="rgb(var(--accent))"
                />
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
