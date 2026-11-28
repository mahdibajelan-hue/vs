import { NavScroller } from './components/NavScroller'
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bot, Factory, Camera, Flame, CalendarRange, ClipboardList, FileBarChart2, Gauge, HardHat, Hourglass, Inbox, Loader2, Settings2, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useModuleStore } from '../../store/useModuleStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import '../issues/issues.css'
import '../finance/finance-dashboard.css'
import '../material/material-control.css'
import './execution.css'
import { useExecutionStore } from './store/useExecutionStore'
import { useExecutionModel } from './lib/useExecutionModel'
import { PortfolioStrip } from './components/epc/PortfolioStrip'
import { ExecutionGuide } from './components/ExecutionGuide'
import { resetModuleScroll, revealTab } from '../../lib/revealTab'
import { urlSubs, useRemembered } from '../../lib/navMemory'
import { useUrlBind } from '../../lib/urlState'
import { scopeViews, SCOPE_VIEW_FA, PROJECT_KIND_FA, type ScopeView } from '../../lib/projectProfile'
import { useProjectScope, useScopeStore } from './store/useScopeStore'

export const EXECUTION_ACCENT = '#f97316'
export type ExTab = 'station' | 'dashboard' | 'daily' | 'review' | 'welds' | 'progress' | 'outlook' | 'plan' | 'assistant' | 'reports' | 'gaps' | 'qc' | 'photos' | 'settings'
type Sub = { id: string; label: string }
/** `only`: the tab exists in that scope alone (the pipeline weld file is kilometre-based; a station's welds live in its spool register) */
const NAV: { id: ExTab; label: string; icon: LucideIcon; color: string; subs?: Sub[]; only?: 'pipeline' | 'station' }[] = [
  { id: 'dashboard', label: 'داشبورد', icon: Gauge, color: '#f97316' },
  { id: 'station', label: 'ایستگاه: پایپینگ، تجهیزات، تست‌پک', icon: Factory, color: '#6366f1', only: 'station', subs: [{ id: 'dash', label: 'خلاصهٔ ایستگاه' }, { id: 'lines', label: 'لاین‌ها و اسپول‌ها' }, { id: 'welds', label: 'سرجوش‌ها (اینچ‌قطر)' }, { id: 'equipment', label: 'نصب تجهیزات' }, { id: 'packs', label: 'تست‌پک‌ها' }, { id: 'qc', label: 'کنترل کیفیت (B31.8 / IGS)' }, { id: 'twin', label: 'دوقلوی دیجیتال (پلات‌پلن)' }] },
  { id: 'daily', label: 'گزارش روزانه', icon: ClipboardList, color: '#0ea5e9', subs: [{ id: 'work', label: 'گزارش روز (وضعیت کارگاه و صورتجلسات)' }, { id: 'line', label: 'میز کار خط (ثبت گرافیکی)' }, { id: 'forms', label: 'بایگانی گزارشات روزانه' }] },
  { id: 'review', label: 'کارتابل بررسی', icon: Inbox, color: '#10b981' },
  { id: 'welds', label: 'سرجوش‌ها (پروندهٔ جوش)', icon: Flame, color: '#f43f5e', only: 'pipeline' },
  { id: 'progress', label: 'پیشرفت فیزیکی', icon: TrendingUp, color: '#14b8a6' },
  { id: 'outlook', label: 'پیش‌بینی اتمام پروژه', icon: Hourglass, color: '#a855f7', subs: [{ id: 'dash', label: 'داشبورد اتمام' }, { id: 'acts', label: 'فعالیت‌ها و کارکرد آتی' }, { id: 'crew', label: 'بهره‌وری اکیپ‌ها' }, { id: 'civil', label: 'ماشین‌آلات سیویل' }, { id: 'setup', label: 'تعاریف و تنظیمات' }, { id: 'guide', label: 'راهنما' }] },
  { id: 'plan', label: 'برنامهٔ کوتاه‌مدت و آمادگی', icon: CalendarRange, color: '#0ea5e9', subs: [{ id: 'lookahead', label: 'برنامهٔ سه‌هفته‌ای' }, { id: 'readiness', label: 'آمادگی فعالیت‌ها' }, { id: 'import', label: 'ورود برنامه از اکسل' }] },
  { id: 'assistant', label: 'دستیار هوشمند', icon: Bot, color: '#ec4899' },
  { id: 'reports', label: 'گزارش‌های دوره‌ای', icon: FileBarChart2, color: '#94a3b8', subs: [{ id: 'builder', label: 'گزارش‌ساز و صدور رسمی' }, { id: 'week', label: 'هفتگی' }, { id: 'month', label: 'ماهانه' }, { id: 'cum', label: 'تجمعی از ابتدا' }, { id: 'contract', label: 'صورت‌وضعیت پیمان (۳ ستونی)' }, { id: 'statement', label: 'صورت‌وضعیت کارکرد' }, { id: 'ledger', label: 'مغایرت اجرایی و صورت‌وضعیت' }, { id: 'personnel', label: 'جوشکاران و عایق‌کاران' }, { id: 'mrs', label: 'لوله‌های ورودی (MRS)' }, { id: 'archive', label: 'بایگانی فرم‌های فنی' }, { id: 'mgmt-week', label: 'گزارش مدیریتی هفتگی' }, { id: 'mgmt-month', label: 'گزارش مدیریتی ماهانه' }, { id: 'delays', label: 'تأخیرات و کلیم' }] },
  { id: 'photos', label: 'عکس‌های کارگاه', icon: Camera, color: '#0891b2' },
  { id: 'gaps', label: 'کامل‌بودن و کسری', icon: AlertTriangle, color: '#ef4444' },
  { id: 'settings', label: 'تنظیمات', icon: Settings2, color: '#64748b', subs: [{ id: 'roles', label: 'افراد، نقش‌ها و تنظیمات پایه' }, { id: 'rules', label: 'فهرست‌ها، مقادیر پیمان، تقویم و قواعد' }, { id: 'tpl', label: 'کتابخانهٔ قالب‌های فرم‌های فنی' }, { id: 'actions', label: 'اقدام‌های کارگاهی و تطبیق با فهرست‌بها' }, { id: 'timing', label: 'زمان ثبت گزارش' }] },
]

