import { useEffect, useState } from 'react'
import { Sparkles, Plus } from 'lucide-react'
import { useStore } from './store/useStore'
import { Sidebar } from './components/Layout/Sidebar'
import { Topbar } from './components/Layout/Topbar'
import { NewProjectModal } from './components/Layout/NewProjectModal'
import { ViewerPage } from './pages/ViewerPage'
import { OnePagerPage } from './pages/OnePagerPage'
import { ReportsPage } from './pages/ReportsPage'
import { SchematicPage } from './pages/SchematicPage'
import { SchedulePage } from './pages/SchedulePage'
import { AboutPage } from './pages/AboutPage'
import { buildSeedProject } from './data/seed'

export type Page = 'viewer' | 'onepager' | 'reports' | 'schematic' | 'schedule' | 'about'

const PAGE_TITLE: Record<Page, string> = {
  viewer: 'نقشه ایزومتریک تعاملی',
  onepager: 'داشبورد مدیریتی تک‌صفحه‌ای',
  reports: 'گزارش‌های تحلیلی',
  schematic: 'طراح نقشه شماتیک',
  schedule: 'برنامه زمان‌بندی',
  about: 'درباره ما',
}

function App() {
  const theme = useStore((s) => s.theme)
  const projects = useStore((s) => s.projects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const currentProject = useStore((s) => s.currentProject())
  const createProject = useStore((s) => s.createProject)
  const setProjectSvg = useStore((s) => s.setProjectSvg)
  const addLog = useStore((s) => s.addLog)
  const setPlannedCurve = useStore((s) => s.setPlannedCurve)
  const addSchedules = useStore((s) => s.addSchedules)
  const selectProject = useStore((s) => s.selectProject)

  const [page, setPage] = useState<Page>('viewer')
  const [showNewProject, setShowNewProject] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const loadDemo = () => {
    const seed = buildSeedProject()
    const id = createProject({
      name: 'ایستگاه تقویت فشار گاز - نمونه',
      client: 'شرکت ملی گاز ایران',
      location: 'پارس جنوبی',
      unit: 'واحد ۱۰۰',
    })
    setProjectSvg(id, seed.svgRaw, 'sample-isometric.svg', seed.lines)
    for (const log of seed.logs) addLog(id, log)
    setPlannedCurve(id, seed.plannedCurve)
    addSchedules(id, seed.schedules)
    selectProject(id)
  }

  if (projects.length === 0 || !currentProjectId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="glass-panel max-w-lg rounded-3xl p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white font-bold text-xl shadow-lg shadow-brand-500/30">
            IP
          </div>
          <h1 className="mb-2 text-xl font-extrabold">سامانه پایش پیشرفت ایزومتریک لوله‌کشی</h1>
          <p className="mb-7 text-sm text-secondary leading-7">
            مدیریت و پایش روزانه پیشرفت نقشه‌های ایزومتریک ایستگاه‌های گاز و پتروشیمی — آپلود SVG، ثبت کارکرد، گزارش‌های
            بصری و خروجی حرفه‌ای.
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
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-secondary hover:bg-white/5 transition-colors"
            >
              <Sparkles size={17} /> بارگذاری پروژه نمایشی
            </button>
          </div>
        </div>
        {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} />}
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar page={page} onPageChange={setPage} onNewProject={() => setShowNewProject(true)} />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar project={currentProject} title={PAGE_TITLE[page]} />
        <main className="flex-1 min-h-0">
          {currentProject && page === 'viewer' && <ViewerPage project={currentProject} />}
          {currentProject && page === 'onepager' && <OnePagerPage project={currentProject} />}
          {currentProject && page === 'reports' && <ReportsPage project={currentProject} />}
          {currentProject && page === 'schematic' && (
            <SchematicPage project={currentProject} onSaved={() => setPage('viewer')} />
          )}
          {currentProject && page === 'schedule' && <SchedulePage project={currentProject} />}
          {currentProject && page === 'about' && <AboutPage />}
        </main>
      </div>
      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} />}
    </div>
  )
}

export default App
