import { useMemo } from 'react'
import type { SpendPoint } from '../lib/finance'
import { faNum, fmtMonth, fmtMoney } from '../lib/fa'

/**
 * Budget consumption over time: cumulative payments as an area, the approved budget as a dashed ceiling and the
 * estimated total cost of all parcels as a second dashed line. Turns amber at 80% of the budget and red beyond it.
 */
export function BudgetChart({ series, budget, estimated }: { series: SpendPoint[]; budget: number | null; estimated: number }) {
  const W = 760
  const H = 250
  const m = { l: 62, r: 14, t: 26, b: 34 }
  const geo = useMemo(() => {
    const cum = series.at(-1)?.cumulative ?? 0
    const top = Math.max(budget ?? 0, estimated, cum, 1) * 1.08
    const n = Math.max(series.length - 1, 1)
    const x = (i: number) => m.l + (i / n) * (W - m.l - m.r)
    const y = (v: number) => m.t + (1 - v / top) * (H - m.t - m.b)
    const pts = series.map((p, i) => [x(i), y(p.cumulative)] as const)
    const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')
    const area = pts.length ? `${line} L${pts.at(-1)![0].toFixed(1)} ${y(0)} L${pts[0][0].toFixed(1)} ${y(0)} Z` : ''
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: top * f / 1.08 * 1.08, y: y(top * f) }))
    return { top, x, y, line, area, ticks, cum, pts }
  }, [series, budget, estimated])
  if (series.length === 0) return <p className="la-eyebrow m-0 py-8 text-center">هنوز پرداختی ثبت نشده است؛ پس از ثبت اولین پرداخت، نمودار مصرف بودجه ظاهر می‌شود.</p>
  const ratio = budget ? geo.cum / budget : 0
  const color = !budget ? 'var(--la-accent)' : ratio > 1 ? '#ef4444' : ratio >= 0.8 ? '#f59e0b' : '#22c55e'
  const step = Math.ceil(series.length / 8)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`مصرف بودجه: ${fmtMoney(geo.cum)}${budget ? ` از ${fmtMoney(budget)}` : ''}`} style={{ direction: 'ltr', maxHeight: 300 }}>
      <defs>
        <linearGradient id="la-spend" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.45" /><stop offset="1" stopColor={color} stopOpacity="0.02" /></linearGradient>
      </defs>
      {geo.ticks.map((t, i) => (
        <g key={i}>
          <line x1={62} x2={W - 14} y1={t.y} y2={t.y} stroke="var(--la-line)" strokeWidth="1" />
          <text x={56} y={t.y + 3.5} textAnchor="end" fontSize="10" fill="var(--la-ink-2)">{faNum(Math.round((geo.top * i) / 4 / 1e9)).replace(/٬/g, '')}</text>
        </g>
      ))}
      <text x={W - 14} y={12} textAnchor="end" fontSize="10" fill="var(--la-ink-2)">محور عمودی: میلیارد ریال</text>
      {budget != null && (
        <g>
          <line x1={62} x2={W - 14} y1={geo.y(budget)} y2={geo.y(budget)} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="6 4" />
          <text x={W - 16} y={geo.y(budget) - 5} textAnchor="end" fontSize="10.5" fontWeight="700" fill="#ef4444">بودجه {fmtMoney(budget)}</text>
        </g>
      )}
      {estimated > 0 && (
        <g>
          <line x1={62} x2={W - 14} y1={geo.y(estimated)} y2={geo.y(estimated)} stroke="#38bdf8" strokeWidth="1.3" strokeDasharray="2 4" />
          <text x={W - 16} y={geo.y(estimated) + 12} textAnchor="end" fontSize="10" fill="#38bdf8">برآورد کل زمین‌ها {fmtMoney(estimated)}</text>
        </g>
      )}
      <path d={geo.area} fill="url(#la-spend)" />
      <path d={geo.line} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {geo.pts.map(([px, py], i) => <circle key={series[i].month} cx={px} cy={py} r={i === geo.pts.length - 1 ? 4.5 : 2.5} fill={color}><title>{`${fmtMonth(series[i].month)}: ${fmtMoney(series[i].paid)} (جمع ${fmtMoney(series[i].cumulative)})`}</title></circle>)}
      {series.map((p, i) => (i % step === 0 || i === series.length - 1) && <text key={p.month} x={geo.x(i)} y={H - 12} textAnchor="middle" fontSize="10" fill="var(--la-ink-2)">{fmtMonth(p.month)}</text>)}
    </svg>
  )
}
