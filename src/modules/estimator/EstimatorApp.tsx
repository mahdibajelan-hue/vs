import { useEffect, useState } from 'react'
import { ClipboardList, Clock, FileSliders, Gauge, ListChecks, Loader2, Settings } from 'lucide-react'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { useAuthStore } from '../../store/useAuthStore'
import { useEstimatorStore } from './store/useEstimatorStore'
import { buildDefaultInputs, computeEstimate } from './lib/calc'
import { EST_GLOBAL_STYLE } from './components/ui'
import { BG, BORDER, INK, MUTED_FG, SAFETY, SURFACE, SURFACE_2 } from './lib/theme'
import type { EstEstimateRecord, EstFullInputs } from './types'
import { ProjectListPage } from './pages/ProjectListPage'
import { SpecsPage } from './pages/SpecsPage'
import { ResultsPage } from './pages/ResultsPage'
import { HistoryPage } from './pages/HistoryPage'
import { SettingsPage } from './pages/SettingsPage'

type Tab = 'specs' | 'results' | 'history' | 'settings'

export function EstimatorApp({ onExitToHub }: { onExitToHub: () => void }) {
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

  useEffect(() => {
    fetchProjects()
    fetchAssumptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loadingAssumptions) setInputs(buildDefaultInputs(assumptions, currentProject ?? undefined))
    setTab('specs')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId])

  function openHistoryRecord(rec: EstEstimateRecord) {
    setInputs(rec.inputs)
    setTab('results')
  }

  async function handleSave({ grandTotalEur, grandTotalRial }: { grandTotalEur: number; grandTotalRial: number }) {
    if (!currentProject) return
    const results = computeEstimate(currentProject, inputs)
    await saveEstimate({
      projectId: currentProject.id,
      label: new Date().toISOString(),
      inputs,
      results,
      fxEurPerUsd: inputs.overhead.fxEurPerUsd,
      fxRialPerUsd: inputs.overhead.fxRialPerUsd,
      grandTotalEur,
      grandTotalRial,
    })
  }

  if (loadingProjects) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: BG }}>
        <Loader2 size={24} className="animate-spin" style={{ color: SAFETY }} />
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden est-font" style={{ background: BG }} dir="rtl" lang="fa">
      <style>{EST_GLOBAL_STYLE}</style>

      <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-y-2 px-3 py-2.5 sm:px-4 sm:py-3" style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(242,183,5,0.10)', border: `1px solid rgba(242,183,5,0.30)` }}>
            <Gauge size={18} style={{ color: SAFETY }} />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-extrabold" style={{ color: INK }}>برآورد هزینه پروژه</p>
            <p className="hidden text-[10px] sm:block" style={{ color: MUTED_FG }} dir="ltr">RASTA · Project Cost Estimator</p>
          </div>
          {currentProject && (
            <>
              <span className="mx-1 hidden h-5 w-px sm:mx-2 sm:block" style={{ background: BORDER }} />
              <select
                value={currentProject.id}
                onChange={(e) => selectProject(e.target.value)}
                className="w-32 rounded-lg px-2.5 py-1.5 text-xs outline-none sm:max-w-[16rem] sm:w-auto"
                style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="order-3 hidden w-full items-center gap-1 rounded-lg p-1 sm:order-none sm:flex sm:w-auto" style={{ background: SURFACE_2 }}>
          {currentProject && (
            <>
              <TabButton active={tab === 'specs'} onClick={() => setTab('specs')} icon={<FileSliders size={13} />} label="مشخصات" />
              <TabButton active={tab === 'results'} onClick={() => setTab('results')} icon={<ListChecks size={13} />} label="نتایج" />
              <TabButton active={tab === 'history'} onClick={() => setTab('history')} icon={<Clock size={13} />} label="تاریخچه" />
            </>
          )}
          {profile?.isAdmin && (
            <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon={<Settings size={13} />} label="تنظیمات" />
          )}
          <button
            onClick={() => selectProject(null)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ color: MUTED_FG }}
          >
            <ClipboardList size={13} /> پروژه‌ها
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <ModuleHeaderActions onExitToHub={onExitToHub} />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === 'settings' && profile?.isAdmin ? (
          <SettingsPage />
        ) : !currentProject ? (
          <ProjectListPage />
        ) : tab === 'specs' ? (
          <SpecsPage project={currentProject} inputs={inputs} onChange={setInputs} saving={saving} onCalculate={() => setTab('results')} />
        ) : tab === 'results' ? (
          <ResultsPage project={currentProject} inputs={inputs} onSave={handleSave} saving={saving} />
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

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
      style={active ? { background: SAFETY, color: '#1A1400' } : { color: MUTED_FG }}
    >
      {icon} {label}
    </button>
  )
}
