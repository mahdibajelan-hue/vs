import { faNum } from '../lib/fa'
import { KIND_COLOR, SEVERITY_COLOR, SEVERITY_FA, type MatrixPoint } from '../lib/reportVisuals'
import type { Priority } from '../types'

/** Inline-SVG / CSS charts for the printed report. Fixed light-paper colours, no chart library, print-safe. */

const INK = '#1c1917'
const MUTED = '#78716c'
const TRACK = '#e7e5e4'

export function Donut({ segments, center, sub, size = 118 }: { segments: { value: number; color: string; label: string }[]; center: string; sub?: string; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r = 42
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${center} ${sub ?? ''}`} style={{ flexShrink: 0 }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke={TRACK} strokeWidth="13" />
        {total > 0 &&
          segments.filter((s) => s.value > 0).map((s) => {
            const len = (s.value / total) * c
            const el = <circle key={s.label} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="13" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)" />
            offset += len
            return el
          })}
        <text x="50" y="52" textAnchor="middle" fontSize="19" fontWeight="900" fill={INK}>{center}</text>
        {sub && <text x="50" y="65" textAnchor="middle" fontSize="7.5" fill={MUTED}>{sub}</text>}
      </svg>
      <ul className="m-0 list-none p-0">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5" style={{ fontSize: 11.5, marginBottom: 2 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, display: 'inline-block' }} />
            <span style={{ color: '#44403c' }}>{s.label}</span>
            <b style={{ color: INK }}>{faNum(s.value)}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Bars({ rows, max }: { rows: { label: string; value: number; color: string; sub?: string }[]; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2" style={{ fontSize: 11.5 }}>
          <span style={{ width: 92, color: '#44403c', flexShrink: 0 }}>{r.label}</span>
          <span style={{ flex: 1, height: 12, background: TRACK, borderRadius: 6, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(r.value / top) * 100}%`, background: r.color, borderRadius: 6 }} />
          </span>
          <b style={{ width: 22, textAlign: 'left', color: INK }}>{faNum(r.value)}</b>
        </div>
      ))}
    </div>
  )
}

