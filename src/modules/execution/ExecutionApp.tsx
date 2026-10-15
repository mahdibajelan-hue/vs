import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bot, CalendarRange, ClipboardList, Cpu, FileBarChart2, Gauge, HardHat, Inbox, ListTree, Loader2, Settings2, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import '../issues/issues.css'
import '../finance/finance-dashboard.css'
import '../material/material-control.css'
import './execution.css'
import { useExecutionStore } from './store/useExecutionStore'
import { useMaterialControlStore } from '../material/store/useMaterialControlStore'
import { useMaterialStore } from '../material/store/useMaterialStore'
import { useExecutionModel } from './lib/useExecutionModel'
import { PortfolioStrip } from './components/epc/PortfolioStrip'

export const EXECUTION_ACCENT = '#f97316'
export type ExTab = 'dashboard' | 'activities' | 'daily' | 'review' | 'progress' | 'productivity' | 'plan' | 'assistant' | 'reports' | 'gaps' | 'settings'
type Sub = { id: string; label: string }
const NAV: { id: ExTab; label: string; icon: LucideIcon; color: string; subs?: Sub[] }[] = [
  { id: 'dashboard', label: 'داشبورد', icon: Gauge, color: '#f97316' },
  { id: 'activities', label: 'فعالیت‌ها و فهرست‌بها', icon: ListTree, color: '#6366f1', subs: [{ id: 'activities', label: 'فعالیت‌های پروژه' }, { id: 'books', label: 'فهرست‌های بها' }, { id: 'baselines', label: 'نسخه‌های مبنا (مقدار و وزن)' }] },
  { id: 'daily', label: 'گزارش روزانه', icon: ClipboardList, color: '#0ea5e9', subs: [{ id: 'work', label: 'کارکرد روزانه' }, { id: 'forms', label: 'فرم‌های فنی (جوش، پوشش، …)' }] },
  { id: 'review', label: 'کارتابل بررسی', icon: Inbox, color: '#10b981' },
  { id: 'progress', label: 'پیشرفت فیزیکی', icon: TrendingUp, color: '#14b8a6' },
  { id: 'productivity', label: 'بهره‌وری و پیش‌بینی', icon: Cpu, color: '#8b5cf6', subs: [{ id: 'rates', label: 'بهره‌وری اکیپ‌ها' }, { id: 'forecast', label: 'پیش‌بینی فعالیت‌ها' }, { id: 'scenarios', label: 'سناریوهای جبرانی' }] },
  { id: 'plan', label: 'برنامهٔ کوتاه‌مدت و آمادگی', icon: CalendarRange, color: '#0ea5e9', subs: [{ id: 'lookahead', label: 'برنامهٔ سه‌هفته‌ای' }, { id: 'readiness', label: 'آمادگی فعالیت‌ها' }, { id: 'eng', label: 'مدارک مهندسی' }, { id: 'import', label: 'ورود برنامه از اکسل' }] },
  { id: 'assistant', label: 'دستیار هوشمند', icon: Bot, color: '#ec4899' },
  { id: 'reports', label: 'گزارش‌های دوره‌ای', icon: FileBarChart2, color: '#94a3b8', subs: [{ id: 'week', label: 'هفتگی' }, { id: 'month', label: 'ماهانه' }, { id: 'cum', label: 'تجمعی از ابتدا' }, { id: 'statement', label: 'صورت‌وضعیت کارکرد' }, { id: 'ledger', label: 'مغایرت اجرایی و صورت‌وضعیت' }, { id: 'mgmt-week', label: 'گزارش مدیریتی هفتگی' }, { id: 'mgmt-month', label: 'گزارش مدیریتی ماهانه' }, { id: 'delays', label: 'تأخیرات و کلیم' }] },
  { id: 'gaps', label: 'کامل‌بودن و کسری', icon: AlertTriangle, color: '#ef4444' },
  { id: 'settings', label: 'تنظیمات', icon: Settings2, color: '#64748b', subs: [{ id: 'roles', label: 'نقش‌ها و دسترسی' }, { id: 'rules', label: 'تقویم و قواعد' }, { id: 'forms', label: 'فرم‌ها و ماتریس تطبیق' }, { id: 'map', label: 'اتصال فرم فنی به فعالیت' }, { id: 'epc', label: 'کنترل EPC (سربرگ، کارفرما، تحفظ، بهره‌وری)' }] },
]

type P = { projectId: string; sub: string; onGo: (t: ExTab, s?: string) => void }
const L = <T extends Record<string, unknown>>(f: () => Promise<T>, k: keyof T) => lazy(() => f().then((m) => ({ default: m[k] as React.ComponentType<P> })))
const Dashboard = L(() => import('./pages/DashboardPage'), 'DashboardPage')
const Activities = L(() => import('./pages/ActivitiesPage'), 'ActivitiesPage')
const Daily = L(() => import('./pages/DailyPage'), 'DailyPage')
const Review = L(() => import('./pages/ReviewPage'), 'ReviewPage')
const Progress = L(() => import('./pages/ProgressPage'), 'ProgressPage')
const Productivity = L(() => import('./pages/ProductivityPage'), 'ProductivityPage')
const Assistant = L(() => import('./pages/AssistantPage'), 'AssistantPage')
const Plan = L(() => import('./pages/PlanPage'), 'PlanPage')
const Reports = L(() => import('./pages/ReportsRouter'), 'ReportsRouter')
const Gaps = L(() => import('./pages/GapsPage'), 'GapsPage')
const Settings = L(() => import('./pages/SettingsPage'), 'SettingsPage')

