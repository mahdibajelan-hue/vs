import { IM_PRIORITIES, IM_PRIORITY_COLOR, IM_PRIORITY_LABEL_FA, IM_STATUS_COLOR, IM_STATUS_LABEL_FA, IM_STATUSES, type ImIssuePriority, type ImIssueStatus } from '../types'

export function SemiGauge({ pct, color, centerText, size = 100 }: { pct: number; color: string; centerText: string; size?: number }) {
  const r = size / 2 - 14
  const cy = size / 2
  const cx = size / 2
  const circ = Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct))
  const offset = circ * (1 - clamped / 100)
  return (
    <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
      <path d={`M 14 ${cy} A ${r} ${r} 0 0 1 ${size - 14} ${cy}`} stroke="rgba(200,206,219,0.14)" strokeWidth={11} fill="none" strokeLinecap="round" />
      <path
        d={`M 14 ${cy} A ${r} ${r} 0 0 1 ${size - 14} ${cy}`}
        stroke={color}
        strokeWidth={11}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
      />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={21} fontWeight={900} fill={color} fontFamily="Vazirmatn, sans-serif">
        {centerText}
      </text>
    </svg>
  )
}

export function StatusDonut({ distribution, total }: { distribution: { status: ImIssueStatus; count: number }[]; total: number }) {
  const t = total || 1
  let acc = 0
  const stops = distribution
    .map(({ status, count }) => {
      const pct = (count / t) * 100
      const start = acc
      acc += pct
      return `${IM_STATUS_COLOR[status]} ${start}% ${acc}%`
    })
    .join(', ')
  return (
    <div>
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          background: `conic-gradient(${stops})`,
          position: 'relative',
          margin: '0 auto 10px',
        }}
      >
        <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', background: 'var(--im-panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <div style={{ fontWeight: 900, fontSize: 15 }}>{total}</div>
          <div style={{ fontSize: 8.5, color: 'var(--im-muted)' }}>کل</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 160, margin: '0 auto' }}>
        {IM_STATUSES.map((s) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--im-muted-2)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: IM_STATUS_COLOR[s], display: 'inline-block' }} />
            {IM_STATUS_LABEL_FA[s]}
          </div>
        ))}
      </div>
    </div>
  )
}

export function PriorityBars({ distribution }: { distribution: { priority: ImIssuePriority; count: number }[] }) {
  const max = Math.max(1, ...distribution.map((d) => d.count))
  return (
    <>
      {IM_PRIORITIES.map((priority) => {
        const count = distribution.find((d) => d.priority === priority)?.count ?? 0
        const pct = (count / max) * 100
        return (
          <div key={priority} style={{ marginBottom: 10, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
              <span>{IM_PRIORITY_LABEL_FA[priority]}</span>
              <span style={{ fontWeight: 800 }}>{count}</span>
            </div>
            <div style={{ height: 8, borderRadius: 6, background: 'var(--im-panel-2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: IM_PRIORITY_COLOR[priority], borderRadius: 6 }} />
            </div>
          </div>
        )
      })}
    </>
  )
}
