import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, Copy, Folders, Layers, Loader2, Milestone, TrendingUp } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { RM_CATEGORY_LABEL_FA } from '../types'
import { detectCrossProjectDuplicates, detectPortfolioPatterns } from '../lib/riskIntelligence'
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

function TotalsRow({ totals }: { totals: RollupTotals }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px]">
      <Badge label="پروژه متصل" value={`${totals.mappedProjectCount}/${totals.projectCount}`} color="#94a3b8" />
      <Badge label="ریسک فعال" value={totals.activeRisks} color="#3498db" />
      <Badge label="بحرانی/زیاد" value={totals.criticalHighCount} color="#e74c3c" />
      <Badge label="مواجهه فعلی" value={totals.exposureCurrent} color="#f97316" />
      <Badge label="میانگین بلوغ" value={`${totals.avgMaturity}%`} color="#a855f7" />
    </div>
  )
}

function Badge({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: `${color}18` }}>
      <span className="num font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-muted">{label}</span>
    </span>
  )
}

function PortfolioCard({ rollup, bundles, onOpenProject }: { rollup: PortfolioRollup; bundles: Map<string, RiskBundle>; onOpenProject: (rmProjectId: string) => void }) {
  const [open, setOpen] = useState(false)
  const allProjects = useMemo(() => [...rollup.programs.flatMap((p) => p.projects), ...rollup.directProjects], [rollup])
  const groups = useMemo(
    () =>
      allProjects
        .filter((p) => p.rmProjectId !== null)
        .map((p) => ({ projectName: p.projectName, risks: bundles.get(p.rmProjectId as string)?.risks ?? [], assessments: bundles.get(p.rmProjectId as string)?.assessments ?? [] })),
    [allProjects, bundles],
  )
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
        </div>
      )}
    </div>
  )
}

function ProgramRow({ rollup, onOpenProject }: { rollup: ProgramRollup; onOpenProject: (rmProjectId: string) => void }) {
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
          {rollup.projects.length === 0 ? <p className="text-[11px] text-muted">پروژه‌ای در این طرح تعریف نشده است</p> : rollup.projects.map((p) => <ProjectRow key={p.masterProjectId} summary={p} onOpenProject={onOpenProject} />)}
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
