import { useState } from 'react'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { SCORE_GUIDE } from '../lib/competencyModel'

/** Fixed 0-5 maturity scoring guide — kept visible/collapsible at the top of every scoring page so a panelist can check it while listening to the candidate, per the interview protocol. */
export function ScoringGuideBanner() {
  const [open, setOpen] = useState(true)

  return (
    <div className="glass-panel rounded-2xl p-3.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold">
          <Info size={13} className="text-brand-300" /> راهنمای امتیازدهی (۰ تا ۵)
        </span>
        {open ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
      </button>
      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[11px]">
            <thead>
              <tr className="border-b border-white/10 text-muted">
                <th className="py-1.5 pr-2 text-right font-medium">امتیاز</th>
                <th className="py-1.5 pr-2 text-right font-medium">سطح بلوغ</th>
                <th className="py-1.5 text-right font-medium">معیار ارزیابی پاسخ</th>
              </tr>
            </thead>
            <tbody>
              {SCORE_GUIDE.map((g) => (
                <tr key={g.score} className="border-b border-white/5 last:border-0">
                  <td className="num py-1.5 pr-2 font-bold text-brand-300">{g.score}</td>
                  <td className="py-1.5 pr-2 font-medium">{g.level}</td>
                  <td className="py-1.5 leading-5 text-secondary">{g.criteria}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
