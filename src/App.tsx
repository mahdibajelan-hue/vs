import { Suspense, lazy, useEffect, useState } from 'react'
import { Sparkles, Plus, Loader2 } from 'lucide-react'
import { useStore } from './store/useStore'
import { Sidebar } from './components/Layout/Sidebar'
import { Topbar } from './components/Layout/Topbar'
import { NewProjectModal } from './components/Layout/NewProjectModal'
import { ViewerPage } from './pages/ViewerPage'
import { OnePagerPage } from './pages/OnePagerPage'
import { ReportsPage } from './pages/ReportsPage'
import { WorkLogPage } from './pages/WorkLogPage'
import { SchematicPage } from './pages/SchematicPage'
import { SchedulePage } from './pages/SchedulePage'
import { PortfolioRollupPage } from './pages/PortfolioRollupPage'
import { AboutPage } from './pages/AboutPage'
import { buildSeedProject } from './data/seed'
import { useAuthStore } from './store/useAuthStore'
import { supabase } from './lib/supabaseClient'
import { LogoFull } from './components/common/Logo'
import { StorageErrorBanner } from './components/Layout/StorageErrorBanner'

// Lazy-loaded: pulls in three.js (large) only when the user actually opens the 3D viewer tab,
// keeping it out of the initial bundle every other page load pays for.
const Model3DPage = lazy(() => import('./pages/Model3DPage').then((m) => ({ default: m.Model3DPage })))

export type Page = 'viewer' | 'worklog' | 'onepager' | 'reports' | 'schematic' | 'schedule' | 'model3d' | 'portfolio' | 'about'

const PAGE_TITLE: Record<Page, string> = {
  viewer: 'نقشه ایزومتریک تعاملی',
  worklog: 'کارکرد روزانه',
  onepager: 'داشبورد مدیریتی تک‌صفحه‌ای',
  reports: 'گزارش‌های تحلیلی',
  schematic: 'طراحی نقشه شماتیک',
  schedule: 'برنامه زمان‌بندی',
  model3d: 'مدل سه‌بعدی',
  portfolio: 'تحلیل سه‌سطحی پورتفولیو/طرح/پروژه',
  about: 'درباره ما',
}

