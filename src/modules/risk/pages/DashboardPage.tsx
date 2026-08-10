import { useMemo, useRef, useState } from 'react'
import { AlertOctagon, AlarmClockOff, Clock3, FileDown, TrendingDown, TrendingUp, X } from 'lucide-react'
import type { RmProjectDetail } from '../store/useRiskStore'
import { useRiskMembersStore } from '../store/useRiskMembersStore'
import { RM_PROJECT_PHASES, RM_PROJECT_PHASE_LABEL_FA, type RmProjectPhase } from '../types'
import { formatJalali } from '../../../lib/jalali'
import { currentState, isActionOverdue, todayIso, RISK_LEVEL_COLOR, RISK_LEVEL_LABEL_FA } from '../lib/riskScore'
import {
  computeCategoryDistribution,
  computeCriticalHighAttention,
  computeExposureKpi,
  computeExposureTimeline,
  computeLevelDistribution,
  computeManagementAttentionRisks,
  computePhaseDistribution,
  computeResponseCompletion,
  computeRiskMaturityIndex,
  computeStatusCounts,
  computeTimeToImpactRisks,
  computeTopRisks,
} from '../lib/riskAnalytics'
import { exportElementToPdf } from '../../../lib/export'
import { KpiTile } from '../components/KpiTile'
import { RiskHeatMap } from '../components/RiskHeatMap'
import { TopRisksTable } from '../components/TopRisksTable'
import { CategoryDistributionChart, CriticalTrendChart, ExposureTrendChart, PhaseDistributionChart, StatusDistributionChart } from '../components/RiskTrendCharts'
import { ClosureRateGauge, RiskLevelDonut } from '../components/RiskKpiCharts'
import { RiskDetailModal } from '../components/RiskDetailModal'