type P = { projectId: string; sub: string; onGo: (t: ExTab, s?: string) => void }
const L = <T extends Record<string, unknown>>(f: () => Promise<T>, k: keyof T) => lazy(() => f().then((m) => ({ default: m[k] as React.ComponentType<P> })))
const Dashboard = L(() => import('./pages/DashboardPage'), 'DashboardPage')
const Daily = L(() => import('./pages/DailyPage'), 'DailyPage')
const Review = L(() => import('./pages/ReviewPage'), 'ReviewPage')
const Progress = L(() => import('./pages/ProgressPage'), 'ProgressPage')
const Outlook = L(() => import('./pages/outlook/OutlookRouter'), 'OutlookRouter')
const Assistant = L(() => import('./pages/AssistantPage'), 'AssistantPage')
const Plan = L(() => import('./pages/PlanPage'), 'PlanPage')
const Reports = L(() => import('./pages/ReportsRouter'), 'ReportsRouter')
const Today = L(() => import('./pages/TodayPage'), 'TodayPage')
const Designed = L(() => import('./pages/DesignedForms'), 'DesignedForms')
const Photos = L(() => import('./photos/PhotosPage'), 'PhotosPage')
const Welds = L(() => import('./pages/WeldsPage'), 'WeldsPage')
const Gaps = L(() => import('./pages/GapsPage'), 'GapsPage')
const Settings = L(() => import('./pages/SettingsPage'), 'SettingsPage')
const Station = L(() => import('./pages/StationPage'), 'StationPage')
const LineWork = L(() => import('./pages/LineWorkspace'), 'LineWorkspace')

