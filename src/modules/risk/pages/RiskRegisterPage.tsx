import { useMemo, useState } from 'react'
import { FileSpreadsheet, Plus, Search, TrendingDown, TrendingUp, Minus, AlertTriangle, Users } from 'lucide-react'
import type { RmProjectDetail } from '../store/useRiskStore'
import { exportRiskProjectToExcel } from '../lib/riskExport'
import { ResponsiveTable, type ResponsiveTableColumn } from '../../../components/common/ResponsiveTable'
import {
  RM_CATEGORIES,
  RM_CATEGORY_LABEL_FA,
  RM_RISK_STATUSES,
  RM_RISK_STATUS_COLOR,
  RM_RISK_STATUS_LABEL_FA,
  rmCanManage,
  type RmRiskCategory,
  type RmRiskStatus,
} from '../types'
import { currentState, isEscalationRequired, latestAssessment, riskLevel, RISK_LEVEL_COLOR, RISK_LEVEL_LABEL_FA, isActionOverdue } from '../lib/riskScore'
import { useRiskCurrentRole, useRiskMembersStore } from '../store/useRiskMembersStore'
import { RiskFormModal } from '../components/RiskFormModal'
import { RiskDetailModal } from '../components/RiskDetailModal'
import { RmMembersModal } from '../components/RmMembersModal'
import { KpiTile } from '../components/KpiTile'

