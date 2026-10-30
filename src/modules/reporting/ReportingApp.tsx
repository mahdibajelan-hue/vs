import { useEffect, useState } from 'react'
import { BarChart3, Bot, CalendarRange, FileText, LayoutDashboard, Loader2, Microscope, Settings2, type LucideIcon } from 'lucide-react'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { useDeepLinkStore } from '../../store/useDeepLinkStore'
import { useReportingStore } from './store/useReportingStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { useTabIndicator } from '../../components/common/useTabIndicator'
import { DashboardPage } from './pages/DashboardPage'
import { ReportBuilderPage } from './pages/ReportBuilderPage'
import { ReportCenterPage } from './pages/ReportCenterPage'
import { PortfolioReportPage } from './pages/PortfolioReportPage'
import { EvidenceReportPage } from './pages/EvidenceReportPage'
import { ReportSettingsPage } from './pages/ReportSettingsPage'
import { HomePage } from './pages/HomePage'
import { ComposerPage } from './pages/ComposerPage'
import { AnalysisCenterPage, type AnalysisSub } from './pages/AnalysisCenterPage'
import { AssistantPage } from './pages/AssistantPage'
import { GuidePage } from './pages/GuidePage'
import { PeriodReportsPage } from './pages/PeriodReportsPage'
import type { Scope } from './components/rpx'
import type { View } from './lib/assistantCore'

/** The module is organised around three parts — report builder, analysis center, assistant — plus its front page, settings and guide. */
export type Section = 'home' | 'reports' | 'builder' | 'analysis' | 'assistant' | 'settings' | 'guide'
type BuilderSub = 'composer' | 'official' | 'center' | 'widgets' | 'template' | 'portfolio'

const NAV: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'نمای مدیریتی', icon: LayoutDashboard },
  { id: 'reports', label: 'گزارش‌های دوره‌ای', icon: CalendarRange },
  { id: 'builder', label: 'گزارش‌ساز', icon: FileText },
  { id: 'analysis', label: 'مرکز تحلیل', icon: Microscope },
  { id: 'assistant', label: 'دستیار', icon: Bot },
  { id: 'settings', label: 'تنظیمات', icon: Settings2 },
]
const BUILDER_SUBS: { id: BuilderSub; label: string; project: boolean }[] = [
  { id: 'composer', label: 'گزارش ترکیبی', project: false },
  { id: 'official', label: 'گزارش رسمی پروژه', project: true },
  { id: 'center', label: 'مرکز گزارش‌های صادرشده', project: true },
  { id: 'widgets', label: 'ویجت‌های پروژه', project: true },
  { id: 'template', label: 'قالب ویجتی', project: true },
  { id: 'portfolio', label: 'ویجت‌های سبد', project: false },
]

