import { useId, type ReactNode } from 'react'

const fa = (n: number) => n.toLocaleString('fa-IR')

export interface Seg { key: string; label: string; value: number; color: string }

/** Donut with the total in the middle; each slice and legend row is a button that filters the inbox. */
export function Donut({ segs, center, sub, active, onPick, size = 132 }: { segs: Seg[]; center: ReactNode; sub?: string; active?: string; onPick?: (key: string) => void; size?: number }) {
  const total = segs.reduce((s, x) => s + x.value, 0)
  const r = 46, c = 2 * Math.PI * r
  let off = 0
  return (
    <div className="ib-donut">
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="سهم هر ماژول از کارها">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--im-line, rgba(148,163,184,.25))" strokeWidth="13" opacity=".55" />
        {total > 0 && segs.filter((s) => s.value > 0).map((s) => {
          const len = (s.value / total) * c
          const el = (
            <circle key={s.key} className={`ib-seg${active === s.key ? ' on' : ''}${active && active !== s.key ? ' dim' : ''}`} cx="60" cy="60" r={r} fill="none" stroke={s.color} strokeWidth={active === s.key ? 16 : 13}
              strokeDasharray={`${Math.max(0, len - 1.6)} ${c - Math.max(0, len - 1.6)}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" onClick={() => onPick?.(s.key)} style={{ cursor: onPick ? 'pointer' : undefined }}><title>{s.label}: {fa(s.value)}</title></circle>
          )
          off += len
          return el
        })}
        <text x="60" y="58" textAnchor="middle" className="ib-donut-n">{center}</text>
        {sub && <text x="60" y="75" textAnchor="middle" className="ib-donut-s">{sub}</text>}
      </svg>
      <ul className="ib-legend">
        {segs.filter((s) => s.value > 0).map((s) => (
          <li key={s.key}><button className={active === s.key ? 'on' : ''} onClick={() => onPick?.(s.key)}><i style={{ background: s.color }} />{s.label}<b>{fa(s.value)}</b></button></li>
        ))}
      </ul>
    </div>
  )
}

/** Vertical columns (due-date / waiting-time distributions); clicking a column filters. */
export function Columns({ bars, active, onPick, height = 104 }: { bars: Seg[]; active?: string; onPick?: (key: string) => void; height?: number }) {
  const max = Math.max(1, ...bars.map((b) => b.value))
  const id = useId()
  return (
    <div className="ib-cols" style={{ ['--h' as string]: `${height}px` }}>
      {bars.map((b, i) => (
        <button key={b.key} className={`ib-col${active === b.key ? ' on' : ''}${active && active !== b.key ? ' dim' : ''}`} onClick={() => onPick?.(b.key)} aria-label={`${b.label}: ${fa(b.value)}`} aria-describedby={id}>
          <b>{b.value ? fa(b.value) : ''}</b>
          <span className="ib-col-bar"><i style={{ height: `${(b.value / max) * 100}%`, background: `linear-gradient(180deg, ${b.color}, color-mix(in srgb, ${b.color} 45%, transparent))`, animationDelay: `${i * 60}ms` }} /></span>
          <em>{b.label}</em>
        </button>
      ))}
    </div>
  )
}

/** One stacked horizontal bar (share of decisions / own work / fixes). */
export function StackBar({ segs, active, onPick }: { segs: Seg[]; active?: string; onPick?: (key: string) => void }) {
  const total = segs.reduce((s, x) => s + x.value, 0)
  return (
    <div className="ib-stack">
      <div className="ib-stack-bar" role="img" aria-label="ترکیب کارها">
        {total === 0 ? <i style={{ flex: 1, background: 'var(--im-line, rgba(148,163,184,.3))' }} /> : segs.filter((s) => s.value > 0).map((s) => <i key={s.key} className={active && active !== s.key ? 'dim' : ''} style={{ flex: s.value, background: s.color }} onClick={() => onPick?.(s.key)} title={`${s.label}: ${fa(s.value)}`} />)}
      </div>
      <div className="ib-stack-rows">
        {segs.map((s) => (
          <button key={s.key} className={active === s.key ? 'on' : ''} onClick={() => onPick?.(s.key)}>
            <i style={{ background: s.color }} /><span>{s.label}</span><b>{fa(s.value)}</b><em>{total ? fa(Math.round((s.value / total) * 100)) : fa(0)}٪</em>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Half-circle gauge: share of work that is on time. */
export function Gauge({ value, face, caption }: { value: number; face: string; caption: string }) {
  const v = Math.max(0, Math.min(100, value))
  const r = 52, arc = Math.PI * r
  const color = v >= 80 ? '#34d399' : v >= 50 ? '#f59e0b' : '#fb7185'
  return (
    <div className="ib-gauge">
      <svg viewBox="0 0 130 82" role="img" aria-label={`${fa(v)} درصد سر وقت`}>
        <path d="M13 70 A52 52 0 0 1 117 70" fill="none" stroke="var(--im-line, rgba(148,163,184,.3))" strokeWidth="12" strokeLinecap="round" opacity=".6" />
        <path d="M13 70 A52 52 0 0 1 117 70" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(v / 100) * arc} ${arc}`} className="ib-gauge-fill" />
        <text x="65" y="56" textAnchor="middle" className="ib-gauge-face">{face}</text>
        <text x="65" y="78" textAnchor="middle" className="ib-gauge-n">{fa(v)}٪</text>
      </svg>
      <p>{caption}</p>
    </div>
  )
}

export function Widget({ title, hint, children, className = '' }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return <section className={`ib-widget ${className}`}><header><b>{title}</b>{hint && <span>{hint}</span>}</header>{children}</section>
}
