import type { CSSProperties } from 'react'
import { formatJalali } from '../../lib/jalali'
import { PART_META, STATUS_COLOR, STATUS_FA, type Part, type StStatus } from './lib/stmtCore'

export const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
export const rial = (n: number) => Math.round(n).toLocaleString('fa-IR')
/** compact amount for cards: «۹۱٫۳ میلیارد» */
export function short(n: number): string {
  const a = Math.abs(n), s = n < 0 ? '−' : ''
  if (a >= 1e12) return `${s}${fa(a / 1e12, 2)} هزار میلیارد`
  if (a >= 1e9) return `${s}${fa(a / 1e9, 1)} میلیارد`
  if (a >= 1e6) return `${s}${fa(a / 1e6, 1)} میلیون`
  return `${s}${fa(a)}`
}
export const pct = (a: number, b: number) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0)
export const jd = (d: string | null | undefined) => (d ? formatJalali(d.slice(0, 10)) : '—')

export function PartChip({ part, long }: { part: Part; long?: boolean }) {
  return <span className="pst-part" style={{ '--pc': PART_META[part].color } as CSSProperties}><b>{part}</b>{long ? PART_META[part].long : PART_META[part].title}</span>
}
export function StatusChip({ status }: { status: StStatus }) {
  return <span className="pst-status" style={{ '--sc': STATUS_COLOR[status] } as CSSProperties}>{STATUS_FA[status]}</span>
}

/** the ledger bar: what earlier statements accepted, this period, and what is left to the cap (overrun in red) */
export function Ledger({ prev, now, cap, color }: { prev: number; now: number; cap: number | null; color: string }) {
  const total = Math.max(cap ?? 0, prev + Math.max(0, now))
  const over = cap != null ? Math.max(0, prev + now - cap) : 0
  const w = (x: number) => `${total > 0 ? (Math.max(0, x) / total) * 100 : 0}%`
  return (
    <div className="pst-ledger" style={{ '--pc': color } as CSSProperties}>
      <div className="pst-ledger-bar" role="img" aria-label={`تأییدشدهٔ قبل ${short(prev)}، این ماه ${short(now)}${cap != null ? `، سقف ${short(cap)}` : ''}`}>
        <i className="is-prev" style={{ width: w((now < 0 ? prev + now : prev) - Math.max(0, over - Math.max(0, now))) }} />
        <i className="is-this" style={{ width: w(Math.max(0, now) - Math.min(over, Math.max(0, now))) }} />
        {over > 0 && <i className="is-over" style={{ width: w(over) }} />}
      </div>
      <div className="pst-ledger-legend">
        <span><i style={{ background: `color-mix(in srgb, ${color} 55%, var(--bg-panel-solid))` }} />تأییدشدهٔ صورت‌وضعیت قبل: {short(prev)}</span>
        <span><i style={{ background: color }} />این ماه: {short(now)}</span>
        {cap != null && (over > 0 ? <span style={{ color: '#ef4444', fontWeight: 800 }}><i style={{ background: '#ef4444' }} />بیش از سقف: {short(over)}</span> : <span>باقی‌مانده تا سقف: {short(cap - prev - Math.max(0, now))} از {short(cap)}</span>)}
      </div>
    </div>
  )
}
