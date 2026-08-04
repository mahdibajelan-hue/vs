import { STATUS_COLOR, STATUS_LABEL_FA, type LineStatus } from '../../types'

export function StatusBadge({ status, className = '' }: { status: LineStatus; className?: string }) {
  const color = STATUS_COLOR[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
      style={{ background: `${color}22`, color: 'var(--text-primary)', border: `1px solid ${color}66` }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
      {STATUS_LABEL_FA[status]}
    </span>
  )
}

export function StatusDot({ status }: { status: LineStatus }) {
  const color = STATUS_COLOR[status]
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
}
