import { useMemo, useState } from 'react'
import {
  AlertTriangle, Bell, ChevronLeft, CircleCheckBig, ClipboardList, Flag, Layers, Lock, Network, X,
} from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useLifecycleStore } from '../store/useLifecycleStore'
import { buildLifecycleRollup, summariseProject, aggregate, type ProjectSummary, type RollupTotals } from '../lib/portfolioRollup'
import { HEALTH_STATUS_LABEL_FA, STAGE_LABEL_FA, type HealthStatus, type StageKey } from '../types'
import { HealthMixDonut, ReadinessComparisonBars, type ReadinessDatum } from '../components/PortfolioCharts'
import { StatSlicer } from '../components/StatSlicer'
import { TowerTile } from '../components/TowerTile'
import { Bar, EmptyState, StatusDot, STATUS_COLOR, STATUS_TEXT_COLOR, faNum, faVariance } from '../components/ui'

/**
 * Portfolio → Plan(«طرح») → Project drill-down — rebuilt as a live report rather than a printout.
 *
 * The stat cards from the previous version were read-only facts sitting above an unrelated table.
 * Here every count is also a filter: click "تأخیرکرده" and the table narrows to delayed projects
 * and every other card re-renders around that slice — the property that makes a Power BI report
 * feel alive instead of static. The readiness bar chart changes SHAPE with the breadcrumb, not
 * just its numbers, so drilling down reads as moving through a real report rather than paging a
 * flat list.
 */
type Level =
  | { kind: 'portfolio' }
  | { kind: 'plan'; portfolioId: string }
  | { kind: 'project'; portfolioId: string; programId: string | null }

type ActiveFilter =
  | { kind: 'health'; value: HealthStatus }
  | { kind: 'criticalMilestones' }
  | { kind: 'overdueActions' }
  | { kind: 'attention' }
  | null

function matchesFilter(s: ProjectSummary, filter: ActiveFilter): boolean {
  if (!filter) return true
  if (filter.kind === 'health') return s.health === filter.value
  if (filter.kind === 'criticalMilestones') return s.criticalMilestonesDelayed > 0
  if (filter.kind === 'overdueActions') return s.overdueActions > 0
  return s.attentionCount > 0
}

/** This page's own vocabulary for the four health buckets — "در مسیر / در معرض ریسک / تأخیرکرده /
 * مسدود" reads better for a portfolio rollup than the canonical per-project labels
 * (HEALTH_STATUS_LABEL_FA: "سالم / در معرض ریسک / بحرانی / مسدود") that the project table's own
 * «سلامت» column still uses. The chip must echo whichever label the user actually clicked, so it
 * stays in this vocabulary rather than the canonical one — otherwise clicking a card captioned
 * "تأخیرکرده" would confirm the filter as "بحرانی", which reads as a different thing entirely. */
const PORTFOLIO_HEALTH_LABEL_FA: Record<HealthStatus, string> = {
  green: 'در مسیر', yellow: 'در معرض ریسک', red: 'تأخیرکرده', black: 'مسدود',
}

function filterLabel(filter: ActiveFilter): string {
  if (!filter) return ''
  if (filter.kind === 'health') return PORTFOLIO_HEALTH_LABEL_FA[filter.value]
  if (filter.kind === 'criticalMilestones') return 'دارای Milestone بحرانی تأخیرکرده'
  if (filter.kind === 'overdueActions') return 'دارای اقدام معوق'
  return 'نیازمند توجه مدیریت'
}

/** Worst-dimension colour for an aggregate — the same "worst wins, not average" rule the health
 * engine uses per project, applied here to a group of projects. */