export function ReportingApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const projects = useMasterDataStore((s) => s.projects)
  const masterDataLoaded = useMasterDataStore((s) => s.loaded)
  const masterDataLoading = useMasterDataStore((s) => s.loading)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const profilesLoaded = useReportingStore((s) => s.profilesLoaded)
  const fetchProfiles = useReportingStore((s) => s.fetchProfiles)
  const fetchProjectData = useReportingStore((s) => s.fetchProjectData)

  // Arrived from a mission finding («مشاهده در مدیریت اقدامات»): open that project's decision center.
  const linked = useDeepLinkStore.getState().pending?.module === 'reporting' ? useDeepLinkStore.getState().pending?.masterProjectId ?? null : null
  const [projectId, setProjectId] = useState<string | null>(linked)
  const [section, setSection] = useState<Section>(linked ? 'analysis' : 'home')
  const [builderSub, setBuilderSub] = useState<BuilderSub>('composer')
  const navInd = useTabIndicator<HTMLElement>(section)
  const subInd = useTabIndicator<HTMLElement>(`${section}:${builderSub}`)
  const [reportKind, setReportKind] = useState<string>('daily')
  const [analysisSub, setAnalysisSub] = useState<AnalysisSub>(linked ? 'decisions' : 'deviations')
  const [scope, setScope] = useState<Scope>(linked ? { level: 'project', id: linked } : { level: 'all', id: null })

  useEffect(() => {
    if (!masterDataLoaded) fetchMasterData()
    if (!profilesLoaded) fetchProfiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (projects.length > 0 && !projectId) setProjectId(projects[0].id) }, [projects, projectId])
  useEffect(() => { if (projectId) fetchProjectData(projectId) }, [projectId, fetchProjectData])
  // choosing a single project in the analysis scope also makes it the project of the project-level report pages
  useEffect(() => { if (scope.level === 'project' && scope.id) setProjectId(scope.id) }, [scope])

  const open = (s: Section, sub?: string, pid?: string) => {
    setSection(s)
    if (s === 'analysis' && sub) setAnalysisSub(sub as AnalysisSub)
    if (s === 'builder' && sub) setBuilderSub(sub as BuilderSub)
    if (s === 'reports' && sub) setReportKind(sub)
    if (pid) setScope({ level: 'project', id: pid })
  }
  const openView = (v: View, pid: string | null) => {
    if (pid) setScope({ level: 'project', id: pid })
    if (v === 'evidence') open('builder', pid ? 'official' : 'composer')
    else open('analysis', v === 'actions' ? 'actions' : v)
  }

  if (masterDataLoading && !masterDataLoaded) {
    return <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}><Loader2 size={24} className="animate-spin text-teal-400" /></div>
  }

  const projectLevel = (section === 'builder' && BUILDER_SUBS.find((b) => b.id === builderSub)?.project) || section === 'settings'

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-2 glass-panel !rounded-none border-t-0 border-x-0 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-400/30 bg-teal-500/10"><BarChart3 size={18} className="text-teal-400" /></div>
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-extrabold">گزارش هوشمند و تحلیل</p>
            <p className="text-[10px] text-muted">گزارش‌های دوره‌ای · گزارش‌ساز · مرکز تحلیل · دستیار</p>
          </div>
          {projectLevel && (
            <>
              <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
              <select value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)} aria-label="پروژه" className="w-36 rounded-lg bg-black/20 border border-white/10 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400 sm:w-auto">
                <option value="">پروژه‌ای انتخاب کنید</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.officialName}</option>)}
              </select>
            </>
          )}
        </div>
        <nav ref={navInd.list} className="rp-nav relative order-3 hidden w-full items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 lg:order-none lg:flex lg:w-auto" aria-label="بخش‌های ماژول">
          <span ref={navInd.indicator} className="tab-ind rp-nav-ind" aria-hidden />
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined}
              className={`tab-press relative z-[1] flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${section === id ? 'text-teal-300' : 'text-secondary rp-nav-idle'}`}>
              <Icon size={13} />{label}
            </button>
          ))}
        </nav>
        <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} onGuide={() => setSection(section === 'guide' ? 'home' : 'guide')} guideActive={section === 'guide'} />
      </header>

      <StorageErrorBanner />

      <div className="rpx-scroll flex-1 min-h-0 overflow-y-auto p-3 pb-20 sm:p-4 lg:pb-4" dir="rtl">
        {section === 'home' ? <HomePage scope={scope} onScope={setScope} onOpen={open} />
          : section === 'reports' ? <PeriodReportsPage key={reportKind} initialKind={reportKind} initialProject={scope.level === 'project' ? scope.id : projectId} />
          : section === 'analysis' ? <AnalysisCenterPage sub={analysisSub} onSub={setAnalysisSub} scope={scope} onScope={setScope} />
          : section === 'assistant' ? <AssistantPage onOpen={openView} />
          : section === 'guide' ? <GuidePage onOpen={(s) => setSection(s)} />
          : section === 'settings' ? <ReportSettingsPage masterProjectId={projectId} projectName={projects.find((p) => p.id === projectId)?.officialName ?? ''} />
          : (
            <div className="space-y-3">
              <nav ref={subInd.list} className="rpx-subnav no-print" role="tablist" aria-label="گزارش‌ساز" style={{ display: 'flex', gap: '.3rem', overflowX: 'auto' }}>
                <span ref={subInd.indicator} className="tab-ind rpx-subnav-ind" aria-hidden />
                {BUILDER_SUBS.map((b) => <button key={b.id} role="tab" aria-selected={builderSub === b.id} onClick={() => setBuilderSub(b.id)}>{b.label}</button>)}
              </nav>
              {builderSub === 'composer' ? <ComposerPage projectId={scope.level === 'project' ? scope.id : null} />
                : builderSub === 'portfolio' ? <PortfolioReportPage />
                : !projectId ? <div className="flex h-40 items-center justify-center text-sm text-muted">{projects.length === 0 ? 'ابتدا از بخش داده پایه یک پروژه تعریف کنید' : 'یک پروژه را از بالا انتخاب کنید'}</div>
                : builderSub === 'official' ? <EvidenceReportPage key={projectId} masterProjectId={projectId} onOpenCenter={() => setBuilderSub('center')} />
                : builderSub === 'center' ? <ReportCenterPage masterProjectId={projectId} />
                : builderSub === 'widgets' ? <DashboardPage masterProjectId={projectId} />
                : <ReportBuilderPage masterProjectId={projectId} />}
            </div>
          )}
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex items-center justify-around overflow-x-auto border-t bg-[var(--bg-panel-solid)] py-1.5 lg:hidden" style={{ borderColor: 'var(--border-soft)' }} aria-label="بخش‌های ماژول">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined} className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] shrink-0 ${section === id ? 'text-teal-400' : 'text-muted'}`}>
            <Icon size={17} /><span className="max-w-[4.5rem] truncate">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
