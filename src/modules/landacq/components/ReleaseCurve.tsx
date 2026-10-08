import { useMemo } from 'react'
import type { Analysis } from '../lib/kpis'
import { addDays } from '../lib/dates'
import { plannedFinishOf, releaseKey } from '../lib/autoplan'
import { stageOf } from '../lib/workflow'
import { faNum, fmtMonth } from '../lib/fa'

/**
 * Plan vs reality of the release of the route: cumulative length freed per month. Blue = the plan (planned finish of each parcel),
 * green = what has really been released so far, dashed amber = the forecast for what is still open.
 */
export function ReleaseCurve({ rows, today }: { rows: Analysis[]; today: string }) {
  const m = useMemo(() => {
    const total = rows.reduce((n, r) => n + r.length, 0) || 1
    const month = (d: string) => `${d.slice(0, 7)}-01`
    const planned = rows.map((r) => ({ d: plannedFinishOf(r.parcel), km: r.length })).filter((x): x is { d: string; km: number } => !!x.d)
    const actual = rows.filter((r) => r.released).map((r) => ({ d: stageOf(r.parcel, releaseKey(r.parcel))?.actualDate ?? today, km: r.length }))
    const forecast = rows.filter((r) => !r.released).map((r) => ({ d: r.early.projectedRelease, km: r.length }))
    const all = [...planned, ...actual, ...forecast].map((x) => x.d).concat(today).sort()
    if (all.length < 2) return null
    const months: string[] = []
    for (let d = month(all[0]); d <= month(all.at(-1)!); d = month(addDays(d, 32))) months.push(d)
    const cum = (list: { d: string; km: number }[], upTo?: string) => months.map((mo) => list.filter((x) => month(x.d) <= mo && (!upTo || month(x.d) <= month(upTo))).reduce((n, x) => n + x.km, 0))
    const act = cum(actual)
    const fc = months.map((mo) => (mo < month(today) ? null : act[Math.max(0, months.findIndex((q) => q >= month(today)))] + forecast.filter((x) => month(x.d) <= mo).reduce((n, x) => n + x.km, 0)))
    return { total, months, planned: cum(planned), actual: months.map((mo, i) => (mo <= month(today) ? act[i] : null)), forecast: fc }
  }, [rows, today])
  if (!m) return <p className="la-eyebrow m-0 py-6 text-center">با ایجاد برنامه، نمودار پیشرفت برنامه‌ای و واقعی اینجا نمایش داده می‌شود.</p>
  const W = 760, H = 230, L = 46, R = 12, T = 12, B = 30
  const n = Math.max(m.months.length - 1, 1)
  const x = (i: number) => L + (i / n) * (W - L - R)
  const y = (v: number) => T + (1 - v / m.total) * (H - T - B)
  const path = (vals: (number | null)[]) => vals.map((v, i) => (v == null ? '' : `${vals.slice(0, i).some((q) => q != null) ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join(' ')
  const step = Math.ceil(m.months.length / 9)
  const ti = m.months.findIndex((mo) => mo >= `${today.slice(0, 7)}-01`)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="پیشرفت آزادسازی: برنامه، واقعی و پیش‌بینی" style={{ direction: 'ltr', maxHeight: 280 }}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(m.total * f)} y2={y(m.total * f)} stroke="var(--la-line)" /><text x={L - 6} y={y(m.total * f) + 3.5} textAnchor="end" fontSize="10" fill="var(--la-ink-2)">{faNum(Math.round(m.total * f))}</text></g>)}
      <text x={4} y={10} fontSize="10" fill="var(--la-ink-2)">km</text>
      {ti >= 0 && <line x1={x(ti)} x2={x(ti)} y1={T} y2={H - B} stroke="var(--la-accent)" strokeDasharray="4 4" />}
      <path d={path(m.planned)} fill="none" stroke="#38bdf8" strokeWidth="2.4" />
      <path d={path(m.forecast)} fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeDasharray="6 4" />
      <path d={path(m.actual)} fill="none" stroke="#22c55e" strokeWidth="2.8" />
      {m.months.map((mo, i) => i % step === 0 && <text key={mo} x={x(i)} y={H - 10} textAnchor="middle" fontSize="10" fill="var(--la-ink-2)">{fmtMonth(mo)}</text>)}
    </svg>
  )
}
