import { useMemo, useState, type CSSProperties } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { formatJalali } from '../../../lib/jalali'
import { elevAt, type ProfilePoint } from '../lib/htCore'
import { PSI_PER_BAR, pvOffset, type IgsParams, type SectionPressures } from '../lib/igs'
import type { HtReading, HtSection } from '../repo'

/**
 * Interactive charts of the hydrostatic test: where (km, elevation) and when each pressure and temperature was read,
 * against what the procedure requires there — so a reading below the line, or a section that cannot pass, shows at a glance.
 */
const fa = (v: number, d = 1) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
export const PHASE_UI: Record<string, { label: string; color: string }> = {
  filling: { label: 'آبگیری', color: '#38bdf8' }, air: { label: 'عدم وجود هوا', color: '#06b6d4' }, strength: { label: 'آزمون مقاومت', color: '#f59e0b' },
  stabilization: { label: 'دورهٔ یکنواختی', color: '#14b8a6' }, leak: { label: 'آزمون نشتی', color: '#f97316' }, drying: { label: 'خشک‌کنی', color: '#84cc16' },
}
export const LOC_UI: Record<string, { label: string; color: string }> = {
  head: { label: 'کابین (سر آزمون)', color: '#0ea5e9' }, start: { label: 'ابتدای قطعه', color: '#a855f7' }, end: { label: 'انتهای قطعه', color: '#ec4899' },
  low: { label: 'نقطهٔ پایین', color: '#ef4444' }, high: { label: 'نقطهٔ بالا', color: '#22c55e' }, km: { label: 'کیلومتر دلخواه', color: '#eab308' },
  g1: { label: 'فشارسنج ۱', color: '#0ea5e9' }, g2: { label: 'فشارسنج ۲', color: '#a855f7' }, '': { label: 'بدون محل', color: '#94a3b8' },
}
const tip: CSSProperties = { background: 'var(--bg-panel-solid, #0f172a)', border: '1px solid var(--border-soft, #334155)', borderRadius: 12, fontSize: 12, direction: 'rtl', color: 'var(--text-primary, #e2e8f0)', padding: '8px 10px' }
const axis = { fontSize: 10.5, fill: 'var(--text-muted, #94a3b8)' }
const CSS = `.hc{display:grid;gap:.5rem}.hc-legend{display:flex;flex-wrap:wrap;gap:.3rem .9rem;font-size:11px;color:var(--text-secondary)}
.hc-legend span{display:inline-flex;align-items:center;gap:.3rem}.hc-legend i{width:.8rem;height:.25rem;border-radius:2px;background:var(--c)}.hc-legend i.dot{width:.55rem;height:.55rem;border-radius:99px}.hc-legend i.dash{background:repeating-linear-gradient(90deg,var(--c) 0 4px,transparent 4px 7px)}
.hc-badge{display:inline-flex;align-items:center;gap:.35rem;padding:.25rem .65rem;border-radius:99px;font-size:11.5px;font-weight:800;color:var(--c);border:1px solid color-mix(in srgb,var(--c) 45%,transparent);background:color-mix(in srgb,var(--c) 12%,transparent)}
.hc-seg{display:flex;gap:.35rem;flex-wrap:wrap}.hc-seg button{padding:.3rem .65rem;border-radius:99px;border:1px solid var(--border-soft);font-size:11.5px;font-weight:700;color:var(--text-secondary);background:transparent;cursor:pointer}
.hc-seg button[aria-pressed=true]{border-color:#0ea5e9;color:#0ea5e9;background:color-mix(in srgb,#0ea5e9 12%,transparent)}`
const Legend = ({ items }: { items: { label: string; color: string; kind?: 'line' | 'dot' | 'dash' }[] }) => (
  <div className="hc-legend">{items.map((x) => <span key={x.label}><i className={x.kind === 'dot' ? 'dot' : x.kind === 'dash' ? 'dash' : ''} style={{ '--c': x.color } as CSSProperties} />{x.label}</span>)}</div>
)
export const Verdict = ({ label, result }: { label: string; result: 'pass' | 'fail' | 'pending' | null }) => {
  const c = result === 'pass' ? '#22c55e' : result === 'fail' ? '#ef4444' : '#94a3b8'
  return <span className="hc-badge" style={{ '--c': c } as CSSProperties}>{label}: {result === 'pass' ? 'قبول' : result === 'fail' ? 'مردود' : 'در انتظار'}</span>
}

