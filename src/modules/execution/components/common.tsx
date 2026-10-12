import type { ReactNode } from 'react'
import { Chip } from '../../finance/components/fn'
import { REPORT_STATUS_LABEL_FA, LINE_STATUS_LABEL_FA, type LineStatus, type ReportStatus } from '../types'

export const fa = (n: number, d = 0): string => (Number.isFinite(n) ? n.toLocaleString('fa-IR', { maximumFractionDigits: d }) : '—')
export const pct = (x: number | null, d = 1): string => (x == null ? '—' : `${(x * 100).toLocaleString('fa-IR', { maximumFractionDigits: d })}٪`)
const RT: Record<ReportStatus, 'good' | 'warn' | 'bad' | 'neutral'> = { draft: 'neutral', incomplete: 'warn', submitted: 'neutral', partially_approved: 'warn', approved: 'good', returned: 'bad', rejected: 'bad' }
export function ReportStatusChip({ status }: { status: ReportStatus }) { return <Chip tone={RT[status]}>{REPORT_STATUS_LABEL_FA[status]}</Chip> }
const LT: Record<LineStatus, 'good' | 'warn' | 'bad' | 'neutral'> = { pending: 'neutral', approved: 'good', rejected: 'bad', returned: 'warn' }
export function LineStatusChip({ status }: { status: LineStatus }) { return <Chip tone={LT[status]}>{LINE_STATUS_LABEL_FA[status]}</Chip> }

/** Thin progress bar with an optional planned marker. */
export function Bar({ value, planned, color = 'var(--im-accent)' }: { value: number; planned?: number | null; color?: string }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <span className="ex-bar" role="img" aria-label={`پیشرفت ${pct(v, 0)}`}>
      <i style={{ width: `${v * 100}%`, background: color }} />
      {planned != null && <b style={{ insetInlineStart: `${Math.max(0, Math.min(1, planned)) * 100}%` }} title={`برنامه ${pct(planned, 0)}`} />}
    </span>
  )
}
export function Empty({ children }: { children: ReactNode }) { return <div className="im-card im-empty" style={{ padding: 28 }}>{children}</div> }
