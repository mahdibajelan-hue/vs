import { useMemo } from 'react'
import type { RmRisk, RmRiskAssessment } from '../types'
import { currentState, riskLevel, riskScore, RISK_LEVEL_COLOR, RISK_LEVEL_LABEL_FA } from '../lib/riskScore'

const LEVELS = [5, 4, 3, 2, 1]

export function RiskHeatMap({
  risks,
  assessments,
  activeCell,
  onCellClick,
}: {
  risks: RmRisk[]
  assessments: RmRiskAssessment[]
  activeCell: { probability: number; impact: number } | null
  onCellClick: (probability: number, impact: number) => void
}) {
  const grid = useMemo(() => {
    const map = new Map<string, RmRisk[]>()
    for (const r of risks) {
      if (r.status === 'closed') continue
      const state = currentState(r, assessments.filter((a) => a.riskId === r.id))
      const key = `${state.probability}-${state.impact}`
      map.set(key, [...(map.get(key) ?? []), r])
    }
    return map
  }, [risks, assessments])

  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-1 text-sm font-bold">نقشه حرارتی ریسک (۵×۵)</p>
      <p className="mb-3 text-[11px] text-muted">احتمال وقوع × شدت پیامد بر اساس آخرین وضعیت — روی هر خانه کلیک کنید تا ریسک‌های آن دیده شوند</p>
      <div className="flex gap-2" dir="ltr">
        <div className="flex flex-col justify-between py-1 text-[10px] text-muted">
          {LEVELS.map((lvl) => (
            <div key={lvl} className="flex h-14 items-center justify-center w-5">
              {lvl}
            </div>
          ))}
        </div>
        <div className="flex-1">
          <div className="grid grid-cols-5 gap-1.5">
            {LEVELS.map((impact) =>
              [1, 2, 3, 4, 5].map((probability) => {
                const cellRisks = grid.get(`${probability}-${impact}`) ?? []
                const score = riskScore(probability, impact)
                const level = riskLevel(score)
                const isActive = activeCell?.probability === probability && activeCell?.impact === impact
                return (
                  <button
                    key={`${probability}-${impact}`}
                    onClick={() => onCellClick(probability, impact)}
                    title={cellRisks.map((r) => r.title).join('، ')}
                    className="relative flex h-14 flex-col items-center justify-center rounded-lg text-white font-bold transition-transform hover:scale-[1.04]"
                    style={{
                      background: RISK_LEVEL_COLOR[level],
                      outline: isActive ? '2.5px solid white' : 'none',
                      outlineOffset: isActive ? '-2.5px' : 0,
                      opacity: activeCell && !isActive ? 0.55 : 1,
                    }}
                  >
                    {cellRisks.length > 0 && <span className="text-base leading-none">{cellRisks.length}</span>}
                  </button>
                )
              }),
            )}
          </div>
          <div className="mt-1.5 grid grid-cols-5 gap-1.5 text-center text-[10px] text-muted">
            {[1, 2, 3, 4, 5].map((p) => (
              <div key={p}>{p}</div>
            ))}
          </div>
          <p className="mt-1 text-center text-[10px] text-muted">احتمال وقوع →</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[10px]">
        {(['low', 'medium', 'high', 'critical'] as const).map((lvl) => (
          <span key={lvl} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: RISK_LEVEL_COLOR[lvl] }} />
            {RISK_LEVEL_LABEL_FA[lvl]}
          </span>
        ))}
      </div>
    </div>
  )
}
