import { CRITERIA, type CriterionKey } from '../lib/bank'
import type { OptionResult, RiskRow, SensitivityRow } from '../lib/engine'
import { fa } from '../../../lib/faNum'

export const SERIES = ['var(--ds-a)', '#f59e0b', '#a78bfa']

/** confidence as a 240° arc; the needle colour follows the level */
export function ConfidenceGauge({ score, level }: { score: number; level: 'high' | 'medium' | 'low' }) {
  const R = 52, C = 2 * Math.PI * R, arc = C * (240 / 360), val = arc * Math.max(0, Math.min(1, score / 100))
  const tone = level === 'high' ? 'var(--ds-good)' : level === 'medium' ? 'var(--ds-warn)' : 'var(--ds-bad)'
  return (
    <svg viewBox="0 0 140 120" className="ds-gauge" role="img" aria-label={`اطمینان تحلیل ${fa(score)} از ۱۰۰`}>
      <g transform="rotate(150 70 70)">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--ds-track)" strokeWidth="10" strokeDasharray={`${arc} ${C}`} strokeLinecap="round" />
        <circle cx="70" cy="70" r={R} fill="none" stroke={tone} strokeWidth="10" strokeDasharray={`${val} ${C}`} strokeLinecap="round" className="ds-gauge-val" />
      </g>
      <text x="70" y="72" textAnchor="middle" className="ds-gauge-n">{fa(score)}</text>
      <text x="70" y="92" textAnchor="middle" className="ds-gauge-l">{level === 'high' ? 'اطمینان بالا' : level === 'medium' ? 'اطمینان متوسط' : 'اطمینان پایین'}</text>
    </svg>
  )
}

/** two lines for a long axis label, so neighbours near the bottom do not collide */
const wrap = (t: string) => { if (t.length <= 12) return [t]; const w = t.split(' '); const h = Math.ceil(w.length / 2); return [w.slice(0, h).join(' '), w.slice(h).join(' ')] }

