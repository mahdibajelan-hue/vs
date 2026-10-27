import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BookMarked, Compass, FileSliders, FileStack, Gauge, Home, ListChecks, Loader2, SlidersHorizontal } from 'lucide-react'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { useAuthStore } from '../../store/useAuthStore'
import { todayJalali } from '../../lib/jalali'
import { useEstimatorStore } from './store/useEstimatorStore'
import { buildDefaultInputs } from './lib/calc'
import { finalResults, METHOD_META } from './lib/methods'
import { EST_GLOBAL_STYLE } from './components/ui'
import { BG, BORDER, fmtEURm, INK, INK_SOFT, MUTED_FG, SAFETY, SURFACE, SURFACE_2, toFa } from './lib/theme'
import type { EstEstimateRecord, EstFullInputs } from './types'
import { ProjectListPage } from './pages/ProjectListPage'
import { StartPage } from './pages/StartPage'
import { SpecsPage } from './pages/SpecsPage'
import { ResultsPage } from './pages/ResultsPage'
import { HistoryPage, versionName } from './pages/HistoryPage'
import { LibraryPage } from './pages/LibraryPage'
import { SettingsPage } from './pages/SettingsPage'

type View = 'home' | 'library' | 'settings' | 'start' | 'specs' | 'results' | 'history'

const VIEW_TITLE: Record<View, string> = {
  home: 'خانه و راهنما', library: 'کتابخانهٔ پروژه‌های مرجع', settings: 'مبانی برآورد',
  start: 'گام ۱ — نرخ یورو و روش برآورد', specs: 'گام ۲ — مشخصات فنی', results: 'گام ۳ — برآورد و گزارش', history: 'نسخه‌های برآورد',
}

