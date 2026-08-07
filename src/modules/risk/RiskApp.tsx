import { useEffect, useState } from 'react'
import { ArrowRight, Loader2, ShieldAlert } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { useRiskStore } from './store/useRiskStore'
import { useRiskMembersStore } from './store/useRiskMembersStore'
import { ProjectListPage } from './pages/ProjectListPage'
import { RiskRegisterPage } from './pages/RiskRegisterPage'

export function RiskApp({ onExitToHub }: { onExitToHub: () => void }) {
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

  useEffect(() => {
    fetchProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (currentProjectId) fetchMembers(currentProjectId)
    else clearMembers()
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
      <header className="no-print flex shrink-0 items-center justify-between glass-panel !rounded-none border-t-0 border-x-0 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10">
            <ShieldAlert size={18} className="text-red-400" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-extrabold">مدیریت ریسک</p>
            <p className="text-[10px] text-muted" dir="ltr">
              Risk Management
            </p>
          </div>
          {projectDetail && (
            <>
              <span className="mx-2 h-5 w-px bg-white/10" />
              <div className="relative">
                <select
                  value={projectDetail.id}
                  disabled={switching}
                  onChange={async (e) => {
                    setSwitching(true)
                    await selectProject(e.target.value)
                    setSwitching(false)
                  }}
                  className="rounded-lg bg-black/20 border border-white/10 px-2.5 py-1.5 text-xs outline-none focus:border-red-400 max-w-[14rem]"
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
        <div className="flex items-center gap-3">
          {currentUser && <span className="hidden text-xs text-secondary sm:inline">{currentUser.fullName || currentUser.email}</span>}
          <button
            onClick={onExitToHub}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors"
          >
            <ArrowRight size={13} /> بازگشت به ماژول‌ها
          </button>
        </div>
      </header>

      <StorageErrorBanner />

      <main className="min-h-0 flex-1 overflow-hidden">
        {!currentProjectId || !projectDetail ? (
          loadingDetail ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={22} className="animate-spin text-red-400" />
            </div>
          ) : (
            <ProjectListPage />
          )
        ) : (
          <RiskRegisterPage project={projectDetail} onChangeProject={() => useRiskStore.setState({ currentProjectId: null, projectDetail: null })} />
        )}
      </main>
    </div>
  )
}
