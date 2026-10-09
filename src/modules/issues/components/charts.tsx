import { useEffect, useState, type ReactNode } from 'react'
import { useCountUp } from '../lib/useCountUp'

/** Small dependency-free SVG charts in the module's visual language. Every chart carries an accessible label and a legend/title. */

export const CHART_COLORS = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#fb7185', '#2dd4bf', '#818cf8', '#f97316']

/** Animated progress ring with a centre label (number counts up). */
export function Ring({ value, size = 108, stroke = 11, color = 'var(--im-accent)', label, sub, suffix = '٪' }: { value: number | null; size?: number; stroke?: number; color?: string; label: string; sub?: ReactNode; suffix?: string }) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const [on, setOn] = useState(false)
  useEffect(() => { const t = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(t) }, [])
  const n = useCountUp(Math.round(v))
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${value === null ? 'نامشخص' : Math.round(v) + ' درصد'}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--im-panel-3)" strokeWidth={stroke} />
        <circle className="im-ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={value === null ? 'var(--im-muted)' : color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={on ? c * (1 - v / 100) : c} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="im-gauge-label" fill="var(--im-text)" fontSize={size * 0.235}>{value === null ? '—' : `${n}${suffix}`}</text>
      </svg>
      <figcaption style={{ fontSize: 12, fontWeight: 700, color: 'var(--im-muted-2)' }}>{label}</figcaption>
      {sub && <div className="im-helper" style={{ marginTop: 0 }}>{sub}</div>}
    </figure>
  )
}

export interface Slice { key: string; label: string; value: number; color: string }

