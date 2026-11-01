import { useEffect, useState } from 'react'
import type { EpcProgress } from './epcProgress'

/** The EPC contract's progress as four gauges — engineering, procurement, construction and the weighted total — from the
 * one shared source (epcProgressOf). The arc fills in on load; the planned value is a tick on the arc. */
export const EPC_COLORS = { eng: '#6366f1', proc: '#f59e0b', cons: '#14b8a6', total: '#0ea5e9' } as const
export const EPC_LABELS = { eng: 'مهندسی (E)', proc: 'تأمین کالا (P)', cons: 'اجرا (C)', total: 'کل قرارداد EPC' } as const

const fa = (v: number, d = 1) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const CSS = `.epg{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.epg-c{position:relative;display:grid;justify-items:center;gap:2px;padding:12px 10px 12px;border-radius:18px;border:1px solid color-mix(in srgb,var(--g) 28%,var(--im-line,rgba(148,163,184,.25)));background:radial-gradient(90% 70% at 50% 0%,color-mix(in srgb,var(--g) 14%,transparent),transparent 70%),var(--im-panel,transparent);overflow:hidden}
.epg-c.tot{border-width:1.5px;box-shadow:0 16px 36px -24px var(--g)}
.epg-c h4{margin:0;font-size:12.5px;font-weight:800;color:var(--im-text,inherit)}
.epg-arc{transition:stroke-dashoffset 1.3s cubic-bezier(.23,1,.32,1)}
.epg-v{position:absolute;top:86px;left:0;right:0;text-align:center;font-size:22px;font-weight:900;font-variant-numeric:tabular-nums;color:var(--im-text,inherit)}
.epg-c.tot .epg-v{font-size:25px}
.epg-s{font-size:11.5px;color:var(--im-muted,#94a3b8);text-align:center;line-height:1.7}
.epg-s b{font-weight:800}
@media (prefers-reduced-motion:reduce){.epg-arc{transition:none}}`

function Gauge({ k, actual, planned, weight }: { k: keyof typeof EPC_COLORS; actual: number | null; planned: number | null; weight: number | null }) {
  const [on, setOn] = useState(false)
  useEffect(() => { const t = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(t) }, [])
  const r = 52, C = 2 * Math.PI * r, arc = 0.75 // a 270° arc
  const len = C * arc, v = Math.max(0, Math.min(100, actual ?? 0))
  const off = len * (1 - (on ? v : 0) / 100)
  // the planned tick on the arc: the arc starts at 135° (bottom-left) and runs clockwise
  const ang = (135 + 270 * (Math.max(0, Math.min(100, planned ?? 0)) / 100)) * (Math.PI / 180)
  const tick = (rr: number) => [70 + rr * Math.cos(ang), 70 + rr * Math.sin(ang)]
  const [x1, y1] = tick(r - 10), [x2, y2] = tick(r + 10)
  const varc = actual != null && planned != null ? actual - planned : null
  const color = EPC_COLORS[k]
  return (
    <div className={`epg-c${k === 'total' ? ' tot' : ''}`} style={{ ['--g' as string]: color }}>
      <h4>{EPC_LABELS[k]}</h4>
      <svg width="140" height="118" viewBox="0 0 140 128" aria-hidden>
        <defs><linearGradient id={`epg-${k}`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor={color} stopOpacity=".55" /><stop offset="1" stopColor={color} /></linearGradient></defs>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--im-line, rgba(148,163,184,.25))" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${len} ${C}`} transform="rotate(135 70 70)" />
        {actual != null && <circle className="epg-arc" cx="70" cy="70" r={r} fill="none" stroke={`url(#epg-${k})`} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${len} ${C}`} strokeDashoffset={off} transform="rotate(135 70 70)" style={{ filter: `drop-shadow(0 0 6px ${color}66)` }} />}
        {planned != null && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--im-text, #e2e8f0)" strokeWidth="2.5" strokeLinecap="round" opacity=".85" />}
      </svg>
      <div className="epg-v">{actual == null ? '—' : `${fa(actual)}٪`}</div>
      <div className="epg-s">
        برنامه <b>{planned == null ? '—' : `${fa(planned)}٪`}</b>{varc != null && <> · <b style={{ color: varc >= 0 ? '#16a34a' : '#ef4444' }}>{varc >= 0 ? '+' : '−'}{fa(Math.abs(varc))}</b></>}
        {weight != null && <><br />سهم از قرارداد {fa(weight * 100, 0)}٪</>}
      </div>
    </div>
  )
}

export function EpcGauges({ p }: { p: EpcProgress }) {
  const parts = ([['eng', p.eng, p.weights.e], ['proc', p.proc, p.weights.p], ['cons', p.cons, p.weights.c]] as const)
  const W = parts.reduce((s, [, d, w]) => s + (d ? w : 0), 0)
  return (
    <div className="epg" role="group" aria-label="پیشرفت قرارداد EPC">
      <style>{CSS}</style>
      <Gauge k="total" actual={p.overall?.actual ?? null} planned={p.overall?.planned ?? null} weight={null} />
      {parts.map(([k, d, w]) => <Gauge key={k} k={k} actual={d?.actual ?? null} planned={d?.planned ?? null} weight={d && W > 0 ? w / W : null} />)}
    </div>
  )
}