// ── 1. a section's pressure along its profile ─────────────────────────────────
/** elevation profile of the section, the strength / leak pressure each point must see, the limits, and the readings at their km */
export function SectionHydraulic({ sec, profile, pr, igs, readings, minPsiHigh }: { sec: HtSection; profile: ProfilePoint[]; pr: SectionPressures; igs: IgsParams; readings: HtReading[]; minPsiHigh: number }) {
  const [phase, setPhase] = useState<'strength' | 'leak'>('strength')
  const pts = useMemo(() => {
    const inside = profile.filter((p) => p.km > sec.kmFrom && p.km < sec.kmTo)
    const raw = [{ km: sec.kmFrom, elev: elevAt(profile, sec.kmFrom) }, ...inside, { km: sec.kmTo, elev: elevAt(profile, sec.kmTo) }]
    const step = Math.max(1, Math.ceil(raw.length / 300))
    return raw.filter((_, i) => i % step === 0 || i === raw.length - 1).map((p) => ({ km: p.km, elev: p.elev, strength: pr.strength.low - (p.elev - sec.elevMin) * igs.psiPerM, leak: pr.leak.low - (p.elev - sec.elevMin) * igs.psiPerM }))
  }, [profile, sec, pr, igs.psiPerM])
  if (pts.length < 2) return null
  const kmOf = (r: HtReading) => r.km ?? (r.location === 'start' ? sec.kmFrom : r.location === 'end' ? sec.kmTo : r.location === 'low' ? sec.elevMinKm : r.location === 'high' ? sec.elevMaxKm : r.location === 'head' ? sec.headKm : null)
  // the last reading of the phase at each place
  const last = new Map<string, HtReading>()
  for (const r of readings.filter((x) => x.phase === phase).sort((a, b) => a.at.localeCompare(b.at))) { const k = kmOf(r); if (k != null) last.set(`${r.location}:${k.toFixed(3)}`, r) }
  const dots = [...last.values()].map((r) => {
    const km = kmOf(r)!, e = r.elev ?? elevAt(profile, km)
    const need = (phase === 'strength' ? pr.strength.low : pr.leak.low) - (e - sec.elevMin) * igs.psiPerM
    const psi = r.pressureBar * PSI_PER_BAR
    return { km, psi, ok: psi >= need - 5, r, need }
  })
  const env = phase === 'strength' ? 'strength' : 'leak'
  const envColor = phase === 'strength' ? '#f59e0b' : '#f97316'
  const minLine = phase === 'strength' ? minPsiHigh : pr.leakMin
  const pMax = Math.max(pr.strength.low, ...dots.map((d) => d.psi)) * 1.01, pMinV = Math.min(minLine, pr.leak.high, ...dots.map((d) => d.psi)) * 0.985
  const eMin = Math.min(...pts.map((p) => p.elev)), eMax = Math.max(...pts.map((p) => p.elev)), pad = Math.max(5, (eMax - eMin) * 0.3)
  return (
    <div className="hc"><style>{CSS}</style>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="hc-seg" role="group" aria-label="آزمون">{(['strength', 'leak'] as const).map((k) => <button key={k} type="button" aria-pressed={phase === k} onClick={() => setPhase(k)}>{k === 'strength' ? 'آزمون مقاومت' : 'آزمون نشتی'}</button>)}</div>
        {dots.length > 0 && <span className="hc-badge" style={{ '--c': dots.every((d) => d.ok) ? '#22c55e' : '#ef4444' } as CSSProperties}>{dots.every((d) => d.ok) ? 'همهٔ قرائت‌ها به فشار لازم رسیده‌اند' : `${fa(dots.filter((d) => !d.ok).length, 0)} قرائت کمتر از فشار لازم`}</span>}
      </div>
      <Legend items={[{ label: 'پروفیل ارتفاعی (محور راست، متر)', color: '#64748b' }, { label: phase === 'strength' ? `فشار لازم مقاومت (${fa(igs.strengthPct, 0)}٪ SMYS در نقطهٔ پایین)` : `فشار لازم نشتی (${fa(igs.leakPct, 0)}٪ SMYS در نقطهٔ پایین)`, color: envColor },
        { label: phase === 'strength' ? `حداقل ${fa(igs.minHighPct, 0)}٪ SMYS` : `حداقل ${fa(igs.leakMinPct, 0)}٪ SMYS`, color: '#ef4444', kind: 'dash' }, { label: 'قرائت قبول', color: '#22c55e', kind: 'dot' }, { label: 'قرائت کمتر از لازم', color: '#ef4444', kind: 'dot' }]} />
      <div style={{ height: 300 }} dir="ltr"><ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={pts} margin={{ top: 16, right: 8, left: 4, bottom: 4 }}>
          <defs><linearGradient id={`hc-el-${sec.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#64748b" stopOpacity={0.35} /><stop offset="1" stopColor="#64748b" stopOpacity={0.03} /></linearGradient></defs>
          <CartesianGrid stroke="var(--border-soft, rgba(148,163,184,.2))" strokeDasharray="2 5" vertical={false} />
          <XAxis dataKey="km" type="number" domain={['dataMin', 'dataMax']} tick={axis} tickFormatter={(v) => fa(Number(v), 2)} label={{ value: 'km', position: 'insideBottomRight', offset: -2, fill: 'var(--text-muted)', fontSize: 10 }} />
          <YAxis yAxisId="p" domain={[pMinV, pMax]} tick={axis} width={52} tickFormatter={(v) => fa(Number(v), 0)} label={{ value: 'psi', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 10 }} />
          <YAxis yAxisId="e" orientation="right" domain={[eMin - pad, eMax + pad]} tick={axis} width={44} tickFormatter={(v) => fa(Number(v), 0)} />
          <Tooltip contentStyle={tip} labelFormatter={(v) => `کیلومتر ${fa(Number(v), 3)}`}
            formatter={(v, k) => k === 'elev' ? [`${fa(Number(v), 2)} m`, 'ارتفاع'] : k === 'psi' ? [`${fa(Number(v), 1)} psi`, 'قرائت'] : [`${fa(Number(v), 1)} psi (${fa(Number(v) / PSI_PER_BAR, 2)} bar)`, k === 'strength' ? 'فشار لازم مقاومت' : 'فشار لازم نشتی']} />
          <Area yAxisId="e" type="linear" dataKey="elev" stroke="#64748b" strokeWidth={1.5} fill={`url(#hc-el-${sec.id})`} isAnimationActive animationDuration={700} />
          <Line yAxisId="p" type="linear" dataKey={env} stroke={envColor} strokeWidth={3} dot={false} isAnimationActive animationDuration={1100} style={{ filter: `drop-shadow(0 0 5px ${envColor}88)` }} />
          <ReferenceLine yAxisId="p" y={minLine} stroke="#ef4444" strokeDasharray="6 4" label={{ value: `حداقل ${fa(minLine, 0)}`, position: 'insideTopLeft', fill: '#ef4444', fontSize: 10 }} />
          <ReferenceLine yAxisId="p" x={sec.headKm} stroke="#0ea5e9" strokeDasharray="3 3" label={{ value: 'کابین', position: 'top', fill: '#0ea5e9', fontSize: 10 }} />
          <ReferenceDot yAxisId="e" x={sec.elevMinKm} y={sec.elevMin} r={5} fill="#ef4444" stroke="#fff" label={{ value: '▼ پایین', position: 'bottom', fill: '#ef4444', fontSize: 10 }} />
          <ReferenceDot yAxisId="e" x={sec.elevMaxKm} y={sec.elevMax} r={5} fill="#22c55e" stroke="#fff" label={{ value: '▲ بالا', position: 'top', fill: '#22c55e', fontSize: 10 }} />
          <Scatter yAxisId="p" data={dots.map((d) => ({ km: d.km, psi: d.psi }))} dataKey="psi" shape={(p: { cx?: number; cy?: number; index?: number }) => { const d = dots[p.index ?? 0]; return <circle cx={p.cx} cy={p.cy} r={6} fill={d?.ok ? '#22c55e' : '#ef4444'} stroke="#fff" strokeWidth={2} /> }} />
        </ComposedChart>
      </ResponsiveContainer></div>
    </div>
  )
}

// ── 2. pressure and temperature against time ──────────────────────────────────
export function TimeChart({ readings, required, verdicts }: { readings: HtReading[]; required: { label: string; psi: number; color: string }[]; verdicts?: { label: string; result: 'pass' | 'fail' | 'pending' | null }[] }) {
  const locs = [...new Set(readings.map((r) => r.location))]
  const data = useMemo(() => [...readings].sort((a, b) => a.at.localeCompare(b.at)).map((r) => ({ t: Date.parse(r.at), [`p_${r.location}`]: r.pressureBar * PSI_PER_BAR, temp: r.tempC, phase: r.phase, loc: r.location })), [readings])
  // the span of each phase, as a coloured band
  const bands = useMemo(() => {
    const out: { phase: string; a: number; b: number }[] = []
    for (const d of data) { const l = out[out.length - 1]; if (l && l.phase === d.phase) l.b = d.t; else out.push({ phase: d.phase, a: d.t, b: d.t }) }
    return out
  }, [data])
  if (data.length < 2) return <p className="ps-hint">برای رسم نمودار دست‌کم دو قرائت لازم است.</p>
  const ps = data.flatMap((d) => locs.map((l) => d[`p_${l}`] as number | undefined).filter((x): x is number => x != null)).concat(required.map((x) => x.psi))
  const hasT = data.some((d) => d.temp != null)
  const when = (t: number) => { const d = new Date(t); return `${formatJalali(d.toISOString().slice(0, 10))} ${d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}` }
  return (
    <div className="hc"><style>{CSS}</style>
      {verdicts && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{verdicts.map((v) => <Verdict key={v.label} {...v} />)}</div>}
      <Legend items={[...locs.map((l) => ({ label: `فشار — ${(LOC_UI[l] ?? LOC_UI['']).label}`, color: (LOC_UI[l] ?? LOC_UI['']).color })), ...(hasT ? [{ label: 'دما (محور راست)', color: '#f97316', kind: 'dash' as const }] : []), ...required.map((x) => ({ label: x.label, color: x.color, kind: 'dash' as const })), ...bands.filter((b, i, arr) => arr.findIndex((y) => y.phase === b.phase) === i).map((b) => ({ label: (PHASE_UI[b.phase] ?? { label: b.phase }).label, color: (PHASE_UI[b.phase] ?? { color: '#94a3b8' }).color, kind: 'dot' as const }))]} />
      <div style={{ height: 300 }} dir="ltr"><ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 6, left: 4, bottom: 4 }}>
          <CartesianGrid stroke="var(--border-soft, rgba(148,163,184,.2))" strokeDasharray="2 5" vertical={false} />
          {bands.map((b, i) => <ReferenceArea key={i} yAxisId="p" x1={b.a} x2={Math.max(b.b, b.a + 60000)} fill={(PHASE_UI[b.phase] ?? { color: '#94a3b8' }).color} fillOpacity={0.16} stroke="none" />)}
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tick={axis} tickFormatter={(t) => new Date(Number(t)).toLocaleString('fa-IR-u-ca-persian', { month: 'numeric', day: 'numeric', hour: '2-digit' })} minTickGap={40} />
          <YAxis yAxisId="p" domain={[Math.min(...ps) * 0.995, Math.max(...ps) * 1.005]} tick={axis} width={52} tickFormatter={(v) => fa(Number(v), 0)} />
          {hasT && <YAxis yAxisId="t" orientation="right" tick={{ ...axis, fill: '#f97316' }} width={34} tickFormatter={(v) => `${fa(Number(v), 0)}°`} domain={['dataMin - 1', 'dataMax + 1']} />}
          <Tooltip contentStyle={tip} labelFormatter={(t) => when(Number(t))} formatter={(v, k) => String(k) === 'temp' ? [`${fa(Number(v), 2)} °C`, 'دما'] : [`${fa(Number(v), 1)} psi (${fa(Number(v) / PSI_PER_BAR, 2)} bar)`, `فشار — ${(LOC_UI[String(k).slice(2)] ?? LOC_UI['']).label}`]} />
          {required.map((x) => <ReferenceLine key={x.label} yAxisId="p" y={x.psi} stroke={x.color} strokeDasharray="6 4" label={{ value: `${fa(x.psi, 0)}`, position: 'insideTopRight', fill: x.color, fontSize: 10 }} />)}
          {locs.map((l) => { const c = (LOC_UI[l] ?? LOC_UI['']).color; return <Line key={l} yAxisId="p" type="monotone" dataKey={`p_${l}`} stroke={c} strokeWidth={2.6} connectNulls dot={{ r: 2.5, fill: c }} activeDot={{ r: 5 }} isAnimationActive animationDuration={900} /> })}
          {hasT && <Line yAxisId="t" type="monotone" dataKey="temp" stroke="#f97316" strokeWidth={1.6} strokeDasharray="4 3" connectNulls dot={false} isAnimationActive animationDuration={900} />}
        </ComposedChart>
      </ResponsiveContainer></div>
    </div>
  )
}