export function EstimatorApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const profile = useAuthStore((s) => s.profile)
  const currentProject = useEstimatorStore((s) => s.currentProject)
  const currentProjectId = useEstimatorStore((s) => s.currentProjectId)
  const projects = useEstimatorStore((s) => s.projects)
  const estimates = useEstimatorStore((s) => s.estimates)
  const assumptions = useEstimatorStore((s) => s.assumptions)
  const benchmarks = useEstimatorStore((s) => s.benchmarks)
  const loadingProjects = useEstimatorStore((s) => s.loadingProjects)
  const loadingEstimates = useEstimatorStore((s) => s.loadingEstimates)
  const loadingAssumptions = useEstimatorStore((s) => s.loadingAssumptions)
  const saving = useEstimatorStore((s) => s.saving)
  const fetchProjects = useEstimatorStore((s) => s.fetchProjects)
  const fetchAssumptions = useEstimatorStore((s) => s.fetchAssumptions)
  const fetchBenchmarks = useEstimatorStore((s) => s.fetchBenchmarks)
  const selectProject = useEstimatorStore((s) => s.selectProject)
  const saveEstimate = useEstimatorStore((s) => s.saveEstimate)
  const deleteEstimate = useEstimatorStore((s) => s.deleteEstimate)

  const [view, setView] = useState<View>('home')
  const [inputs, setInputs] = useState<EstFullInputs>(buildDefaultInputs())
  /** name of the saved version currently on screen; cleared as soon as an input changes */
  const [openVersion, setOpenVersion] = useState<string | undefined>()
  const nowYear = useMemo(() => todayJalali().jy, [])

  useEffect(() => {
    fetchProjects()
    fetchAssumptions()
    fetchBenchmarks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // every estimate starts from the current bases and asks for the day's euro rate again
  useEffect(() => {
    if (!loadingAssumptions) setInputs(buildDefaultInputs(assumptions, currentProject ?? undefined))
    setOpenVersion(undefined)
    setView(currentProjectId ? 'start' : 'home')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId])

  const started = (inputs.overhead.fxRialPerEur ?? 0) > 0
  const live = useMemo(() => (currentProject && started ? finalResults(currentProject, inputs, benchmarks, nowYear) : null), [currentProject, inputs, benchmarks, nowYear, started])

  function go(v: View) {
    if (v === 'home') { selectProject(null); setView('home'); return }
    if ((v === 'specs' || v === 'results') && !started) { setView('start'); return }
    setView(v)
  }

  function openHistoryRecord(rec: EstEstimateRecord) {
    setInputs(rec.inputs)
    setOpenVersion(versionName(rec))
    setView('results')
  }

  function changeInputs(next: EstFullInputs) {
    setInputs(next)
    setOpenVersion(undefined)
  }

  async function handleSave({ label }: { label: string }) {
    if (!currentProject) return
    const { results } = finalResults(currentProject, inputs, benchmarks, nowYear)
    await saveEstimate({
      projectId: currentProject.id,
      label,
      inputs,
      results,
      fxEurPerUsd: inputs.overhead.fxEurPerUsd,
      fxRialPerUsd: inputs.overhead.fxRialPerUsd,
      grandTotalEur: results.grand * inputs.overhead.fxEurPerUsd,
      grandTotalRial: results.grand * inputs.overhead.fxRialPerUsd,
    })
    setOpenVersion(label)
  }

  if (loadingProjects) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 est-font" style={{ background: BG }} dir="rtl">
        <style>{EST_GLOBAL_STYLE}</style>
        <Loader2 size={24} className="animate-spin" style={{ color: SAFETY }} />
        <span className="text-xs" style={{ color: MUTED_FG }}>در حال بارگذاری پروژه‌های برآورد…</span>
      </div>
    )
  }

  const isAdmin = !!profile?.isAdmin
  const shown: View = view === 'settings' && !isAdmin ? 'home' : !currentProject && ['start', 'specs', 'results', 'history'].includes(view) ? 'home' : view
  const chosen = live?.methods.chosen

  return (
    <div className="est-app est-font" dir="rtl" lang="fa">
      <style>{EST_GLOBAL_STYLE}{SHELL_STYLE}</style>

      {/* side rail (desktop) */}
      <aside className="est-rail no-print" aria-label="ناوبری ماژول">
        <button type="button" className="est-brand" onClick={() => go('home')}>
          <span className="est-logo"><Gauge size={19} /></span>
          <span className="min-w-0 text-right">
            <b>برآورد هزینهٔ پروژه</b>
            <small>برآورد سرمایه‌ای خطوط لوله</small>
          </span>
        </button>

        <nav className="est-rail-group">
          <RailBtn on={shown === 'home'} onClick={() => go('home')} icon={<Home size={16} />} label="خانه و راهنما" />
          <RailBtn on={shown === 'library'} onClick={() => go('library')} icon={<BookMarked size={16} />} label="کتابخانهٔ مرجع" badge={benchmarks.length ? toFa(benchmarks.length) : undefined} />
          {isAdmin && <RailBtn on={shown === 'settings'} onClick={() => go('settings')} icon={<SlidersHorizontal size={16} />} label="مبانی برآورد" />}
        </nav>

        {currentProject && (
          <div className="est-rail-project">
            <span className="est-rail-cap">پروژهٔ جاری</span>
            <label className="est-projsel">
              <select value={currentProject.id} onChange={(e) => selectProject(e.target.value)} aria-label="پروژه">
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <ol className="est-steps">
              <StepBtn n="۱" on={shown === 'start'} done={started} onClick={() => go('start')} label="نرخ یورو و روش" icon={<Compass size={14} />} />
              <StepBtn n="۲" on={shown === 'specs'} done={started && shown === 'results'} disabled={!started} onClick={() => go('specs')} label="مشخصات فنی" icon={<FileSliders size={14} />} />
              <StepBtn n="۳" on={shown === 'results'} disabled={!started} onClick={() => go('results')} label="برآورد و گزارش" icon={<ListChecks size={14} />} />
            </ol>
            <RailBtn on={shown === 'history'} onClick={() => go('history')} icon={<FileStack size={16} />} label="نسخه‌ها" badge={estimates.length ? toFa(estimates.length) : undefined} />
          </div>
        )}

        {currentProject && live && chosen && (
          <div className="est-rail-live">
            <span className="flex items-center gap-1.5 text-[10.5px]" style={{ color: MUTED_FG }}><i className="est-dot" /> برآورد زنده · {METHOD_META[chosen.method].short}</span>
            <b className="est-mono">{fmtEURm(chosen.eur)} <small>یورو</small></b>
            <span className="text-[10.5px] est-mono" style={{ color: INK_SOFT }}>یورو = {toFa(Math.round(inputs.overhead.fxRialPerEur ?? 0).toLocaleString('en-US'))} ریال</span>
          </div>
        )}
      </aside>

      <div className="est-main">
        <header className="est-top no-print">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" className="est-logo lg:hidden" onClick={() => go('home')} aria-label="خانه"><Gauge size={17} /></button>
            <div className="min-w-0">
              <p className="truncate text-[11px]" style={{ color: MUTED_FG }}>{currentProject && ['start', 'specs', 'results', 'history'].includes(shown) ? currentProject.name : 'برآورد هزینهٔ پروژه'}</p>
              <p className="truncate text-sm font-extrabold" style={{ color: INK }}>{VIEW_TITLE[shown]}</p>
            </div>
          </div>
          <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
        </header>

        <main key={`${currentProjectId ?? 'none'}-${shown}`} className="est-view est-page-in">
          {shown === 'settings' ? <SettingsPage />
            : shown === 'library' ? <LibraryPage nowYear={nowYear} />
            : shown === 'home' || !currentProject ? <ProjectListPage onOpenLibrary={() => go('library')} />
            : shown === 'start' ? <StartPage project={currentProject} inputs={inputs} benchmarks={benchmarks} nowYear={nowYear} onChange={changeInputs} onNext={() => setView('specs')} onOpenLibrary={() => go('library')} />
            : shown === 'specs' ? <SpecsPage project={currentProject} inputs={inputs} benchmarks={benchmarks} nowYear={nowYear} onChange={changeInputs} onCalculate={() => setView('results')} onEditStart={() => setView('start')} />
            : shown === 'results' ? <ResultsPage project={currentProject} inputs={inputs} benchmarks={benchmarks} nowYear={nowYear} onChange={changeInputs} onSave={handleSave} saving={saving} versionLabel={openVersion} />
            : <HistoryPage project={currentProject} estimates={estimates} loading={loadingEstimates} onOpen={openHistoryRecord} onDelete={(id) => deleteEstimate(id, currentProject.id)} />}
        </main>

        {/* bottom bar (phones) */}
        <nav className="est-bottom no-print" aria-label="ناوبری ماژول">
          <BottomBtn on={shown === 'home'} onClick={() => go('home')} icon={<Home size={18} />} label="خانه" />
          <BottomBtn on={shown === 'library'} onClick={() => go('library')} icon={<BookMarked size={18} />} label="کتابخانه" />
          {currentProject && <>
            <BottomBtn on={shown === 'start'} onClick={() => go('start')} icon={<Compass size={18} />} label="شروع" />
            <BottomBtn on={shown === 'specs'} onClick={() => go('specs')} icon={<FileSliders size={18} />} label="مشخصات" />
            <BottomBtn on={shown === 'results'} onClick={() => go('results')} icon={<ListChecks size={18} />} label="نتیجه" />
          </>}
          {!currentProject && isAdmin && <BottomBtn on={shown === 'settings'} onClick={() => go('settings')} icon={<SlidersHorizontal size={18} />} label="مبانی" />}
        </nav>
      </div>
    </div>
  )
}

