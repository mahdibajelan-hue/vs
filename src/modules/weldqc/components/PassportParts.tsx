import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { GRADE_COLOR, GRADE_FA, type Health } from '../lib/health'
import { PASSES, QUAD_FA, crewGrid, type CrewRow, type PassSides } from '../lib/crew'
import { PASS_FA } from '../lib/rules'
import { CODE_TYPE, type Code } from '../lib/api1104'
import { DEFECT_COLOR } from '../lib/rules'
import { fa } from '../lib/useQc'

/** شاخص سلامت سرجوش — the ring, its grade, and «provisional» while the file is open */
export function HealthRing({ h, size = 132 }: { h: Health; size?: number }) {
  const r = 52, C = 2 * Math.PI * r, f = (h.score ?? 0) / 100, c = GRADE_COLOR[h.grade]
  return (
    <div className="wq-hring" style={{ '--c': c, width: size, height: size } as CSSProperties} role="img" aria-label={`شاخص سلامت سرجوش ${h.score == null ? 'نامعلوم' : fa(h.score)} از ۱۰۰، ${GRADE_FA[h.grade]}`}>
      <svg viewBox="0 0 120 120" aria-hidden><circle cx="60" cy="60" r={r} className="wq-hring-track" /><circle cx="60" cy="60" r={r} className="wq-hring-fill" strokeDasharray={`${C * f} ${C}`} transform="rotate(-90 60 60)" /></svg>
      <b>{h.score == null ? '—' : fa(h.score)}<small>{GRADE_FA[h.grade]}{h.provisional ? ' · موقت' : ''}</small></b>
    </div>
  )
}

export type StageState = 'done' | 'now' | 'todo' | 'fail' | 'na'
export interface Stage { id: string; label: string; icon: LucideIcon; state: StageState; date?: string; hint?: string }
const STATE_FA: Record<StageState, string> = { done: 'انجام شده', now: 'در جریان', todo: 'انجام نشده', fail: 'مردود / نیاز به اقدام', na: 'لازم نیست' }

