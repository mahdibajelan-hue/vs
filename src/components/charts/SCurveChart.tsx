import { useId } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { jalaliText } from '../../modules/execution/lib/periods'

/**
 * The S-curve of the whole system (schedule, engineering): planned, actual and forecast progress on a real time axis,
 * so «today», the status date and the end dates sit exactly where they belong.
 *  - actual: the thick line with a soft glow and a gradient fill, drawn in on load; its last point pulses;
 *  - planned: a calm solid line; forecast: a dashed line whose dashes move forward; extra series (cost…) dotted;
 *  - a legend above the chart names every line and marker, in words, never by colour alone.
 * Motion is off for people who ask the system for reduced motion.
 */
export type SeriesKind = 'planned' | 'actual' | 'forecast' | 'aux'
export interface SCurveSeries { key: string; label: string; color: string; kind: SeriesKind }
export interface SCurveMarker { date: string; label: string; color: string; /** today = solid accent; others dashed */ strong?: boolean }
export type SCurveRow = { date: string } & Record<string, number | null | string>

const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const faNum = (v: number, d = 1) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })

const CSS = `.scv{display:grid;gap:8px}
.scv-legend{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:11.5px;color:var(--im-text,inherit)}
.scv-legend span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.scv-legend svg{flex:none}
.scv-legend .mk{width:2px;height:13px;border-radius:2px;display:inline-block}
.scv-box{position:relative;border-radius:14px;background:radial-gradient(120% 90% at 0% 0%,color-mix(in srgb,var(--scv-a) 9%,transparent),transparent 60%),radial-gradient(90% 80% at 100% 100%,color-mix(in srgb,var(--scv-p) 7%,transparent),transparent 60%)}
.scv-fc{stroke-dasharray:7 6;animation:scv-march 1.4s linear infinite}
@keyframes scv-march{to{stroke-dashoffset:-26}}
.scv-pulse{transform-box:fill-box;transform-origin:center;animation:scv-pulse 2.2s cubic-bezier(.23,1,.32,1) infinite}
@keyframes scv-pulse{0%{transform:scale(.6);opacity:.75}100%{transform:scale(2.6);opacity:0}}
@media (prefers-reduced-motion:reduce){.scv-fc,.scv-pulse{animation:none}}`

function Swatch({ kind, color }: { kind: SeriesKind; color: string }) {
  return (
    <svg width="26" height="10" aria-hidden>
      {kind === 'actual' && <rect x="0" y="2" width="26" height="6" rx="3" fill={color} opacity=".2" />}
      <line x1="1" y1="5" x2="25" y2="5" stroke={color} strokeWidth={kind === 'actual' ? 3.5 : 2} strokeLinecap="round" strokeDasharray={kind === 'forecast' ? '5 4' : kind === 'aux' ? '2 3' : undefined} />
    </svg>
  )
}

