import type { Risk } from '../../types'
import { riskScoreColor } from '../../lib/risk'

const LEVELS = [5, 4, 3, 2, 1]

export function ReportRiskHeatMini({ risks }: { risks: Risk[] }) {
  const grid = new Map<string, number>()
  for (const r of risks) {
    const key = `${r.probability}-${r.impact}`
    grid.set(key, (grid.get(key) ?? 0) + 1)
  }
  return (
    <div className="flex items-center gap-3">
      <div className="grid grid-cols-5 gap-[3px]" style={{ width: 130 }}>
        {LEVELS.map((impact) =>
          [1, 2, 3, 4, 5].map((probability) => {
            const count = grid.get(`${probability}-${impact}`) ?? 0
            const score = probability * impact
            return (
              <div
                key={`${probability}-${impact}`}
                className="flex h-[22px] items-center justify-center rounded-[3px] text-[9px] font-bold text-white"
                style={{ background: riskScoreColor(score) }}
              >
                {count > 0 ? count : ''}
              </div>
            )
          }),
        )}
      </div>
      <div className="text-[9px] leading-5" style={{ color: '#334155' }}>
        <p>محور افقی: احتمال وقوع (۱ تا ۵)</p>
        <p>محور عمودی: شدت تاثیر (۱ تا ۵، از پایین)</p>
        <p>تعداد ریسک‌های ثبت‌شده: {risks.length}</p>
      </div>
    </div>
  )
}
