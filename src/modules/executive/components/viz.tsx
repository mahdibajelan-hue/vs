import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { faNum } from './pfUi'
import './viz.css'

/* A small Power BI–style kit for the portfolio module: counting numbers, gauges, rings, donuts, ranked bars, sparklines
   and KPI tiles. Every chart that groups projects can hand its group to `onPick`, which the pages wire to the drill sheet. */

export const PALETTE = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#f43f5e', '#a78bfa', '#22c55e', '#f97316', '#06b6d4', '#ec4899']
/** one colour per lifecycle phase family, shared by every chart that groups projects by phase */
export const PHASE_COLOR: Record<string, string> = { G1: '#64748b', G2: '#0ea5e9', G3: '#8b5cf6', G4: '#6366f1', G5: '#f59e0b', G6: '#f97316', G7: '#14b8a6', G8: '#22c55e', G9: '#10b981', done: '#94a3b8', nodata: '#475569' }
/** SPI / CPI dial bands: below 0.9 red, below 0.95 amber, otherwise green */
export const IDX_BANDS: Band[] = [{ to: 0.9, color: '#ef4444' }, { to: 0.95, color: '#f59e0b' }, { to: 1.6, color: '#22c55e' }]
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const easeOut = (t: number) => 1 - (1 - t) ** 4

/** a number that counts up to its value (once per change, 700 ms, strong ease-out); jumps when motion is reduced */
export function useCountUp(value: number, ms = 700): number {
  const [shown, setShown] = useState(reduced() ? value : 0)
  const from = useRef(0)
  useEffect(() => {
    if (reduced() || !Number.isFinite(value)) { setShown(value); from.current = value; return }
    const a = from.current, t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms)
      const v = a + (value - a) * easeOut(t)
      setShown(v)
      if (t < 1) raf = requestAnimationFrame(step); else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); from.current = value }
  }, [value, ms])
  return shown
}
export function Num({ value, digits = 0, format }: { value: number; digits?: number; format?: (n: number) => string }) {
  const v = useCountUp(value)
  return <>{format ? format(v) : faNum(v, digits)}</>
}

/** set once after the first paint, so a chart can transition from empty to its value */
function useMounted() {
  const [m, setM] = useState(false)
  useEffect(() => { const r = requestAnimationFrame(() => setM(true)); return () => cancelAnimationFrame(r) }, [])
  return m
}

/* ── gauge: a half dial with coloured bands, a target tick and the value's arc ── */
export interface Band { to: number; color: string }
export function Gauge({ value, min = 0, max = 100, bands, target, label, display, sub, size = 168, onClick }: {
  value: number | null; min?: number; max?: number; bands: Band[]; target?: number; label: string; display?: ReactNode; sub?: ReactNode; size?: number; onClick?: () => void
}) {
  const mounted = useMounted()
  const R = 70, C = Math.PI * R
  const frac = (x: number) => Math.max(0, Math.min(1, (x - min) / (max - min)))
  const v = value == null ? 0 : frac(value)
  const tone = value == null ? 'var(--text-muted)' : (bands.find((b) => value <= b.to) ?? bands[bands.length - 1]).color
  const ang = (f: number) => Math.PI * (1 - f)
  const pt = (f: number, r: number) => [90 + r * Math.cos(ang(f)), 86 - r * Math.sin(ang(f))]
  let start = 0
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} className={`vz-gauge${onClick ? ' is-click' : ''}`} onClick={onClick} style={{ '--tone': tone, width: size } as CSSProperties} aria-label={`${label}: ${value == null ? 'بدون داده' : faNum(value, 2)}`}>
      <svg viewBox="0 0 180 100" aria-hidden>
        {bands.map((b, i) => {
          const f0 = start, f1 = frac(b.to); start = f1
          const [x0, y0] = pt(f0, R + 11), [x1, y1] = pt(f1, R + 11)
          return <path key={i} d={`M${x0},${y0} A${R + 11},${R + 11} 0 0 1 ${x1},${y1}`} stroke={b.color} className="vz-gauge-band" />
        })}
        <path d={`M${90 - R},86 A${R},${R} 0 0 1 ${90 + R},86`} className="vz-gauge-track" />
        <path d={`M${90 - R},86 A${R},${R} 0 0 1 ${90 + R},86`} className="vz-gauge-arc" style={{ strokeDasharray: C, strokeDashoffset: mounted ? C * (1 - v) : C }} />
        {target != null && (() => { const [x0, y0] = pt(frac(target), R - 9), [x1, y1] = pt(frac(target), R + 15); return <line x1={x0} y1={y0} x2={x1} y2={y1} className="vz-gauge-target" /> })()}
        <g className="vz-gauge-needle" style={{ transform: `rotate(${mounted ? v * 180 - 90 : -90}deg)` }}><line x1="90" y1="86" x2="90" y2="30" /><circle cx="90" cy="86" r="5" /></g>
      </svg>
      <span className="vz-gauge-v">{display ?? (value == null ? '—' : <Num value={value} digits={2} />)}</span>
      <span className="vz-gauge-l">{label}</span>
      {sub && <span className="vz-gauge-s">{sub}</span>}
    </Tag>
  )
}

