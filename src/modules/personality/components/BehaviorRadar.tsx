import { AlertTriangle, CheckCircle2, Info, Target } from 'lucide-react'
import type { FingerprintDimensionRow } from '../lib/fingerprintModel'
import type { RoleAlignmentResult } from '../lib/roleAlignment'
import { analyseProfile, buildAxes, familySummaries, type RadarAxis } from '../lib/behaviorChart'
import { tone } from '../../competency/lib/tone'

const STATUS_COLOR: Record<string, string> = { BELOW_MIN: '#ef4444', BELOW_PREFERRED: '#f59e0b', MEETS: '#10b981', MEETS_CRITICAL: '#10b981', ABOVE_PREFERRED: '#38bdf8' }
const fa = (n: number) => Math.round(n).toLocaleString('fa-IR')

const pt = (cx: number, cy: number, r: number, deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)] as const
function wedge(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = pt(cx, cy, r1, a0), [x1, y1] = pt(cx, cy, r1, a1), [x2, y2] = pt(cx, cy, r0, a1), [x3, y3] = pt(cx, cy, r0, a0)
  return `M${x0} ${y0} A${r1} ${r1} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 0 ${x3} ${y3} Z`
}

/**
 * Radial-bar chart of every behavioural dimension: one spoke per dimension, grouped by family (coloured arc on the rim).
 * Each spoke shows the candidate's calibrated score as the bar, the job's preferred band as a green track behind it and the job minimum as a tick.
 * Bar colour = fit with the job (red below minimum, amber below preferred, green meets, blue above); a dashed outline marks a score that rests on a single item.
 */
export function BehaviorRadar({ axes, alignmentPercent, hasJobProfile }: { axes: RadarAxis[]; alignmentPercent: number | null; hasJobProfile: boolean }) {
  const W = 760, H = 540, cx = W / 2, cy = H / 2, R0 = 44, R1 = 196
  const n = axes.length, step = 360 / Math.max(1, n), half = step * 0.4
  const rr = (v: number) => R0 + ((R1 - R0) * Math.max(0, Math.min(100, v))) / 100
  const ang = (i: number) => -90 + i * step
  const fams = familySummaries(axes)
  const famColor = new Map(fams.map((f) => [f.familyKey, f.tone]))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[760px]" role="img" aria-label={`نمودار شعاعی ${fa(n)} بُعد رفتاری در برابر الزام شغل`}>
      {[25, 50, 75, 100].map((g) => <circle key={g} cx={cx} cy={cy} r={rr(g)} fill="none" stroke="var(--fx-grid)" strokeWidth={g === 100 ? 1.2 : 0.8} strokeDasharray={g === 100 ? undefined : '3 4'} />)}
      {[50, 100].map((g) => { const [x, y] = pt(cx, cy, rr(g), -90 + step / 2 - 2); return <text key={g} x={x} y={y} fontSize="9" fill="var(--fx-chart-muted)" textAnchor="middle">{fa(g)}</text> })}
      {axes.map((a, i) => {
        const a0 = ang(i) - half, a1 = ang(i) + half, mid = ang(i)
        const color = (a.status && STATUS_COLOR[a.status]) || a.tone
        const bandFrom = a.prefMin ?? a.min, bandTo = a.prefMax ?? (bandFrom != null ? 100 : null)
        const [lx, ly] = pt(cx, cy, R1 + 32, mid)
        const [fx, fy] = pt(cx, cy, R1 + 15, mid)
        const right = Math.cos((mid * Math.PI) / 180) >= 0
        const flip = Math.abs(Math.sin((mid * Math.PI) / 180)) > 0.97
        return (
          <g key={a.key}>
            <title>{`${a.labelFa}: ${a.score == null ? 'بدون شواهد' : fa(a.score)}${a.min != null ? ` · حداقل شغل ${fa(a.min)}` : ''}${a.confidence === 'LOW' ? ' · فقط یک گویه' : ''}`}</title>
            <path d={wedge(cx, cy, R0, R1, a0, a1)} fill="var(--fx-track)" />
            {bandFrom != null && bandTo != null && <path d={wedge(cx, cy, rr(bandFrom), rr(bandTo), a0, a1)} fill="#10b981" opacity={0.2} stroke="#10b981" strokeOpacity={0.5} strokeWidth={0.8} />}
            {a.score != null && <path d={wedge(cx, cy, R0, rr(a.score), a0 + 0.8, a1 - 0.8)} fill={color} opacity={a.confidence === 'LOW' ? 0.55 : 0.92} stroke={a.confidence === 'LOW' ? color : 'none'} strokeDasharray={a.confidence === 'LOW' ? '3 2' : undefined} strokeWidth={1} />}
            {a.min != null && (() => { const [x0, y0] = pt(cx, cy, rr(a.min), a0), [x1, y1] = pt(cx, cy, rr(a.min), a1); return <path d={`M${x0} ${y0} A${rr(a.min)} ${rr(a.min)} 0 0 1 ${x1} ${y1}`} fill="none" stroke="var(--text-primary)" strokeWidth={2.2} /> })()}
            <circle cx={fx} cy={fy} r={4.2} fill={famColor.get(a.familyKey)} />
            <text x={lx} y={ly} fontSize="10.5" fontWeight={a.isCritical ? 800 : 600} fill="var(--fx-chart-label)" textAnchor={flip ? 'middle' : right ? 'start' : 'end'} dominantBaseline="central">{a.short}{a.isCritical ? ' ★' : ''}</text>
          </g>
        )
      })}
      <circle cx={cx} cy={cy} r={R0 - 4} fill="var(--fx-ring-hole)" stroke="var(--fx-border)" />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="22" fontWeight="900" fill="var(--text-primary)">{hasJobProfile && alignmentPercent != null ? `٪${fa(alignmentPercent)}` : '—'}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9.5" fill="var(--fx-chart-muted)">{hasJobProfile ? 'تطابق شغلی' : 'بدون نیم‌رخ شغل'}</text>
    </svg>
  )
}

