import type { ReactNode } from 'react'
import type { PaletteToken } from '../../lib/palette'
import { token } from '../../lib/palette'

interface StatWidgetProps {
  label: string
  value: ReactNode
  icon: ReactNode
  accent?: PaletteToken
  hint?: string
}

/** Datta Able-style KPI card: colored icon tile + big value + label. */
export default function StatWidget({ label, value, icon, accent = 'primary', hint }: StatWidgetProps) {
  return (
    <div className="widget-stat">
      <div
        className="icon-box"
        style={{ backgroundColor: token(accent, 0.14), color: token(accent) }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-subtle">{hint}</div>}
      </div>
    </div>
  )
}