function RailBtn({ on, onClick, icon, label, badge }: { on: boolean; onClick: () => void; icon: ReactNode; label: string; badge?: string }) {
  return (
    <button type="button" onClick={onClick} aria-current={on ? 'page' : undefined} className={`est-railbtn ${on ? 'is-on' : ''}`}>
      <span className="est-railbtn-ic">{icon}</span><span className="flex-1 text-right truncate">{label}</span>{badge && <em>{badge}</em>}
    </button>
  )
}

function StepBtn({ n, on, done, disabled, onClick, label, icon }: { n: string; on: boolean; done?: boolean; disabled?: boolean; onClick: () => void; label: string; icon: ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} disabled={disabled} aria-current={on ? 'step' : undefined} className={`est-step ${on ? 'is-on' : ''} ${done ? 'is-done' : ''}`}>
        <b>{n}</b><span className="flex-1 text-right">{label}</span><span className="opacity-60">{icon}</span>
      </button>
    </li>
  )
}

function BottomBtn({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button type="button" onClick={onClick} aria-current={on ? 'page' : undefined} className={on ? 'is-on' : ''}>{icon}<span>{label}</span></button>
}

const SHELL_STYLE = `
  .est-app { display: grid; grid-template-columns: 1fr; height: 100vh; height: 100dvh; width: 100vw; overflow: hidden; color: ${INK};
    background:
      radial-gradient(900px 500px at 85% -10%, rgba(57,135,229,.13), transparent 60%),
      radial-gradient(700px 420px at 0% 110%, rgba(242,183,5,.07), transparent 60%),
      linear-gradient(rgba(56,189,248,.035) 1px, transparent 1px) 0 0 / 32px 32px,
      linear-gradient(90deg, rgba(56,189,248,.035) 1px, transparent 1px) 0 0 / 32px 32px,
      ${BG}; }
  @media (min-width: 1024px) { .est-app { grid-template-columns: 252px minmax(0, 1fr); } }
  .est-rail { display: none; }
  @media (min-width: 1024px) { .est-rail { display: flex; flex-direction: column; gap: 1rem; padding: 1rem .8rem; border-inline-end: 1px solid ${BORDER}; background: rgba(9,16,26,.82); backdrop-filter: blur(12px); overflow-y: auto; } }
  .est-brand { display: flex; align-items: center; gap: .65rem; padding: .3rem .35rem .8rem; border-bottom: 1px solid ${BORDER}; }
  .est-brand b { display: block; font-size: 13.5px; font-weight: 900; color: ${INK}; }
  .est-brand small { display: block; font-size: 10.5px; color: ${MUTED_FG}; }
  .est-logo { width: 38px; height: 38px; flex-shrink: 0; display: grid; place-items: center; border-radius: 12px; color: ${SAFETY}; background: radial-gradient(circle at 30% 20%, rgba(242,183,5,.28), rgba(242,183,5,.06)); border: 1px solid rgba(242,183,5,.32); transition: transform .14s var(--ease); }
  .est-logo:active { transform: scale(.94); }
  @media (min-width: 1024px) { .est-top .est-logo { display: none; } }
  .est-rail-group { display: grid; gap: .2rem; }
  .est-railbtn { display: flex; align-items: center; gap: .6rem; width: 100%; padding: .6rem .65rem; border-radius: 11px; font-size: 13px; font-weight: 600; color: ${INK_SOFT}; transition: background .15s ease, color .15s ease; position: relative; min-height: 42px; }
  .est-railbtn:hover { background: rgba(255,255,255,.04); color: ${INK}; }
  .est-railbtn.is-on { background: linear-gradient(90deg, rgba(242,183,5,.04), rgba(242,183,5,.14)); color: ${INK}; }
  .est-railbtn.is-on::before { content: ''; position: absolute; inset-inline-start: -.8rem; top: 22%; bottom: 22%; width: 3px; border-radius: 0 3px 3px 0; background: ${SAFETY}; }
  .est-railbtn-ic { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 8px; background: rgba(255,255,255,.04); color: ${MUTED_FG}; }
  .est-railbtn.is-on .est-railbtn-ic { color: ${SAFETY}; background: rgba(242,183,5,.12); }
  .est-railbtn em { font-style: normal; font-size: 10.5px; font-weight: 700; padding: .05rem .45rem; border-radius: 99px; background: ${SURFACE_2}; color: ${INK_SOFT}; border: 1px solid ${BORDER}; }
  .est-rail-project { display: grid; gap: .45rem; padding: .8rem .6rem; border-radius: 16px; background: ${SURFACE}; border: 1px solid ${BORDER}; }
  .est-rail-cap { font-size: 10.5px; font-weight: 700; color: ${MUTED_FG}; letter-spacing: .02em; }
  .est-projsel select { width: 100%; appearance: none; background: ${SURFACE_2}; border: 1px solid ${BORDER}; color: ${INK}; border-radius: 10px; padding: .5rem .6rem; font-size: 12.5px; font-weight: 700; outline: none; }
  .est-projsel select:focus { border-color: ${SAFETY}; }
  .est-steps { display: grid; gap: .15rem; position: relative; }
  .est-step { display: flex; align-items: center; gap: .55rem; width: 100%; padding: .5rem .45rem; border-radius: 10px; font-size: 12.5px; font-weight: 600; color: ${INK_SOFT}; transition: background .15s ease; min-height: 38px; }
  .est-step:hover:not(:disabled) { background: rgba(255,255,255,.04); }
  .est-step:disabled { opacity: .4; cursor: not-allowed; }
  .est-step b { width: 22px; height: 22px; border-radius: 99px; display: grid; place-items: center; font-size: 11px; background: ${SURFACE_2}; border: 1px solid ${BORDER}; color: ${MUTED_FG}; transition: background .2s ease, color .2s ease; }
  .est-step.is-done b { background: rgba(25,158,112,.18); color: #34d399; border-color: rgba(52,211,153,.4); }
  .est-step.is-on { color: ${INK}; background: rgba(242,183,5,.08); }
  .est-step.is-on b { background: ${SAFETY}; color: #1A1400; border-color: ${SAFETY}; }
  .est-rail-live { margin-top: auto; display: grid; gap: .2rem; padding: .85rem .9rem; border-radius: 16px; background: linear-gradient(160deg, rgba(242,183,5,.12), rgba(242,183,5,.02)); border: 1px solid rgba(242,183,5,.28); }
  .est-rail-live b { font-size: 1.35rem; color: ${SAFETY}; line-height: 1.2; }
  .est-rail-live b small { font-size: 11px; color: ${INK_SOFT}; font-family: Vazirmatn, sans-serif; }
  .est-dot { width: 6px; height: 6px; border-radius: 99px; background: #22c55e; display: inline-block; }
  .est-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .est-top { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .6rem 1rem; border-bottom: 1px solid ${BORDER}; background: rgba(9,16,26,.7); backdrop-filter: blur(10px); }
  .est-view { flex: 1; min-height: 0; overflow: hidden; }
  .est-bottom { display: flex; justify-content: space-around; gap: .25rem; padding: .35rem .5rem calc(.35rem + env(safe-area-inset-bottom)); border-top: 1px solid ${BORDER}; background: rgba(9,16,26,.95); backdrop-filter: blur(10px); }
  .est-bottom button { flex: 1; display: grid; justify-items: center; gap: .1rem; padding: .35rem 0; min-height: 48px; font-size: 10.5px; font-weight: 600; color: ${MUTED_FG}; border-radius: 10px; transition: color .15s ease; }
  .est-bottom button.is-on { color: ${SAFETY}; }
  @media (min-width: 1024px) { .est-bottom { display: none; } }
  .est-page-in { animation: est-page-in .35s var(--ease) both; }
  @keyframes est-page-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .est-page-in { animation: none; } }
`
