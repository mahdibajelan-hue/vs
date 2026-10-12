import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Compass, ListChecks, Scale, Gauge, GitCompareArrows, Loader2, Package, PackageCheck, Settings2, ShieldAlert, ShoppingCart, Warehouse, Flame, FileBarChart2, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import '../issues/issues.css'
import '../finance/finance-dashboard.css'
import './material-control.css'
import { useMaterialStore } from './store/useMaterialStore'
import { useMaterialControlStore } from './store/useMaterialControlStore'
import { useMaterialModel } from './lib/control/useMaterialModel'
import { Term } from './components/control/Term'
import { useMyTasks } from './lib/control/useMyTasks'
import { GuideWizard, HelpBox, shouldAutoGuide } from './components/control/GuideKit'

export const MATERIAL_ACCENT = '#f59e0b'

export type MatTab = 'dashboard' | 'myTasks' | 'bank' | 'mto' | 'discrepancy' | 'packages' | 'progress' | 'stock' | 'consumption' | 'balance' | 'reports' | 'settings'
type Sub = { id: string; label: string; term?: string }
const NAV: { id: MatTab; label: string; icon: LucideIcon; color: string; subs?: Sub[] }[] = [
  { id: 'dashboard', label: 'داشبورد', icon: Gauge, color: '#f59e0b' },
  { id: 'myTasks', label: 'کارهای من', icon: ListChecks, color: '#38bdf8' },
  { id: 'bank', label: 'بانک متریال', icon: Package, color: '#10b981' },
  { id: 'mto', label: 'کنترل MTO', icon: GitCompareArrows, color: '#6366f1', subs: [{ id: 'compare', label: 'پیمان در برابر طراحی' }, { id: 'changes', label: 'تغییرات مقدار و قیمت' }] },
  { id: 'discrepancy', label: 'تطبیق و مغایرت‌ها', icon: ShieldAlert, color: '#ef4444' },
  { id: 'packages', label: 'بسته‌های خرید', icon: ShoppingCart, color: '#0ea5e9', subs: [{ id: 'packages', label: 'بسته‌ها و مراحل' }, { id: 'orders', label: 'درخواست خرید و سفارش' }, { id: 'factory', label: 'ساخت و بازرسی' }, { id: 'shipping', label: 'حواله و حمل' }] },
  { id: 'progress', label: 'پیشرفت تأمین', icon: TrendingUp, color: '#14b8a6', subs: [{ id: 'overview', label: 'پیشرفت وزنی' }, { id: 'inbox', label: 'کارتابل تأیید' }, { id: 'late', label: 'مراحل عقب‌افتاده' }] },
  { id: 'stock', label: 'موجودی و انبار', icon: Warehouse, color: '#a855f7', subs: [{ id: 'stock', label: 'موجودی', term: 'stock_view' }, { id: 'locations', label: 'به‌تفکیک انبار' }, { id: 'shortage', label: 'کسری', term: 'shortage' }, { id: 'receiving', label: 'رسید و بازرسی ورودی', term: 'receipt' }, { id: 'allocation', label: 'تخصیص (رزرو) به جبهه', term: 'allocation' }, { id: 'vouchers', label: 'حواله انبار', term: 'requisition' }] },
  { id: 'consumption', label: 'مصرف', icon: Flame, color: '#f97316', subs: [{ id: 'usage', label: 'مصرف واقعی در برابر مبنا', term: 'deviation' }, { id: 'norms', label: 'مبنای مصرف', term: 'norm' }, { id: 'weld', label: 'جدول مصرف سرجوش', term: 'weld_table' }] },
  { id: 'balance', label: 'بالانس', icon: Scale, color: '#22c55e' },
  { id: 'reports', label: 'گزارش‌ها', icon: FileBarChart2, color: '#94a3b8' },
  { id: 'settings', label: 'تنظیمات', icon: Settings2, color: '#64748b', subs: [{ id: 'roles', label: 'نقش‌ها و دسترسی' }, { id: 'lists', label: 'فهرست‌های پایه' }, { id: 'catalog', label: 'گروه‌ها و واحدها' }, { id: 'stages', label: 'مراحل و وزن‌ها' }, { id: 'rules', label: 'آستانه‌ها و اولویت' }, { id: 'audit', label: 'سابقه' }] },
]

