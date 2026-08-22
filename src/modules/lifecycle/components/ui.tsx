import type { ReactNode } from 'react'
import { formatJalali } from '../../../lib/jalali'
import type { HealthStatus, WarningSeverity } from '../types'
import { HEALTH_STATUS_LABEL_FA } from '../types'

/** Shared primitives for the Lifecycle module.
 *
 * Colour discipline (UI spec §21): colour carries STATUS and nothing else. Cards, borders and
 * type are all neutral; the only saturated pixels on a page are status dots, pills and bars. That
 * is what lets a manager scan a portfolio page and have the red things actually stand out. */

export const STATUS_COLOR: Record<HealthStatus, string> = {
  green: '#0ca30c',
  yellow: '#fab219',
  red: '#d03b3b',
  black: '#334155',
}

export const SEVERITY_COLOR: Record<WarningSeverity, string> = {
  critical: '#d03b3b',
  high: '#ec835a',
  medium: '#fab219',
  low: '#64748b',
}

/** Dates are Shamsi everywhere in the UI (spec §22); the database keeps ISO/Gregorian. */
export function fa(iso: string | null | undefined): string {
  if (!iso) return '—'
  return formatJalali(iso.slice(0, 10)) || '—'
}

export function faNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}

/** Signed day count, e.g. "+۱۷ روز" / "−۳ روز". */
export function faVariance(days: number | null): string {
  if (days === null) return '—'
  if (days === 0) return 'بدون انحراف'
  const sign = days > 0 ? '+' : '−'
  return `${sign}${faNum(Math.abs(days))} روز`
}

export function StatusDot({ status, size = 8 }: { status: HealthStatus; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: STATUS_COLOR[status] }}
      aria-label={HEALTH_STATUS_LABEL_FA[status]}
    />
  )
}

export function StatusPill({ status, label }: { status: HealthStatus; label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
      style={{ background: STATUS_COLOR[status] }}
    >
      {label ?? HEALTH_STATUS_LABEL_FA[status]}
    </span>
  )
}

export function SeverityPill({ severity, label }: { severity: WarningSeverity; label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
      style={{ background: SEVERITY_COLOR[severity] }}
    >
      {label}
    </span>
  )
}

export function Card({ children, className = '', title, action }: {
  children: ReactNode
  className?: string
  title?: string
  action?: ReactNode
}) {
  return (
    <section className={`glass-panel rounded-xl p-4 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-bold">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

/** A single headline number. Kept deliberately plain — the portfolio page has many of these and
 * they must read as a row of facts, not a wall of decorated tiles. */
export function Kpi({ label, value, sub, status }: {
  label: string
  value: ReactNode
  sub?: string
  status?: HealthStatus
}) {
  return (
    <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="mb-1 flex items-center gap-1.5">
        {status && <StatusDot status={status} size={7} />}
        <span className="text-[10px] text-muted">{label}</span>
      </div>
      <div className="text-lg font-extrabold leading-none" style={status ? { color: STATUS_COLOR[status] } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[10px] text-muted">{sub}</div>}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return <p className="py-8 text-center text-xs text-muted">{message}</p>
}

/** Horizontal progress/readiness bar. `blocked` renders it neutral-grey with a hatch so a
 * high percentage on a blocked item can never read as "nearly done". */
export function Bar({ percent, status, blocked }: { percent: number; status?: HealthStatus; blocked?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border-soft)' }}>
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{
          width: `${Math.max(0, Math.min(100, percent))}%`,
          background: blocked
            ? 'repeating-linear-gradient(45deg, #64748b 0 4px, #475569 4px 8px)'
            : STATUS_COLOR[status ?? (percent >= 80 ? 'green' : percent >= 50 ? 'yellow' : 'red')],
        }}
      />
    </div>
  )
}
