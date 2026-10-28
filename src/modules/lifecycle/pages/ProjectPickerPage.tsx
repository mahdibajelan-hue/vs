import { useMemo } from 'react'
import { Briefcase, ChevronLeft, Flag, ListChecks } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useModuleStore } from '../../../store/useModuleStore'
import { useLifecycleStore } from '../store/useLifecycleStore'
import { summariseProject, type ProjectSummary } from '../lib/portfolioRollup'
import { STAGE_LABEL_FA, type StageKey } from '../types'
import { EmptyState, faNum } from '../components/ui'

/**
 * Entry page of the lifecycle control tower when it is opened without a project. Portfolio-level analysis (health,
 * priority, scenarios, capacity, decisions) lives in Portfolio Management — this page only picks a project, so the
 * platform has one portfolio view with one health verdict (council review).
 */
export function ProjectPickerPage({ onOpenProject }: { onOpenProject: (projectId: string) => void }) {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const projects = useMasterDataStore((s) => s.projects)
  const lc = useLifecycleStore()
  const enterModule = useModuleStore((s) => s.enterModule)

  const summaries = useMemo(() => new Map<string, ProjectSummary>(projects.map((p) => {
    const by = <T extends { projectId: string }>(list: T[]) => list.filter((x) => x.projectId === p.id)
    return [p.id, summariseProject(p, lc.allLifecycles.find((l) => l.projectId === p.id) ?? null, by(lc.allMilestones), by(lc.allGates), by(lc.allChecklist), lc.allActions.filter((a) => a.projectId === p.id), by(lc.allHealth))]
  })), [projects, lc.allLifecycles, lc.allMilestones, lc.allGates, lc.allChecklist, lc.allActions, lc.allHealth])

  const groups = useMemo(() => {
    const out: { key: string; title: string; sub: string; items: typeof projects }[] = []
    for (const pf of portfolios) {
      for (const pg of programs.filter((x) => x.portfolioId === pf.id)) {
        const items = projects.filter((p) => p.programId === pg.id)
        if (items.length) out.push({ key: pg.id, title: pg.name, sub: pf.name, items })
      }
      const direct = projects.filter((p) => p.portfolioId === pf.id && !p.programId)
      if (direct.length) out.push({ key: `${pf.id}-direct`, title: 'بدون طرح', sub: pf.name, items: direct })
    }
    const rest = projects.filter((p) => !p.portfolioId && !p.programId)
    if (rest.length) out.push({ key: 'none', title: 'خارج از سبد', sub: '', items: rest })
    return out
  }, [portfolios, programs, projects])

  if (!projects.length) return <EmptyState message="پروژه‌ای تعریف نشده است — ابتدا در ماژول داده پایه پروژه ایجاد کنید." />

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div className="min-w-0">
          <p className="text-sm font-extrabold">یک پروژه را برای برج کنترل انتخاب کنید</p>
          <p className="mt-1 text-[11px] leading-5 text-muted">سلامت، اولویت، سناریو، ظرفیت منابع و تصمیم‌های سطح سبد در «مدیریت سبد پروژه‌ها» است؛ Milestoneها و اقدام‌های عقب‌افتادهٔ همین برج کنترل هم آن‌جا جمع می‌شود.</p>
        </div>
        <button type="button" onClick={() => enterModule('executive')} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-indigo-400/40 bg-indigo-500/15 px-3 py-2 text-xs font-bold text-indigo-200 transition-colors hover:bg-indigo-500/25">
          <Briefcase size={14} /> مدیریت سبد پروژه‌ها
        </button>
      </div>

      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <p className="text-[12px] font-bold">{g.title}{g.sub && <span className="ms-2 text-[11px] font-normal text-muted">{g.sub}</span>}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((p) => {
              const s = summaries.get(p.id)
              const stage = s?.currentStageKey ? STAGE_LABEL_FA[s.currentStageKey as StageKey] ?? s.currentStageKey : null
              return (
                <button key={p.id} type="button" onClick={() => onOpenProject(p.id)} className="glass-panel group flex items-start justify-between gap-2 rounded-xl p-3 text-right transition-colors hover:border-sky-400/40">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold">{p.officialName}</span>
                    <span className="mt-1 block text-[10px] text-muted">{stage ? `مرحله: ${stage}` : 'مرحلهٔ چرخهٔ عمر ثبت نشده'}</span>
                    {s && (s.milestonesDelayed > 0 || s.overdueActions > 0) && (
                      <span className="mt-1.5 flex flex-wrap gap-2 text-[10px]">
                        {s.milestonesDelayed > 0 && <span className={s.criticalMilestonesDelayed ? 'text-red-300' : 'text-amber-300'}><Flag size={10} className="inline" /> {faNum(s.milestonesDelayed)} Milestone تأخیرکرده</span>}
                        {s.overdueActions > 0 && <span className={s.criticalOverdueActions ? 'text-red-300' : 'text-amber-300'}><ListChecks size={10} className="inline" /> {faNum(s.overdueActions)} اقدام معوق</span>}
                      </span>
                    )}
                  </span>
                  <ChevronLeft size={14} className="mt-0.5 shrink-0 text-muted transition-transform group-hover:-translate-x-0.5" />
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