export function DashboardPage({ project }: { project: RmProjectDetail }) {
  const members = useRiskMembersStore((s) => s.members)
  const [phaseFilter, setPhaseFilter] = useState<RmProjectPhase | 'all'>('all')
  const [activeCell, setActiveCell] = useState<{ probability: number; impact: number } | null>(null)
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  const risks = useMemo(
    () => (phaseFilter === 'all' ? project.risks : project.risks.filter((r) => r.projectPhase === phaseFilter)),
    [project.risks, phaseFilter],
  )
  const riskIds = useMemo(() => new Set(risks.map((r) => r.id)), [risks])
  const assessments = useMemo(() => project.assessments.filter((a) => riskIds.has(a.riskId)), [project.assessments, riskIds])
  const actions = useMemo(() => project.actions.filter((a) => riskIds.has(a.riskId)), [project.actions, riskIds])

  const exposure = useMemo(() => computeExposureKpi(risks, assessments), [risks, assessments])
  const statusCounts = useMemo(() => computeStatusCounts(risks), [risks])
  const levelDist = useMemo(() => computeLevelDistribution(risks, assessments), [risks, assessments])
  const timeline = useMemo(() => computeExposureTimeline(risks, assessments), [risks, assessments])
  const categoryDist = useMemo(() => computeCategoryDistribution(risks), [risks])
  const phaseDist = useMemo(() => computePhaseDistribution(risks), [risks])
  const topRisks = useMemo(() => computeTopRisks(risks, assessments, actions), [risks, assessments, actions])
  const timeToImpact = useMemo(() => computeTimeToImpactRisks(risks), [risks])
  const overdueActionRows = useMemo(() => {
    const today = todayIso()
    return actions
      .filter((a) => isActionOverdue(a, today))
      .map((a) => {
        const risk = risks.find((r) => r.id === a.riskId) ?? null
        const owner = members.find((m) => m.userId === a.ownerId)
        const daysOverdue = a.dueDate ? Math.round((new Date(today).getTime() - new Date(a.dueDate).getTime()) / 86400000) : 0
        return { action: a, risk, ownerName: owner?.fullName || owner?.email || 'تعیین‌نشده', daysOverdue }
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
  }, [actions, risks, members])
  const overdueActions = overdueActionRows.length
  const criticalHighAttention = useMemo(() => computeCriticalHighAttention(risks, assessments, actions), [risks, assessments, actions])
  const maturity = useMemo(() => computeRiskMaturityIndex(risks, assessments, actions), [risks, assessments, actions])
  const responseCompletion = useMemo(() => computeResponseCompletion(actions), [actions])

  const active = risks.filter((r) => r.status !== 'closed')
  const closureRate = risks.length > 0 ? Math.round((risks.filter((r) => r.status === 'closed').length / risks.length) * 100) : 0

  const cellRisks = useMemo(() => {
    if (!activeCell) return []
    return active.filter((r) => {
      const state = currentState(r, assessments.filter((a) => a.riskId === r.id))
      return state.probability === activeCell.probability && state.impact === activeCell.impact
    })
  }, [activeCell, active, assessments])

  const selectedRisk = selectedRiskId ? project.risks.find((r) => r.id === selectedRiskId) ?? null : null
  const attentionRisks = useMemo(() => computeManagementAttentionRisks(risks, assessments, actions), [risks, assessments, actions])

  const handleExportPdf = () => {
    if (reportRef.current) exportElementToPdf(reportRef.current, `${project.name}-گزارش-اجرایی-ریسک.pdf`)
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-base font-bold">داشبورد مدیریتی — {project.name}</p>
            <p className="text-[11px] text-muted">دید یکپارچه از وضعیت ریسک‌های پروژه برای تصمیم‌گیری مدیریتی</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value as RmProjectPhase | 'all')} className="input !w-auto">
              <option value="all">همه فازهای پروژه</option>
              {RM_PROJECT_PHASES.map((p) => (
                <option key={p} value={p}>
                  {RM_PROJECT_PHASE_LABEL_FA[p]}
                </option>
              ))}
            </select>
            <button
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5 transition-colors"
            >
              <FileDown size={13} /> گزارش اجرایی (PDF)
            </button>
          </div>
        </div>

        <div ref={reportRef} className="space-y-4">
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <KpiTile label="ریسک‌های فعال" value={active.length} color="#3498db" tooltip="تعداد ریسک‌های باز/در حال پایش/ارجاع‌شده — بسته‌شده‌ها حذف شده‌اند" />
          <KpiTile
            label="اقدامات عقب‌افتاده"
            value={overdueActions}
            color="#e74c3c"
            tooltip="اقدامات کنترلی با سررسید گذشته که هنوز تکمیل نشده‌اند — هرچه کمتر بهتر"
            status={overdueActions === 0 ? 'good' : overdueActions <= 2 ? 'warn' : 'bad'}
          />
          <KpiTile label="بسته‌شده" value={statusCounts.closed} color="#2ecc71" tooltip="ریسک‌های بسته‌شده از کل تاریخچه پروژه" />
          <KpiTile label="کل ثبت‌شده" value={risks.length} color="#94a3b8" tooltip="کل ریسک‌های ثبت‌شده در پروژه (فعال + بسته‌شده)" />
          <KpiTile
            label="شاخص بلوغ مدیریت ریسک"
            value={`${maturity.overall}%`}
            color="#a855f7"
            tooltip={`پوشش بازبینی: ${maturity.reviewCoverage}% — پوشش اقدام: ${maturity.actionCoverage}% — به‌موقع بودن: ${maturity.onTimeRate}% — تکمیل جزئیات استراتژی: ${maturity.strategyDetailCoverage}%`}
            status={maturity.overall >= 70 ? 'good' : maturity.overall >= 40 ? 'warn' : 'bad'}
          />
          <KpiTile
            label="تکمیل اقدامات پاسخ"
            value={`${responseCompletion}%`}
            color="#06b6d4"
            tooltip="میانگین درصد پیشرفت همه اقدامات کنترلی ثبت‌شده در پروژه"
            status={responseCompletion >= 70 ? 'good' : responseCompletion >= 40 ? 'warn' : 'bad'}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="glass-panel rounded-2xl p-4 h-60 flex flex-col">
            <p className="mb-1 text-sm font-bold">توزیع سطح ریسک</p>
            <div className="flex-1 min-h-0">
              <RiskLevelDonut counts={levelDist} />
            </div>
          </div>
          <div className="glass-panel rounded-2xl p-4 h-60 flex flex-col">
            <p className="mb-1 text-sm font-bold">نرخ بسته‌شدن ریسک‌ها</p>
            <div className="flex-1 min-h-0">
              <ClosureRateGauge percent={closureRate} />
            </div>
          </div>
          <div className="glass-panel rounded-2xl p-4 h-60 flex flex-col justify-center">
            <p className="mb-3 text-sm font-bold">مواجهه ریسک پروژه (Risk Exposure)</p>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="text-[10px] text-muted">اولیه</p>
                <p className="num text-2xl font-extrabold text-secondary">{exposure.initial}</p>
              </div>
              <span className="text-xl text-muted">←</span>
              <div className="text-center">
                <p className="text-[10px] text-muted">فعلی</p>
                <p className="num text-2xl font-extrabold" style={{ color: exposure.current <= exposure.initial ? '#2ecc71' : '#e74c3c' }}>
                  {exposure.current}
                </p>
              </div>
            </div>
            {exposure.initial > 0 && (
              <span
                className="mt-3 flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
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

        {attentionRisks.length > 0 && (
          <div className="glass-panel rounded-2xl border border-red-400/30 p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertOctagon size={16} className="text-red-400" />
              <p className="text-sm font-bold">ریسک‌های نیازمند توجه مدیریت ({attentionRisks.length})</p>
            </div>
            <div className="space-y-1.5">
              {attentionRisks.map(({ risk, score, reasons }) => (
                <button
                  key={risk.id}
                  onClick={() => setSelectedRiskId(risk.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right text-xs hover:bg-white/5 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="num text-muted">{risk.code}</span>
                    <span className="font-medium">{risk.title}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {reasons.map((reason) => (
                      <span key={reason} className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] text-red-300">
                        {reason}
                      </span>
                    ))}
                    <span className="num font-bold text-red-400">{score}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {criticalHighAttention.length > 0 && (
          <div className="glass-panel rounded-2xl p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertOctagon size={16} className="text-red-400" />
              <p className="text-sm font-bold">توصیه‌های مدیریتی برای ریسک‌های بحرانی و زیاد ({criticalHighAttention.length})</p>
            </div>
            <div className="space-y-2">
              {criticalHighAttention.map(({ risk, score, level, recommendation }) => (
                <button
                  key={risk.id}
                  onClick={() => setSelectedRiskId(risk.id)}
                  className="flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-right text-xs hover:bg-white/5 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="num text-muted">{risk.code}</span>
                    <span className="font-medium">{risk.title}</span>
                    <span className="num shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${RISK_LEVEL_COLOR[level]}22`, color: RISK_LEVEL_COLOR[level] }}>
                      {score} — {RISK_LEVEL_LABEL_FA[level]}
                    </span>
                  </span>
                  <span className="text-[11px] leading-5 text-secondary">{recommendation}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {overdueActionRows.length > 0 && (
          <div className="glass-panel rounded-2xl border border-orange-400/30 p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlarmClockOff size={16} className="text-orange-400" />
              <p className="text-sm font-bold">اقدامات عقب‌افتاده ({overdueActionRows.length})</p>
            </div>
            <div className="space-y-1.5">
              {overdueActionRows.map(({ action, risk, ownerName, daysOverdue }) => (
                <button
                  key={action.id}
                  onClick={() => risk && setSelectedRiskId(risk.id)}
                  disabled={!risk}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right text-xs hover:bg-white/5 transition-colors disabled:opacity-60"
                >
                  <span className="flex items-center gap-2">
                    {risk && <span className="num text-muted">{risk.code}</span>}
                    <span className="font-medium">{action.description}</span>
                    <span className="text-[10px] text-muted">— مسئول: {ownerName}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="num text-[10px] text-muted">{action.dueDate ? formatJalali(action.dueDate) : ''}</span>
                    <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] text-orange-300">{daysOverdue} روز تاخیر</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

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