function App() {
  const theme = useStore((s) => s.theme)
  const projects = useStore((s) => s.projects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const currentProject = useStore((s) => s.currentProject())
  const loadingProjects = useStore((s) => s.loadingProjects)
  const fetchProjects = useStore((s) => s.fetchProjects)
  const createProject = useStore((s) => s.createProject)
  const setProjectSvg = useStore((s) => s.setProjectSvg)
  const addLog = useStore((s) => s.addLog)
  const setPlannedCurve = useStore((s) => s.setPlannedCurve)
  const addSchedules = useStore((s) => s.addSchedules)
  const setMilestones = useStore((s) => s.setMilestones)
  const selectProject = useStore((s) => s.selectProject)
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)

  const [page, setPage] = useState<Page>('viewer')
  const [showNewProject, setShowNewProject] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!isAuthed) return
    useStore.setState({ loadingProjects: true })
    supabase
      .rpc('accept_pending_invites')
      .then(() => fetchProjects())
      .then(() => {
        // currentProjectId is never persisted (only projectDetail-of-the-moment is fetched
        // live), so without this, a returning user with real projects would land on the
        // empty "create a project" screen on every single visit — projects.length > 0 but
        // currentProjectId is still null. Auto-select one so they see their own work.
        const state = useStore.getState()
        if (!state.currentProjectId && state.projects.length > 0) {
          selectProject(state.projects[0].id)
        }
      })
  }, [isAuthed, fetchProjects, selectProject])

  const loadDemo = async () => {
    setDemoLoading(true)
    try {
      const seed = buildSeedProject()
      const id = await createProject({
        name: 'ایستگاه تقویت فشار گاز - نمونه',
        client: 'شرکت ملی گاز ایران',
        location: 'پارس جنوبی',
        unit: 'واحد ۱۰۰',
        role: 'contractor',
      })
      const insertedLines = await setProjectSvg(id, seed.svgRaw, 'sample-isometric.svg', seed.lines)
      // setProjectSvg doesn't (and can't) keep the seed's placeholder line ids — the db assigns
      // real ones on insert. Every downstream record that references a line by id (logs,
      // schedules) has to be remapped through the real ids, matched by svgElementId.
      const realIdByElementId = new Map(insertedLines.map((l) => [l.svgElementId, l.id]))
      const remapLineId = (lineId: string) => {
        const original = seed.lines.find((l) => l.id === lineId)
        return (original && realIdByElementId.get(original.svgElementId)) ?? lineId
      }
      for (const log of seed.logs) await addLog(id, { ...log, lineId: remapLineId(log.lineId) })
      await setPlannedCurve(id, seed.plannedCurve)
      await addSchedules(
        id,
        seed.schedules.map((s) => ({ ...s, lineId: remapLineId(s.lineId) })),
      )
      await setMilestones(id, seed.milestones)
      await selectProject(id)
    } catch {
      // error already surfaced via the storage-error banner
    } finally {
      setDemoLoading(false)
    }
  }

  if (loadingProjects && projects.length === 0) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loader2 size={26} className="animate-spin text-brand-400" />
      </div>
    )
  }

  if (!isAdmin && (projects.length === 0 || !currentProjectId)) {
    return (
      <div className="flex h-screen w-screen flex-col">
        <StorageErrorBanner />
        <div className="flex flex-1 items-center justify-center">
          <div className="glass-panel max-w-lg rounded-3xl p-10 text-center">
            <LogoFull width={190} className="mx-auto mb-4" />
            <h1 style={{ fontFamily: "'Montserrat', sans-serif" }} className="mb-2 text-xl font-extrabold tracking-tight">
              PipePulse
            </h1>
            <p className="mb-7 text-sm text-secondary leading-7">
              پایش بصری، کنترل پیشرفت و پیش‌بینی عملکرد پروژه‌های پایپینگ — آپلود SVG، ثبت کارکرد، گزارش‌های بصری و
              خروجی حرفه‌ای.
            </p>
            <p className="mb-4 text-xs text-muted leading-6">
              اگر همکارتان از قبل پروژه‌ای ساخته، از او بخواهید شما را با ایمیل‌تان به آن پروژه دعوت کند.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => setShowNewProject(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-medium text-white hover:bg-brand-400 transition-colors"
              >
                <Plus size={17} /> ایجاد پروژه جدید
              </button>
              <button
                onClick={loadDemo}
                disabled={demoLoading}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-secondary hover:bg-white/5 disabled:opacity-50 transition-colors"
              >
                {demoLoading ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />} بارگذاری پروژه نمایشی
              </button>
            </div>
          </div>
        </div>
        {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} />}
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        page={page}
        onPageChange={setPage}
        onNewProject={() => setShowNewProject(true)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar project={currentProject} title={PAGE_TITLE[page]} onMenuClick={() => setMobileSidebarOpen(true)} />
        <StorageErrorBanner />
        <main className="flex-1 min-h-0">
          {page === 'portfolio' ? (
            <PortfolioRollupPage
              onOpenProject={(pipepulseProjectId) => {
                selectProject(pipepulseProjectId)
                setPage('viewer')
              }}
            />
          ) : page === 'about' ? (
            <AboutPage />
          ) : !currentProject ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={24} className="animate-spin text-brand-400" />
            </div>
          ) : (
            <>
              {page === 'viewer' && <ViewerPage project={currentProject} />}
              {page === 'worklog' && <WorkLogPage project={currentProject} />}
              {page === 'onepager' && <OnePagerPage project={currentProject} />}
              {page === 'reports' && <ReportsPage project={currentProject} />}
              {page === 'schematic' && <SchematicPage project={currentProject} onSaved={() => setPage('viewer')} />}
              {page === 'schedule' && <SchedulePage project={currentProject} />}
              {page === 'model3d' && (
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center">
                      <Loader2 size={24} className="animate-spin text-brand-400" />
                    </div>
                  }
                >
                  {/* Keyed on project id: switching between stations without leaving this tab
                      otherwise reuses the same component instance, and stale selection/mesh-link
                      state from the previous station's model would leak into the new one. Keying
                      forces a clean remount per station, so at most one model is ever loading and
                      it always starts from a blank slate. */}
                  <Model3DPage key={currentProject.id} project={currentProject} />
                </Suspense>
              )}
            </>
          )}
        </main>
      </div>
      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} />}
    </div>
  )
}

export default App