const TONE_ICON = { good: CheckCircle2, warn: AlertTriangle, bad: AlertTriangle, info: Info } as const
const TONE_COLOR = { good: '#10b981', warn: '#f59e0b', bad: '#ef4444', info: '#38bdf8' } as const

/** The combined view: chart, family summary chips, legend and the written analysis underneath. */
export function BehaviorOverview({ rows, alignment, hasJobProfile, validityFactor }: { rows: FingerprintDimensionRow[]; alignment: RoleAlignmentResult; hasJobProfile: boolean; validityFactor?: number | null }) {
  const axes = buildAxes(rows)
  const analysis = analyseProfile(axes, alignment, { validityFactor, hasJobProfile })
  const fams = familySummaries(axes)
  return (
    <div className="fx-card space-y-4 p-4 sm:p-5">
      <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div>
          <BehaviorRadar axes={axes} alignmentPercent={alignment.overallAlignmentPercent} hasJobProfile={hasJobProfile} />
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10.5px] fx-muted">
            <Legend color="#10b981" label="برآورده" /><Legend color="#f59e0b" label="زیر بازهٔ ترجیحی" /><Legend color="#ef4444" label="زیر حداقل شغل" /><Legend color="#38bdf8" label="بالاتر از بازه" />
            <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-4 rounded-sm" style={{ background: '#10b981', opacity: 0.25, outline: '1px solid #10b98188' }} /> بازهٔ موردنیاز شغل</span>
            <span className="inline-flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-current" /> حداقل شغل</span>
            <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-4 rounded-sm border border-dashed" /> فقط یک گویه</span>
          </div>
        </div>
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-[14px] font-extrabold"><Target size={16} style={{ color: '#0ea5e9' }} /> {analysis.headline}</p>
          <ul className="space-y-2">
            {analysis.paragraphs.map((p, i) => { const Icon = TONE_ICON[p.tone]; return (
              <li key={i} className="fx-sub flex items-start gap-2 p-2.5 text-[11.5px] leading-6" style={tone(TONE_COLOR[p.tone])}>
                <Icon size={14} className="fx-tone-text mt-1 shrink-0" /><span className="fx-text-2">{p.text}</span>
              </li>
            ) })}
          </ul>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {fams.map((f) => (
          <div key={f.familyKey} className="fx-sub p-2.5" style={tone(f.tone)}>
            <p className="fx-tone-text truncate text-[10.5px] font-bold">{f.familyLabelFa}</p>
            <p className="num text-lg font-black">{f.average == null ? '—' : fa(f.average)}</p>
            <p className="fx-muted text-[10px]">{fa(f.count)} بُعد{f.below > 0 ? ` · ${fa(f.below)} زیر الزام` : ''}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
const Legend = ({ color, label }: { color: string; label: string }) => <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} /> {label}</span>