// ── 3. strength test: pressure–volume ─────────────────────────────────────────
export function PvChart({ readings, volumeM3, igs }: { readings: HtReading[]; volumeM3: number; igs: IgsParams }) {
  const pts = readings.filter((r) => r.phase === 'strength' && r.volumeM3 != null).map((r) => ({ v: r.volumeM3!, p: r.pressureBar * PSI_PER_BAR })).sort((a, b) => a.p - b.p)
  const fit = pvOffset(pts, volumeM3, igs)
  if (pts.length < 4 || !fit) return <p className="ps-hint">برای نمودار فشار–حجم، در قرائت‌های آزمون مقاومت «حجم آب تزریق‌شدهٔ تجمعی» را هم ثبت کنید (دست‌کم ۴ قرائت).</p>
  const line = [{ v: fit.intercept + fit.slope * pts[0].p, p: pts[0].p }, { v: fit.intercept + fit.slope * pts[pts.length - 1].p, p: pts[pts.length - 1].p }]
  return (
    <div className="hc"><style>{CSS}</style>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Verdict label="خطی بودن P–V" result={fit.pass ? 'pass' : 'fail'} />
        <span className="ps-meta">بیشترین انحراف {fa(fit.maxOffsetM3, 3)} m³ = {fa(fit.maxOffsetPct, 3)}٪ حجم قطعه (حد {fa(igs.pvOffsetPct, 2)}٪){fit.atP != null ? ` در ${fa(fit.atP, 0)} psi` : ''}</span>
      </div>
      <Legend items={[{ label: 'قرائت‌ها', color: '#f59e0b', kind: 'dot' }, { label: 'خط راست برازش‌شده (بخش خطی)', color: '#6366f1', kind: 'dash' }]} />
      <div style={{ height: 260 }} dir="ltr"><ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 10, right: 10, left: 4, bottom: 14 }}>
          <CartesianGrid stroke="var(--border-soft, rgba(148,163,184,.2))" strokeDasharray="2 5" />
          <XAxis dataKey="v" type="number" domain={['dataMin', 'dataMax']} tick={axis} tickFormatter={(v) => fa(Number(v), 2)} label={{ value: 'حجم تزریقی m³', position: 'insideBottom', offset: -8, fill: 'var(--text-muted)', fontSize: 10 }} />
          <YAxis dataKey="p" type="number" domain={['dataMin', 'dataMax']} tick={axis} width={52} tickFormatter={(v) => fa(Number(v), 0)} />
          <Tooltip contentStyle={tip} formatter={(v, k) => (k === 'v' ? [`${fa(Number(v), 3)} m³`, 'حجم'] : [`${fa(Number(v), 1)} psi`, 'فشار'])} />
          <Line data={line} dataKey="p" stroke="#6366f1" strokeDasharray="6 4" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Scatter data={pts} dataKey="p" fill="#f59e0b" isAnimationActive animationDuration={700} />
        </ComposedChart>
      </ResponsiveContainer></div>
    </div>
  )
}