type P = { projectId: string; sub: string; onGo: (t: MatTab, s?: string) => void }
const L = <T extends Record<string, unknown>>(f: () => Promise<T>, k: keyof T) => lazy(() => f().then((m) => ({ default: m[k] as React.ComponentType<P> })))
const MyTasks = L(() => import('./pages/control/MyTasksPage'), 'MyTasksPage')
const Dashboard = L(() => import('./pages/control/DashboardPage'), 'DashboardPage')
const Bank = L(() => import('./pages/control/BankPage'), 'BankPage')
const Mto = L(() => import('./pages/control/MtoPage'), 'MtoPage')
const Discrepancy = L(() => import('./pages/control/DiscrepancyPage'), 'DiscrepancyPage')
const Packages = L(() => import('./pages/control/PackagesPage'), 'PackagesPage')
const Progress = L(() => import('./pages/control/ProgressPage'), 'ProgressPage')
const Stock = L(() => import('./pages/control/StockPage'), 'StockPage')
const Consumption = L(() => import('./pages/control/ConsumptionPage'), 'ConsumptionPage')
const Weld = L(() => import('./pages/control/WeldTablesPage'), 'WeldTablesPage')
const Balance = L(() => import('./pages/control/BalancePage'), 'BalancePage')
const Reports = L(() => import('./pages/control/ReportsPage'), 'ReportsPage')
const Settings = L(() => import('./pages/control/SettingsPage'), 'SettingsPage')
const Orders = L(() => import('./pages/control/SupplyChainPages'), 'OrdersPage')
const Factory = L(() => import('./pages/control/SupplyChainPages'), 'FactoryPage')
const Shipping = L(() => import('./pages/control/SupplyChainPages'), 'ShippingPage')
const Requisitions = L(() => import('./pages/control/VoucherPage'), 'VoucherPage')
const Allocation = L(() => import('./pages/control/SupplyChainPages'), 'AllocationsPage')

