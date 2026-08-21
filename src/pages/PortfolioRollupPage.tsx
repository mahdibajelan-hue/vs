import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, ChevronDown, ChevronLeft, Folders, Layers, Loader2, Milestone, PieChart, TrendingUp } from 'lucide-react'
import { useMasterDataStore } from '../modules/masterdata/store/useMasterDataStore'
import { BreakdownDonut, ChartDrillPanel, RankedBarChart, useDrillKey, type ChartDatum } from '../modules/masterdata/components/RollupCharts'
import { formatJalali } from '../lib/jalali'
import {
  buildProgressPortfolioTree,
  fetchPipePulseProjectMappings,
  fetchPipePulseProjects,
  summarizeProjectProgress,
  type PortfolioProgressRollup,
  type ProgramProgressRollup,
  type ProgressRollupTotals,
  type ProjectProgressSummary,
} from '../lib/pipepulseRollup'

/**
 * Three-level Portfolio -> Program -> Project rollup for PipePulse (progress/schedule) — mirrors
 * the Risk and Issue Management modules' rollup pages, reusing the same shared masterdata
 * hierarchy and the same rasta_project_mappings join (source_module = 'pipepulse').
 */
export function PortfolioRollupPage({ onOpenProject }: { onOpenProject: (pipepulseProjectId: string) => void }) {
  const masterDataLoaded = useMasterDataStore((s) => s.loaded)
  const masterDataLoading = useMasterDataStore((s) => s.loading)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const masterProjects = useMasterDataStore((s) => s.projects)

  const [progressLoading, setProgressLoading] = useState(true)
  const [summaries, setSummaries] = useState<ProjectProgressSummary[]>([])

  useEffect(() => {
    if (!masterDataLoaded && !masterDataLoading) fetchMasterData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!masterDataLoaded || masterProjects.length === 0) {
      setProgressLoading(false)
      return
    }
    let cancelled = false
    setProgressLoading(true)
    ;(async () => {
      const mappings = await fetchPipePulseProjectMappings()
      const pipepulseProjectIds = masterProjects.map((mp) => mappings.get(mp.id)).filter((id): id is string => !!id)
      const projectsById = await fetchPipePulseProjects(pipepulseProjectIds)
      const built = masterProjects.map((mp) => {
        const pipepulseProjectId = mappings.get(mp.id) ?? null
        return summarizeProjectProgress(mp, pipepulseProjectId, pipepulseProjectId ? projectsById.get(pipepulseProjectId) ?? null : null)
      })
      if (!cancelled) {
        setSummaries(built)
        setProgressLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [masterDataLoaded, masterProjects])

  const tree = useMemo(() => buildProgressPortfolioTree(portfolios, programs, masterProjects, summaries), [portfolios, programs, masterProjects, summaries])
  const mappedCount = summaries.filter((s) => s.pipepulseProjectId !== null).length

  if (masterDataLoading || progressLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={22} className="animate-spin text-brand-400" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <p className="text-sm font-bold">تحلیل سه‌سطحی پیشرفت — پورتفولیو / طرح / پروژه</p>
          <p className="text-[11px] text-muted">
            ساختار پورتفولیو، طرح و پروژه از ماژول «داده‌های پایه» گرفته می‌شود — {mappedCount} از {masterProjects.length} پروژه به PipePulse متصل است.
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
              <PortfolioCard key={rollup.portfolio.id} rollup={rollup} onOpenProject={onOpenProject} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

type KpiStatus = 'good' | 'warn' | 'bad'
const STATUS_COLOR: Record<KpiStatus, string> = { good: '#2ecc71', warn: '#f97316', bad: '#e74c3c' }

/** Delay count is lower-is-better, achievement ratio (actual/planned) is closer-to-100-is-better — each metric gets its own direction rather than one blanket rule. */
function TotalsRow({ totals }: { totals: ProgressRollupTotals }) {
  const delayStatus: KpiStatus = totals.delayedProjectCount === 0 ? 'good' : totals.delayedProjectCount <= 2 ? 'warn' : 'bad'
  const ratio = totals.avgAchievementRatio
  const ratioStatus: KpiStatus | undefined = ratio === null ? undefined : ratio >= 90 ? 'good' : ratio >= 70 ? 'warn' : 'bad'
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px]">
      <Badge label="پروژه متصل" value={`${totals.mappedProjectCount}/${totals.projectCount}`} color="#94a3b8" />
      <Badge label="پیشرفت برنامه‌ای" value={`${totals.avgPlannedPercent}%`} color="#3498db" />
      <Badge label="پیشرفت واقعی" value={`${totals.avgActualPercent}%`} color="#a855f7" />
      <Badge label="پروژه با تاخیر" value={totals.delayedProjectCount} color="#e74c3c" status={delayStatus} />
      <Badge label="میانگین تاخیر (روز)" value={totals.avgDelayDays} color="#f97316" />
      {ratio !== null && <Badge label="نسبت دستیابی" value={`${ratio}%`} color="#2ecc71" status={ratioStatus} />}
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

function PortfolioCard({ rollup, onOpenProject }: { rollup: PortfolioProgressRollup; onOpenProject: (pipepulseProjectId: string) => void }) {
  const [open, setOpen] = useState(false)
  const allProjects = useMemo(() => [...rollup.programs.flatMap((p) => p.projects), ...rollup.directProjects], [rollup])

  return (
    <div className="glass-panel rounded-2xl p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-right">
        <span className="flex items-center gap-2">
          {open ? <ChevronDown size={15} className="text-muted" /> : <ChevronLeft size={15} className="text-muted" />}
          <Folders size={15} className="text-brand-400" />
          <span className="text-sm font-bold">{rollup.portfolio.name}</span>
          <span className="text-[10px] text-muted">({rollup.portfolio.code})</span>
        </span>
      </button>
      <div className="mt-2 pr-6">
        <TotalsRow totals={rollup.totals} />
      </div>
      {open && (
        <div className="mt-3 space-y-2 border-t pr-6 pt-3" style={{ borderColor: 'var(--border-soft)' }}>
          <ProgressChartsSection projects={allProjects} onOpenProject={onOpenProject} />

          {rollup.programs.map((pr) => (
            <ProgramRow key={pr.program.id} rollup={pr} onOpenProject={onOpenProject} />
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

          <DelayAttentionList label="این پورتفولیو" projects={allProjects} />
        </div>
      )}
    </div>
  )
}

function ProgramRow({ rollup, onOpenProject }: { rollup: ProgramProgressRollup; onOpenProject: (pipepulseProjectId: string) => void }) {
  const [open, setOpen] = useState(false)
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
          <ProgressChartsSection projects={rollup.projects} onOpenProject={onOpenProject} />
          {rollup.projects.length === 0 ? (
            <p className="text-[11px] text-muted">پروژه‌ای در این طرح تعریف نشده است</p>
          ) : (
            rollup.projects.map((p) => <ProjectRow key={p.masterProjectId} summary={p} onOpenProject={onOpenProject} />)
          )}
          <DelayAttentionList label="این طرح" projects={rollup.projects} />
        </div>
      )}
    </div>
  )
}

type ProgressStatusKey = 'on_track' | 'delayed' | 'unconfigured'
const PROGRESS_STATUS_LABEL: Record<ProgressStatusKey, string> = { on_track: 'طبق برنامه', delayed: 'دارای تاخیر', unconfigured: 'بدون زمان‌بندی' }
const PROGRESS_STATUS_COLOR: Record<ProgressStatusKey, string> = { on_track: '#2ecc71', delayed: '#e74c3c', unconfigured: '#64748b' }

function progressStatusOf(p: ProjectProgressSummary): ProgressStatusKey {
  if (p.configuredCount === 0) return 'unconfigured'
  return p.isDelayed ? 'delayed' : 'on_track'
}

/** Power-BI-style breakdown for one portfolio/program's own scope — project-status donut (on
 * track / delayed / not yet scheduled) + a ranked bar of delay days per project, both clicking
 * straight into that project's Schedule page. */
function ProgressChartsSection({ projects, onOpenProject }: { projects: ProjectProgressSummary[]; onOpenProject: (pipepulseProjectId: string) => void }) {
  const { activeKey: activeStatus, setActiveKey: setActiveStatus, clear: clearStatus } = useDrillKey()

  const mapped = projects.filter((p) => p.pipepulseProjectId !== null)
  const statusCounts = useMemo(() => {
    const counts: Record<ProgressStatusKey, number> = { on_track: 0, delayed: 0, unconfigured: 0 }
    for (const p of mapped) counts[progressStatusOf(p)]++
    return counts
  }, [mapped])

  const donutData: ChartDatum[] = (['delayed', 'unconfigured', 'on_track'] as ProgressStatusKey[]).map((s) => ({
    key: s,
    label: PROGRESS_STATUS_LABEL[s],
    value: statusCounts[s],
    color: PROGRESS_STATUS_COLOR[s],
  }))

  const barData: ChartDatum[] = projects.filter((p) => p.isDelayed).map((p) => ({ key: p.pipepulseProjectId ?? p.masterProjectId, label: p.projectName, value: p.delayDays, color: '#e74c3c' }))

  const filteredProjects = activeStatus ? mapped.filter((p) => progressStatusOf(p) === activeStatus) : []

  if (mapped.length === 0) return null

  return (
    <div className="rounded-xl bg-white/[0.02] p-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <BreakdownDonut title="توزیع وضعیت پروژه‌ها" icon={<PieChart size={12} className="text-brand-400" />} data={donutData} unit="پروژه" activeKey={activeStatus} onSliceClick={setActiveStatus} />
        <RankedBarChart title="پروژه‌های دارای تاخیر (روز)" icon={<BarChart3 size={12} className="text-brand-400" />} data={barData} unit="روز" onBarClick={(key) => key && onOpenProject(key)} />
      </div>
      {activeStatus && (
        <div className="mt-3">
          <ChartDrillPanel title={`پروژه‌های با وضعیت «${PROGRESS_STATUS_LABEL[activeStatus as ProgressStatusKey]}»`} count={filteredProjects.length} onClose={clearStatus}>
            {filteredProjects.map((p) => (
              <button
                key={p.masterProjectId}
                onClick={() => p.pipepulseProjectId && onOpenProject(p.pipepulseProjectId)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-right text-[11px] hover:bg-white/5 transition-colors"
              >
                <span className="font-medium">{p.projectName}</span>
                <span className="flex items-center gap-2">
                  <span className="num text-muted">واقعی {p.actualPercent}%</span>
                  {p.isDelayed && <span className="num rounded-full bg-red-500/15 px-2 py-0.5 text-red-300">{p.delayDays} روز تاخیر</span>}
                </span>
              </button>
            ))}
          </ChartDrillPanel>
        </div>
      )}
    </div>
  )
}

function ProjectRow({ summary, onOpenProject }: { summary: ProjectProgressSummary; onOpenProject: (pipepulseProjectId: string) => void }) {
  const mapped = summary.pipepulseProjectId !== null
  return (
    <button
      onClick={() => summary.pipepulseProjectId && onOpenProject(summary.pipepulseProjectId)}
      disabled={!mapped}
      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right text-[11px] hover:bg-white/5 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span className="font-medium">{summary.projectName}</span>
      {mapped && summary.configuredCount > 0 ? (
        <span className="flex items-center gap-2">
          <span className="num text-muted">برنامه {summary.plannedPercent}%</span>
          <span className="num text-purple-300">واقعی {summary.actualPercent}%</span>
          {summary.isDelayed && (
            <span className="num rounded-full bg-red-500/15 px-2 py-0.5 text-red-300">{summary.delayDays} روز تاخیر</span>
          )}
        </span>
      ) : mapped ? (
        <span className="text-muted">زمان‌بندی تعریف نشده است</span>
      ) : (
        <span className="text-muted">به PipePulse متصل نیست</span>
      )}
    </button>
  )
}

/** Delayed projects across a set of projects (a program's own, or a whole portfolio's), sorted worst-first. */
function DelayAttentionList({ label, projects }: { label: string; projects: ProjectProgressSummary[] }) {
  const delayed = useMemo(() => [...projects.filter((p) => p.isDelayed)].sort((a, b) => b.delayDays - a.delayDays), [projects])

  if (delayed.length === 0) return null

  return (
    <div className="rounded-xl bg-white/[0.02] p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold">
        <AlertTriangle size={12} className="text-red-400" /> پروژه‌های دارای تاخیر در {label} ({delayed.length})
      </p>
      <div className="space-y-1">
        {delayed.map((p) => (
          <div key={p.masterProjectId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px]">
            <span className="flex items-center gap-2">
              <TrendingUp size={11} className="text-red-400" />
              <span className="font-medium">{p.projectName}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="num rounded-full bg-red-500/15 px-2 py-0.5 text-red-300">{p.delayDays} روز تاخیر</span>
              {p.forecastEnd && <span className="num text-muted">پیش‌بینی پایان: {formatJalali(p.forecastEnd)}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