/** the life of the weld, one icon per stage; each opens its own part of the file */
export function StageRail({ stages, active, onPick }: { stages: Stage[]; active: string; onPick: (id: string) => void }) {
  return (
    <ol className="wq-rail" aria-label="مراحل پروندهٔ سرجوش">
      {stages.map((s, k) => {
        const I = s.icon
        return (
          <li key={s.id} className={`is-${s.state} ${active === s.id ? 'is-active' : ''}`} style={{ '--i': k } as CSSProperties}>
            <button type="button" onClick={() => onPick(s.id)} aria-current={active === s.id ? 'step' : undefined} aria-label={`${s.label}: ${STATE_FA[s.state]}`} title={s.hint}>
              <span className="wq-rail-ico"><I size={19} aria-hidden /></span>
              <span className="wq-rail-dot" aria-hidden />
              <b>{s.label}</b>
              <small>{s.date || STATE_FA[s.state]}</small>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

const hue = (k: string) => { let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 70% 55%)` }

/**
 * The weld seen along the pipe: four concentric rings (root inside → cap outside), each split in four quadrants coloured
 * by the welder who made it; indications drawn at their clock position on their pass. 12 o'clock at the top.
 */
export function WeldClock({ crew, sides, defects, nameOf }: { crew: CrewRow[]; sides: PassSides; defects: { code: Code | ''; clock: number | null; pass: string; verdict: string | null }[]; nameOf: (k: string) => string }) {
  const g = crewGrid(crew, sides)
  const R = { root: 52, hot: 66, fill: 80, cap: 94 } as const, cx = 120, cy = 120
  const arc = (r: number, q: number) => { const a0 = ((q - 1) * 90 - 90) * Math.PI / 180, a1 = (q * 90 - 90) * Math.PI / 180; return `M ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}` }
  const pt = (r: number, clock: number) => { const a = (clock / 12 * 360 - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] }
  const labels = [1, 2, 3, 4].map((q) => ({ q, keys: g.root[q as 1 | 2 | 3 | 4].keys, at: pt(118, (q - 1) * 3 + 1.5) }))
  return (
    <figure className="wq-clock">
      <svg viewBox="0 0 240 240" role="img" aria-label="نقشهٔ جوشکاران هر پاس در هر ربع و محل ناپیوستگی‌ها">
        {PASSES.map((p) => [1, 2, 3, 4].map((q) => { const c = g[p][q as 1 | 2 | 3 | 4]; return <path key={`${p}${q}`} d={arc(R[p], q)} stroke={c.keys.length ? hue(c.keys[0]) : 'var(--border-soft)'} strokeWidth={11} fill="none" strokeLinecap="butt" opacity={c.source === 'crew' ? 1 : c.source === 'half' ? 0.75 : 0.45}><title>{`${PASS_FA[p]} · ${QUAD_FA[q as 1 | 2 | 3 | 4]}: ${c.keys.map(nameOf).join('، ') || 'ثبت نشده'}`}</title></path> }))}
        {[0, 3, 6, 9].map((h) => { const [x1, y1] = pt(44, h), [x2, y2] = pt(102, h); return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} className="wq-clock-tick" /> })}
        {defects.filter((d) => d.clock != null).map((d, k) => { const [x, y] = pt(R[(d.pass as keyof typeof R) || 'fill'] ?? 80, d.clock as number); const c = d.code ? DEFECT_COLOR[CODE_TYPE[d.code]] : '#64748b'; return <g key={k}><circle cx={x} cy={y} r={6} fill={c} stroke="#fff" strokeWidth={1.5} className={d.verdict && d.verdict !== 'accept' ? 'wq-clock-bad' : ''} /><title>{`${d.code} · ساعت ${fa(d.clock as number, 1)}`}</title></g> })}
        <text x={cx} y={cy - 4} className="wq-clock-c">۱۲</text><text x={cx} y={cy + 12} className="wq-clock-s">ریشه ← کپ</text>
        {labels.map((l) => <text key={l.q} x={l.at[0]} y={l.at[1]} className="wq-clock-lab">{l.keys.slice(0, 2).join('/') || '—'}</text>)}
      </svg>
      <figcaption>حلقهٔ داخلی ریشه و بیرونی پاس نهایی؛ هر رنگ یک جوشکار. پررنگ = ترکیب ثبت‌شده، کم‌رنگ‌تر = نیمهٔ گزارش جوشکاری یا کل پاس. ساعت ۱۲ بالا.</figcaption>
    </figure>
  )
}

/** pass × quadrant table: welder, position / direction, time, VT, and where the answer came from */
export function CrewTable({ crew, sides, nameOf }: { crew: CrewRow[]; sides: PassSides; nameOf: (k: string) => string }) {
  const g = crewGrid(crew, sides)
  const SRC = { crew: '', half: 'نیمهٔ گزارش', pass: 'کل پاس', none: '' } as const
  return (
    <div className="wq-tbl-wrap"><table className="wq-tbl wq-crew-tbl">
      <thead><tr><th>پاس</th>{[1, 2, 3, 4].map((q) => <th key={q}>{QUAD_FA[q as 1 | 2 | 3 | 4]}</th>)}</tr></thead>
      <tbody>{PASSES.map((p) => (
        <tr key={p}><th scope="row">{PASS_FA[p]}</th>{[1, 2, 3, 4].map((q) => { const c = g[p][q as 1 | 2 | 3 | 4]; return (
          <td key={q} className={`is-${c.source}`}>
            {c.keys.length ? c.keys.map((k) => <span key={k} className="wq-crew-w"><i style={{ background: hue(k) }} /><b className="ps-code">{k}</b> {nameOf(k) !== k ? nameOf(k) : ''}</span>) : <em>—</em>}
            {c.row && (c.row.position || c.row.direction || c.row.vt) && <small>{[c.row.position, c.row.direction === 'uphill' ? 'سربالا' : c.row.direction === 'downhill' ? 'سرپایین' : '', c.row.vt === 'accept' ? 'VT قبول' : c.row.vt === 'reject' ? 'VT رد' : ''].filter(Boolean).join(' · ')}</small>}
            {SRC[c.source] && <small className="wq-src">{SRC[c.source]}</small>}
          </td>
        ) })}</tr>
      ))}</tbody>
    </table></div>
  )
}
export { hue as welderHue }