/** the adjusted 1–5 profile of up to three options over the eleven criteria */
export function CriteriaRadar({ options }: { options: OptionResult[] }) {
  const N = CRITERIA.length, cx = 180, cy = 160, R = 100
  const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / N; return [cx + Math.cos(a) * R * (v / 5), cy + Math.sin(a) * R * (v / 5)] }
  return (
    <figure className="ds-radar">
      <svg viewBox="0 0 360 320" role="img" aria-label="مقایسهٔ معیارها برای گزینه‌های برتر">
        {[1, 2, 3, 4, 5].map((l) => <polygon key={l} points={CRITERIA.map((_, i) => pt(i, l).join(',')).join(' ')} fill="none" stroke="var(--ds-grid)" strokeWidth={l === 5 ? 1.2 : 0.8} />)}
        {CRITERIA.map((c, i) => { const [x, y] = pt(i, 5), [lx, ly] = pt(i, 6.25); return <g key={c.key}><line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--ds-grid)" strokeWidth=".8" /><text x={lx} y={ly} textAnchor="middle" className="ds-radar-l">{wrap(c.fa).map((t, j, xs) => <tspan key={j} x={lx} dy={j === 0 ? `${0.35 - (xs.length - 1) * 0.55}em` : '1.1em'}>{t}</tspan>)}</text></g> })}
        {options.map((o, k) => <polygon key={o.key} points={CRITERIA.map((c, i) => pt(i, o.profile[c.key]).join(',')).join(' ')} fill={SERIES[k]} fillOpacity={k === 0 ? 0.2 : 0.08} stroke={SERIES[k]} strokeWidth={k === 0 ? 2.2 : 1.5} strokeDasharray={k === 0 ? undefined : '5 3'} />)}
      </svg>
      <figcaption>{options.map((o, k) => <span key={o.key}><i style={{ background: SERIES[k] }} />{o.fa}</span>)}</figcaption>
    </figure>
  )
}

/** risk families on a 5×5 probability × impact grid; register risks as small dots */
export function RiskMatrix({ risks, register, bearerOf }: { risks: RiskRow[]; register: { probability: number; impact: number; title: string; code: string }[]; bearerOf?: (r: RiskRow) => string }) {
  const cell = (p: number, i: number) => { const s = p * i; return s >= 15 ? 'is-hi' : s >= 8 ? 'is-mid' : 'is-lo' }
  return (
    <div className="ds-matrix" role="table" aria-label="ماتریس ریسک: احتمال در برابر اثر">
      <div className="ds-matrix-y" aria-hidden>احتمال / شدت ←</div>
      <div className="ds-matrix-grid">
        {[5, 4, 3, 2, 1].map((p) => [1, 2, 3, 4, 5].map((i) => {
          const here = risks.filter((r) => Math.round(r.severity) === p && Math.round(r.impact) === i)
          const reg = register.filter((r) => r.probability === p && r.impact === i)
          return (
            <div key={`${p}-${i}`} className={`ds-cell ${cell(p, i)}`} role="cell" aria-label={`احتمال ${fa(p)}، اثر ${fa(i)}: ${here.map((r) => r.fa).join('، ') || 'خالی'}`}>
              {here.map((r) => <span key={r.key} className="ds-chip" title={bearerOf ? `تحمل‌کننده: ${bearerOf(r)}` : undefined}>{r.fa}</span>)}
              {reg.length > 0 && <em className="ds-reg" title={reg.map((r) => `${r.code} ${r.title}`).join('\n')}>{fa(reg.length)}</em>}
            </div>
          )
        }))}
      </div>
      <div className="ds-matrix-x" aria-hidden>اثر →</div>
    </div>
  )
}

/** how far a criterion's weight must move before the leader changes (short bar = sensitive) */
export function SensitivityTornado({ rows, name }: { rows: SensitivityRow[]; name: (k: string | null) => string }) {
  const sorted = [...rows].sort((a, b) => (a.flipTo ? 0 : 1) - (b.flipTo ? 0 : 1) || b.swing - a.swing)
  const max = Math.max(1, ...rows.map((r) => r.swing))
  return (
    <ul className="ds-tornado">
      {sorted.map((r) => (
        <li key={r.crit} className={r.flipTo ? 'is-flip' : ''}>
          <span className="ds-t-l">{r.fa}</span>
          <span className="ds-t-bar"><b style={{ width: `${Math.max(3, (r.swing / max) * 100)}%` }} /></span>
          <span className="ds-t-v">{r.flipTo ? `${r.flipUp ? `×${fa(r.flipUp, 2)}` : `×${fa(r.flipDown ?? 0, 2)}`} → ${name(r.flipTo)}` : 'پایدار'}</span>
        </li>
      ))}
    </ul>
  )
}

/** scores as horizontal bars, with the weighted contribution of each criterion as segments */
export function ScoreBars({ options, winner, onPick }: { options: OptionResult[]; winner: string | null; onPick?: (k: string) => void }) {
  const order = [...options].sort((a, b) => (a.status === 'excluded' ? 1 : 0) - (b.status === 'excluded' ? 1 : 0) || b.score - a.score)
  return (
    <ul className="ds-bars">
      {order.map((o) => (
        <li key={o.key} className={`${o.key === winner ? 'is-win' : ''} is-${o.status}`}>
          <button type="button" onClick={() => onPick?.(o.key)} aria-label={`${o.fa}: ${o.status === 'excluded' ? 'حذف‌شده' : `${fa(o.score, 1)} امتیاز`}`}>
            <span className="ds-b-l">{o.fa}{o.status === 'conditional' && <small>مشروط</small>}</span>
            <span className="ds-b-bar">{o.status === 'excluded' ? <i className="ds-b-x">حذف به دلیل محدودیت قطعی</i> : CRITERIA.map((c, k) => <b key={c.key} style={{ width: `${o.contributions[c.key as CriterionKey]}%`, opacity: 1 - (k % 4) * 0.17 }} title={`${c.fa}: ${fa(o.contributions[c.key as CriterionKey], 1)}`} />)}</span>
            <span className="ds-b-v">{o.status === 'excluded' ? '—' : fa(o.score, 1)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
