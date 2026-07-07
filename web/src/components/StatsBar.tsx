import type { DashboardStats } from '../lib/stats'
import { token } from '../lib/palette'
import StatWidget from './widgets/StatWidget'
import Icon from './ui/Icon'

interface StatsBarProps {
  stats: DashboardStats
}

/** The KPI widget row shown at the top of the dashboard. */
export default function StatsBar({ stats }: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
      <StatWidget label="Total jobs" value={stats.total} icon={<Icon name="briefcase" />} accent="primary" />
      <StatWidget label="New · 24h" value={stats.new24h} icon={<Icon name="sparkles" />} accent="info" />
      <StatWidget
        label="Hot leads"
        value={<span style={{ color: token('hot') }}>{stats.hotLeads}</span>}
        icon={<Icon name="flame" />}
        accent="danger"
      />
      <StatWidget label="Verified" value={`${stats.verifiedPct}%`} icon={<Icon name="verified" />} accent="success" />
      <StatWidget label="Avg bids" value={stats.avgBids} icon={<Icon name="bars" />} accent="warning" />
      <StatWidget label="Freshest" value={stats.freshest} icon={<Icon name="clock" />} accent="info" />
    </div>
  )
}