function toneFromTotals(t: RollupTotals): HealthStatus {
  if (t.blocked > 0) return 'black'
  if (t.delayed > 0) return 'red'
  if (t.atRisk > 0) return 'yellow'
  return 'green'
}

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
  // Persists across drill-downs on purpose, like a Power BI slicer: narrowing to "تأخیرکرده" at
  // the portfolio level and then drilling into one portfolio keeps only its delayed projects
  // in view, until explicitly cleared.
  const [filter, setFilter] = useState<ActiveFilter>(null)

  function toggleFilter(next: NonNullable<ActiveFilter>) {
    setFilter((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? null : next))
  }

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

  /* Which projects the table shows (unfiltered) and which totals the KPI strip reflects — totals
     stay unfiltered so the cards always describe "this level", with the filter shown as a slice
     taken out of them rather than replacing them. */
  let levelProjects: ProjectSummary[] = []
  let totals: RollupTotals
  if (level.kind === 'portfolio') {
    levelProjects = summaries
    totals = aggregate(summaries)
  } else if (level.kind === 'plan' && activePortfolio) {
    levelProjects = [...activePortfolio.programs.flatMap((p) => p.projects), ...activePortfolio.directProjects]
    totals = activePortfolio.totals
  } else if (activeProgram) {
    levelProjects = activeProgram.projects
    totals = activeProgram.totals
  } else {
    levelProjects = activePortfolio?.directProjects ?? []
    totals = aggregate(levelProjects)
  }

  const listed = levelProjects.filter((s) => matchesFilter(s, filter))

  /* The comparison chart's shape follows the breadcrumb: one bar per portfolio, then per plan,
     then per project — never per-project data squeezed under a portfolio-level label. */
  const readinessData: ReadinessDatum[] =
    level.kind === 'portfolio'
      ? tree.map((pf) => ({
          id: pf.portfolio.id, name: pf.portfolio.name, value: pf.totals.averageReadiness,
          status: toneFromTotals(pf.totals), blocked: pf.totals.blocked > 0,
        }))
      : level.kind === 'plan' && activePortfolio
        ? [
            ...activePortfolio.programs.map((pg) => ({
              id: pg.program.id, name: pg.program.name, value: pg.totals.averageReadiness,
              status: toneFromTotals(pg.totals), blocked: pg.totals.blocked > 0,
            })),
            ...(activePortfolio.directProjects.length > 0
              ? [{
                  id: '__direct__', name: 'بدون طرح', value: aggregate(activePortfolio.directProjects).averageReadiness,
                  status: toneFromTotals(aggregate(activePortfolio.directProjects)), blocked: false,
                }]
              : []),
          ]
        : [...levelProjects]
            .sort((a, b) => a.readiness - b.readiness)
            .slice(0, 10)
            .map((s) => ({
              id: s.masterProjectId, name: s.project.officialName, value: s.readiness,
              status: s.health, blocked: s.blockedGates,
            }))

  function onSelectReadinessBar(id: string) {
    if (level.kind === 'portfolio') setLevel({ kind: 'plan', portfolioId: id })
    else if (level.kind === 'plan' && id !== '__direct__') {
      setLevel({ kind: 'project', portfolioId: level.portfolioId, programId: id })
    } else if (level.kind === 'project') onOpenProject(id)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1 text-[12px] text-muted">
        <button onClick={() => setLevel({ kind: 'portfolio' })} className="transition-colors hover:text-primary">همه سبدها</button>
        {activePortfolio && (
          <>
            <ChevronLeft size={12} />
            <button
              onClick={() => setLevel({ kind: 'plan', portfolioId: activePortfolio.portfolio.id })}
              className="transition-colors hover:text-primary"
            >
              {activePortfolio.portfolio.name}
            </button>
          </>
        )}
        {activeProgram && (
          <>
            <ChevronLeft size={12} />
            <span className="font-bold text-primary">{activeProgram.program.name}</span>
          </>
        )}
      </nav>

      <div className="plc-bento">
        {/* ── Health mix + slicers ─────────────────────────────────── */}
        <TowerTile span={4} variant="raised" title="ترکیب سلامت پروژه‌ها">
          <HealthMixDonut totals={totals} />
        </TowerTile>

        <div className="grid gap-2" style={{ gridColumn: 'span 8' }}>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <StatSlicer
              icon={<CircleCheckBig size={15} />} label="در مسیر" tone="green"
              value={faNum(totals.onTrack)}
              active={filter?.kind === 'health' && filter.value === 'green'}
              onClick={() => toggleFilter({ kind: 'health', value: 'green' })}
            />
            <StatSlicer
              icon={<AlertTriangle size={15} />} label="در معرض ریسک" tone="yellow"
              value={faNum(totals.atRisk)}
              active={filter?.kind === 'health' && filter.value === 'yellow'}
              onClick={() => toggleFilter({ kind: 'health', value: 'yellow' })}
            />
            <StatSlicer
              icon={<AlertTriangle size={15} />} label="تأخیرکرده" tone="red"
              value={faNum(totals.delayed)}
              active={filter?.kind === 'health' && filter.value === 'red'}
              onClick={() => toggleFilter({ kind: 'health', value: 'red' })}
            />
            <StatSlicer
              icon={<Lock size={15} />} label="مسدود" tone="black"
              value={faNum(totals.blocked)}
              active={filter?.kind === 'health' && filter.value === 'black'}
              onClick={() => toggleFilter({ kind: 'health', value: 'black' })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <ReadinessStat totals={totals} />
            <StatSlicer
              icon={<Flag size={15} />} label="Milestone بحرانی تأخیرکرده"
              tone={totals.criticalMilestonesDelayed > 0 ? 'red' : 'green'}
              value={faNum(totals.criticalMilestonesDelayed)}
              sub={totals.criticalMilestonesDelayed === 0 ? 'موردی نیست' : undefined}
              active={filter?.kind === 'criticalMilestones'}
              onClick={() => toggleFilter({ kind: 'criticalMilestones' })}
            />
            <StatSlicer
              icon={<ClipboardList size={15} />} label="اقدام بحرانی معوق"
              tone={totals.criticalOverdueActions > 0 ? 'red' : 'green'}
              value={faNum(totals.criticalOverdueActions)}
              sub={totals.criticalOverdueActions === 0 ? 'موردی نیست' : undefined}
              active={filter?.kind === 'overdueActions'}
              onClick={() => toggleFilter({ kind: 'overdueActions' })}
            />
            <StatSlicer
              icon={<Bell size={15} />} label="پروژه نیازمند توجه"
              tone={totals.needingAttention > 0 ? 'yellow' : 'green'}
              value={faNum(totals.needingAttention)}
              sub={totals.needingAttention === 0 ? 'موردی نیست' : undefined}
              active={filter?.kind === 'attention'}
              onClick={() => toggleFilter({ kind: 'attention' })}
            />
          </div>
        </div>

        {/* ── Readiness comparison — shape follows the breadcrumb ─────── */}
        <TowerTile
          span={12}
          eyebrow="Readiness comparison"
          title={
            level.kind === 'portfolio' ? 'مقایسه آمادگی سبدها'
            : level.kind === 'plan' ? `مقایسه آمادگی طرح‌های سبد «${activePortfolio?.portfolio.name}»`
            : 'ضعیف‌ترین پروژه‌ها از نظر آمادگی'
          }
        >
          <ReadinessComparisonBars data={readinessData} onSelect={onSelectReadinessBar} />
          <p className="plc-stat-sub">
            {level.kind === 'project'
              ? 'برای مشاهده برج کنترل پروژه، روی میله کلیک کنید.'
              : 'برای ورود به سطح بعد، روی میله کلیک کنید.'}
          </p>
        </TowerTile>

        {/* ── Portfolio level: one card per portfolio ─────────────────── */}
        {level.kind === 'portfolio' && (
          <TowerTile span={12} title="سبدهای پروژه">
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {tree.map((pf) => (
                <RollupCard
                  key={pf.portfolio.id}
                  icon={<Layers size={15} />}
                  name={pf.portfolio.name}
                  meta={`${faNum(pf.programs.length)} طرح · ${faNum(pf.totals.projects)} پروژه`}
                  totals={pf.totals}
                  onClick={() => setLevel({ kind: 'plan', portfolioId: pf.portfolio.id })}
                />
              ))}
            </ul>
          </TowerTile>
        )}

        {/* ── Plan level: one card per plan within the portfolio ──────── */}
        {level.kind === 'plan' && activePortfolio && (
          <TowerTile span={12} title={`طرح‌های سبد «${activePortfolio.portfolio.name}»`}>
            {activePortfolio.programs.length === 0 && activePortfolio.directProjects.length === 0 ? (
              <EmptyState message="طرح یا پروژه‌ای در این سبد ثبت نشده است" />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {activePortfolio.programs.map((pg) => (
                  <RollupCard
                    key={pg.program.id}
                    icon={<Network size={15} />}
                    name={pg.program.name}
                    meta={`${faNum(pg.totals.projects)} پروژه`}
                    totals={pg.totals}
                    onClick={() => setLevel({ kind: 'project', portfolioId: activePortfolio.portfolio.id, programId: pg.program.id })}
                  />
                ))}
              </ul>
            )}
          </TowerTile>
        )}

        {/* ── Project table — always present, scoped to the open level ── */}
        <TowerTile
          span={12}
          title={filter ? `پروژه‌ها (${faNum(listed.length)} از ${faNum(levelProjects.length)})` : `پروژه‌ها (${faNum(listed.length)})`}
          action={
            filter && (
              <button
                onClick={() => setFilter(null)}
                className="plc-filter-chip flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-white/5"
                style={{ borderColor: 'rgba(56,189,248,0.4)', color: '#7dd3fc' }}
              >
                پالایش: {filterLabel(filter)} <X size={12} />
              </button>
            )
          }
        >
          {listed.length === 0 ? (
            <EmptyState message={filter ? 'پروژه‌ای مطابق این پالایش در این سطح نیست' : 'پروژه‌ای در این سطح ثبت نشده است'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 760 }}>
                <thead>
                  <tr className="border-b text-[12px] font-bold text-secondary" style={{ borderColor: 'var(--border-soft)' }}>
                    <th className="py-2.5 text-right">پروژه</th>
                    <th className="py-2.5 text-right">مرحله</th>
                    <th className="py-2.5 text-center">سلامت</th>
                    <th className="py-2.5 text-center">آمادگی</th>
                    <th className="py-2.5 text-center">Milestone تأخیر</th>
                    <th className="py-2.5 text-center">اقدام معوق</th>
                    <th className="py-2.5 text-center">انحراف پیش‌بینی</th>
                    <th className="py-2.5 text-right">مهم‌ترین موضوع</th>
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
                        <td className="py-2.5 pl-2 plc-body-text">
                          <div className="flex items-center gap-1.5">
                            <StatusDot status={s.health} size={8} />
                            <span className="font-bold">{s.project.officialName}</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-[12px] text-muted">
                          {STAGE_LABEL_FA[s.currentStageKey as StageKey] ?? s.currentStageKey ?? '—'}
                        </td>
                        <td className="py-2.5 text-center text-[12px] font-bold" style={{ color: STATUS_TEXT_COLOR[s.health] }}>
                          {HEALTH_STATUS_LABEL_FA[s.health]}
                        </td>
                        <td className="py-2.5">
                          <div className="mx-auto w-20">
                            <Bar percent={s.readiness} blocked={s.blockedGates} />
                            <div className="plc-num mt-1 text-center text-[11px] text-muted">{faNum(s.readiness)}٪</div>
                          </div>
                        </td>
                        <td className="py-2.5 text-center text-[12px]">
                          {s.criticalMilestonesDelayed > 0 ? (
                            <span className="font-bold" style={{ color: STATUS_TEXT_COLOR.red }}>
                              {faNum(s.criticalMilestonesDelayed)} بحرانی
                            </span>
                          ) : s.milestonesDelayed > 0 ? (
                            <span style={{ color: STATUS_TEXT_COLOR.yellow }}>{faNum(s.milestonesDelayed)}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="py-2.5 text-center text-[12px]">
                          {s.overdueActions > 0
                            ? <span style={{ color: s.criticalOverdueActions > 0 ? STATUS_TEXT_COLOR.red : STATUS_TEXT_COLOR.yellow }}>{faNum(s.overdueActions)}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td className="py-2.5 text-center text-[12px]"
                          style={{ color: (s.forecastVarianceDays ?? 0) > 0 ? STATUS_TEXT_COLOR.red : undefined }}>
                          {faVariance(s.forecastVarianceDays)}
                        </td>
                        <td className="py-2.5 pr-2 text-[12px] text-muted">
                          <span className="line-clamp-1">{s.topAttention ?? '—'}</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </TowerTile>
      </div>
    </div>
  )
}

/** Average readiness, plain — an average has no single project to filter by, so unlike its
 * neighbours this tile stays a display, not a slicer. */
function ReadinessStat({ totals }: { totals: RollupTotals }) {
  const tone = totals.averageReadiness >= 80 ? 'green' : totals.averageReadiness >= 50 ? 'yellow' : 'red'
  return (
    <div className="plc-tile flex flex-col justify-between gap-2" style={{ padding: '14px 16px' }}>
      <span className="plc-stat-label">میانگین آمادگی</span>
      <span className="plc-stat-value" style={{ color: STATUS_TEXT_COLOR[tone] }}>{faNum(totals.averageReadiness)}٪</span>
      <Bar percent={totals.averageReadiness} status={tone} />
    </div>
  )
}

/** A portfolio or plan card, restyled as a bento tile: bigger type, a hover lift, and the health
 * distribution stated in words as well as colour underneath the bar. */
function RollupCard({ icon, name, meta, totals, onClick }: {
  icon: React.ReactNode
  name: string
  meta: string
  totals: RollupTotals
  onClick: () => void
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className="plc-tile plc-slicer w-full text-right"
        style={{ '--plc-slicer-tone': STATUS_TEXT_COLOR[toneFromTotals(totals)] } as React.CSSProperties}
      >
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-muted">{icon}</span>
            <span className="truncate text-[14px] font-extrabold">{name}</span>
          </div>
          <ChevronLeft size={15} className="shrink-0 text-muted" />
        </div>
        <p className="plc-stat-sub mb-2">{meta}</p>
        <HealthDistribution totals={totals} />
      </button>
    </li>
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
      <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--border-soft)' }} dir="ltr">
        {segments.map((s) => s.count > 0 && (
          <div key={s.key} style={{ width: `${(s.count / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-muted">
        <span>در مسیر {faNum(totals.onTrack)}</span>
        <span>در معرض ریسک {faNum(totals.atRisk)}</span>
        <span>تأخیرکرده {faNum(totals.delayed)}</span>
        {totals.blocked > 0 && <span>مسدود {faNum(totals.blocked)}</span>}
        <span>· آمادگی {faNum(totals.averageReadiness)}٪</span>
      </div>
    </>
  )
}
