import { useEffect, useState } from 'react'
import { Brain, LayoutDashboard, ListChecks, Loader2, Network, ShieldAlert } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { LevelBreadcrumb } from '../masterdata/components/LevelBreadcrumb'
import { useHierarchyPath } from '../masterdata/lib/useHierarchyPath'
import { fetchModuleProjectMappings } from '../masterdata/lib/hierarchyRollup'
import { useRiskStore } from './store/useRiskStore'
import { useRiskMembersStore } from './store/useRiskMembersStore'
import { ProjectListPage } from './pages/ProjectListPage'
import { RiskRegisterPage } from './pages/RiskRegisterPage'
import { DashboardPage } from './pages/DashboardPage'
import { PortfolioRollupPage } from './pages/PortfolioRollupPage'
import { RiskIntelligencePage } from './pages/RiskIntelligencePage'

type Tab = 'dashboard' | 'register' | 'portfolio' | 'intelligence'

export function RiskApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const currentUser = useAuthStore((s) => s.currentUser())
  const projects = useRiskStore((s) => s.projects)
  const currentProjectId = useRiskStore((s) => s.currentProjectId)
  const projectDetail = useRiskStore((s) => s.projectDetail)
  const loadingProjects = useRiskStore((s) => s.loadingProjects)
  const loadingDetail = useRiskStore((s) => s.loadingDetail)
  const fetchProjects = useRiskStore((s) => s.fetchProjects)
  const selectProject = useRiskStore((s) => s.selectProject)
  const fetchMembers = useRiskMembersStore((s) => s.fetchForProject)
  const clearMembers = useRiskMembersStore((s) => s.clear)
  const [switching, setSwitching] = useState(false)
  const [tab, setTab] = useState<Tab>('dashboard')
  const hierarchyPath = useHierarchyPath('risk', projectDetail?.id ?? null)

  useEffect(() => {
    fetchProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Arrived here from Project Radar with a project already in context: jump straight to that
  // project's risk register instead of making the user find it again in the picker, and stay
  // locked to it — hide the project switcher and the cross-project "سه‌سطحی" view so there's no
  // way to wander back to a list of other projects.
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const [lockedToProject, setLockedToProject] = useState(false)
  useEffect(() => {
    if (!contextProjectId) return
    fetchModuleProjectMappings('risk').then((map) => {
      const resolved = map.get(contextProjectId)
      if (resolved) {
        selectProject(resolved)
        setLockedToProject(true)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (currentProjectId) fetchMembers(currentProjectId)
    else clearMembers()
    setTab('dashboard')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId])

  if (loadingProjects) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <Loader2 size={24} className="animate-spin text-red-400" />
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-y-2 glass-panel !rounded-none border-t-0 border-x-0 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10">
            <ShieldAlert size={18} className="text-red-400" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-extrabold">مدیریت ریسک</p>
            <p className="hidden text-[10px] text-muted sm:block" dir="ltr">
              Risk Management
            </p>
          </div>
          {projectDetail && !lockedToProject && (
            <>
              <span className="mx-1 hidden h-5 w-px bg-white/10 sm:mx-2 sm:block" />
              <div className="relative min-w-0">
                <select
                  value={projectDetail.id}
                  disabled={switching}
                  onChange={async (e) => {
                    setSwitching(true)
                    await selectProject(e.target.value)
                    setSwitching(false)
                  }}
                  className="w-32 rounded-lg bg-black/20 border border-white/10 px-2.5 py-1.5 text-xs outline-none focus:border-red-400 sm:max-w-[14rem] sm:w-auto"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <div className="order-3 hidden w-full items-center gap-1 rounded-lg bg-white/[0.04] p-1 sm:order-none sm:flex sm:w-auto">
          {projectDetail && (
            <>
              <button
                onClick={() => setTab('dashboard')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === 'dashboard' ? 'bg-red-500 text-white' : 'text-secondary hover:bg-white/5'
                }`}
              >
                <LayoutDashboard size={13} /> داشبورد
              </button>
              <button
                onClick={() => setTab('register')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === 'register' ? 'bg-red-500 text-white' : 'text-secondary hover:bg-white/5'
                }`}
              >
                <ListChecks size={13} /> ثبت ریسک‌ها
              </button>
              <button
                onClick={() => setTab('intelligence')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === 'intelligence' ? 'bg-red-500 text-white' : 'text-secondary hover:bg-white/5'
                }`}
              >
                <Brain size={13} /> هوش ریسک
              </button>
            </>
          )}
          {!lockedToProject && (
            <button
              onClick={() => setTab('portfolio')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === 'portfolio' ? 'bg-red-500 text-white' : 'text-secondary hover:bg-white/5'
              }`}
            >
              <Network size={13} /> تحلیل سه‌سطحی
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {currentUser && <span className="hidden text-xs text-secondary lg:inline">{currentUser.fullName || currentUser.email}</span>}
          <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
        </div>
      </header>

      <StorageErrorBanner />

      {projectDetail && tab !== 'portfolio' && hierarchyPath && (
        <div className="no-print border-b px-4 py-1.5" style={{ borderColor: 'var(--border-soft)' }}>
          <LevelBreadcrumb path={hierarchyPath} className="text-muted" />
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-hidden pb-14 sm:pb-0">
        {tab === 'portfolio' ? (
          <PortfolioRollupPage
            onOpenProject={async (rmProjectId) => {
              await selectProject(rmProjectId)
              setTab('dashboard')
            }}
          />
        ) : !currentProjectId || !projectDetail ? (
          loadingDetail ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={22} className="animate-spin text-red-400" />
            </div>
          ) : (
            <ProjectListPage />
          )
        ) : tab === 'dashboard' ? (
          <DashboardPage project={projectDetail} />
        ) : tab === 'intelligence' ? (
          <RiskIntelligencePage project={projectDetail} />
        ) : (
          <RiskRegisterPage project={projectDetail} onChangeProject={() => useRiskStore.setState({ currentProjectId: null, projectDetail: null })} />
        )}
      </main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t bg-[var(--bg-panel-solid)] py-1.5 sm:hidden" style={{ borderColor: 'var(--border-soft)' }}>
        {projectDetail && (
          <>
            <button onClick={() => setTab('dashboard')} className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[10px] ${tab === 'dashboard' ? 'text-red-400' : 'text-muted'}`}>
              <LayoutDashboard size={17} /> داشبورد
            </button>
            <button onClick={() => setTab('register')} className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[10px] ${tab === 'register' ? 'text-red-400' : 'text-muted'}`}>
              <ListChecks size={17} /> ثبت ریسک‌ها
            </button>
            <button onClick={() => setTab('intelligence')} className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[10px] ${tab === 'intelligence' ? 'text-red-400' : 'text-muted'}`}>
              <Brain size={17} /> هوش ریسک
            </button>
          </>
        )}
        {!lockedToProject && (
          <button onClick={() => setTab('portfolio')} className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[10px] ${tab === 'portfolio' ? 'text-red-400' : 'text-muted'}`}>
            <Network size={17} /> سه‌سطحی
          </button>
        )}
      </nav>
    </div>
  )
}
