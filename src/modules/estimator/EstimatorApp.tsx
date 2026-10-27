import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, FileSliders, FileStack, Gauge, LayoutGrid, ListChecks, Loader2, Settings } from 'lucide-react'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { useAuthStore } from '../../store/useAuthStore'
import { useEstimatorStore } from './store/useEstimatorStore'
import { buildDefaultInputs, computeEstimate } from './lib/calc'
import { EST_GLOBAL_STYLE } from './components/ui'
import { BG, BORDER, fmtEURm, INK, MUTED_FG, SAFETY, SURFACE, SURFACE_2, toFa } from './lib/theme'
import type { EstEstimateRecord, EstFullInputs } from './types'
import { ProjectListPage } from './pages/ProjectListPage'
import { SpecsPage } from './pages/SpecsPage'
import { ResultsPage } from './pages/ResultsPage'
import { HistoryPage, versionName } from './pages/HistoryPage'
import { SettingsPage } from './pages/SettingsPage'

type Tab = 'specs' | 'results' | 'history' | 'settings'

export function EstimatorApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const profile = useAuthStore((s) => s.profile)
  const currentProject = useEstimatorStore((s) => s.currentProject)
  const currentProjectId = useEstimatorStore((s) => s.currentProjectId)
  const projects = useEstimatorStore((s) => s.projects)
  const estimates = useEstimatorStore((s) => s.estimates)
  const assumptions = useEstimatorStore((s) => s.assumptions)
  const loadingProjects = useEstimatorStore((s) => s.loadingProjects)
  const loadingEstimates = useEstimatorStore((s) => s.loadingEstimates)
  const loadingAssumptions = useEstimatorStore((s) => s.loadingAssumptions)
  const saving = useEstimatorStore((s) => s.saving)
  const fetchProjects = useEstimatorStore((s) => s.fetchProjects)
  const fetchAssumptions = useEstimatorStore((s) => s.fetchAssumptions)
  const selectProject = useEstimatorStore((s) => s.selectProject)
  const saveEstimate = useEstimatorStore((s) => s.saveEstimate)
  const deleteEstimate = useEstimatorStore((s) => s.deleteEstimate)

  const [tab, setTab] = useState<Tab>('specs')
  const [inputs, setInputs] = useState<EstFullInputs>(buildDefaultInputs())
  /** name of the saved version currently on screen; cleared as soon as an input changes */
  const [openVersion, setOpenVersion] = useState<string | undefined>()

  useEffect(() => {
    fetchProjects()
    fetchAssumptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loadingAssumptions) setInputs(buildDefaultInputs(assumptions, currentProject ?? undefined))
    setOpenVersion(undefined)
    setTab('specs')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId])

  const liveTotal = useMemo(() => (currentProject ? computeEstimate(currentProject, inputs).grand * inputs.overhead.fxEurPerUsd : 0), [currentProject, inputs])

  function openHistoryRecord(rec: EstEstimateRecord) {
    setInputs(rec.inputs)
    setOpenVersion(versionName(rec))
    setTab('results')
  }

  function changeInputs(next: EstFullInputs) {
    setInputs(next)
    setOpenVersion(undefined)
  }

  async function handleSave({ label, grandTotalEur, grandTotalRial }: { label: string; grandTotalEur: number; grandTotalRial: number }) {
    if (!currentProject) return
    const results = computeEstimate(currentProject, inputs)
    await saveEstimate({
      projectId: currentProject.id,
      label,
      inputs,
      results,
      fxEurPerUsd: inputs.overhead.fxEurPerUsd,
      fxRialPerUsd: inputs.overhead.fxRialPerUsd,
      grandTotalEur,
      grandTotalRial,
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

  const inSettings = tab === 'settings' && profile?.isAdmin

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden est-font" style={{ background: BG }} dir="rtl" lang="fa">
      <style>{EST_GLOBAL_STYLE}{SHELL_STYLE}</style>

      <header className="no-print shrink-0" style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" onClick={() => { selectProject(null); setTab('specs') }} className="est-logo" title="همهٔ پروژه‌ها">
              <Gauge size={18} />
            </button>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-extrabold" style={{ color: INK }}>برآورد هزینهٔ پروژه</p>
              <p className="hidden text-[10px] sm:block" style={{ color: MUTED_FG }}>برآورد پارامتریک سرمایه‌ای خطوط لوله و ایستگاه‌ها</p>
            </div>
            {currentProject && !inSettings && (
              <>
                <span className="mx-1 hidden h-6 w-px sm:block" style={{ background: BORDER }} />
                <label className="est-projsel hidden sm:inline-flex">
                  <select value={currentProject.id} onChange={(e) => selectProject(e.target.value)} aria-label="پروژه">
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <ChevronDown size={14} />
                </label>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {currentProject && !inSettings && (
              <span className="est-livepill hidden md:inline-flex" title="برآورد زندهٔ ورودی‌های فعلی">
                <i /> <span className="est-mono">{fmtEURm(liveTotal)}</span> یورو
              </span>
            )}
            <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
          </div>
        </div>

        <nav className="est-nav" aria-label="بخش‌های ماژول">
          <NavBtn active={!currentProject && !inSettings} onClick={() => { selectProject(null); setTab('specs') }} icon={<LayoutGrid size={14} />} label="پروژه‌ها" />
          {currentProject && (
            <>
              <span className="est-nav-sep" aria-hidden />
              <NavBtn step="۲" active={tab === 'specs'} onClick={() => setTab('specs')} icon={<FileSliders size={14} />} label="مشخصات" />
              <NavBtn step="۳" active={tab === 'results'} onClick={() => setTab('results')} icon={<ListChecks size={14} />} label="برآورد و گزارش" />
              <NavBtn active={tab === 'history'} onClick={() => setTab('history')} icon={<FileStack size={14} />} label={`نسخه‌ها${estimates.length ? ` (${toFa(estimates.length)})` : ''}`} />
            </>
          )}
          {profile?.isAdmin && (
            <>
              <span className="flex-1" />
              <NavBtn active={tab === 'settings'} onClick={() => setTab(tab === 'settings' ? 'specs' : 'settings')} icon={<Settings size={14} />} label="مبانی محاسبات" />
            </>
          )}
        </nav>
      </header>

      <main key={`${currentProjectId ?? 'list'}-${inSettings ? 'settings' : tab}`} className="min-h-0 flex-1 overflow-hidden est-page-in">
        {inSettings ? (
          <SettingsPage />
        ) : !currentProject ? (
          <ProjectListPage />
        ) : tab === 'specs' ? (
          <SpecsPage project={currentProject} inputs={inputs} onChange={changeInputs} onCalculate={() => setTab('results')} />
        ) : tab === 'results' ? (
          <ResultsPage project={currentProject} inputs={inputs} onSave={handleSave} saving={saving} versionLabel={openVersion} />
        ) : (
          <HistoryPage
            project={currentProject}
            estimates={estimates}
            loading={loadingEstimates}
            onOpen={openHistoryRecord}
            onDelete={(id) => deleteEstimate(id, currentProject.id)}
          />
        )}
      </main>
    </div>
  )
}

function NavBtn({ active, onClick, icon, label, step }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; step?: string }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className={`est-navbtn ${active ? 'is-on' : ''}`}>
      {step ? <b className="est-navstep">{step}</b> : icon} {label}
    </button>
  )
}

const SHELL_STYLE = `
  .est-logo { width: 36px; height: 36px; flex-shrink: 0; display: grid; place-items: center; border-radius: 12px; color: ${SAFETY}; background: radial-gradient(circle at 30% 20%, rgba(242,183,5,.25), rgba(242,183,5,.06)); border: 1px solid rgba(242,183,5,.32); transition: transform .14s var(--ease); }
  .est-logo:active { transform: scale(.94); }
  .est-projsel { position: relative; align-items: center; color: ${MUTED_FG}; }
  .est-projsel select { appearance: none; background: ${SURFACE_2}; border: 1px solid ${BORDER}; color: ${INK}; border-radius: 10px; padding: .4rem .7rem .4rem 1.9rem; font-size: 12px; font-weight: 600; max-width: min(46vw, 18rem); outline: none; }
  .est-projsel select:focus { border-color: ${SAFETY}; }
  .est-projsel svg { position: absolute; left: .55rem; pointer-events: none; }
  .est-livepill { align-items: center; gap: .4rem; font-size: 11.5px; color: ${MUTED_FG}; padding: .3rem .7rem; border-radius: 99px; background: ${SURFACE_2}; border: 1px solid ${BORDER}; }
  .est-livepill .est-mono { color: ${SAFETY}; font-weight: 700; font-size: 13px; }
  .est-livepill i { width: 6px; height: 6px; border-radius: 99px; background: #22c55e; }
  .est-nav { display: flex; align-items: center; gap: .25rem; padding: 0 .75rem; overflow-x: auto; scrollbar-width: none; }
  .est-nav::-webkit-scrollbar { display: none; }
  .est-navbtn { position: relative; display: inline-flex; align-items: center; gap: .4rem; padding: .55rem .8rem .7rem; font-size: 12.5px; font-weight: 600; color: ${MUTED_FG}; white-space: nowrap; transition: color .15s ease; }
  .est-navbtn:hover { color: ${INK}; }
  .est-navbtn::after { content: ''; position: absolute; left: .6rem; right: .6rem; bottom: 0; height: 2px; border-radius: 2px 2px 0 0; background: ${SAFETY}; transform: scaleX(0); transition: transform .25s var(--ease); }
  .est-navbtn.is-on { color: ${INK}; }
  .est-navbtn.is-on::after { transform: scaleX(1); }
  .est-navstep { width: 18px; height: 18px; border-radius: 99px; display: grid; place-items: center; font-size: 10.5px; background: ${SURFACE_2}; color: ${MUTED_FG}; border: 1px solid ${BORDER}; }
  .est-navbtn.is-on .est-navstep { background: ${SAFETY}; color: #1A1400; border-color: ${SAFETY}; }
  .est-nav-sep { width: 1px; height: 16px; background: ${BORDER}; margin: 0 .25rem; }
  .est-page-in { animation: est-page-in .35s var(--ease) both; }
  @keyframes est-page-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .est-page-in { animation: none; } .est-navbtn::after { transition: none; } }
`