export function SCurveChart({ rows, series, markers = [], h = 300, yMax = 100, unit = '٪' }: { rows: SCurveRow[]; series: SCurveSeries[]; markers?: SCurveMarker[]; h?: number; yMax?: number; unit?: string }) {
  const uid = useId().replace(/:/g, '')
  const data: (Record<string, number | string | null> & { t: number; date: string })[] = rows.map((r) => ({ ...r, t: ms(r.date) }))
  const actual = series.find((s) => s.kind === 'actual'), planned = series.find((s) => s.kind === 'planned')
  const lastActual = actual ? [...data].reverse().find((r) => typeof r[actual.key] === 'number') : undefined
  const ts = [...data.map((r) => r.t), ...markers.map((m) => ms(m.date))]
  const lo = Math.min(...ts), hi = Math.max(...ts)
  if (!data.length || !Number.isFinite(lo)) return <p className="im-helper" style={{ margin: 16, textAlign: 'center' }}>برای رسم منحنی داده‌ای وجود ندارد.</p>
  const fmtDate = (t: number) => jalaliText(new Date(t).toISOString().slice(0, 10))
  const labelOf = new Map(series.map((s) => [s.key, s.label]))
  return (
    <div className="scv" style={{ ['--scv-a' as string]: actual?.color ?? '#14b8a6', ['--scv-p' as string]: planned?.color ?? '#6366f1' }}>
      <style>{CSS}</style>
      <div className="scv-legend" role="list" aria-label="راهنمای منحنی">
        {series.map((s) => <span role="listitem" key={s.key}><Swatch kind={s.kind} color={s.color} />{s.label}</span>)}
        {markers.map((m) => <span role="listitem" key={m.label}><i className="mk" style={{ background: m.color, opacity: m.strong ? 1 : 0.7 }} />{m.label}: {jalaliText(m.date)}</span>)}
      </div>
      <div className="scv-box" style={{ height: h }} dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 14, right: 16, left: 2, bottom: 2 }}>
            <defs>
              <linearGradient id={`a${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={actual?.color} stopOpacity={0.38} /><stop offset="1" stopColor={actual?.color} stopOpacity={0.02} /></linearGradient>
              <linearGradient id={`p${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={planned?.color} stopOpacity={0.12} /><stop offset="1" stopColor={planned?.color} stopOpacity={0} /></linearGradient>
              <filter id={`g${uid}`} x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <CartesianGrid stroke="var(--im-line, rgba(148,163,184,.25))" strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={[lo, hi]} tickFormatter={fmtDate} tick={{ fontSize: 10.5, fill: 'var(--im-muted, #94a3b8)' }} axisLine={{ stroke: 'var(--im-line, rgba(148,163,184,.3))' }} tickLine={false} minTickGap={34} />
            <YAxis domain={[0, yMax]} tickFormatter={(v) => `${faNum(v, 0)}${unit}`} tick={{ fontSize: 10.5, fill: 'var(--im-muted, #94a3b8)' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              cursor={{ stroke: 'var(--im-muted, #94a3b8)', strokeDasharray: '3 4' }}
              labelFormatter={(t) => fmtDate(Number(t))}
              formatter={(v, k) => [`${faNum(Number(v))}${unit}`, labelOf.get(String(k)) ?? String(k)]}
              contentStyle={{ background: 'var(--im-panel, #0f172a)', border: '1px solid var(--im-line, #334155)', borderRadius: 12, fontSize: 12, direction: 'rtl', color: 'var(--im-text, #e2e8f0)' }}
            />
            {markers.map((m) => <ReferenceLine key={m.label} x={ms(m.date)} stroke={m.color} strokeWidth={m.strong ? 2 : 1.4} strokeDasharray={m.strong ? undefined : '4 4'} strokeOpacity={m.strong ? 0.9 : 0.75} ifOverflow="extendDomain" label={m.strong ? { value: m.label, position: 'top', fontSize: 10.5, fontWeight: 700, fill: m.color } : undefined} />)}
            {planned && <Area type="monotone" dataKey={planned.key} name={planned.key} stroke={planned.color} strokeWidth={2.2} fill={`url(#p${uid})`} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive animationDuration={900} animationEasing="ease-out" />}
            {actual && <Area type="monotone" dataKey={actual.key} name={actual.key} stroke={actual.color} strokeWidth={4} fill={`url(#a${uid})`} filter={`url(#g${uid})`} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} isAnimationActive animationDuration={1500} animationBegin={250} animationEasing="ease-out" />}
            {series.filter((s) => s.kind === 'forecast').map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.key} stroke={s.color} strokeWidth={2.8} className="scv-fc" dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />)}
            {series.filter((s) => s.kind === 'aux').map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.key} stroke={s.color} strokeWidth={2} strokeDasharray="2 4" dot={false} connectNulls isAnimationActive animationDuration={1200} />)}
            {actual && lastActual && <ReferenceLine x={lastActual.t} stroke="none" label={(p: { viewBox?: { x: number; y: number; height: number } }) => {
              const vb = p.viewBox; if (!vb) return <g />
              const v = Number(lastActual[actual.key]); const y = vb.y + vb.height * (1 - v / yMax)
              return <g><circle cx={vb.x} cy={y} r={6} fill={actual.color} className="scv-pulse" /><circle cx={vb.x} cy={y} r={5} fill={actual.color} stroke="#fff" strokeWidth={2} /></g>
            }} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
