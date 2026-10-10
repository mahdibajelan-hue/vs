import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Banknote, FileText, Gauge, Home, LineChart, Loader2, Receipt, Settings2, ShieldAlert, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import '../issues/issues.css'
import './finance-dashboard.css'
import { useFinanceStore } from './store/useFinanceStore'
import { useFinanceControlStore } from './store/useFinanceControlStore'
import { HubPage } from './pages/HubPage'

/** Accent used for fills inside the module (white text on it keeps ≥ 4:1 contrast). */
export const FINANCE_ACCENT = '#059669'

const L = <T extends Record<string, unknown>>(f: () => Promise<T>, k: keyof T) => lazy(() => f().then((m) => ({ default: m[k] as React.ComponentType<{ masterProjectId: string }> })))
const ContractsPage = L(() => import('./pages/ContractsPage'), 'ContractsPage')
const ChangesBridgePage = L(() => import('./pages/control/ChangesBridgePage'), 'ChangesBridgePage')
const GuaranteesPage = L(() => import('./pages/GuaranteesPage'), 'GuaranteesPage')
const ObligationsPage = L(() => import('./pages/control/ObligationsPage'), 'ObligationsPage')
const ClaimsPage = L(() => import('./pages/ClaimsPage'), 'ClaimsPage')
const RetentionPage = L(() => import('./pages/RetentionPage'), 'RetentionPage')
const PipelinePage = L(() => import('./pages/control/PipelinePage'), 'PipelinePage')
const PaymentCertificatesPage = L(() => import('./pages/PaymentCertificatesPage'), 'PaymentCertificatesPage')
const PaymentsRecordPage = L(() => import('./pages/PaymentsRecordPage'), 'PaymentsRecordPage')
const BudgetPage = L(() => import('./pages/BudgetPage'), 'BudgetPage')
const CostManagementPage = L(() => import('./pages/CostManagementPage'), 'CostManagementPage')
const LandBridgePage = L(() => import('./pages/control/LandBridgePage'), 'LandBridgePage')
const CashflowCurvesPage = L(() => import('./pages/control/CashflowCurvesPage'), 'CashflowCurvesPage')
const ExceptionsPage = L(() => import('./pages/control/ExceptionsPage'), 'ExceptionsPage')
const FinancialReportsPage = L(() => import('./pages/FinancialReportsPage'), 'FinancialReportsPage')
const ControlSettingsPage = lazy(() => import('./pages/control/ControlSettingsPage').then((m) => ({ default: m.ControlSettingsPage as React.ComponentType<{ masterProjectId: string | null }> })))
const MgmtDashboardPage = lazy(() => import('./pages/control/MgmtDashboardPage').then((m) => ({ default: m.MgmtDashboardPage })))
const FinancialDashboardPage = lazy(() => import('./pages/FinancialDashboardPage').then((m) => ({ default: m.FinancialDashboardPage })))
const CashFlowForecastPage = lazy(() => import('./pages/CashFlowForecastPage').then((m) => ({ default: m.CashFlowForecastPage })))

export type FinTab = 'home' | 'dashboard' | 'contracts' | 'billing' | 'budget' | 'cash' | 'attention' | 'admin'
type Sub = { id: string; label: string }
const NAV: { id: FinTab; label: string; icon: LucideIcon; color: string; subs?: Sub[]; project?: boolean }[] = [
  { id: 'home', label: 'خانه', icon: Home, color: '#10b981' },
  { id: 'dashboard', label: 'داشبورد', icon: Gauge, color: '#6366f1', subs: [{ id: 'mgmt', label: 'مدیریتی' }, { id: 'portfolio', label: 'سبد پروژه‌ها' }] },
  { id: 'contracts', label: 'قراردادها', icon: FileText, color: '#10b981', project: true, subs: [{ id: 'list', label: 'قراردادها' }, { id: 'changes', label: 'تغییرات و الحاقیه' }, { id: 'guarantees', label: 'ضمانت‌نامه' }, { id: 'obligations', label: 'پیش‌پرداخت و مفاصاحساب' }, { id: 'claims', label: 'ادعاها' }, { id: 'retention', label: 'حسن انجام کار' }] },
  { id: 'billing', label: 'صورت‌وضعیت و پرداخت', icon: Receipt, color: '#0ea5e9', project: true, subs: [{ id: 'pipeline', label: 'گردش' }, { id: 'certificates', label: 'صورت‌وضعیت‌ها' }, { id: 'payments', label: 'پرداخت‌ها' }] },
  { id: 'budget', label: 'بودجه و هزینه', icon: Wallet, color: '#f59e0b', project: true, subs: [{ id: 'budget', label: 'بودجه و ردیف‌ها' }, { id: 'cost', label: 'هزینه و پیش‌بینی' }, { id: 'land', label: 'تملک اراضی' }] },
  { id: 'cash', label: 'جریان نقدی', icon: LineChart, color: '#14b8a6', project: true, subs: [{ id: 'curves', label: 'منحنی‌ها' }, { id: 'monthly', label: 'برنامهٔ ریالی ماهانه (سبد)' }] },
  { id: 'attention', label: 'موارد نیازمند تصمیم', icon: ShieldAlert, color: '#ef4444', project: true },
  { id: 'admin', label: 'گزارش و تنظیمات', icon: Settings2, color: '#94a3b8', subs: [{ id: 'reports', label: 'گزارش‌ها' }, { id: 'settings', label: 'تنظیمات و سابقه' }] },
]

