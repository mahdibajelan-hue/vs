import type { Risk } from '../../types'
import { riskScoreColor } from '../../lib/risk'

const LEVELS = [5, 4, 3, 2, 1]

export function RiskHeatMap({
  risks,
  activeCell,
  onCellClick,
}: {
  risks: Risk[]
  activeCell: { probability: number; impact: number } | null
  onCellClick: (probability: number, impact: number) => void
}) {
  const grid = new Map<string, Risk[]>()
  for (const r of risks) {
    const key = `${r.probability}-${r.impact}`
    grid.set(key, [...(grid.get(key) ?? []), r])
  }

  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-1 text-sm font-bold">نقشه حرارتی ریسک‌ها</p>
      <p className="mb-3 text-[11px] text-muted">احتمال وقوع × شدت تاثیر — روی هر خانه کلیک کنید تا ریسک‌های آن فیلتر شوند</p>
      <div className="flex gap-2" dir="ltr">
        <div className="flex flex-col justify-between py-1 text-[10px] text-muted">
          {LEVELS.map((lvl) => (
            <div key={lvl} className="flex h-16 items-center justify-center w-5">
              {lvl}
            </div>
          ))}
        </div>
        <div className="flex-1">
          <div className="grid grid-cols-5 gap-1.5">
            {LEVELS.map((impact) =>
              [1, 2, 3, 4, 5].map((probability) => {
                const cellRisks = grid.get(`${probability}-${impact}`) ?? []
                const score = probability * impact
                const isActive = activeCell?.probability === probability && activeCell?.impact === impact
                return (
                  <button
                    key={`${probability}-${impact}`}
                    onClick={() => onCellClick(probability, impact)}
                    title={cellRisks.map((r) => r.title).join('، ')}
                    className="relative flex h-16 flex-col items-center justify-center rounded-lg text-white font-bold transition-transform hover:scale-[1.04]"
                    style={{
                      background: riskScoreColor(score),
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
        </div>
      </div>
      <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-muted" dir="ltr">
        <span>احتمال وقوع →</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[10px]">
        {[
          { c: '#22c55e', l: 'ناچیز' },
          { c: '#eab308', l: 'پایین' },
          { c: '#f97316', l: 'متوسط' },
          { c: '#ef4444', l: 'بالا' },
          { c: '#b91c1c', l: 'بحرانی' },
        ].map((x) => (
          <span key={x.l} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: x.c }} />
            {x.l}
          </span>
        ))}
      </div>
    </div>
  )
}
