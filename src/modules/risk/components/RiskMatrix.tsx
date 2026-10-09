import { useMemo } from 'react'
import type { RmPolicy, RmRisk } from '../types'
import { IMPACT_LABELS_FA, PROBABILITY_LABELS_FA, levelOf, zoneOf } from '../lib/riskPolicy'
import type { RiskState } from '../lib/riskState'

export type MatrixMode = 'inherent' | 'current' | 'residual'
export const MODE_LABEL: Record<MatrixMode, string> = { inherent: 'ذاتی', current: 'فعلی', residual: 'باقیمانده' }
const COLOR = { low: '#22c55e', medium: '#eab308', high: '#f97316', critical: '#ef4444' }
/** Heat-map colour: continuous green → yellow → orange → red by score (1…25), so neighbouring cells differ even inside one level. */
const heat = (score: number): string => `hsl(${Math.round(135 - ((score - 1) / 24) * 135)} 78% 46%)`

/** Probability (x) × impact (y). Colour = policy level; a white inner ring marks cells beyond tolerance. Click a cell to filter. */
export function RiskMatrix({ risks, states, policy, mode, selected, onSelect }: { risks: RmRisk[]; states: Map<string, RiskState>; policy: RmPolicy; mode: MatrixMode; selected: { p: number; i: number } | null; onSelect: (c: { p: number; i: number } | null) => void }) {
  const cells = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of risks) {
      const s = states.get(r.id)
      if (!s) continue
      // the matrix shows the three states with the actual P×I of the assessment they come from
      const p = mode === 'inherent' ? r.initialProbability : mode === 'current' ? s.currentP : s.residualP
      const i = mode === 'inherent' ? r.initialImpact : mode === 'current' ? s.currentI : s.residualI
      m.set(`${p}-${i}`, (m.get(`${p}-${i}`) ?? 0) + 1)
    }
    return m
  }, [risks, states, mode])
  return (
    <div>
      <div className="rk-matrix-wrap">
        <div className="rk-axis-y">{[5, 4, 3, 2, 1].map((v) => <span key={v} title={IMPACT_LABELS_FA[v - 1]}>{v}</span>)}</div>
        <div>
          <div className="rk-matrix">
            {[5, 4, 3, 2, 1].flatMap((i) => [1, 2, 3, 4, 5].map((p) => {
              const score = p * i
              const n = cells.get(`${p}-${i}`) ?? 0
              const on = selected?.p === p && selected?.i === i
              return (
                <button key={`${p}-${i}`} type="button" className={`rk-cell ${on ? 'sel' : ''} ${zoneOf(score, policy) === 'above_tolerance' || zoneOf(score, policy) === 'escalate' ? 'tol' : ''} ${selected && !on ? 'dim' : ''}`}
                  style={{ ['--c' as string]: heat(score), ['--lc' as string]: COLOR[levelOf(score, policy)] }} onClick={() => onSelect(on ? null : { p, i })} aria-label={`احتمال ${p} اثر ${i} امتیاز ${score}: ${n} ریسک`} aria-pressed={on}>
                  <small>{score}</small>{n > 0 ? n : ''}
                </button>
              )
            }))}
          </div>
          <div className="rk-axis-x">{[1, 2, 3, 4, 5].map((v) => <span key={v} title={PROBABILITY_LABELS_FA[v - 1]}>{v}</span>)}</div>
        </div>
      </div>
      <div className="im-helper" style={{ textAlign: 'center', marginTop: 6 }}>احتمال وقوع ← · اثر ↑ · {MODE_LABEL[mode]}</div>
    </div>
  )
}