/** «کنترل و پایش متریال» — same shell and design system as the other project-management modules; eleven sections, each with its few sub-views. */
export function MaterialApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const projects = useMasterDataStore((s) => s.projects)
  const mdLoaded = useMasterDataStore((s) => s.loaded)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const matLoaded = useMaterialStore((s) => s.loaded)
  const fetchMaterial = useMaterialStore((s) => s.fetchAll)
  const csLoaded = useMaterialControlStore((s) => s.loaded)
  const fetchControl = useMaterialControlStore((s) => s.fetchAll)
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const [tab, setTab] = useState<MatTab>('dashboard')
  const [subs, setSubs] = useState<Partial<Record<MatTab, string>>>({})
  const [projectId, setProjectId] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [guide, setGuide] = useState(false)

  useEffect(() => {
    if (!mdLoaded) fetchMasterData()
    if (!matLoaded) fetchMaterial()
    if (!csLoaded) void fetchControl()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!projects.length || projectId) return
    if (contextProjectId && projects.some((p) => p.id === contextProjectId)) { setProjectId(contextProjectId); setLocked(true) } else setProjectId(projects[0].id)
  }, [projects, projectId, contextProjectId])
  useEffect(() => { document.getElementById('im-main')?.scrollTo({ top: 0 }); document.querySelector('.im-nav-tab[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [tab, subs])

  const cur = useMemo(() => NAV.find((n) => n.id === tab)!, [tab])
  const sub = cur.subs ? (subs[tab] ?? cur.subs[0].id) : ''
  const go = (t: MatTab, s?: string) => { setTab(t); if (s) setSubs((x) => ({ ...x, [t]: s })) }
  const loading = !matLoaded || !mdLoaded || !csLoaded
  const model = useMaterialModel(projectId)
  const myTasks = useMyTasks(model, projectId)
  useEffect(() => { if (!loading && projectId && model.packages.length === 0 && model.materials.length === 0 && shouldAutoGuide(projectId)) setGuide(true) }, [loading, projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const goStr = (t: string, sub?: string) => go(t as MatTab, sub)
  const badge = (id: MatTab): number => (id === 'myTasks' ? myTasks.length : id === 'discrepancy' ? model.discrepancies.filter((d) => d.status === 'open' || d.status === 'in_review').length : id === 'progress' ? model.stages.filter((s) => s.applicable && (s.status === 'submitted' || s.status === 'reviewed')).length : 0)

  const body = (pid: string) => {
    const p: P = { projectId: pid, sub, onGo: go }
    switch (tab) {
      case 'dashboard': return <Dashboard {...p} />
      case 'myTasks': return <MyTasks {...p} />
      case 'bank': return <Bank {...p} />
      case 'mto': return <Mto {...p} />
      case 'discrepancy': return <Discrepancy {...p} />
      case 'packages': return sub === 'orders' ? <Orders {...p} /> : sub === 'factory' ? <Factory {...p} /> : sub === 'shipping' ? <Shipping {...p} /> : <Packages {...p} />
      case 'progress': return <Progress {...p} />
      case 'stock': return sub === 'allocation' ? <Allocation {...p} /> : sub === 'vouchers' ? <Requisitions {...p} /> : <Stock {...p} />
      case 'consumption': return sub === 'weld' ? <Weld {...p} /> : <Consumption {...p} />
      case 'balance': return <Balance {...p} />
      case 'reports': return <Reports {...p} />
      case 'settings': return <Settings {...p} />
    }
  }
  return (
    <div className="im-root fn-root mt-root" dir="rtl">
      <header className="im-head no-print">
        <div className="im-head-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <span className="im-logo" aria-hidden style={{ background: 'linear-gradient(135deg, #f59e0b, #b45309 70%, #92400e)', boxShadow: '0 10px 22px -10px #d97706, inset 0 1px 0 rgba(255,255,255,.35)' }}><PackageCheck size={22} /></span>
            <div style={{ minWidth: 0, lineHeight: 1.3 }}>
              <h1 className="im-head-title">کنترل و پایش متریال</h1>
              <p className="im-head-eyebrow">Material Control &amp; Supply Monitoring</p>
            </div>
          </div>
          <div className="im-actions" style={{ minWidth: 0 }}>
            {projects.length > 0 && (locked
              ? <span className="im-select-pill" style={{ pointerEvents: 'none' }}>{projects.find((p) => p.id === projectId)?.officialName}</span>
              : <select className="im-select-pill" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)} aria-label="پروژه">{projects.map((p) => <option key={p.id} value={p.id}>{p.officialName}</option>)}</select>)}
            {projectId && <button className="im-btn im-btn-sm mt-guide-btn" onClick={() => setGuide(true)} aria-label="راهنمای گام‌به‌گام"><Compass size={14} /> <span>راهنمای مراحل</span></button>}
            <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
          </div>
        </div>
        <nav className="im-nav" role="tablist" aria-label="بخش‌های کنترل و پایش متریال">
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
            <div className="im-tiles">{Array.from({ length: 6 }, (_, k) => <div key={k} className="im-skeleton" style={{ height: 96, borderRadius: 18 }} />)}</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}><Loader2 size={20} className="animate-spin" style={{ color: 'var(--im-accent)' }} aria-label="در حال بارگذاری" /></div>
          </div>
        ) : !projectId ? (
          <div className="im-page"><div className="im-card im-empty">{projects.length === 0 ? 'ابتدا از «اطلاعات پایه» یک پروژه تعریف کنید.' : 'یک پروژه را از بالای صفحه انتخاب کنید.'}</div></div>
        ) : (
          <div className="im-page" key={`${tab}:${sub}:${projectId}`}>
            {cur.subs && (
              <div className="no-print" style={{ marginBottom: 14, overflowX: 'auto' }}>
                <div className="im-seg" role="tablist" aria-label="نماها">
                  {cur.subs.map((s) => <button key={s.id} role="tab" aria-selected={sub === s.id} className={sub === s.id ? 'on' : ''} onClick={() => setSubs((x) => ({ ...x, [tab]: s.id }))}>{s.term ? <Term k={s.term}>{s.label}</Term> : s.label}</button>)}
                </div>
              </div>
            )}
            <HelpBox tab={tab} sub={sub} onGo={goStr} />
            <Suspense fallback={<div className="im-skeleton" style={{ height: 240 }} />}>{body(projectId)}</Suspense>
          </div>
        )}
      </main>
      {guide && projectId && <GuideWizard model={model} projectId={projectId} onGo={goStr} onClose={() => setGuide(false)} />}
    </div>
  )
}