/** Donut with centre total and a legend; segments grow in. */
export function Donut({ slices, size = 150, stroke = 22, centerLabel, onPick }: { slices: Slice[]; size?: number; stroke?: number; centerLabel: string; onPick?: (key: string) => void }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const [on, setOn] = useState(false)
  useEffect(() => { const t = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(t) }, [])
  let acc = 0
  const n = useCountUp(total)
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel}: ${total}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--im-panel-3)" strokeWidth={stroke} />
        {total > 0 && slices.filter((s) => s.value > 0).map((s) => {
          const len = (s.value / total) * c
          const off = acc
          acc += len
          return (
            <circle key={s.key} className="im-donut-seg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke} strokeDasharray={on ? `${Math.max(0, len - 2)} ${c}` : `0 ${c}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`} onClick={() => onPick?.(s.key)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          )
        })}
        <text x="50%" y="46%" dominantBaseline="central" textAnchor="middle" className="im-gauge-label" fill="var(--im-text)" fontSize={size * 0.2}>{n}</text>
        <text x="50%" y="63%" dominantBaseline="central" textAnchor="middle" fill="var(--im-muted)" fontSize={size * 0.075} fontWeight={700}>{centerLabel}</text>
      </svg>
      <ul className="im-legend" style={{ flexDirection: 'column', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
        {slices.map((s) => (
          <li key={s.key} style={{ ['--c' as string]: s.color }}>
            <i />{s.label} <b style={{ color: 'var(--im-text)', marginInlineStart: 4 }}>{s.value}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Horizontal bar list; widths animate from zero. */
export function HBars({ rows, max }: { rows: { key: string; label: string; value: number; color?: string; hint?: string }[]; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value))
  const [on, setOn] = useState(false)
  useEffect(() => { const t = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(t) }, [])
  return (
    <div className="im-bars">
      {rows.map((r) => (
        <div key={r.key} className="im-bar-row" title={r.hint}>
          <span className="lbl">{r.label}</span>
          <span className="trk"><i style={{ width: on ? `${(r.value / m) * 100}%` : 0, ['--c' as string]: r.color ?? 'var(--im-accent)' }} /></span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  )
}

/** Area + line trend over equally spaced points (e.g. weekly created vs closed). */
export function Trend({ series, labels, height = 140 }: { series: { key: string; label: string; color: string; values: number[] }[]; labels: string[]; height?: number }) {
  const w = 460
  const h = height
  const pad = { l: 26, r: 8, t: 10, b: 22 }
  const n = labels.length
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (w - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - v / max) * (h - pad.t - pad.b)
  const ticks = [0, Math.round(max / 2), max]
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={series.map((s) => s.label).join(' و ')}>
        {ticks.map((t) => <g key={t}><line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--im-line)" strokeDasharray="3 4" /><text x={pad.l - 6} y={y(t)} textAnchor="end" dominantBaseline="central" fontSize="9" fill="var(--im-muted)">{t}</text></g>)}
        {series.map((s, k) => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`)
          return (
            <g key={s.key}>
              <defs><linearGradient id={`im-g-${s.key}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity="0.34" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient></defs>
              {k === 0 && <polygon className="im-spark-area" points={`${x(0)},${y(0)} ${pts.join(' ')} ${x(n - 1)},${y(0)}`} fill={`url(#im-g-${s.key})`} />}
              <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.2" fill="var(--im-panel)" stroke={s.color} strokeWidth="2"><title>{`${labels[i]}: ${v}`}</title></circle>)}
            </g>
          )
        })}
        {labels.map((l, i) => (i % Math.ceil(n / 7) === 0 ? <text key={i} x={x(i)} y={h - 6} textAnchor="middle" fontSize="9" fill="var(--im-muted)">{l}</text> : null))}
      </svg>
      <ul className="im-legend" style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>{series.map((s) => <li key={s.key} style={{ ['--c' as string]: s.color }}><i />{s.label}</li>)}</ul>
    </div>
  )
}

/** Half-circle gauge with a needle-less filled arc and min/max captions. */
export function Gauge({ value, max = 100, color = 'var(--im-accent)', label, display, size = 170 }: { value: number | null; max?: number; color?: string; label: string; display?: string; size?: number }) {
  const v = value === null ? 0 : Math.max(0, Math.min(max, value))
  const r = size / 2 - 14
  const c = Math.PI * r
  const [on, setOn] = useState(false)
  useEffect(() => { const t = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(t) }, [])
  return (
    <figure style={{ margin: 0, textAlign: 'center' }}>
      <svg width={size} height={size / 2 + 22} viewBox={`0 0 ${size} ${size / 2 + 22}`} role="img" aria-label={`${label}: ${display ?? v}`}>
        <path d={`M 14 ${size / 2} A ${r} ${r} 0 0 1 ${size - 14} ${size / 2}`} fill="none" stroke="var(--im-panel-3)" strokeWidth="14" strokeLinecap="round" />
        <path className="im-ring-arc" d={`M 14 ${size / 2} A ${r} ${r} 0 0 1 ${size - 14} ${size / 2}`} fill="none" stroke={value === null ? 'var(--im-muted)' : color} strokeWidth="14" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={on ? c * (1 - v / max) : c} />
        <text x="50%" y={size / 2 - 6} textAnchor="middle" className="im-gauge-label" fill="var(--im-text)" fontSize={size * 0.17}>{value === null ? '—' : display ?? v}</text>
      </svg>
      <figcaption style={{ fontSize: 12, fontWeight: 700, color: 'var(--im-muted-2)', marginTop: -4 }}>{label}</figcaption>
    </figure>
  )
}

/** Stacked horizontal segment bar (e.g. share of each stage). */
export function StackBar({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1
  return (
    <div>
      <div style={{ display: 'flex', height: 14, borderRadius: 99, overflow: 'hidden', background: 'var(--im-panel-3)' }} role="img" aria-label="سهم هر بخش">
        {slices.filter((s) => s.value > 0).map((s) => <i key={s.key} title={`${s.label}: ${s.value}`} style={{ flexGrow: s.value / total, background: s.color, transition: 'flex-grow .6s var(--im-ease)' }} />)}
      </div>
      <ul className="im-legend" style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>{slices.map((s) => <li key={s.key} style={{ ['--c' as string]: s.color }}><i />{s.label} <b style={{ color: 'var(--im-text)' }}>{s.value}</b></li>)}</ul>
    </div>
  )
}