export function RiskRegisterPage({ project, onChangeProject }: { project: RmProjectDetail; onChangeProject: () => void }) {
  const role = useRiskCurrentRole()
  const members = useRiskMembersStore((s) => s.members)
  const memberCount = members.length
  const [showNewRisk, setShowNewRisk] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<RmRiskStatus | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<RmRiskCategory | 'all'>('all')
  const [query, setQuery] = useState('')

  const enriched = useMemo(
    () =>
      project.risks.map((risk) => {
        const riskAssessments = project.assessments.filter((a) => a.riskId === risk.id)
        const riskActions = project.actions.filter((a) => a.riskId === risk.id)
        const state = currentState(risk, riskAssessments)
        const trend = latestAssessment(riskAssessments)?.trend ?? null
        return {
          risk,
          score: state.score,
          level: riskLevel(state.score),
          trend,
          escalation: isEscalationRequired(risk, riskAssessments, riskActions),
          overdueActions: riskActions.filter((a) => isActionOverdue(a)).length,
        }
      }),
    [project.risks, project.assessments, project.actions],
  )

  const kpis = useMemo(() => {
    const active = enriched.filter((e) => e.risk.status !== 'closed')
    return {
      total: active.length,
      critical: active.filter((e) => e.level === 'critical').length,
      high: active.filter((e) => e.level === 'high').length,
      overdueActions: project.actions.filter((a) => isActionOverdue(a)).length,
      closed: enriched.filter((e) => e.risk.status === 'closed').length,
      closureRate: enriched.length > 0 ? Math.round((enriched.filter((e) => e.risk.status === 'closed').length / enriched.length) * 100) : 0,
    }
  }, [enriched, project.actions])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return enriched
      .filter((e) => statusFilter === 'all' || e.risk.status === statusFilter)
      .filter((e) => categoryFilter === 'all' || e.risk.category === categoryFilter)
      .filter((e) => !q || e.risk.title.toLowerCase().includes(q) || e.risk.code.toLowerCase().includes(q))
      .sort((a, b) => b.score - a.score)
  }, [enriched, statusFilter, categoryFilter, query])

  const selectedRisk = selectedRiskId ? project.risks.find((r) => r.id === selectedRiskId) ?? null : null

  const columns: ResponsiveTableColumn<(typeof filtered)[number]>[] = [
    { key: 'code', label: 'کد', render: (e) => <span className="num text-xs text-muted">{e.risk.code}</span> },
    {
      key: 'title',
      label: 'عنوان ریسک',
      primary: true,
      className: 'max-w-[16rem]',
      render: (e) => (
        <span className="flex items-center gap-1.5">
          {e.escalation && (
            <span title="نیازمند توجه مدیریت">
              <AlertTriangle size={13} className="shrink-0 text-red-400" />
            </span>
          )}
          <span className="truncate font-medium">{e.risk.title}</span>
        </span>
      ),
    },
    { key: 'category', label: 'دسته', render: (e) => <span className="text-xs text-secondary">{RM_CATEGORY_LABEL_FA[e.risk.category]}</span> },
    {
      key: 'score',
      label: 'امتیاز',
      primary: true,
      render: (e) => (
        <span className="num font-bold" style={{ color: RISK_LEVEL_COLOR[e.level] }}>
          {e.score}
        </span>
      ),
    },
    {
      key: 'level',
      label: 'سطح',
      render: (e) => (
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${RISK_LEVEL_COLOR[e.level]}22`, color: RISK_LEVEL_COLOR[e.level] }}>
          {RISK_LEVEL_LABEL_FA[e.level]}
        </span>
      ),
    },
    {
      key: 'trend',
      label: 'روند',
      render: (e) =>
        e.trend === 'improving' ? (
          <TrendingDown size={15} className="text-green-400" />
        ) : e.trend === 'worsening' ? (
          <TrendingUp size={15} className="text-red-400" />
        ) : (
          <Minus size={15} className="text-muted" />
        ),
    },
    {
      key: 'status',
      label: 'وضعیت',
      render: (e) => (
        <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: `${RM_RISK_STATUS_COLOR[e.risk.status]}22`, color: RM_RISK_STATUS_COLOR[e.risk.status] }}>
          {RM_RISK_STATUS_LABEL_FA[e.risk.status]}
        </span>
      ),
    },
  ]

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <button onClick={onChangeProject} className="text-[11px] text-muted hover:text-secondary transition-colors">
              ← همه پروژه‌ها
            </button>
            <p className="text-base font-bold">{project.name}</p>
            {project.client && <p className="text-[11px] text-muted">کارفرما: {project.client}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportRiskProjectToExcel(project, members, `${project.name}-گزارش-ریسک.xlsx`)}
              title="شامل سه گزارش: ثبت ریسک، پیگیری اقدامات، گزارش هفتگی"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5 transition-colors"
            >
              <FileSpreadsheet size={13} /> خروجی اکسل (ثبت ریسک، پیگیری اقدامات، گزارش هفتگی)
            </button>
            {rmCanManage(role) && (
              <button
                onClick={() => setShowMembers(true)}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5 transition-colors"
              >
                <Users size={13} /> اعضا ({memberCount})
              </button>
            )}
            <button
              onClick={() => setShowNewRisk(true)}
              className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-xs font-medium text-white hover:bg-red-400 transition-colors"
            >
              <Plus size={14} /> ثبت ریسک جدید
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <KpiTile label="ریسک‌های فعال" value={kpis.total} color="#3498db" />
          <KpiTile label="بحرانی" value={kpis.critical} color={RISK_LEVEL_COLOR.critical} />
          <KpiTile label="زیاد" value={kpis.high} color={RISK_LEVEL_COLOR.high} />
          <KpiTile label="اقدامات عقب‌افتاده" value={kpis.overdueActions} color="#e74c3c" />
          <KpiTile label="نرخ بسته‌شدن" value={`${kpis.closureRate}%`} color="#2ecc71" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[10rem]">
            <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجو در عنوان یا کد ریسک..."
              className="input !pr-8"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as RmRiskStatus | 'all')} className="input !w-auto">
            <option value="all">همه وضعیت‌ها</option>
            {RM_RISK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {RM_RISK_STATUS_LABEL_FA[s]}
              </option>
            ))}
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as RmRiskCategory | 'all')} className="input !w-auto">
            <option value="all">همه دسته‌ها</option>
            {RM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {RM_CATEGORY_LABEL_FA[c]}
              </option>
            ))}
          </select>
        </div>

        <div className="glass-panel rounded-2xl overflow-hidden">
          <ResponsiveTable
            columns={columns}
            rows={filtered}
            rowKey={(e) => e.risk.id}
            onRowClick={(e) => setSelectedRiskId(e.risk.id)}
            emptyText="ریسکی با این فیلترها یافت نشد"
          />
        </div>
      </div>

      {showNewRisk && <RiskFormModal projectId={project.id} onClose={() => setShowNewRisk(false)} />}
      {selectedRisk && <RiskDetailModal project={project} risk={selectedRisk} onClose={() => setSelectedRiskId(null)} />}
      {showMembers && <RmMembersModal projectName={project.name} onClose={() => setShowMembers(false)} />}
    </div>
  )
}
