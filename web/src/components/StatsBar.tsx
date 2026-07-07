import type { DashboardStats } from '../lib/stats'
import { tierColor } from '../lib/scoring'

interface StatsBarProps {
  stats: DashboardStats
}

interface Tile {
  emoji: string
  label: string
  value: string
  valueColor?: string
}

export default function StatsBar({ stats }: StatsBarProps) {
  const tiles: Tile[] = [
    { emoji: '📋', label: 'Total jobs', value: String(stats.total) },
    { emoji: '✨', label: 'New 24h', value: String(stats.new24h) },
    {
      emoji: '🔥',
      label: 'Hot leads',
      value: String(stats.hotLeads),
      valueColor: tierColor('hot'),
    },
    { emoji: '✅', label: 'Verified', value: `${stats.verifiedPct}%` },
    { emoji: '📊', label: 'Avg bids', value: String(stats.avgBids) },
    { emoji: '⏱', label: 'Freshest', value: stats.freshest },
  ]

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mt-6">
      {tiles.map((tile) => (
        <div key={tile.label} className="stat-tile">
          <span className="stat-label uppercase">
            <span aria-hidden className="mr-1">
              {tile.emoji}
            </span>
            {tile.label}
          </span>
          <span
            className="stat-value"
            style={tile.valueColor ? { color: tile.valueColor } : undefined}
          >
            {tile.value}
          </span>
        </div>
      ))}
    </div>
  )
}
