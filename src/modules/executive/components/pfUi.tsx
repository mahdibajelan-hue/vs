import type { CSSProperties, ReactNode } from 'react'
import { HEALTH_FA, type PfHealth } from '../lib/portfolioCore'
import { KpiTile, Num } from './viz'

export const faNum = (n: number, digits = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

/** compact money: rial amounts on real contracts run into the trillions */
export function fmtMoney(n: number | null | undefined, currency = 'ریال'): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n), sign = n < 0 ? '−' : ''
  const unit = currency ? ` ${currency}` : ''
  if (abs >= 1e12) return `${sign}${faNum(abs / 1e12, 1)} هزار میلیارد${unit}`
  if (abs >= 1e9) return `${sign}${faNum(abs / 1e9, 1)} میلیارد${unit}`
  if (abs >= 1e6) return `${sign}${faNum(abs / 1e6, 1)} میلیون${unit}`
  return `${sign}${faNum(abs)}${unit}`
}

export const fmtIdx = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : faNum(n, 2))

export function HealthChip({ health, title }: { health: PfHealth; title?: string }) {
  const h = HEALTH_FA[health]
  return <span className={`pf-health is-${health}`} style={{ '--c': h.color } as CSSProperties} title={title}><i aria-hidden />{h.label}</span>
}

export function Panel({ title, icon, hint, right, children, className = '' }: { title: string; icon?: ReactNode; hint?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`pf-panel ${className}`}>
      <header className="pf-panel-head">
        <div className="min-w-0">
          <h3>{icon}{title}</h3>
          {hint && <p>{hint}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  )
}

/** the module's KPI tile (see viz KpiTile): a plain number counts up; a click drills into the projects behind it */
export function Kpi({ label, value, sub, tone, icon, onClick, active, spark }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; icon?: ReactNode; onClick?: () => void; active?: boolean; spark?: number[] }) {
  return <KpiTile label={label} value={typeof value === 'number' ? <Num value={value} /> : value} sub={sub} tone={tone} icon={icon} onClick={onClick} active={active} spark={spark} />
}

/** green / yellow / red / black / unknown as one bar with counts — the portfolio's health at a glance */
export function HealthBar({ counts, onPick, active }: { counts: Record<PfHealth, number>; onPick?: (h: PfHealth | null) => void; active?: PfHealth | null }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  const order: PfHealth[] = ['green', 'yellow', 'red', 'black', 'unknown']
  return (
    <div className="pf-hbar-wrap">
      <div className="pf-hbar" role="group" aria-label="توزیع سلامت پروژه‌ها">
        {order.filter((h) => counts[h] > 0).map((h) => (
          <button key={h} type="button" aria-pressed={active === h} className={active && active !== h ? 'is-dim' : ''}
            style={{ flexGrow: counts[h], background: HEALTH_FA[h].color }} title={`${HEALTH_FA[h].label}: ${faNum(counts[h])}`}
            onClick={onPick ? () => onPick(active === h ? null : h) : undefined}>
            {counts[h] / total > 0.08 ? faNum(counts[h]) : ''}
          </button>
        ))}
      </div>
      <div className="pf-legend">
        {order.map((h) => <span key={h}><i style={{ background: HEALTH_FA[h].color }} />{HEALTH_FA[h].label} {faNum(counts[h])}</span>)}
      </div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="pf-empty">{children}</div>
}
