import { useEffect, useMemo, useState } from 'react'
import { AlertOctagon, BarChart3, ChevronDown, ChevronLeft, Copy, Folders, Layers, ListChecks, Loader2, Milestone, PieChart, TrendingUp } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { BreakdownDonut, ChartDrillPanel, RankedBarChart, useDrillKey, type ChartDatum } from '../../masterdata/components/RollupCharts'
import { RM_CATEGORY_LABEL_FA, type RmRiskAction, type RmRiskAssessment } from '../types'
import type { RmRisk } from '../types'
import { detectCrossProjectDuplicates, detectPortfolioPatterns } from '../lib/riskIntelligence'
import { computeCriticalHighAttention } from '../lib/riskAnalytics'
import { currentState, riskLevel, RISK_LEVEL_COLOR, RISK_LEVEL_LABEL_FA, type RiskLevel } from '../lib/riskScore'
import {
  buildPortfolioTree,
  fetchRiskBundlesForProjects,
  fetchRiskProjectMappings,
  summarizeProjectRisk,
  type PortfolioRollup,
  type ProgramRollup,
  type ProjectRiskSummary,
  type RiskBundle,
  type RollupTotals,
} from '../lib/portfolioRollup'

interface RiskGroup {
  projectName: string
  risks: RmRisk[]
  assessments: RmRiskAssessment[]
  actions: RmRiskAction[]
}

function buildGroups(summaries: ProjectRiskSummary[], bundles: Map<string, RiskBundle>): RiskGroup[] {
  return summaries
    .filter((s) => s.rmProjectId !== null)
    .map((s) => {
      const bundle = bundles.get(s.rmProjectId as string)
      return { projectName: s.projectName, risks: bundle?.risks ?? [], assessments: bundle?.assessments ?? [], actions: bundle?.actions ?? [] }
    })
}

