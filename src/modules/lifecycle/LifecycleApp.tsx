import { useEffect, useState } from 'react'
import { GitBranch, LayoutDashboard, Loader2, Settings2, Target } from 'lucide-react'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { useAuthStore } from '../../store/useAuthStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { useLifecycleStore } from './store/useLifecycleStore'
import { PortfolioDashboardPage } from './pages/PortfolioDashboardPage'
import { ControlTowerPage } from './pages/ControlTowerPage'
import { StageGatePage } from './pages/StageGatePage'
import { MilestonesPage } from './pages/MilestonesPage'
import { TemplatesPage } from './pages/TemplatesPage'

type View =
  | { kind: 'portfolio' }
  | { kind: 'tower'; projectId: string }
  | { kind: 'stage'; projectId: string; stageKey: string }
  | { kind: 'milestones'; projectId: string }
  | { kind: 'templates' }

export function LifecycleApp({ onExitToHub }: { onExitToHub: () => void }) {
  const profile = useAuthStore((s) => s.profile)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const projects = useMasterDataStore((s) => s.projects)
  const fetchPortfolioWide = useLifecycleStore((s) => s.fetchPortfolioWide)
  const fetchTemplates = useLifecycleStore((s) => s.fetchTemplates)
  const selectProject = useLifecycleStore((s) => s.selectProject)
  const loadingPortfolio = useLifecycleStore((s) => s.loadingPortfolio)

  const [view, setView] = useState<View>({ kind: 'portfolio' })

  useEffect(() => {
    fetchMasterData()
    fetchPortfolioWide()
    fetchTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openProject(projectId: string) {
    await selectProject(projectId)
    setView({ kind: 'tower', projectId })
  }

  // Arrived here from Project Radar with a project already in context (Lifecycle uses
  // masterProjectId directly, no mapping table needed): open straight into its Control Tower and
  // stay locked to it — hide the "سبد پروژه‌ها" tab so there's no way back to the portfolio list.
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const [lockedToProject, setLockedToProject] = useState(false)
  useEffect(() => {
    if (contextProjectId) {
      openProject(contextProjectId)
      setLockedToProject(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeProject =
    view.kind !== 'portfolio' && view.kind !== 'templates'
      ? projects.find((p) => p.id === view.projectId) ?? null
      : null

  if (loadingPortfolio && view.kind === 'portfolio') {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <Loader2 size={24} className="animate-spin text-brand-400" />
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-y-2 glass-panel !rounded-none border-x-0 border-t-0 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10">
            <GitBranch size={18} className="text-sky-400" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-extrabold">چرخه عمر و برج کنترل</p>
            <p className="hidden text-[10px] text-muted sm:block" dir="ltr">Project Lifecycle &amp; Control Tower</p>
          </div>
          {activeProject && (
            <>
              <span className="mx-1 hidden h-5 w-px bg-white/10 sm:mx-2 sm:block" />
              <span className="truncate text-xs text-secondary">{activeProject.officialName}</span>
            </>
          )}
        </div>

        <nav className="order-3 hidden w-full items-center gap-1 rounded-lg bg-white/[0.04] p-1 sm:order-none sm:flex sm:w-auto">
          {!lockedToProject && (
            <TabButton
              active={view.kind === 'portfolio'}
              onClick={() => { selectProject(null); setView({ kind: 'portfolio' }) }}
              icon={<LayoutDashboard size={13} />}
              label="سبد پروژه‌ها"
            />
          )}
          {activeProject && (
            <>
              <TabButton
                active={view.kind === 'tower'}
                onClick={() => setView({ kind: 'tower', projectId: activeProject.id })}
                icon={<Target size={13} />}
                label="برج کنترل"
              />
              <TabButton
                active={view.kind === 'milestones'}
                onClick={() => setView({ kind: 'milestones', projectId: activeProject.id })}
                icon={<GitBranch size={13} />}
                label="Milestoneها"
              />
            </>
          )}
          {profile?.isAdmin && (
            <TabButton
              active={view.kind === 'templates'}
              onClick={() => setView({ kind: 'templates' })}
              icon={<Settings2 size={13} />}
              label="قالب‌ها"
            />
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <ModuleHeaderActions onExitToHub={onExitToHub} />
        </div>
      </header>

      <StorageErrorBanner />

      <main className="plc-canvas min-h-0 flex-1 overflow-y-auto">
        {view.kind === 'portfolio' ? (
          <PortfolioDashboardPage onOpenProject={openProject} />
        ) : view.kind === 'templates' ? (
          <TemplatesPage />
        ) : !activeProject ? (
          <p className="p-8 text-center text-xs text-muted">پروژه یافت نشد</p>
        ) : view.kind === 'tower' ? (
          <ControlTowerPage
            project={activeProject}
            onBack={() => { selectProject(null); setView({ kind: 'portfolio' }) }}
            onOpenStage={(stageKey) => setView({ kind: 'stage', projectId: activeProject.id, stageKey })}
            onOpenMilestones={() => setView({ kind: 'milestones', projectId: activeProject.id })}
          />
        ) : view.kind === 'stage' ? (
          <StageGatePage stageKey={view.stageKey} onBack={() => setView({ kind: 'tower', projectId: activeProject.id })} />
        ) : (
          <MilestonesPage projectId={activeProject.id} onBack={() => setView({ kind: 'tower', projectId: activeProject.id })} />
        )}
      </main>
    </div>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? 'bg-sky-500 text-white' : 'text-secondary hover:bg-white/5'
      }`}
    >
      {icon} {label}
    </button>
  )
}
