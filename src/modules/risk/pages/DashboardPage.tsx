import { useMemo, useState } from 'react'
import { Clock3, TrendingDown, TrendingUp, X } from 'lucide-react'
import type { RmProjectDetail } from '../store/useRiskStore'
import { useRiskMembersStore } from '../store/useRiskMembersStore'
import { RM_PROJECT_PHASES, RM_PROJECT_PHASE_LABEL_FA, type RmProjectPhase } from '../types'
import { currentState, RISK_LEVEL_COLOR } from '../lib/riskScore'
import {
  computeCategoryDistribution,
  computeExposureKpi,
  computeExposureTimeline,
  computePhaseDistribution,
  computeStatusCounts,
  computeTimeToImpactRisks,
  computeTopRisks,
} from '../lib/riskAnalytics'
import { KpiTile } from '../components/KpiTile'
import { RiskHeatMap } from '../components/RiskHeatMap'
import { TopRisksTable } from '../components/TopRisksTable'
import { CategoryDistributionChart, CriticalTrendChart, ExposureTrendChart, PhaseDistributionChart, StatusDistributionChart } from '../components/RiskTrendCharts'
import { RiskDetailModal } from '../components/RiskDetailModal'

export function DashboardPage({ project }: { project: RmProjectDetail }) {
  const members = useRiskMembersStore((s) => s.members)
  const [phaseFilter, setPhaseFilter] = useState<RmProjectPhase | 'all'>('all')
  const [activeCell, setActiveCell] = useState<{ probability: number; impact: number } | null>(null)
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null)

  const risks = useMemo(
    () => (phaseFilter === 'all' ? project.risks : project.risks.filter((r) => r.projectPhase === phaseFilter)),
    [project.risks, phaseFilter],
  )
  const riskIds = useMemo(() => new Set(risks.map((r) => r.id)), [risks])
  const assessments = useMemo(() => project.assessments.filter((a) => riskIds.has(a.riskId)), [project.assessments, riskIds])
  const actions = useMemo(() => project.actions.filter((a) => riskIds.has(a.riskId)), [project.actions, riskIds])

  const exposure = useMemo(() => computeExposureKpi(risks, assessments), [risks, assessments])
  const statusCounts = useMemo(() => computeStatusCounts(risks), [risks])
  const timeline = useMemo(() => computeExposureTimeline(risks, assessments), [risks, assessments])
  const categoryDist = useMemo(() => computeCategoryDistribution(risks), [risks])
  const phaseDist = useMemo(() => computePhaseDistribution(risks), [risks])
  const topRisks = useMemo(() => computeTopRisks(risks, assessments, actions), [risks, assessments, actions])
  const timeToImpact = useMemo(() => computeTimeToImpactRisks(risks), [risks])
  const overdueActions = useMemo(() => actions.filter((a) => a.status !== 'completed' && a.dueDate && a.dueDate < new Date().toISOString().slice(0, 10)).length, [actions])

  const active = risks.filter((r) => r.status !== 'closed')
  const closureRate = risks.length > 0 ? Math.round((risks.filter((r) => r.status === 'closed').length / risks.length) * 100) : 0
  const criticalCount = topRisks.filter((r) => r.level === 'critical').length
  const highCount = topRisks.filter((r) => r.level === 'high').length

  const cellRisks = useMemo(() => {
    if (!activeCell) return []
    return active.filter((r) => {
      const state = currentState(r, assessments.filter((a) => a.riskId === r.id))
      return state.probability === activeCell.probability && state.impact === activeCell.impact
    })
  }, [activeCell, active, assessments])

  const selectedRisk = selectedRiskId ? project.risks.find((r) => r.id === selectedRiskId) ?? null : null

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-base font-bold">داشبورد مدیریتی — {project.name}</p>
            <p className="text-[11px] text-muted">دید یکپارچه از وضعیت ریسک‌های پروژه برای تصمیم‌گیری مدیریتی</p>
          </div>
          <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value as RmProjectPhase | 'all')} className="input !w-auto">
            <option value="all">همه فازهای پروژه</option>
            {RM_PROJECT_PHASES.map((p) => (
              <option key={p} value={p}>
                {RM_PROJECT_PHASE_LABEL_FA[p]}
              </option>
            ))}
          </select>
        </div>

        {timeToImpact.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-red-400/40 bg-red-500/10 p-3.5 text-xs text-red-200">
            <Clock3 size={16} className="mt-0.5 shrink-0 text-red-400" />
            <div>
              <p className="font-bold">{timeToImpact.length} ریسک ظرف ۱۴ روز آینده اثر خود را بر پروژه خواهند گذاشت</p>
              <p className="mt-1 leading-6 text-red-300/90">
                {timeToImpact
                  .slice(0, 4)
                  .map((t) => `${t.risk.title} (${t.daysLeft} روز)`)
                  .join(' — ')}
                {timeToImpact.length > 4 && ` و ${timeToImpact.length - 4} مورد دیگر`}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile label="ریسک‌های فعال" value={active.length} color="#3498db" />
          <KpiTile label="بحرانی" value={criticalCount} color={RISK_LEVEL_COLOR.critical} />
          <KpiTile label="زیاد" value={highCount} color={RISK_LEVEL_COLOR.high} />
          <KpiTile label="اقدامات عقب‌افتاده" value={overdueActions} color="#e74c3c" />
          <KpiTile label="بسته‌شده" value={statusCounts.closed} color="#2ecc71" />
          <KpiTile label="نرخ بسته‌شدن" value={`${closureRate}%`} color="#94a3b8" />
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-3 text-sm font-bold">مواجهه ریسک پروژه (Risk Exposure)</p>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-[10px] text-muted">اولیه</p>
              <p className="num text-2xl font-extrabold text-secondary">{exposure.initial}</p>
            </div>
            <span className="text-2xl text-muted">←</span>
            <div className="text-center">
              <p className="text-[10px] text-muted">فعلی</p>
              <p className="num text-2xl font-extrabold" style={{ color: exposure.current <= exposure.initial ? '#2ecc71' : '#e74c3c' }}>
                {exposure.current}
              </p>
            </div>
            {exposure.initial > 0 && (
              <span
                className="mr-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold"
                style={{
                  background: exposure.improvementPercent >= 0 ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.12)',
                  color: exposure.improvementPercent >= 0 ? '#2ecc71' : '#e74c3c',
                }}
              >
                {exposure.improvementPercent >= 0 ? <TrendingDown size={15} /> : <TrendingUp size={15} />}
                {Math.abs(exposure.improvementPercent)}% {exposure.improvementPercent >= 0 ? 'بهبود' : 'افزایش'}
              </span>
            )}
          </div>
        </div>

        <RiskHeatMap risks={risks} assessments={assessments} activeCell={activeCell} onCellClick={(p, i) => setActiveCell(activeCell?.probability === p && activeCell?.impact === i ? null : { probability: p, impact: i })} />

        {activeCell && (
          <div className="glass-panel rounded-2xl p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold">
                ریسک‌های خانه احتمال {activeCell.probability} × شدت {activeCell.impact} ({cellRisks.length} مورد)
              </p>
              <button onClick={() => setActiveCell(null)} className="text-muted hover:text-current transition-colors">
                <X size={14} />
              </button>
            </div>
            {cellRisks.length === 0 ? (
              <p className="text-[11px] text-muted">ریسکی در این خانه نیست</p>
            ) : (
              <div className="space-y-1">
                {cellRisks.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRiskId(r.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-right text-xs hover:bg-white/5 transition-colors"
                  >
                    <span className="truncate">{r.title}</span>
                    <span className="num shrink-0 text-muted">{r.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <TopRisksTable rows={topRisks} members={members} actions={actions} onSelect={setSelectedRiskId} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="روند مواجهه ریسک پروژه">
            <ExposureTrendChart data={timeline} />
          </ChartCard>
          <ChartCard title="روند کاهش ریسک‌های بحرانی">
            <CriticalTrendChart data={timeline} />
          </ChartCard>
          <ChartCard title="توزیع ریسک بر اساس دسته‌بندی">
            <CategoryDistributionChart data={categoryDist} />
          </ChartCard>
          <ChartCard title="توزیع ریسک بر اساس فاز پروژه">
            <PhaseDistributionChart data={phaseDist} />
          </ChartCard>
          <ChartCard title="وضعیت ریسک‌ها">
            <StatusDistributionChart data={statusCounts} />
          </ChartCard>
        </div>
      </div>

      {selectedRisk && <RiskDetailModal project={project} risk={selectedRisk} onClose={() => setSelectedRiskId(null)} />}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-2xl p-4 h-64 flex flex-col">
      <p className="mb-2 text-sm font-bold">{title}</p>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
