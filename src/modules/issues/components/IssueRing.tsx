import type { ImIssue } from '../types'
import { ringState } from '../lib/issueRing'

export function IssueRing({ issue, size = 52 }: { issue: ImIssue; size?: number }) {
  const r = size / 2 - 5
  const c = 2 * Math.PI * r
  const rs = ringState(issue)
  const offset = c * (1 - rs.progress)
  return (
    <div className="im-ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(200,206,219,0.14)" strokeWidth={4} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={rs.color}
          strokeWidth={4}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="im-ring-label" style={{ color: rs.color }}>
        {rs.label}
      </div>
    </div>
  )
}