/* ── ring: one percentage ── */
export function Ring({ pct, color, size = 64, stroke = 7, children }: { pct: number | null; color: string; size?: number; stroke?: number; children?: ReactNode }) {
  const mounted = useMounted()
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  const f = pct == null ? 0 : Math.max(0, Math.min(100, pct)) / 100
  return (
    <span className="vz-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="vz-ring-track" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} className="vz-ring-arc" stroke={color} strokeWidth={stroke} style={{ strokeDasharray: c, strokeDashoffset: mounted ? c * (1 - f) : c }} />
      </svg>
      <span className="vz-ring-c">{children ?? (pct == null ? '—' : `${faNum(pct)}٪`)}</span>
    </span>
  )
}

/* ── donut: parts of a whole; a part can be picked ── */
export interface Part { key: string; label: string; value: number; color: string }
export function Donut({ parts, center, sub, size = 168, picked, onPick, format = (n) => faNum(n) }: {
  parts: Part[]; center?: ReactNode; sub?: ReactNode; size?: number; picked?: string | null; onPick?: (key: string | null) => void; format?: (n: number) => string
}) {
  const mounted = useMounted()
  const [hover, setHover] = useState<string | null>(null)
  const total = parts.reduce((n, p) => n + p.value, 0)
  const R = 54, W = 18, c = 2 * Math.PI * R, gap = parts.filter((p) => p.value > 0).length > 1 ? 2 : 0
  let acc = 0
  const focus = hover ?? picked ?? null
  const fp = parts.find((p) => p.key === focus)
  return (
    <div className="vz-donut-wrap">
      <div className="vz-donut" style={{ width: size, height: size }}>
        <svg viewBox="0 0 140 140" role="img" aria-label={parts.map((p) => `${p.label}: ${format(p.value)}`).join('، ')}>
          <circle cx="70" cy="70" r={R} className="vz-donut-track" strokeWidth={W} />
          {total > 0 && parts.filter((p) => p.value > 0).map((p, i) => {
            const len = (p.value / total) * c
            const off = acc; acc += len
            return (
              <circle key={p.key} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth={focus === p.key ? W + 5 : W}
                className={`vz-donut-seg${focus && focus !== p.key ? ' is-dim' : ''}${onPick ? ' is-click' : ''}`}
                style={{ strokeDasharray: `${mounted ? Math.max(0, len - gap) : 0} ${c}`, strokeDashoffset: -off, transitionDelay: `${i * 60}ms` }}
                onPointerEnter={() => setHover(p.key)} onPointerLeave={() => setHover(null)} onClick={onPick ? () => onPick(picked === p.key ? null : p.key) : undefined}>
                <title>{`${p.label}: ${format(p.value)}`}</title>
              </circle>
            )
          })}
        </svg>
        <span className="vz-donut-c">
          <b>{fp ? format(fp.value) : center ?? <Num value={total} />}</b>
          <small>{fp ? fp.label : sub}</small>
        </span>
      </div>
      <ul className="vz-legend">
        {parts.map((p) => (
          <li key={p.key}>
            <button type="button" disabled={!onPick || !p.value} aria-pressed={picked === p.key} className={focus && focus !== p.key ? 'is-dim' : ''}
              onPointerEnter={() => setHover(p.key)} onPointerLeave={() => setHover(null)} onClick={() => onPick?.(picked === p.key ? null : p.key)}>
              <i style={{ background: p.color }} /><span>{p.label}</span><b>{format(p.value)}</b>
              {total > 0 && <small>{faNum((p.value / total) * 100)}٪</small>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── ranked bars: one row per item, scaled to the largest ── */
export interface BarItem { key: string; label: ReactNode; value: number; color?: string; note?: ReactNode; display?: ReactNode }
export function BarList({ items, onPick, picked, format = (n) => faNum(n), color = '#6366f1', max }: {
  items: BarItem[]; onPick?: (key: string) => void; picked?: string | null; format?: (n: number) => string; color?: string; max?: number
}) {
  const mounted = useMounted()
  const top = max ?? Math.max(1e-9, ...items.map((i) => Math.abs(i.value)))
  return (
    <ol className="vz-bars">
      {items.map((it, i) => {
        const Tag = onPick ? 'button' : 'div'
        return (
          <li key={it.key} style={{ '--i': i } as CSSProperties}>
            <Tag type={onPick ? 'button' : undefined} className={`vz-bar${picked === it.key ? ' is-on' : ''}${onPick ? ' is-click' : ''}`} onClick={onPick ? () => onPick(it.key) : undefined}>
              <span className="vz-bar-l">{it.label}</span>
              <span className="vz-bar-v">{it.display ?? format(it.value)}</span>
              <span className="vz-bar-t"><i style={{ background: it.color ?? color, transform: `scaleX(${mounted ? Math.min(1, Math.abs(it.value) / top) : 0})`, transitionDelay: `${i * 40}ms` }} /></span>
              {it.note && <small className="vz-bar-n">{it.note}</small>}
            </Tag>
          </li>
        )
      })}
    </ol>
  )
}

/* ── stacked bar: parts side by side on one line ── */
export function StackBar({ parts, onPick, picked, height = 14 }: { parts: Part[]; onPick?: (key: string | null) => void; picked?: string | null; height?: number }) {
  const total = parts.reduce((n, p) => n + p.value, 0) || 1
  return (
    <div className="vz-stack" style={{ height }}>
      {parts.filter((p) => p.value > 0).map((p) => (
        <button key={p.key} type="button" disabled={!onPick} title={`${p.label}: ${faNum(p.value)}`} className={picked && picked !== p.key ? 'is-dim' : ''}
          style={{ flexGrow: p.value / total, background: p.color }} onClick={() => onPick?.(picked === p.key ? null : p.key)} />
      ))}
    </div>
  )
}

/* ── sparkline ── */
export function Spark({ values, color = '#6366f1', height = 34, width = 120 }: { values: number[]; color?: string; height?: number; width?: number }) {
  const id = useId()
  if (values.length < 2) return null
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 3 - ((v - lo) / span) * (height - 6)])
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')
  return (
    <svg className="vz-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".32" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d}L${width},${height}L0,${height}Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" className="vz-spark-line" pathLength={1} />
    </svg>
  )
}

/* ── KPI tile: accent, counting value, optional sparkline; clicking drills into its projects ── */
export function KpiTile({ icon, label, value, sub, tone = '#6366f1', spark, onClick, active, i = 0 }: {
  icon?: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: string; spark?: number[]; onClick?: () => void; active?: boolean; i?: number
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} className={`vz-kpi${onClick ? ' is-click' : ''}${active ? ' is-on' : ''}`} style={{ '--c': tone, '--i': i } as CSSProperties} onClick={onClick}>
      <span className="vz-kpi-top"><span className="vz-kpi-ic">{icon}</span><span className="vz-kpi-l">{label}</span></span>
      <b className="vz-kpi-v">{value}</b>
      {sub && <span className="vz-kpi-s">{sub}</span>}
      {spark && spark.length > 1 && <Spark values={spark} color={tone} />}
    </Tag>
  )
}

/* ── column chart (vertical bars) with values on top ── */
export function Columns({ items, onPick, picked, format = (n) => faNum(n), height = 160 }: { items: BarItem[]; onPick?: (key: string) => void; picked?: string | null; format?: (n: number) => string; height?: number }) {
  const mounted = useMounted()
  const top = Math.max(1e-9, ...items.map((i) => i.value))
  return (
    <div className="vz-cols" style={{ height }}>
      {items.map((it, i) => (
        <button key={it.key} type="button" disabled={!onPick} className={`vz-col${picked === it.key ? ' is-on' : ''}${picked && picked !== it.key ? ' is-dim' : ''}`} onClick={() => onPick?.(it.key)} title={`${typeof it.label === 'string' ? it.label : ''} ${format(it.value)}`}>
          <span className="vz-col-v">{it.display ?? format(it.value)}</span>
          <span className="vz-col-t"><i style={{ background: it.color ?? PALETTE[i % PALETTE.length], transform: `scaleY(${mounted ? Math.max(0.02, it.value / top) : 0})`, transitionDelay: `${i * 50}ms` }} /></span>
          <span className="vz-col-l">{it.label}</span>
          {it.note && <small className="vz-col-n">{it.note}</small>}
        </button>
      ))}
    </div>
  )
}

/** a panel header row of section chips; used to switch what a chart measures */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="vz-seg" role="tablist" aria-label={label}>
      {options.map((o) => <button key={o.key} type="button" role="tab" aria-selected={value === o.key} onClick={() => onChange(o.key)}>{o.label}</button>)}
    </div>
  )
}