/** «مدیریت اجرا» — daily work reports on the price-list rows, row-by-row approval by the supervision, technical QC forms, weighted physical progress and automatic period reports. */
export function ExecutionApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const projects = useMasterDataStore((s) => s.projects)
  const mdLoaded = useMasterDataStore((s) => s.loaded)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const exLoaded = useExecutionStore((s) => s.loaded)
  const fetchEx = useExecutionStore((s) => s.fetchAll)
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const [tab, setTab] = useRemembered<ExTab>('tab', () => { const e = (useModuleStore.getState().takeEntryTab() ?? '').split(':')[0] as ExTab; return e && NAV.some((x) => x.id === e) ? e : 'dashboard' }, (v) => typeof v === 'string' && NAV.some((x) => x.id === v), 'tab')
  const [subs, setSubs] = useRemembered<Partial<Record<ExTab, string>>>('subs', () => { const [t, sb] = (useModuleStore.getState().entryTab ?? '').split(':'); return t && sb ? { [t]: sb } : {} }, (v) => !!v && typeof v === 'object', undefined, urlSubs)
  const [projectId, setProjectId] = useRemembered<string | null>('projectId', null, (v) => v === null || typeof v === 'string', 'p')
  const [locked, setLocked] = useState(false)
  const [guide, setGuide] = useState(false)

  useEffect(() => {
    if (!mdLoaded) fetchMasterData()
    if (!exLoaded) void fetchEx()
    // the material module's data (fronts list, warehouse receipts) is loaded by the two pages that read it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!projects.length) return
    // inside a project (radar): that project, fixed; otherwise the remembered choice while it is still in the list
    if (contextProjectId && projects.some((p) => p.id === contextProjectId)) { if (projectId !== contextProjectId) setProjectId(contextProjectId); setLocked(true); return }
    if (projectId && projects.some((p) => p.id === projectId)) return
    setProjectId(projects[0].id)
  }, [projects, projectId, contextProjectId])
  useEffect(() => { resetModuleScroll(); revealTab('.im-nav-tab[aria-selected="true"]') }, [tab, subs])

  const { kind, view } = useProjectScope(projectId)
  const setView = useScopeStore((s) => s.setView)
  const nav = useMemo(() => NAV.filter((n) => !n.only || view === 'all' || n.only === view), [view])
  useEffect(() => { if (!nav.some((n) => n.id === tab)) setTab('dashboard') }, [nav, tab, setTab])
  const todayOn = useExecutionStore((s) => !!(s.settingsByProject.get(projectId ?? '') as unknown as { flags?: { today?: boolean } } | undefined)?.flags?.today)
  const cur0 = useMemo(() => NAV.find((n) => n.id === tab)!, [tab])
  const cur = useMemo(() => (cur0.subs ? { ...cur0, subs: cur0.subs.filter((x) => x.id !== 'today' || todayOn) } : cur0), [cur0, todayOn]) // experimental views stay hidden until their flag is on
  const sub = cur.subs ? (subs[tab] ?? cur.subs[0].id) : ''
  useUrlBind('sub', sub, (v, loc) => setSubs((x) => { const t = (loc.tab || tab) as typeof tab, n = { ...x }; if (v) n[t] = v; else delete n[t]; return n }))
  const go = (t: ExTab, s?: string) => {
    // quality control (NCRs, findings, QC forms) is its own module now
    if (t === 'qc') { if (projectId) useProjectContextStore.getState().setProject(projectId); useModuleStore.getState().enterModule('weldqc', undefined, 'ncr'); return }
    setTab(t); if (s) setSubs((x) => ({ ...x, [t]: s })) }
  // something outside the module (the inbox) asked to show a report: switch to the page that shows it
  const focusTab = useExecutionStore((x) => (x.focusReportId ? x.focusTab : null))
  useEffect(() => { if (!focusTab) return; if (focusTab === 'delays') { setTab('reports'); setSubs((x) => ({ ...x, reports: 'delays' })); useExecutionStore.getState().setFocus(null) } else { setTab(focusTab); if (focusTab === 'daily') setSubs((x) => (x.daily === 'line' ? { ...x, daily: 'forms' } : x)) } }, [focusTab])
  const loading = !mdLoaded || !exLoaded
  const model = useExecutionModel(projectId)
  const badge = (id: ExTab): number => id === 'review' ? model.reports.filter((r) => r.status === 'submitted' || r.status === 'partially_approved').length : id === 'gaps' ? model.detected.filter((g) => g.kind !== 'form_missing').length : id === 'daily' ? model.reports.filter((r) => r.status === 'returned' || r.status === 'incomplete').length : 0

  const body = (pid: string) => {
    const p: P = { projectId: pid, sub, onGo: go }
    switch (tab) {
      case 'station': return <Station {...p} />
      case 'dashboard': return <Dashboard {...p} />
      case 'daily': return sub === 'designed' ? <Designed {...p} /> : sub === 'today' ? <Today {...p} /> : sub === 'line' ? <LineWork {...p} /> : <Daily {...p} />
      case 'review': return <Review {...p} />
      case 'progress': return <Progress {...p} />
      case 'outlook': return <Outlook {...p} />
      case 'plan': return <Plan {...p} />
      case 'assistant': return <Assistant {...p} />
      case 'reports': return <Reports {...p} />
      case 'gaps': return <Gaps {...p} />
      case 'qc': return null // moved to the quality-control module
      case 'welds': return <Welds {...p} />
      case 'photos': return <Photos {...p} />
      case 'settings': return <Settings {...p} />
    }
  }
  return (
    <div className="im-root fn-root mt-root ex-root" dir="rtl">
      <header className="im-head no-print">
        <div className="im-head-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <span className="im-logo" aria-hidden style={{ background: 'linear-gradient(135deg, #fb923c, #ea580c 70%, #9a3412)', boxShadow: '0 10px 22px -10px #ea580c, inset 0 1px 0 rgba(255,255,255,.35)' }}><HardHat size={22} /></span>
            <div style={{ minWidth: 0, lineHeight: 1.3 }}>
              <h1 className="im-head-title">مدیریت اجرا</h1>
              <p className="im-head-eyebrow">Execution Management</p>
            </div>
          </div>
          <div className="im-actions" style={{ minWidth: 0 }}>
            {projects.length > 0 && (locked
              ? <span className="im-select-pill" style={{ pointerEvents: 'none' }} title={projects.find((p) => p.id === projectId)?.officialName}>{projects.find((p) => p.id === projectId)?.officialName}</span>
              : <select className="im-select-pill" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)} aria-label="پروژه">{projects.map((p) => <option key={p.id} value={p.id}>{p.officialName}</option>)}</select>)}
            {projectId && kind === 'hybrid'
              ? <div className="im-seg ex-scope" role="radiogroup" aria-label="محدودهٔ اجرا">{scopeViews(kind).map((v: ScopeView) => <button key={v} role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} onClick={() => setView(projectId, v)}>{SCOPE_VIEW_FA[v]}</button>)}</div>
              : projectId && kind === 'compressor_station' && <span className="im-select-pill ex-scope-pill" title="نوع پروژه در شناسنامهٔ پروژه">{PROJECT_KIND_FA[kind]}</span>}
            <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} onGuide={() => setGuide((g) => !g)} guideActive={guide} />
          </div>
        </div>
        <NavScroller label="بخش‌های مدیریت اجرا"><nav className="im-nav" role="tablist" aria-label="بخش‌های مدیریت اجرا">
          {nav.map((n) => { const b = projectId ? badge(n.id) : 0; return (
            <button key={n.id} role="tab" aria-selected={tab === n.id} className="im-nav-tab" style={{ ['--c' as string]: n.color }} onClick={() => setTab(n.id)}>
              <n.icon size={15} aria-hidden />{n.label}{b > 0 && <span className="im-nav-count" aria-label={`${b} مورد`}>{b.toLocaleString('fa-IR')}</span>}
            </button>
          ) })}
        </nav></NavScroller>
      </header>

      <StorageErrorBanner />

      <main className="im-main" id="im-main">
        {loading ? (
          <div className="im-page" style={{ display: 'grid', gap: 12 }}>
            <div className="im-skeleton" style={{ height: 150, borderRadius: 22 }} />
            <div style={{ display: 'flex', justifyContent: 'center' }}><Loader2 size={20} className="animate-spin" style={{ color: 'var(--im-accent)' }} aria-label="در حال بارگذاری" /></div>
          </div>
        ) : !projectId ? (
          <div className="im-page"><div className="im-card im-empty">{projects.length === 0 ? 'ابتدا از «اطلاعات پایه» یک پروژه تعریف کنید.' : 'یک پروژه را از بالای صفحه انتخاب کنید.'}</div></div>
        ) : (
          <div className="im-page" key={`${tab}:${sub}:${projectId}`}>
            {cur.subs && (
              <div className="no-print" style={{ marginBottom: 14, overflowX: 'auto' }}>
                <div className="im-seg" role="tablist" aria-label="نماها">
                  {cur.subs.map((s) => <button key={s.id} role="tab" aria-selected={sub === s.id || sub.startsWith(`${s.id}-`)} className={sub === s.id || sub.startsWith(`${s.id}-`) ? 'on' : ''} onClick={() => setSubs((x) => ({ ...x, [tab]: s.id }))}>{s.label}</button>)}
                </div>
              </div>
            )}
            {tab === 'dashboard' && !locked && <PortfolioStrip current={projectId} onPick={setProjectId} />}
            <Suspense fallback={<div className="im-skeleton" style={{ height: 240 }} />}>{body(projectId)}</Suspense>
          </div>
        )}
      </main>
      {guide && <ExecutionGuide onClose={() => setGuide(false)} />}
    </div>
  )
}