/** «مدیریت اجرا» — daily work reports on the price-list rows, row-by-row approval by the supervision, technical QC forms, weighted physical progress and automatic period reports. */
export function ExecutionApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const projects = useMasterDataStore((s) => s.projects)
  const mdLoaded = useMasterDataStore((s) => s.loaded)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const exLoaded = useExecutionStore((s) => s.loaded)
  const fetchEx = useExecutionStore((s) => s.fetchAll)
  const csLoaded = useMaterialControlStore((s) => s.loaded)
  const fetchControl = useMaterialControlStore((s) => s.fetchAll)
  const matLoaded = useMaterialStore((s) => s.loaded)
  const fetchMaterial = useMaterialStore((s) => s.fetchAll)
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const [tab, setTab] = useState<ExTab>('dashboard')
  const [subs, setSubs] = useState<Partial<Record<ExTab, string>>>({})
  const [projectId, setProjectId] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    if (!mdLoaded) fetchMasterData()
    if (!exLoaded) void fetchEx()
    if (!matLoaded) fetchMaterial()
    if (!csLoaded) void fetchControl() // shared lists (fronts, stations) and materials live in the material module
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!projects.length || projectId) return
    if (contextProjectId && projects.some((p) => p.id === contextProjectId)) { setProjectId(contextProjectId); setLocked(true) } else setProjectId(projects[0].id)
  }, [projects, projectId, contextProjectId])
  useEffect(() => { document.getElementById('im-main')?.scrollTo({ top: 0 }); document.querySelector('.im-nav-tab[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [tab, subs])

  const cur = useMemo(() => NAV.find((n) => n.id === tab)!, [tab])
  const sub = cur.subs ? (subs[tab] ?? cur.subs[0].id) : ''
  const go = (t: ExTab, s?: string) => { setTab(t); if (s) setSubs((x) => ({ ...x, [t]: s })) }
  // something outside the module (the inbox) asked to show a report: switch to the page that shows it
  const focusTab = useExecutionStore((x) => (x.focusReportId ? x.focusTab : null))
  useEffect(() => { if (!focusTab) return; if (focusTab === 'delays') { setTab('reports'); setSubs((x) => ({ ...x, reports: 'delays' })); useExecutionStore.getState().setFocus(null) } else setTab(focusTab) }, [focusTab])
  const loading = !mdLoaded || !exLoaded
  const model = useExecutionModel(projectId)
  const badge = (id: ExTab): number => id === 'review' ? model.reports.filter((r) => r.status === 'submitted' || r.status === 'partially_approved').length : id === 'gaps' ? model.detected.filter((g) => g.kind !== 'form_missing').length : id === 'daily' ? model.reports.filter((r) => r.status === 'returned' || r.status === 'incomplete').length : 0

  const body = (pid: string) => {
    const p: P = { projectId: pid, sub, onGo: go }
    switch (tab) {
      case 'dashboard': return <Dashboard {...p} />
      case 'activities': return <Activities {...p} />
      case 'daily': return <Daily {...p} />
      case 'review': return <Review {...p} />
      case 'progress': return <Progress {...p} />
      case 'productivity': return <Productivity {...p} />
      case 'plan': return <Plan {...p} />
      case 'assistant': return <Assistant {...p} />
      case 'reports': return <Reports {...p} />
      case 'gaps': return <Gaps {...p} />
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
              ? <span className="im-select-pill" style={{ pointerEvents: 'none' }}>{projects.find((p) => p.id === projectId)?.officialName}</span>
              : <select className="im-select-pill" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)} aria-label="پروژه">{projects.map((p) => <option key={p.id} value={p.id}>{p.officialName}</option>)}</select>)}
            <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
          </div>
        </div>
        <nav className="im-nav" role="tablist" aria-label="بخش‌های مدیریت اجرا">
          {NAV.map((n) => { const b = projectId ? badge(n.id) : 0; return (
            <button key={n.id} role="tab" aria-selected={tab === n.id} className="im-nav-tab" style={{ ['--c' as string]: n.color }} onClick={() => setTab(n.id)}>
              <n.icon size={15} aria-hidden />{n.label}{b > 0 && <span className="im-nav-count" aria-label={`${b} مورد`}>{b.toLocaleString('fa-IR')}</span>}
            </button>
          ) })}
        </nav>
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
                  {cur.subs.map((s) => <button key={s.id} role="tab" aria-selected={sub === s.id} className={sub === s.id ? 'on' : ''} onClick={() => setSubs((x) => ({ ...x, [tab]: s.id }))}>{s.label}</button>)}
                </div>
              </div>
            )}
            {tab === 'dashboard' && !locked && <PortfolioStrip current={projectId} onPick={setProjectId} />}
            <Suspense fallback={<div className="im-skeleton" style={{ height: 240 }} />}>{body(projectId)}</Suspense>
          </div>
        )}
      </main>
    </div>
  )
}