// ── 4. the whole line: each section's strength pressure over the profile ───────
export function LineHydraulic({ profile, sections, psiPerM, onPick }: { profile: ProfilePoint[]; sections: (HtSection & { pLowPsi: number; color: string; status: string })[]; psiPerM: number; onPick?: (id: string) => void }) {
  const data = useMemo(() => {
    const step = Math.max(1, Math.ceil(profile.length / 600))
    const pts = profile.filter((_, i) => i % step === 0 || i === profile.length - 1)
    return pts.map((p) => {
      const row: Record<string, number | null> = { km: p.km, elev: p.elev }
      for (const s of sections) row[s.id] = p.km >= s.kmFrom && p.km <= s.kmTo ? s.pLowPsi - (p.elev - s.elevMin) * psiPerM : null
      return row
    })
  }, [profile, sections, psiPerM])
  if (data.length < 2 || !sections.length) return null
  const ps = sections.flatMap((s) => [s.pLowPsi, s.pLowPsi - (s.elevMax - s.elevMin) * psiPerM])
  const eMin = Math.min(...profile.map((p) => p.elev)), eMax = Math.max(...profile.map((p) => p.elev))
  return (
    <div className="hc"><style>{CSS}</style>
      <Legend items={[{ label: 'پروفیل ارتفاعی خط (محور راست، متر)', color: '#64748b' }, ...sections.slice(0, 12).map((s) => ({ label: `${s.code} — ${s.status}`, color: s.color }))]} />
      <div style={{ height: 300 }} dir="ltr"><ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 6, left: 4, bottom: 4 }} onClick={(e) => { const km = Number((e as { activeLabel?: number } | null)?.activeLabel); const s = sections.find((x) => km >= x.kmFrom && km <= x.kmTo); if (s && onPick) onPick(s.id) }}>
          <defs><linearGradient id="hc-line-el" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#64748b" stopOpacity={0.3} /><stop offset="1" stopColor="#64748b" stopOpacity={0.02} /></linearGradient></defs>
          <CartesianGrid stroke="var(--border-soft, rgba(148,163,184,.2))" strokeDasharray="2 5" vertical={false} />
          <XAxis dataKey="km" type="number" domain={['dataMin', 'dataMax']} tick={axis} tickFormatter={(v) => fa(Number(v), 0)} />
          <YAxis yAxisId="p" domain={[Math.min(...ps) * 0.98, Math.max(...ps) * 1.01]} tick={axis} width={52} tickFormatter={(v) => fa(Number(v), 0)} />
          <YAxis yAxisId="e" orientation="right" domain={[eMin - (eMax - eMin) * 0.6, eMax + 10]} tick={axis} width={44} tickFormatter={(v) => fa(Number(v), 0)} />
          <Tooltip contentStyle={tip} labelFormatter={(v) => `کیلومتر ${fa(Number(v), 2)}`} formatter={(v, k) => k === 'elev' ? [`${fa(Number(v), 1)} m`, 'ارتفاع'] : [`${fa(Number(v), 0)} psi`, `فشار مقاومت ${sections.find((s) => s.id === k)?.code ?? ''}`]} />
          <Area yAxisId="e" type="linear" dataKey="elev" stroke="#64748b" strokeWidth={1.4} fill="url(#hc-line-el)" isAnimationActive animationDuration={700} />
          {sections.map((s) => { const idle = s.stage === 'planned' && !s.failed; return <Line key={s.id} yAxisId="p" type="linear" dataKey={s.id} stroke={s.color} strokeWidth={idle ? 1.4 : 2.8} strokeOpacity={idle ? 0.55 : 1} dot={false} connectNulls={false} isAnimationActive animationDuration={1000} style={{ cursor: onPick ? 'pointer' : undefined }} /> })}
          {sections.map((s) => <ReferenceLine key={`c${s.id}`} yAxisId="p" x={s.kmTo} stroke="var(--border-soft, #475569)" strokeDasharray="2 4" />)}
        </ComposedChart>
      </ResponsiveContainer></div>
      <p className="ps-hint">هر خط رنگی، فشار آزمون مقاومت در طول یک قطعه است: بیشترین فشار در پایین‌ترین نقطه و کمترین در بالاترین نقطه. روی هر قطعه بزنید تا صفحهٔ آن باز شود.</p>
    </div>
  )
}
