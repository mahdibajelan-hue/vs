import { useMemo, useState } from 'react'
import { ChevronLeft, Layers, Network } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useLifecycleStore } from '../store/useLifecycleStore'
import { buildLifecycleRollup, summariseProject, aggregate, type ProjectSummary, type RollupTotals } from '../lib/portfolioRollup'
import { HEALTH_STATUS_LABEL_FA, STAGE_LABEL_FA, type StageKey } from '../types'
import { Bar, Card, EmptyState, Kpi, StatusDot, STATUS_COLOR, faNum, faVariance } from '../components/ui'

/**
 * Portfolio → Plan(«طرح») → Project drill-down.
 *
 * One page rather than three: the level being viewed changes what the KPI strip aggregates and
 * what the table lists, but a manager stays in the same place and keeps their bearings. The
 * breadcrumb is the only navigation.
 */
type Level =
  | { kind: 'portfolio' }
  | { kind: 'plan'; portfolioId: string }
  | { kind: 'project'; portfolioId: string; programId: string | null }

export function PortfolioDashboardPage({ onOpenProject }: { onOpenProject: (projectId: string) => void }) {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const projects = useMasterDataStore((s) => s.projects)

  const allLifecycles = useLifecycleStore((s) => s.allLifecycles)
  const allMilestones = useLifecycleStore((s) => s.allMilestones)
  const allGates = useLifecycleStore((s) => s.allGates)
  const allChecklist = useLifecycleStore((s) => s.allChecklist)
  const allActions = useLifecycleStore((s) => s.allActions)
  const allHealth = useLifecycleStore((s) => s.allHealth)
  const loading = useLifecycleStore((s) => s.loadingPortfolio)

  const [level, setLevel] = useState<Level>({ kind: 'portfolio' })

  const summaries = useMemo<ProjectSummary[]>(() => {
    const byProject = <T extends { projectId: string }>(list: T[], id: string) => list.filter((x) => x.projectId === id)
    return projects.map((p) =>
      summariseProject(
        p,
        allLifecycles.find((l) => l.projectId === p.id) ?? null,
        byProject(allMilestones, p.id),
        byProject(allGates, p.id),
        byProject(allChecklist, p.id),
        allActions.filter((a) => a.projectId === p.id),
        byProject(allHealth, p.id),
      ),
    )
  }, [projects, allLifecycles, allMilestones, allGates, allChecklist, allActions, allHealth])

  const tree = useMemo(
    () => buildLifecycleRollup(portfolios, programs, projects, summaries),
    [portfolios, programs, projects, summaries],
  )

  if (loading) return <EmptyState message="در حال بارگذاری..." />
  if (portfolios.length === 0) {
    return <EmptyState message="سبد پروژه‌ای تعریف نشده است — ابتدا در ماژول مدیریت کاربران و داده پایه، سبد و طرح ایجاد کنید." />
  }

  const activePortfolio = level.kind !== 'portfolio' ? tree.find((t) => t.portfolio.id === level.portfolioId) : null
  const activeProgram =
    level.kind === 'project' && level.programId
      ? activePortfolio?.programs.find((p) => p.program.id === level.programId)
      : null

  /* Which projects the table shows, and which totals the KPI strip reflects. */
  let listed: ProjectSummary[] = []
  let totals: RollupTotals
  if (level.kind === 'portfolio') {
    listed = summaries
    totals = aggregate(summaries)
  } else if (level.kind === 'plan' && activePortfolio) {
    listed = [...activePortfolio.programs.flatMap((p) => p.projects), ...activePortfolio.directProjects]
    totals = activePortfolio.totals
  } else if (activeProgram) {
    listed = activeProgram.projects
    totals = activeProgram.totals
  } else {
    listed = activePortfolio?.directProjects ?? []
    totals = aggregate(listed)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
        <button onClick={() => setLevel({ kind: 'portfolio' })} className="hover:text-primary">همه سبدها</button>
        {activePortfolio && (
          <>
            <ChevronLeft size={11} />
            <button
              onClick={() => setLevel({ kind: 'plan', portfolioId: activePortfolio.portfolio.id })}
              className="hover:text-primary"
            >
              {activePortfolio.portfolio.name}
            </button>
          </>
        )}
        {activeProgram && (
          <>
            <ChevronLeft size={11} />
            <span className="text-primary">{activeProgram.program.name}</span>
          </>
        )}
      </nav>

      {/* KPI strip — identical metric set at every level, which is what makes drilling down
          feel like zooming rather than jumping between unrelated reports. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="تعداد پروژه" value={faNum(totals.projects)} />
        <Kpi label="در مسیر" value={faNum(totals.onTrack)} status="green" />
        <Kpi label="در معرض ریسک" value={faNum(totals.atRisk)} status="yellow" />
        <Kpi label="تأخیرکرده" value={faNum(totals.delayed)} status="red" />
        <Kpi label="مسدود" value={faNum(totals.blocked)} status="black" />
        <Kpi label="میانگین آمادگی" value={`${faNum(totals.averageReadiness)}٪`} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Milestone بحرانی تأخیرکرده" value={faNum(totals.criticalMilestonesDelayed)}
          status={totals.criticalMilestonesDelayed > 0 ? 'red' : 'green'} />
        <Kpi label="کل Milestone تأخیرکرده" value={faNum(totals.milestonesDelayed)} />
        <Kpi label="اقدام بحرانی معوق" value={faNum(totals.criticalOverdueActions)}
          status={totals.criticalOverdueActions > 0 ? 'red' : 'green'} />
        <Kpi label="پروژه نیازمند توجه" value={faNum(totals.needingAttention)}
          status={totals.needingAttention > 0 ? 'yellow' : 'green'} />
      </div>

      {/* Portfolio level: one row per portfolio, click to drill in */}
      {level.kind === 'portfolio' && (
        <Card title="سبدهای پروژه">
          <ul className="space-y-2">
            {tree.map((pf) => (
              <li key={pf.portfolio.id}>
                <button
                  onClick={() => setLevel({ kind: 'plan', portfolioId: pf.portfolio.id })}
                  className="w-full rounded-lg border p-3 text-right transition-colors hover:bg-white/[0.03]"
                  style={{ borderColor: 'var(--border-soft)' }}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-muted" />
                      <span className="text-sm font-bold">{pf.portfolio.name}</span>
                      <span className="text-[10px] text-muted">
                        {faNum(pf.programs.length)} طرح · {faNum(pf.totals.projects)} پروژه
                      </span>
                    </div>
                    <ChevronLeft size={14} className="text-muted" />
                  </div>
                  <HealthDistribution totals={pf.totals} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Plan level: one row per plan within the portfolio */}
      {level.kind === 'plan' && activePortfolio && (
        <Card title={`طرح‌های سبد «${activePortfolio.portfolio.name}»`}>
          {activePortfolio.programs.length === 0 && activePortfolio.directProjects.length === 0 ? (
            <EmptyState message="طرح یا پروژه‌ای در این سبد ثبت نشده است" />
          ) : (
            <ul className="space-y-2">
              {activePortfolio.programs.map((pg) => (
                <li key={pg.program.id}>
                  <button
                    onClick={() => setLevel({ kind: 'project', portfolioId: activePortfolio.portfolio.id, programId: pg.program.id })}
                    className="w-full rounded-lg border p-3 text-right transition-colors hover:bg-white/[0.03]"
                    style={{ borderColor: 'var(--border-soft)' }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Network size={14} className="text-muted" />
                        <span className="text-sm font-bold">{pg.program.name}</span>
                        <span className="text-[10px] text-muted">{faNum(pg.totals.projects)} پروژه</span>
                      </div>
                      <ChevronLeft size={14} className="text-muted" />
                    </div>
                    <HealthDistribution totals={pg.totals} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Project table — always present, scoped to whatever level is open */}
      <Card title={`پروژه‌ها (${faNum(listed.length)})`}>
        {listed.length === 0 ? (
          <EmptyState message="پروژه‌ای در این سطح ثبت نشده است" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 720 }}>
              <thead>
                <tr className="border-b text-[10px] text-muted" style={{ borderColor: 'var(--border-soft)' }}>
                  <th className="py-2 text-right font-medium">پروژه</th>
                  <th className="py-2 text-right font-medium">مرحله</th>
                  <th className="py-2 text-center font-medium">سلامت</th>
                  <th className="py-2 text-center font-medium">آمادگی</th>
                  <th className="py-2 text-center font-medium">Milestone تأخیر</th>
                  <th className="py-2 text-center font-medium">اقدام معوق</th>
                  <th className="py-2 text-center font-medium">انحراف پیش‌بینی</th>
                  <th className="py-2 text-right font-medium">مهم‌ترین موضوع</th>
                </tr>
              </thead>
              <tbody>
                {[...listed]
                  // Worst first: a portfolio manager's eye should land on the problem, not on
                  // whichever project happens to be alphabetically first.
                  .sort((a, b) => b.criticalMilestonesDelayed - a.criticalMilestonesDelayed || b.attentionCount - a.attentionCount)
                  .map((s) => (
                    <tr
                      key={s.masterProjectId}
                      onClick={() => onOpenProject(s.masterProjectId)}
                      className="cursor-pointer border-b transition-colors hover:bg-white/[0.03]"
                      style={{ borderColor: 'var(--border-soft)' }}
                    >
                      <td className="py-2 pl-2">
                        <div className="flex items-center gap-1.5">
                          <StatusDot status={s.health} size={7} />
                          <span className="font-medium">{s.project.officialName}</span>
                        </div>
                      </td>
                      <td className="py-2 text-[10px] text-muted">
                        {STAGE_LABEL_FA[s.currentStageKey as StageKey] ?? s.currentStageKey ?? '—'}
                      </td>
                      <td className="py-2 text-center text-[10px]" style={{ color: STATUS_COLOR[s.health] }}>
                        {HEALTH_STATUS_LABEL_FA[s.health]}
                      </td>
                      <td className="py-2">
                        <div className="mx-auto w-16">
                          <Bar percent={s.readiness} blocked={s.blockedGates} />
                          <div className="mt-0.5 text-center text-[9px] text-muted">{faNum(s.readiness)}٪</div>
                        </div>
                      </td>
                      <td className="py-2 text-center">
                        {s.criticalMilestonesDelayed > 0 ? (
                          <span className="font-bold" style={{ color: STATUS_COLOR.red }}>
                            {faNum(s.criticalMilestonesDelayed)} بحرانی
                          </span>
                        ) : s.milestonesDelayed > 0 ? (
                          <span style={{ color: STATUS_COLOR.yellow }}>{faNum(s.milestonesDelayed)}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {s.overdueActions > 0
                          ? <span style={{ color: s.criticalOverdueActions > 0 ? STATUS_COLOR.red : STATUS_COLOR.yellow }}>{faNum(s.overdueActions)}</span>
                          : <span className="text-muted">—</span>}
                      </td>
                      <td className="py-2 text-center text-[10px]"
                        style={{ color: (s.forecastVarianceDays ?? 0) > 0 ? STATUS_COLOR.red : undefined }}>
                        {faVariance(s.forecastVarianceDays)}
                      </td>
                      <td className="py-2 pr-2 text-[10px] text-muted">
                        <span className="line-clamp-1">{s.topAttention ?? '—'}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

/** Four-segment health bar — the fastest possible read of "how is this group doing". */
function HealthDistribution({ totals }: { totals: RollupTotals }) {
  const total = Math.max(1, totals.projects)
  const segments: { key: string; count: number; color: string }[] = [
    { key: 'green', count: totals.onTrack, color: STATUS_COLOR.green },
    { key: 'yellow', count: totals.atRisk, color: STATUS_COLOR.yellow },
    { key: 'red', count: totals.delayed, color: STATUS_COLOR.red },
    { key: 'black', count: totals.blocked, color: STATUS_COLOR.black },
  ]
  return (
    <>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border-soft)' }} dir="ltr">
        {segments.map((s) => s.count > 0 && (
          <div key={s.key} style={{ width: `${(s.count / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2 text-[9px] text-muted">
        <span>در مسیر {faNum(totals.onTrack)}</span>
        <span>در معرض ریسک {faNum(totals.atRisk)}</span>
        <span>تأخیرکرده {faNum(totals.delayed)}</span>
        {totals.blocked > 0 && <span>مسدود {faNum(totals.blocked)}</span>}
        <span>· میانگین آمادگی {faNum(totals.averageReadiness)}٪</span>
      </div>
    </>
  )
}