/** Planned vs actual progress, with the gap called out. */
export function ProgressCompare({ planned, actual }: { planned: number | null; actual: number | null }) {
  if (planned == null && actual == null) return <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>عدد پیشرفت اعلام نشد.</p>
  const gap = planned != null && actual != null ? planned - actual : null
  const bar = (label: string, v: number | null, color: string) => (
    <div className="flex items-center gap-2" style={{ fontSize: 11.5 }}>
      <span style={{ width: 70, color: '#44403c' }}>{label}</span>
      <span style={{ flex: 1, height: 16, background: TRACK, borderRadius: 8, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${v ?? 0}%`, background: color, borderRadius: 8 }} />
      </span>
      <b style={{ width: 34, textAlign: 'left', color: INK }}>{v != null ? `${faNum(v)}٪` : '—'}</b>
    </div>
  )
  return (
    <div className="flex flex-col gap-2">
      {bar('واقعی', actual, gap != null && gap >= 15 ? '#b91c1c' : gap != null && gap >= 5 ? '#d97706' : '#059669')}
      {bar('برنامه', planned, '#57534e')}
      {gap != null && (
        <p style={{ margin: 0, fontSize: 11.5, color: gap > 0 ? '#b45309' : '#047857', fontWeight: 800 }}>
          {gap > 0 ? `${faNum(gap)} واحد عقب‌تر از برنامه` : gap < 0 ? `${faNum(-gap)} واحد جلوتر از برنامه` : 'مطابق برنامه'}
        </p>
      )}
    </div>
  )
}

export function SeverityStack({ counts }: { counts: Record<Priority, number> }) {
  const order: Priority[] = ['critical', 'high', 'medium', 'low']
  const total = order.reduce((s, k) => s + counts[k], 0)
  if (!total) return <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>مسئله یا ریسکی ثبت نشد.</p>
  return (
    <div>
      <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden', background: TRACK }}>
        {order.filter((k) => counts[k]).map((k) => (
          <span key={k} title={`${SEVERITY_FA[k]}: ${counts[k]}`} style={{ width: `${(counts[k] / total) * 100}%`, background: SEVERITY_COLOR[k], color: '#fff', fontSize: 10.5, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {faNum(counts[k])}
          </span>
        ))}
      </div>
      <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-3 gap-y-0.5 p-0" style={{ fontSize: 11 }}>
        {order.map((k) => (
          <li key={k} className="flex items-center gap-1" style={{ color: '#44403c' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: SEVERITY_COLOR[k], display: 'inline-block' }} />
            {SEVERITY_FA[k]} {faNum(counts[k])}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 5×5 likelihood × impact grid; numbered dots match the numbering in the issue/risk tables. */
export function RiskMatrix({ points }: { points: MatrixPoint[] }) {
  if (!points.length) return <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>موردی برای نمایش در ماتریس نیست.</p>
  const cell = 28
  const pad = 22
  const tone = (p: number, i: number) => {
    const s = p * i
    return s >= 16 ? '#fecaca' : s >= 9 ? '#fed7aa' : s >= 4 ? '#fef08a' : '#d9f99d'
  }
  const slot = new Map<string, MatrixPoint[]>()
  for (const pt of points) slot.set(`${pt.probability}:${pt.impact}`, [...(slot.get(`${pt.probability}:${pt.impact}`) ?? []), pt])
  const W = pad + cell * 5
  const H = pad + cell * 5
  return (
    <svg viewBox={`0 0 ${W + 6} ${H + 6}`} width="100%" style={{ maxWidth: 200 }} role="img" aria-label="ماتریس احتمال و اثر" direction="ltr">
      {[1, 2, 3, 4, 5].map((p) =>
        [1, 2, 3, 4, 5].map((i) => (
          <rect key={`${p}${i}`} x={pad + (i - 1) * cell} y={(5 - p) * cell} width={cell - 2} height={cell - 2} rx="4" fill={tone(p, i)} />
        )),
      )}
      {[...slot.entries()].map(([k, list]) => {
        const [p, i] = k.split(':').map(Number)
        const cx = pad + (i - 1) * cell + (cell - 2) / 2
        const cy = (5 - p) * cell + (cell - 2) / 2
        return list.slice(0, 4).map((pt, idx) => {
          const dx = ((idx % 2) - (list.length > 1 ? 0.5 : 0)) * 11
          const dy = (Math.floor(idx / 2) - (list.length > 2 ? 0.5 : 0)) * 11
          return (
            <g key={pt.n}>
              <circle cx={cx + dx} cy={cy + dy} r={list.length > 1 ? 6 : 8.5} fill={KIND_COLOR[pt.kind]} stroke="#fff" strokeWidth="1.2" />
              <text x={cx + dx} y={cy + dy + 3} textAnchor="middle" fontSize={list.length > 1 ? 7.5 : 9.5} fontWeight="800" fill="#fff">{faNum(pt.n)}</text>
            </g>
          )
        })
      })}
      <text x={pad + (cell * 5) / 2} y={H + 5} textAnchor="middle" fontSize="7.5" fill={MUTED}>اثر ←</text>
      <text x="7" y={(cell * 5) / 2} textAnchor="middle" fontSize="7.5" fill={MUTED} transform={`rotate(-90 7 ${(cell * 5) / 2})`}>احتمال ←</text>
    </svg>
  )
}

export function QualityRing({ value }: { value: number | null }) {
  const r = 30
  const c = 2 * Math.PI * r
  const v = value ?? 0
  const color = v >= 80 ? '#059669' : v >= 60 ? '#d97706' : '#b91c1c'
  return (
    <svg viewBox="0 0 80 80" width="64" height="64" role="img" aria-label={`کیفیت گزارش ${value ?? '—'}`}>
      <circle cx="40" cy="40" r={r} fill="none" stroke={TRACK} strokeWidth="8" />
      {value != null && <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 40 40)" />}
      <text x="40" y="46" textAnchor="middle" fontSize="21" fontWeight="900" fill={INK}>{value != null ? faNum(Math.round(value)) : '—'}</text>
    </svg>
  )
}
