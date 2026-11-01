import { SCurveChart } from '../../../components/charts/SCurveChart'
import { addDays, daysBetween, jalaliText } from '../../execution/lib/periods'
import { engProgress, type CurveForecast, type Doc, type EngRules } from '../../execution/lib/engine/engineering'

export const CURVE_COLORS = { planned: '#6366f1', actual: '#14b8a6', forecast: '#f59e0b' }
/** styles of the forecast summary cards under the curve (.eng-fc) */
export const ENG_FC_CSS = `.eng-fc{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:10px}
.eng-fc>div{position:relative;display:grid;gap:3px;padding:11px 14px 11px 12px;border-radius:14px;background:color-mix(in srgb,var(--c) 9%,transparent);border:1px solid color-mix(in srgb,var(--c) 30%,transparent);overflow:hidden}
.eng-fc>div::before{content:"";position:absolute;inset-block:10px;inset-inline-start:0;width:3px;border-radius:3px;background:var(--c)}
.eng-fc small{font-size:11.5px;opacity:.75;font-weight:700}.eng-fc b{font-size:17px;font-weight:900;color:var(--c)}.eng-fc span{font-size:11.5px;opacity:.8;line-height:1.7}`

/**
 * S-curve of engineering: the plan over the whole period, the actual progress up to today only (no zeros after it), and
 * from today a dotted forecast that continues the measured pace to the forecast end of engineering.
 */
export function EngCurve({ docs, today, rules, fc, h = 300 }: { docs: Doc[]; today: string; rules: EngRules; fc: CurveForecast | null; h?: number }) {
  const dates = docs.flatMap((d) => [d.plannedPrepared, d.plannedApproved, d.actualPrepared, d.actualApproved, ...(d.cycles ?? []).map((c) => c.submittedOn)]).filter((x): x is string => !!x).sort()
  const from = dates[0] ?? today
  const end = [dates[dates.length - 1] ?? today, today, fc?.endDate ?? today].sort().slice(-1)[0]
  const span = Math.max(14, daysBetween(from, end)), step = Math.max(7, Math.ceil(span / 40 / 7) * 7)
  // a grid through today (so the actual stops and the forecast starts on the same point), plus the planned and forecast ends
  const grid = new Set<string>([today])
  for (let t = today; t >= from; t = addDays(t, -step)) grid.add(t)
  for (let t = today; t <= end; t = addDays(t, step)) grid.add(t)
  grid.add(from); grid.add(end)
  if (fc?.plannedEnd) grid.add(fc.plannedEnd)
  if (fc) grid.add(fc.endDate)
  const fcAt = (t: string): number | null => {
    if (!fc || t < today) return null
    const p = fc.points
    if (t >= p[p.length - 1].date) return p[p.length - 1].value
    const i = p.findIndex((x) => x.date > t)
    if (i <= 0) return p[0].value
    const a = p[i - 1], b = p[i], k = daysBetween(a.date, t) / Math.max(1, daysBetween(a.date, b.date))
    return a.value + (b.value - a.value) * k
  }
  const rows = [...grid].sort().map((t) => {
    const s = engProgress(docs, t, rules)
    const f = fcAt(t)
    return { t, d: jalaliText(t), planned: +(s.plannedScore * 100).toFixed(2), actual: t <= today ? +(s.actualScore * 100).toFixed(2) : null, forecast: f == null ? null : +(f * 100).toFixed(2) }
  })
  if (rows.length < 2) return <p className="im-helper" style={{ margin: '24px 12px', textAlign: 'center' }}>برای رسم منحنی دست‌کم دو تاریخ لازم است.</p>
  return (
    <SCurveChart h={h}
      rows={rows.map((r) => ({ date: r.t, planned: r.planned, actual: r.actual, forecast: r.forecast }))}
      series={[
        { key: 'planned', label: 'برنامه', color: CURVE_COLORS.planned, kind: 'planned' },
        { key: 'actual', label: 'واقعی (تا امروز)', color: CURVE_COLORS.actual, kind: 'actual' },
        ...(fc ? [{ key: 'forecast', label: 'پیش‌بینی با روند فعلی', color: CURVE_COLORS.forecast, kind: 'forecast' as const }] : []),
      ]}
      markers={[
        { date: today, label: 'امروز', color: '#f43f5e', strong: true },
        ...(fc?.plannedEnd ? [{ date: fc.plannedEnd, label: 'پایان برنامه', color: CURVE_COLORS.planned }] : []),
        ...(fc ? [{ date: fc.endDate, label: 'پایان پیش‌بینی', color: CURVE_COLORS.forecast }] : []),
      ]} />
  )
}
