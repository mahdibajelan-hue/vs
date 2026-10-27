import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Banknote, FileText, Gauge, LineChart, Loader2, Settings2, ShieldAlert, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import '../issues/issues.css'
import './finance-dashboard.css'
import { useFinanceStore } from './store/useFinanceStore'
import { useFinanceControlStore } from './store/useFinanceControlStore'
import { resetModuleScroll, revealTab } from '../../lib/revealTab'
import { useModuleStore } from '../../store/useModuleStore'
import { PortfolioViewButton } from '../../components/common/PortfolioViewButton'

/** Accent used for fills inside the module (white text on it keeps ≥ 4:1 contrast). */
export const FINANCE_ACCENT = '#059669'

const L = <T extends Record<string, unknown>>(f: () => Promise<T>, k: keyof T) => lazy(() => f().then((m) => ({ default: m[k] as React.ComponentType<{ masterProjectId: string }> })))
const ChangesBridgePage = L(() => import('./pages/control/ChangesBridgePage'), 'ChangesBridgePage')
const ObligationsPage = L(() => import('./pages/control/ObligationsPage'), 'ObligationsPage')
const BudgetPage = L(() => import('./pages/BudgetPage'), 'BudgetPage')
const CostManagementPage = L(() => import('./pages/CostManagementPage'), 'CostManagementPage')
const LandBridgePage = L(() => import('./pages/control/LandBridgePage'), 'LandBridgePage')
const ExceptionsPage = L(() => import('./pages/control/ExceptionsPage'), 'ExceptionsPage')
const ReportsCenter = lazy(() => import('./pages/v3/ReportsCenter').then((m) => ({ default: m.ReportsCenter })))
const ControlSettingsPage = lazy(() => import('./pages/control/ControlSettingsPage').then((m) => ({ default: m.ControlSettingsPage as React.ComponentType<{ masterProjectId: string | null }> })))
const ContractsManage = L(() => import('./pages/v3/ContractsManage'), 'ContractsManage')
const GuaranteesManage = L(() => import('./pages/v3/RegistersManage'), 'GuaranteesManage')
const ClaimsManage = L(() => import('./pages/v3/RegistersManage'), 'ClaimsManage')
const RetentionManage = L(() => import('./pages/v3/RegistersManage'), 'RetentionManage')
const DashboardPage = lazy(() => import('./pages/v2/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const ContractsRegister = lazy(() => import('./pages/v2/ContractsPage').then((m) => ({ default: m.ContractsRegister })))
const BudgetPlanPage = L(() => import('./pages/v2/BudgetPage'), 'BudgetPlanPage')
const CashPage = L(() => import('./pages/v2/CashPage'), 'CashPage')
const ContractDocsPage = lazy(() => import('./pages/v3/ContractDocsPage').then((m) => ({ default: m.ContractDocsPage })))
const CashFlowForecastPage = lazy(() => import('./pages/CashFlowForecastPage').then((m) => ({ default: m.CashFlowForecastPage })))

export type FinTab = 'dashboard' | 'contracts' | 'budget' | 'cash' | 'attention' | 'admin'
type Sub = { id: string; label: string }
const NAV: { id: FinTab; label: string; icon: LucideIcon; color: string; subs?: Sub[]; project?: boolean }[] = [
  { id: 'dashboard', label: 'داشبورد', icon: Gauge, color: '#6366f1' },
  { id: 'contracts', label: 'قراردادها', icon: FileText, color: '#10b981', project: true, subs: [{ id: 'list', label: 'فهرست و پرونده' }, { id: 'changes', label: 'تغییرات و الحاقیه' }, { id: 'guarantees', label: 'ضمانت‌نامه و مفاصاحساب' }, { id: 'claims', label: 'ادعا و حسن انجام کار' }, { id: 'manage', label: 'ثبت و ویرایش' }, { id: 'docs', label: 'متن قرارداد و پرسش' }] },
  { id: 'budget', label: 'بودجه و هزینه', icon: Wallet, color: '#f59e0b', project: true, subs: [{ id: 'plan', label: 'ردیف‌ها و مصرف' }, { id: 'cost', label: 'هزینهٔ نهایی' }, { id: 'land', label: 'تملک اراضی' }, { id: 'annual', label: 'بودجهٔ کل و سالانه' }] },
  { id: 'cash', label: 'نقدینگی', icon: LineChart, color: '#14b8a6', project: true, subs: [{ id: 'project', label: 'پروژه: کارفرما و پیمانکار' }, { id: 'portfolio', label: 'سبد پروژه‌ها' }] },
  { id: 'attention', label: 'نیازمند تصمیم', icon: ShieldAlert, color: '#ef4444', project: true },
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
  // entry from the portfolio view: 'tab' or 'tab:sub' (e.g. 'cash:portfolio')
  const [entry] = useState(() => { const [t, sb] = (useModuleStore.getState().takeEntryTab() ?? '').split(':'); return NAV.some((n) => n.id === t) ? { tab: t as FinTab, sub: sb } : null })
  // opened inside one project (from the radar): portfolio-wide views are offered through «دیدن در سطح پرتفولیو» instead
  const [inProject] = useState(() => !!useProjectContextStore.getState().projectId)
  const [tab, setTab] = useState<FinTab>(entry?.tab ?? 'dashboard')
  const [subs, setSubs] = useState<Partial<Record<FinTab, string>>>(entry?.sub ? { [entry.tab]: entry.sub } : {})
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
  useEffect(() => { resetModuleScroll(); revealTab('.im-nav-tab[aria-selected="true"]') }, [tab, subs])

  const cur = useMemo(() => {
    const n = NAV.find((x) => x.id === tab)!
    return inProject && n.subs ? { ...n, subs: n.subs.filter((x) => x.id !== 'portfolio') } : n
  }, [tab, inProject])
  const sub = cur.subs ? (cur.subs.some((x) => x.id === subs[tab]) ? subs[tab]! : cur.subs[0].id) : ''
  const go = (t: FinTab, s?: string) => { setTab(t); if (s) setSubs((x) => ({ ...x, [t]: s })) }
  const loading = !financeLoaded || !mdLoaded

  const body = (pid: string | null) => {
    if (tab === 'dashboard') return <DashboardPage projectId={pid} onProject={setProjectId} onGo={go} />
    if (cur.project && !pid) return <div className="im-card im-empty">{projects.length === 0 ? 'ابتدا از «اطلاعات پایه» یک پروژه تعریف کنید.' : 'یک پروژه را از بالای صفحه انتخاب کنید.'}</div>
    const p = pid as string
    switch (tab) {
      case 'contracts': return sub === 'docs' ? <ContractDocsPage masterProjectId={p} /> : sub === 'changes' ? <ChangesBridgePage masterProjectId={p} /> : sub === 'guarantees' ? <><GuaranteesManage masterProjectId={p} /><div style={{ height: 16 }} /><ObligationsPage masterProjectId={p} /></> : sub === 'claims' ? <><ClaimsManage masterProjectId={p} /><div style={{ height: 16 }} /><RetentionManage masterProjectId={p} /></> : sub === 'manage' ? <ContractsManage masterProjectId={p} /> : <ContractsRegister masterProjectId={p} onGo={go} />
      case 'budget': return sub === 'cost' ? <CostManagementPage masterProjectId={p} /> : sub === 'land' ? <LandBridgePage masterProjectId={p} /> : sub === 'annual' ? <BudgetPage masterProjectId={p} /> : <BudgetPlanPage masterProjectId={p} />
      case 'cash': return sub === 'portfolio' ? <CashFlowForecastPage /> : <CashPage masterProjectId={p} />
      case 'attention': return <ExceptionsPage masterProjectId={p} />
      case 'admin': return sub === 'settings' ? <ControlSettingsPage masterProjectId={pid} /> : pid ? <ReportsCenter masterProjectId={pid} only={['consumption', 'growth', 'guarantees', 'claims']} /> : <div className="im-card im-empty">یک پروژه را انتخاب کنید.</div>
      default: return null
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
            {projects.length > 0 && (cur.project || tab === 'dashboard' || (tab === 'admin' && sub === 'reports')) && (
              <select className="im-select-pill" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)} aria-label="پروژه">
                {projects.map((p) => <option key={p.id} value={p.id}>{p.officialName}</option>)}
              </select>
            )}
            {inProject && <PortfolioViewButton module="finance" tab="cash:portfolio" />}
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