export function PortfolioRollupPage({ onOpenProject }: { onOpenProject: (rmProjectId: string) => void }) {
  const masterDataLoaded = useMasterDataStore((s) => s.loaded)
  const masterDataLoading = useMasterDataStore((s) => s.loading)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const masterProjects = useMasterDataStore((s) => s.projects)

  const [riskLoading, setRiskLoading] = useState(true)
  const [projectSummaries, setProjectSummaries] = useState<ProjectRiskSummary[]>([])
  const [bundles, setBundles] = useState<Map<string, RiskBundle>>(new Map())

  useEffect(() => {
    if (!masterDataLoaded && !masterDataLoading) fetchMasterData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!masterDataLoaded || masterProjects.length === 0) {
      setRiskLoading(false)
      return
    }
    let cancelled = false
    setRiskLoading(true)
    ;(async () => {
      const mappings = await fetchRiskProjectMappings()
      const rmProjectIds = masterProjects.map((mp) => mappings.get(mp.id)).filter((id): id is string => !!id)
      const riskBundles = await fetchRiskBundlesForProjects(rmProjectIds)
      const summaries = masterProjects.map((mp) => {
        const rmProjectId = mappings.get(mp.id) ?? null
        return summarizeProjectRisk(mp, rmProjectId, rmProjectId ? riskBundles.get(rmProjectId) : undefined)
      })
      if (!cancelled) {
        setProjectSummaries(summaries)
        setBundles(riskBundles)
        setRiskLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [masterDataLoaded, masterProjects])

  const tree = useMemo(() => buildPortfolioTree(portfolios, programs, projectSummaries, masterProjects), [portfolios, programs, projectSummaries, masterProjects])
  const mappedCount = projectSummaries.filter((s) => s.rmProjectId !== null).length

  if (masterDataLoading || riskLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={22} className="animate-spin text-red-400" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <p className="text-sm font-bold">تحلیل سه‌سطحی ریسک — پورتفولیو / طرح / پروژه</p>
          <p className="text-[11px] text-muted">
            ساختار پورتفولیو، طرح و پروژه از ماژول «داده‌های پایه» (مدیریت کاربران) گرفته می‌شود — {mappedCount} از {masterProjects.length} پروژه به ماژول ریسک متصل است.
          </p>
        </div>

        {portfolios.length === 0 ? (
          <div className="glass-panel rounded-2xl p-10 text-center">
            <Folders size={32} className="mx-auto mb-3 text-muted" />
            <p className="text-sm text-secondary">هنوز پورتفولیویی در داده‌های پایه تعریف نشده است</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tree.map((rollup) => (
              <PortfolioCard key={rollup.portfolio.id} rollup={rollup} bundles={bundles} onOpenProject={onOpenProject} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

type KpiStatus = 'good' | 'warn' | 'bad'

const STATUS_COLOR: Record<KpiStatus, string> = {
  good: '#2ecc71',
  warn: '#f97316',
  bad: '#e74c3c',
}

/**
 * Direction-aware thresholds mirroring DashboardPage's project-level KPI coloring (spec #29):
 * "بحرانی/زیاد" is lower-is-better (fewer critical/high risks is good), "میانگین بلوغ" is
 * higher-is-better (more review/action coverage is good) — each metric gets its own rule rather
 * than a single blanket direction.
 */
function TotalsRow({ totals }: { totals: RollupTotals }) {
  const criticalHighStatus: KpiStatus = totals.criticalHighCount === 0 ? 'good' : totals.criticalHighCount <= 2 ? 'warn' : 'bad'
  const maturityStatus: KpiStatus = totals.avgMaturity >= 70 ? 'good' : totals.avgMaturity >= 40 ? 'warn' : 'bad'
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px]">
      <Badge label="پروژه متصل" value={`${totals.mappedProjectCount}/${totals.projectCount}`} color="#94a3b8" />
      <Badge label="ریسک فعال" value={totals.activeRisks} color="#3498db" />
      <Badge label="بحرانی/زیاد" value={totals.criticalHighCount} color="#e74c3c" status={criticalHighStatus} />
      <Badge label="مواجهه فعلی" value={totals.exposureCurrent} color="#f97316" />
      <Badge label="میانگین بلوغ" value={`${totals.avgMaturity}%`} color="#a855f7" status={maturityStatus} />
    </div>
  )
}

function Badge({ label, value, color, status }: { label: string; value: string | number; color: string; status?: KpiStatus }) {
  const displayColor = status ? STATUS_COLOR[status] : color
  return (
    <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: `${displayColor}18` }}>
      <span className="num font-bold" style={{ color: displayColor }}>
        {value}
      </span>
      <span className="text-muted">{label}</span>
    </span>
  )
}

function PortfolioCard({ rollup, bundles, onOpenProject }: { rollup: PortfolioRollup; bundles: Map<string, RiskBundle>; onOpenProject: (rmProjectId: string) => void }) {
  const [open, setOpen] = useState(false)
  const allProjects = useMemo(() => [...rollup.programs.flatMap((p) => p.projects), ...rollup.directProjects], [rollup])
  const groups = useMemo(() => buildGroups(allProjects, bundles), [allProjects, bundles])
  const patterns = useMemo(() => (open ? detectPortfolioPatterns(groups) : []), [open, groups])
  const duplicates = useMemo(() => (open ? detectCrossProjectDuplicates(groups) : []), [open, groups])

  return (
    <div className="glass-panel rounded-2xl p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-right">
        <span className="flex items-center gap-2">
          {open ? <ChevronDown size={15} className="text-muted" /> : <ChevronLeft size={15} className="text-muted" />}
          <Folders size={15} className="text-red-400" />
          <span className="text-sm font-bold">{rollup.portfolio.name}</span>
          <span className="text-[10px] text-muted">({rollup.portfolio.code})</span>
        </span>
      </button>
      <div className="mt-2 pr-6">
        <TotalsRow totals={rollup.totals} />
      </div>
      {open && (
        <div className="mt-3 space-y-2 border-t pr-6 pt-3" style={{ borderColor: 'var(--border-soft)' }}>
          <RiskChartsSection groups={groups} projects={allProjects} onOpenProject={onOpenProject} />

          {rollup.programs.map((pr) => (
            <ProgramRow key={pr.program.id} rollup={pr} bundles={bundles} onOpenProject={onOpenProject} />
          ))}
          {rollup.directProjects.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-secondary">
                <Milestone size={12} /> پروژه‌های مستقیم پورتفولیو (بدون طرح)
              </p>
              {rollup.directProjects.map((p) => (
                <ProjectRow key={p.masterProjectId} summary={p} onOpenProject={onOpenProject} />
              ))}
            </div>
          )}
          {rollup.programs.length === 0 && rollup.directProjects.length === 0 && <p className="text-[11px] text-muted">پروژه‌ای در این پورتفولیو تعریف نشده است</p>}

          {patterns.length > 0 && (
            <div className="rounded-xl bg-white/[0.02] p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold">
                <TrendingUp size={12} className="text-orange-400" /> الگوهای تکرارشونده در این پورتفولیو
              </p>
              <div className="space-y-1">
                {patterns.map((p) => (
                  <p key={p.category} className="text-[11px] text-secondary">
                    دسته «{RM_CATEGORY_LABEL_FA[p.category]}» در {p.projectCount} از {p.totalProjects} پروژه ریسک فعال دارد
                    {p.criticalHighCount > 0 && ` — ${p.criticalHighCount} مورد بحرانی/زیاد`}
                  </p>
                ))}
              </div>
            </div>
          )}

          {duplicates.length > 0 && (
            <div className="rounded-xl bg-white/[0.02] p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold">
                <Copy size={12} className="text-orange-400" /> ریسک‌های مشابه بین پروژه‌های این پورتفولیو
              </p>
              <div className="space-y-1">
                {duplicates.map((d, i) => (
                  <p key={i} className="text-[11px] text-secondary">
                    «{d.riskA.title}» ({d.projectNameA}) ↔ «{d.riskB.title}» ({d.projectNameB}) — {Math.round(d.similarity * 100)}٪ شباهت
                  </p>
                ))}
              </div>
            </div>
          )}

          <RiskAggregateDetail label="این پورتفولیو" groups={groups} />
        </div>
      )}
    </div>
  )
}

/** All risks + recommended management actions aggregated across a set of projects (a program's own projects, or a whole portfolio's). */
function RiskAggregateDetail({ label, groups }: { label: string; groups: RiskGroup[] }) {
  const allRisks = useMemo(() => groups.flatMap((g) => g.risks), [groups])
  const allAssessments = useMemo(() => groups.flatMap((g) => g.assessments), [groups])
  const allActions = useMemo(() => groups.flatMap((g) => g.actions), [groups])
  const riskProjectName = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of groups) for (const r of g.risks) map.set(r.id, g.projectName)
    return map
  }, [groups])

  const riskRows = useMemo(
    () =>
      allRisks
        .filter((r) => r.status !== 'closed')
        .map((r) => ({ risk: r, score: currentState(r, allAssessments.filter((a) => a.riskId === r.id)).score }))
        .sort((a, b) => b.score - a.score),
    [allRisks, allAssessments],
  )
  const attention = useMemo(() => computeCriticalHighAttention(allRisks, allAssessments, allActions), [allRisks, allAssessments, allActions])

  if (riskRows.length === 0) return null

  return (
    <>
      <div className="rounded-xl bg-white/[0.02] p-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold">
          <ListChecks size={12} className="text-blue-400" /> همه ریسک‌های {label} ({riskRows.length})
        </p>
        <div className="space-y-1">
          {riskRows.map(({ risk, score }) => {
            const lv = riskLevel(score)
            return (
              <div key={risk.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px]">
                <span className="flex items-center gap-2">
                  <span className="num text-muted">{risk.code}</span>
                  <span className="font-medium">{risk.title}</span>
                  <span className="text-[10px] text-muted">({riskProjectName.get(risk.id)})</span>
                </span>
                <span className="num rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${RISK_LEVEL_COLOR[lv]}22`, color: RISK_LEVEL_COLOR[lv] }}>
                  {score} — {RISK_LEVEL_LABEL_FA[lv]}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {attention.length > 0 && (
        <div className="rounded-xl bg-white/[0.02] p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold">
            <AlertOctagon size={12} className="text-red-400" /> اقدامات مدیریتی پیشنهادی برای {label} ({attention.length})
          </p>
          <div className="space-y-1.5">
            {attention.map(({ risk, recommendation }) => (
              <div key={risk.id} className="rounded-lg px-2 py-1.5 text-[11px]">
                <span className="flex items-center gap-2">
                  <span className="num text-muted">{risk.code}</span>
                  <span className="font-medium">{risk.title}</span>
                  <span className="text-[10px] text-muted">({riskProjectName.get(risk.id)})</span>
                </span>
                <p className="mt-0.5 text-[10px] leading-5 text-secondary">{recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function ProgramRow({ rollup, bundles, onOpenProject }: { rollup: ProgramRollup; bundles: Map<string, RiskBundle>; onOpenProject: (rmProjectId: string) => void }) {
  const [open, setOpen] = useState(false)
  const groups = useMemo(() => buildGroups(rollup.projects, bundles), [rollup.projects, bundles])
  return (
    <div className="rounded-xl bg-white/[0.02] p-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-right">
        <span className="flex items-center gap-2">
          {open ? <ChevronDown size={13} className="text-muted" /> : <ChevronLeft size={13} className="text-muted" />}
          <Layers size={13} className="text-orange-400" />
          <span className="text-xs font-bold">{rollup.program.name}</span>
          <span className="text-[10px] text-muted">({rollup.program.code})</span>
        </span>
      </button>
      <div className="mt-1.5 pr-5">
        <TotalsRow totals={rollup.totals} />
      </div>
      {open && (
        <div className="mt-2 space-y-1.5 pr-5">
          <RiskChartsSection groups={groups} projects={rollup.projects} onOpenProject={onOpenProject} />
          {rollup.projects.length === 0 ? <p className="text-[11px] text-muted">پروژه‌ای در این طرح تعریف نشده است</p> : rollup.projects.map((p) => <ProjectRow key={p.masterProjectId} summary={p} onOpenProject={onOpenProject} />)}
          <RiskAggregateDetail label="این طرح" groups={groups} />
        </div>
      )}
    </div>
  )
}

/** Power-BI-style breakdown for one portfolio/program's own scope — risk-level donut (click a
 * slice to drill into the matching risks below) + a ranked bar of active risks per project
 * (click a bar to jump straight to that project's Risk Register). */
function RiskChartsSection({ groups, projects, onOpenProject }: { groups: RiskGroup[]; projects: ProjectRiskSummary[]; onOpenProject: (rmProjectId: string) => void }) {
  const { activeKey: activeLevel, setActiveKey: setActiveLevel, clear: clearLevel } = useDrillKey()

  const riskRows = useMemo(
    () =>
      groups.flatMap((g) =>
        g.risks
          .filter((r) => r.status !== 'closed')
          .map((r) => ({ risk: r, projectName: g.projectName, level: riskLevel(currentState(r, g.assessments.filter((a) => a.riskId === r.id)).score) })),
      ),
    [groups],
  )

  const levelCounts = useMemo(() => {
    const counts: Record<RiskLevel, number> = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const r of riskRows) counts[r.level]++
    return counts
  }, [riskRows])

  const donutData: ChartDatum[] = (['critical', 'high', 'medium', 'low'] as RiskLevel[]).map((level) => ({
    key: level,
    label: RISK_LEVEL_LABEL_FA[level],
    value: levelCounts[level],
    color: RISK_LEVEL_COLOR[level],
  }))

  const barData: ChartDatum[] = projects
    .filter((p) => p.activeRisks > 0)
    .map((p) => ({ key: p.rmProjectId ?? p.masterProjectId, label: p.projectName, value: p.activeRisks, color: '#e74c3c' }))

  const filteredRows = activeLevel ? riskRows.filter((r) => r.level === activeLevel) : []

  if (riskRows.length === 0) return null

  return (
    <div className="rounded-xl bg-white/[0.02] p-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <BreakdownDonut title="توزیع سطح ریسک" icon={<PieChart size={12} className="text-red-400" />} data={donutData} unit="ریسک" activeKey={activeLevel} onSliceClick={setActiveLevel} />
        <RankedBarChart
          title="ریسک‌های فعال به تفکیک پروژه"
          icon={<BarChart3 size={12} className="text-red-400" />}
          data={barData}
          unit="ریسک"
          onBarClick={(key) => key && onOpenProject(key)}
        />
      </div>
      {activeLevel && (
        <div className="mt-3">
          <ChartDrillPanel title={`ریسک‌های سطح «${RISK_LEVEL_LABEL_FA[activeLevel as RiskLevel]}»`} count={filteredRows.length} onClose={clearLevel}>
            {filteredRows.map(({ risk, projectName, level }) => (
              <div key={risk.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px]">
                <span className="flex items-center gap-2">
                  <span className="num text-muted">{risk.code}</span>
                  <span className="font-medium">{risk.title}</span>
                  <span className="text-[10px] text-muted">({projectName})</span>
                </span>
                <span className="num rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${RISK_LEVEL_COLOR[level]}22`, color: RISK_LEVEL_COLOR[level] }}>
                  {RISK_LEVEL_LABEL_FA[level]}
                </span>
              </div>
            ))}
          </ChartDrillPanel>
        </div>
      )}
    </div>
  )
}

function ProjectRow({ summary, onOpenProject }: { summary: ProjectRiskSummary; onOpenProject: (rmProjectId: string) => void }) {
  const mapped = summary.rmProjectId !== null
  return (
    <button
      onClick={() => summary.rmProjectId && onOpenProject(summary.rmProjectId)}
      disabled={!mapped}
      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right text-[11px] hover:bg-white/5 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span className="font-medium">{summary.projectName}</span>
      {mapped ? (
        <span className="flex items-center gap-2">
          <span className="num text-muted">{summary.activeRisks} فعال</span>
          {summary.criticalHighCount > 0 && <span className="num rounded-full bg-red-500/15 px-2 py-0.5 text-red-300">{summary.criticalHighCount} بحرانی/زیاد</span>}
          <span className="num rounded-full bg-purple-500/15 px-2 py-0.5 text-purple-300">بلوغ {summary.maturity}%</span>
        </span>
      ) : (
        <span className="text-muted">به ماژول ریسک متصل نیست</span>
      )}
    </button>
  )
}
