import { useMemo, useState } from 'react'
import { AlertTriangle, Plus, ShieldAlert, Siren, CheckCircle2 } from 'lucide-react'
import type { Project, Risk } from '../types'
import { RISK_CATEGORY_LABEL_FA, RISK_STATUS_LABEL_FA } from '../types'
import { riskScore, riskScoreColor, riskScoreLabel, sortRisksBySeverity } from '../lib/risk'
import { RiskHeatMap } from '../components/Risks/RiskHeatMap'
import { RiskEditModal } from '../components/Risks/RiskEditModal'
import { KpiCard } from '../components/Dashboard/KpiCard'
import { useCurrentRole } from '../store/useMembersStore'
import { useAuthStore } from '../store/useAuthStore'
import { canEdit } from '../lib/permissions'

export function RisksPage({ project }: { project: Project }) {
  const role = useCurrentRole()
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const editable = canEdit(role, isAdmin)
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [activeCell, setActiveCell] = useState<{ probability: number; impact: number } | null>(null)

  const sorted = useMemo(() => sortRisksBySeverity(project.risks), [project.risks])
  const filtered = useMemo(
    () => (activeCell ? sorted.filter((r) => r.probability === activeCell.probability && r.impact === activeCell.impact) : sorted),
    [sorted, activeCell],
  )

  const openCount = project.risks.filter((r) => r.status !== 'closed').length
  const criticalCount = project.risks.filter((r) => r.status !== 'closed' && riskScore(r) >= 15).length
  const closedCount = project.risks.filter((r) => r.status === 'closed').length

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-secondary">ثبت، پایش و اولویت‌بندی ریسک‌ها و مشکلات مهم پروژه {project.name}</p>
        {editable && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors"
          >
            <Plus size={15} /> ثبت ریسک جدید
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard label="ریسک‌های باز" value={String(openCount)} icon={ShieldAlert} accent="#f59e0b" />
        <KpiCard label="ریسک‌های بحرانی/بالا (باز)" value={String(criticalCount)} icon={Siren} accent="#ef4444" />
        <KpiCard label="ریسک‌های بسته‌شده" value={String(closedCount)} icon={CheckCircle2} accent="#2ecc71" />
      </div>

      <RiskHeatMap risks={project.risks} activeCell={activeCell} onCellClick={(probability, impact) => setActiveCell((c) => (c?.probability === probability && c?.impact === impact ? null : { probability, impact }))} />

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--border-soft)' }}>
          <p className="text-sm font-bold">ثبت ریسک‌ها {activeCell && `(فیلتر: احتمال ${activeCell.probability} × تاثیر ${activeCell.impact})`}</p>
          {activeCell && (
            <button onClick={() => setActiveCell(null)} className="text-[11px] text-brand-400 hover:underline">
              حذف فیلتر
            </button>
          )}
        </div>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <AlertTriangle size={22} className="text-muted" />
            <p className="text-sm text-muted">ریسکی برای نمایش وجود ندارد</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-[11px] text-muted border-b" style={{ borderColor: 'var(--border-soft)' }}>
                  <th className="px-4 py-2 font-medium">عنوان</th>
                  <th className="px-4 py-2 font-medium">دسته</th>
                  <th className="px-4 py-2 font-medium">امتیاز</th>
                  <th className="px-4 py-2 font-medium">وضعیت</th>
                  <th className="px-4 py-2 font-medium">مسئول</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const score = riskScore(r)
                  return (
                    <tr
                      key={r.id}
                      onClick={() => editable && setEditingRisk(r)}
                      className={`border-b last:border-0 ${editable ? 'cursor-pointer hover:bg-white/[0.03]' : ''} transition-colors`}
                      style={{ borderColor: 'var(--border-soft)' }}
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{r.title}</p>
                        {r.description && <p className="mt-0.5 text-[11px] text-muted line-clamp-1">{r.description}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{RISK_CATEGORY_LABEL_FA[r.category]}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white"
                          style={{ background: riskScoreColor(score) }}
                        >
                          {score} — {riskScoreLabel(score)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{RISK_STATUS_LABEL_FA[r.status]}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{r.owner || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && <RiskEditModal projectId={project.id} risk={null} onClose={() => setShowAdd(false)} />}
      {editingRisk && <RiskEditModal projectId={project.id} risk={editingRisk} onClose={() => setEditingRisk(null)} />}
    </div>
  )
}
