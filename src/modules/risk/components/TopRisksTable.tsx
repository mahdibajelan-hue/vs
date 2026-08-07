import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import type { RmProjectMember } from '../store/useRiskMembersStore'
import { RM_CATEGORY_LABEL_FA, RM_RISK_STATUS_COLOR, RM_RISK_STATUS_LABEL_FA } from '../types'
import { RISK_LEVEL_COLOR, RISK_LEVEL_LABEL_FA, isActionOverdue } from '../lib/riskScore'
import type { TopRiskRow } from '../lib/riskAnalytics'
import type { RmRiskAction } from '../types'

export function TopRisksTable({ rows, members, actions, onSelect }: { rows: TopRiskRow[]; members: RmProjectMember[]; actions: RmRiskAction[]; onSelect: (riskId: string) => void }) {
  const ownerName = (id: string | null) => (id ? members.find((m) => m.userId === id)?.fullName || members.find((m) => m.userId === id)?.email || '—' : '—')

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <p className="px-4 py-2.5 text-sm font-bold border-b" style={{ borderColor: 'var(--border-soft)' }}>
        ۱۰ ریسک برتر
      </p>
      {rows.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted">ریسک فعالی ثبت نشده است</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03]">
              <tr className="text-xs text-secondary">
                <th className="p-2.5 text-right font-medium">#</th>
                <th className="p-2.5 text-right font-medium">ریسک</th>
                <th className="p-2.5 text-right font-medium">مالک</th>
                <th className="p-2.5 text-right font-medium">دسته</th>
                <th className="p-2.5 text-right font-medium">امتیاز</th>
                <th className="p-2.5 text-right font-medium">روند</th>
                <th className="p-2.5 text-right font-medium">اقدام بعدی</th>
                <th className="p-2.5 text-right font-medium">وضعیت</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
              {rows.map(({ risk, score, level, trend, nextActionDueDate }, i) => {
                const overdue = nextActionDueDate ? actions.some((a) => a.riskId === risk.id && a.dueDate === nextActionDueDate && isActionOverdue(a)) : false
                return (
                  <tr key={risk.id} onClick={() => onSelect(risk.id)} className="cursor-pointer hover:bg-white/[0.03] transition-colors">
                    <td className="p-2.5 num text-xs text-muted">{i + 1}</td>
                    <td className="p-2.5 max-w-[14rem]">
                      <p className="truncate text-xs font-medium">{risk.title}</p>
                      <p className="num text-[10px] text-muted">{risk.code}</p>
                    </td>
                    <td className="p-2.5 text-xs text-secondary">{ownerName(risk.ownerId)}</td>
                    <td className="p-2.5 text-xs text-secondary">{RM_CATEGORY_LABEL_FA[risk.category]}</td>
                    <td className="p-2.5 num font-bold" style={{ color: RISK_LEVEL_COLOR[level] }}>
                      {score}
                      <span className="mr-1 text-[9px] font-normal opacity-80">{RISK_LEVEL_LABEL_FA[level]}</span>
                    </td>
                    <td className="p-2.5">
                      {trend === 'improving' && <TrendingDown size={14} className="text-green-400" />}
                      {trend === 'worsening' && <TrendingUp size={14} className="text-red-400" />}
                      {(trend === 'stable' || !trend) && <Minus size={14} className="text-muted" />}
                    </td>
                    <td className={`p-2.5 num text-xs ${overdue ? 'font-bold text-red-400' : 'text-secondary'}`}>
                      {nextActionDueDate ? formatJalali(nextActionDueDate) : '—'}
                    </td>
                    <td className="p-2.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px]"
                        style={{ background: `${RM_RISK_STATUS_COLOR[risk.status]}22`, color: RM_RISK_STATUS_COLOR[risk.status] }}
                      >
                        {RM_RISK_STATUS_LABEL_FA[risk.status]}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