/** کنترل قراردادها و مالی — same shell as the risk and issue modules (im-*), eight sections, each with its own few sub-views. */
export function FinanceApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const projects = useMasterDataStore((s) => s.projects)
  const mdLoaded = useMasterDataStore((s) => s.loaded)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const financeLoaded = useFinanceStore((s) => s.loaded)
  const fetchFinance = useFinanceStore((s) => s.fetchAll)
  const controlLoaded = useFinanceControlStore((s) => s.loaded)
  const fetchControl = useFinanceControlStore((s) => s.fetchAll)
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const [tab, setTab] = useState<FinTab>('home')
  const [subs, setSubs] = useState<Partial<Record<FinTab, string>>>({})
  const [projectId, setProjectId] = useState<string | null>(null)

  useEffect(() => {
    if (!mdLoaded) fetchMasterData()
    if (!financeLoaded) fetchFinance()
    if (!controlLoaded) void fetchControl()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!projects.length || projectId) return
    setProjectId(contextProjectId && projects.some((p) => p.id === contextProjectId) ? contextProjectId : projects[0].id)
  }, [projects, projectId, contextProjectId])
  useEffect(() => { document.getElementById('im-main')?.scrollTo({ top: 0 }); document.querySelector('.im-nav-tab[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [tab, subs])

  const cur = useMemo(() => NAV.find((n) => n.id === tab)!, [tab])
  const sub = cur.subs ? (subs[tab] ?? cur.subs[0].id) : ''
  const go = (t: FinTab, s?: string) => { setTab(t); if (s) setSubs((x) => ({ ...x, [t]: s })) }
  const loading = !financeLoaded || !mdLoaded

  const body = (pid: string | null) => {
    if (cur.project && !pid) return <div className="im-page"><div className="im-card im-empty">{projects.length === 0 ? 'ابتدا از «اطلاعات پایه» یک پروژه تعریف کنید.' : 'یک پروژه را از بالای صفحه انتخاب کنید.'}</div></div>
    const p = pid as string
    switch (tab) {
      case 'home': return <HubPage onGo={go} />
      case 'dashboard': return sub === 'portfolio' ? <FinancialDashboardPage /> : <MgmtDashboardPage />
      case 'contracts': return sub === 'changes' ? <ChangesBridgePage masterProjectId={p} /> : sub === 'guarantees' ? <GuaranteesPage masterProjectId={p} /> : sub === 'obligations' ? <ObligationsPage masterProjectId={p} /> : sub === 'claims' ? <ClaimsPage masterProjectId={p} /> : sub === 'retention' ? <RetentionPage masterProjectId={p} /> : <ContractsPage masterProjectId={p} />
      case 'billing': return sub === 'certificates' ? <PaymentCertificatesPage masterProjectId={p} /> : sub === 'payments' ? <PaymentsRecordPage masterProjectId={p} /> : <PipelinePage masterProjectId={p} />
      case 'budget': return sub === 'cost' ? <CostManagementPage masterProjectId={p} /> : sub === 'land' ? <LandBridgePage masterProjectId={p} /> : <BudgetPage masterProjectId={p} />
      case 'cash': return sub === 'monthly' ? <CashFlowForecastPage /> : <CashflowCurvesPage masterProjectId={p} />
      case 'attention': return <ExceptionsPage masterProjectId={p} />
      case 'admin': return sub === 'settings' ? <ControlSettingsPage masterProjectId={pid} /> : pid ? <FinancialReportsPage masterProjectId={pid} /> : <div className="im-page"><div className="im-card im-empty">یک پروژه را انتخاب کنید.</div></div>
    }
  }

  return (
    <div className="im-root fn-root" dir="rtl">
      <header className="im-head no-print">
        <div className="im-head-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <span className="im-logo" aria-hidden style={{ background: 'linear-gradient(135deg, #10b981, #047857 70%, #0f766e)', boxShadow: '0 10px 22px -10px #059669, inset 0 1px 0 rgba(255,255,255,.35)' }}><Banknote size={22} /></span>
            <div style={{ minWidth: 0, lineHeight: 1.3 }}>
              <h1 className="im-head-title">کنترل قراردادها و مالی</h1>
              <p className="im-head-eyebrow">Contract &amp; Portfolio Finance Control</p>
            </div>
          </div>
          <div className="im-actions" style={{ minWidth: 0 }}>
            {projects.length > 0 && tab !== 'home' && (cur.project || (tab === 'admin' && sub === 'reports')) && (
              <select className="im-select-pill" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)} aria-label="پروژه">
                {projects.map((p) => <option key={p.id} value={p.id}>{p.officialName}</option>)}
              </select>
            )}
            <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
          </div>
        </div>
        <nav className="im-nav" role="tablist" aria-label="بخش‌های کنترل قراردادها و مالی">
          {NAV.map((n) => (
            <button key={n.id} role="tab" aria-selected={tab === n.id} className="im-nav-tab" style={{ ['--c' as string]: n.color }} onClick={() => setTab(n.id)}>
              <n.icon size={15} aria-hidden />{n.label}
            </button>
          ))}
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
        ) : (
          <div className="im-page" key={`${tab}:${sub}`}>
            {cur.subs && (
              <div className="no-print" style={{ marginBottom: 14, overflowX: 'auto' }}>
                <div className="im-seg" role="tablist" aria-label="نماها">
                  {cur.subs.map((s) => <button key={s.id} role="tab" aria-selected={sub === s.id} className={sub === s.id ? 'on' : ''} onClick={() => setSubs((x) => ({ ...x, [tab]: s.id }))}>{s.label}</button>)}
                </div>
              </div>
            )}
            <Suspense fallback={<div className="im-skeleton" style={{ height: 240 }} />}>{body(projectId)}</Suspense>
          </div>
        )}
      </main>
    </div>
  )
}
