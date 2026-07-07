import type { JobScore } from '../types'
import { TIER_LABEL, tierColor } from '../lib/scoring'

interface ScoreBadgeProps {
  scoring: JobScore
  size?: 'sm' | 'md'
}

const TIER_EMOJI: Record<JobScore['tier'], string> = {
  hot: '🔥',
  good: '✅',
  fair: '•',
  low: '•',
}

/**
 * Compact rounded pill showing a job's opportunity score and tier.
 * size 'sm' → emoji + score; size 'md' → emoji + score + tier label.
 */
export default function ScoreBadge({ scoring, size = 'md' }: ScoreBadgeProps) {
  const { score, tier } = scoring
  const emoji = TIER_EMOJI[tier]

  return (
    <span
      className="badge"
      title={`Opportunity score ${score}/100`}
      style={{
        backgroundColor: tierColor(tier, 0.14),
        color: tierColor(tier),
        boxShadow: `inset 0 0 0 1px ${tierColor(tier, 0.35)}`,
      }}
    >
      <span aria-hidden="true">{emoji}</span>
      <span>{score}</span>
      {size === 'md' && (
        <span className="text-muted">· {TIER_LABEL[tier]}</span>
      )}
    </span>
  )
}
