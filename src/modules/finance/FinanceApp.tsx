import { useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  Bell,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  ClipboardList,
  FileText,
  FolderKanban,
  Home,
  LayoutDashboard,
  LineChart,
  Loader2,
  Menu,
  Moon,
  Receipt,
  Settings,
  ShieldCheck,
  Sun,
  Wallet,
  X,
} from 'lucide-react'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useFinanceStore } from './store/useFinanceStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { SignOutButton } from '../../components/Auth/SignOutButton'
import { expiringGuarantees, paymentAgingDays } from './lib/financeCalc'
import { todayJalali, JALALI_MONTHS } from '../../lib/jalali'
import './finance-dashboard.css'
import { BudgetPage } from './pages/BudgetPage'
import { ContractsPage } from './pages/ContractsPage'
import { PaymentCertificatesPage } from './pages/PaymentCertificatesPage'
import { CostManagementPage } from './pages/CostManagementPage'
import { FinancialReportsPage } from './pages/FinancialReportsPage'
import { FinancialDashboardPage } from './pages/FinancialDashboardPage'
import { CashFlowForecastPage } from './pages/CashFlowForecastPage'
import { PortfoliosBrowsePage } from './pages/PortfoliosBrowsePage'
import { ProgramsBrowsePage } from './pages/ProgramsBrowsePage'
import { ProjectsBrowsePage } from './pages/ProjectsBrowsePage'
import { PaymentsRecordPage } from './pages/PaymentsRecordPage'
import { GuaranteesPage } from './pages/GuaranteesPage'

export const FINANCE_ACCENT = '#10b981'

type Tab =
  | 'dashboard'
  | 'portfolios'
  | 'programs'
  | 'projects'
  | 'contracts'
  | 'certificates'
  | 'payments'
  | 'budget'
  | 'cost'
  | 'cashflow'
  | 'guarantees'
  | 'reports'
  | 'settings'

const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'داشبورد', icon: LayoutDashboard },
  { id: 'portfolios', label: 'پرتفولیو', icon: Building2 },
  { id: 'programs', label: 'طرح‌ها', icon: Briefcase },
  { id: 'projects', label: 'پروژه‌ها', icon: FolderKanban },
  { id: 'contracts', label: 'قراردادها', icon: FileText },
  { id: 'certificates', label: 'صورت‌وضعیت‌ها', icon: Receipt },
  { id: 'payments', label: 'پرداخت‌ها', icon: Wallet },
  { id: 'budget', label: 'بودجه', icon: Banknote },
  { id: 'cost', label: 'مدیریت هزینه', icon: Calculator },
  { id: 'cashflow', label: 'جریان نقدینگی', icon: LineChart },
  { id: 'guarantees', label: 'ضمانت‌نامه‌ها', icon: ShieldCheck },
  { id: 'reports', label: 'گزارش‌ها', icon: ClipboardList },
  { id: 'settings', label: 'تنظیمات', icon: Settings },
]

/** Tabs that operate on a single selected project and need the project dropdown in the topbar. */
const PROJECT_SCOPED_TABS = new Set<Tab>(['contracts', 'certificates', 'payments', 'budget', 'cost', 'reports', 'guarantees'])

const PAGE_META: Record<Tab, { title: string; subtitle: string }> = {
  dashboard: { title: 'داشبورد مدیریت مالی', subtitle: 'نمای کلی سبد پروژه‌ها' },
  portfolios: { title: 'پرتفولیوها', subtitle: 'فهرست و وضعیت مالی پرتفولیوها' },
  programs: { title: 'طرح‌ها', subtitle: 'فهرست و وضعیت مالی طرح‌ها' },
  projects: { title: 'پروژه‌ها', subtitle: 'فهرست و وضعیت مالی پروژه‌ها' },
  contracts: { title: 'قراردادها و تعهدات مالی', subtitle: 'مدیریت قراردادها و ضمانت‌نامه‌های هر پروژه' },
  certificates: { title: 'صورت‌وضعیت‌های پرداخت', subtitle: 'کارکرد و تعدیل' },
  payments: { title: 'سوابق پرداخت', subtitle: 'ثبت و پیگیری پرداخت‌های انجام‌شده' },
  budget: { title: 'بودجه', subtitle: 'بودجه کل و سالانه پروژه' },
  cost: { title: 'مدیریت هزینه', subtitle: 'هزینه واقعی، متعهدشده و پیش‌بینی' },
  cashflow: { title: 'جریان نقدینگی و پیش‌بینی', subtitle: 'برنامه، واقعی و پیش‌بینی نقدینگی' },
  guarantees: { title: 'ضمانت‌نامه‌ها', subtitle: 'فهرست و پیگیری ضمانت‌نامه‌های دریافتی' },
  reports: { title: 'گزارش‌های مالی', subtitle: 'گزارش تفکیکی صورت‌وضعیت‌ها' },
  settings: { title: 'تنظیمات', subtitle: '' },
}

const FIN_THEME_KEY = 'rasta-finance-theme'

/**
 * Financial Management — owner-side budget/contract/payment control. Deliberately not
 * accounting: no general ledger, no P&L, no contractor internal cost (see schema.sql section 19).
 */
export function FinanceApp({ onExitToHub }: { onExitToHub: () => void }) {
  const projects = useMasterDataStore((s) => s.projects)
  const masterDataLoaded = useMasterDataStore((s) => s.loaded)
  const masterDataLoading = useMasterDataStore((s) => s.loading)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const financeLoaded = useFinanceStore((s) => s.loaded)
  const fetchFinance = useFinanceStore((s) => s.fetchAll)
  const certificates = useFinanceStore((s) => s.certificates)
  const guarantees = useFinanceStore((s) => s.guarantees)
  const profile = useAuthStore((s) => s.profile)

  const [projectId, setProjectId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [finLight, setFinLight] = useState(() => localStorage.getItem(FIN_THEME_KEY) === 'light')

  useEffect(() => {
    if (!masterDataLoaded) fetchMasterData()
    if (!financeLoaded) fetchFinance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (projects.length > 0 && !projectId) setProjectId(projects[0].id)
  }, [projects, projectId])

  const toggleFinTheme = () => {
    const next = !finLight
    setFinLight(next)
    localStorage.setItem(FIN_THEME_KEY, next ? 'light' : 'dark')
    // Also flips the app-wide token set (data-theme) so any not-yet-restyled piece of this
    // module (modals, shared components) still tracks light/dark consistently.
    document.documentElement.setAttribute('data-theme', next ? 'light' : 'dark')
  }

  const jy = todayJalali().jy
  const notificationCount = useMemo(() => {
    const expiring = expiringGuarantees(guarantees).length
    const overdue = certificates.filter((c) => (paymentAgingDays(c) ?? 0) > 30).length
    return expiring + overdue
  }, [guarantees, certificates])

  if ((masterDataLoading && !masterDataLoaded) || (!financeLoaded && !masterDataLoaded)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: FINANCE_ACCENT }} />
      </div>
    )
  }

  const meta = PAGE_META[tab]

  return (
    <div className={`fin-shell flex h-screen w-screen overflow-hidden ${finLight ? 'fin-light' : ''}`}>
      {mobileNavOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileNavOpen(false)} />}

      <aside
        className={`fixed inset-y-0 z-50 flex w-64 shrink-0 flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${mobileNavOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}
        style={{ background: 'var(--fin-sidebar-bg)', borderInlineStart: '1px solid var(--fin-sidebar-border)' }}
      >
        <div className="flex items-center gap-2.5 px-4 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `${FINANCE_ACCENT}26` }}>
            <Banknote size={18} style={{ color: FINANCE_ACCENT }} />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-extrabold text-white">مدیریت مالی پروژه</p>
            <p className="truncate text-[10px]" style={{ color: 'var(--fin-nav-text-muted)' }}>
              سیستم مدیریت پروژه RASTA
            </p>
          </div>
          <button onClick={() => setMobileNavOpen(false)} className="mr-auto text-white lg:hidden">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setTab(id)
                setMobileNavOpen(false)
              }}
              className={`fin-nav-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] font-medium ${tab === id ? 'is-active' : ''}`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        <div className="border-t px-4 py-3.5" style={{ borderColor: 'var(--fin-sidebar-border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-white">{profile?.fullName?.slice(0, 1) ?? '?'}</div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[11.5px] font-bold text-white">{profile?.fullName || 'کاربر'}</p>
              <p className="truncate text-[10px]" style={{ color: 'var(--fin-nav-text-muted)' }}>
                {profile?.positionTitle || '—'}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={onExitToHub} className="fin-nav-item flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px]">
              <Home size={12} /> ماژول‌ها
            </button>
            <SignOutButton className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-400/25 py-1.5 text-[11px] text-red-300 hover:bg-red-500/10" />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ background: 'var(--fin-topbar-bg)', backdropFilter: 'blur(10px)' }}>
          <div className="min-w-0">
            <p className="truncate text-[11px]" style={{ color: 'var(--fin-nav-text-muted)' }}>
              {meta.subtitle}
            </p>
            <h1 className="truncate text-base font-extrabold text-white">{meta.title}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {PROJECT_SCOPED_TABS.has(tab) && (
              <select
                value={projectId ?? ''}
                onChange={(e) => setProjectId(e.target.value || null)}
                className="fin-input w-40"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', borderColor: 'rgba(255,255,255,0.14)' }}
              >
                <option value="">پروژه‌ای انتخاب کنید</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id} style={{ color: '#0f172a' }}>
                    {p.officialName}
                  </option>
                ))}
              </select>
            )}
            <span className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] sm:flex" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--fin-nav-text)' }}>
              <Calendar size={12} /> سال مالی {jy.toLocaleString('fa-IR')}
            </span>
            <span className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] md:flex" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--fin-nav-text-muted)' }}>
              <Calendar size={12} /> آخرین به‌روزرسانی: {jy.toLocaleString('fa-IR')}/{String(todayJalali().jm).padStart(2, '0')}/{String(todayJalali().jd).padStart(2, '0')} (
              {JALALI_MONTHS[todayJalali().jm - 1]})
            </span>
            <button
              onClick={toggleFinTheme}
              title={finLight ? 'حالت تاریک' : 'حالت روشن'}
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--fin-nav-text)' }}
            >
              {finLight ? <Moon size={14} /> : <Sun size={14} />}
            </button>
            <button className="relative flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--fin-nav-text)' }} title="اعلان‌ها">
              <Bell size={14} />
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {notificationCount.toLocaleString('fa-IR')}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('settings')}
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--fin-nav-text)' }}
              title="تنظیمات"
            >
              <Settings size={14} />
            </button>
            <button onClick={() => setMobileNavOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-lg text-white lg:hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <Menu size={16} />
            </button>
          </div>
        </header>

        <StorageErrorBanner />

        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
          {tab === 'cashflow' ? (
            <CashFlowForecastPage />
          ) : tab === 'dashboard' ? (
            <FinancialDashboardPage />
          ) : tab === 'portfolios' ? (
            <PortfoliosBrowsePage />
          ) : tab === 'programs' ? (
            <ProgramsBrowsePage />
          ) : tab === 'projects' ? (
            <ProjectsBrowsePage />
          ) : tab === 'settings' ? (
            <div className="fin-card p-8 text-center text-sm fin-text-muted">تنظیمات این ماژول به‌زودی اضافه می‌شود.</div>
          ) : !projectId ? (
            <div className="fin-card flex h-40 items-center justify-center text-sm fin-text-muted">
              {projects.length === 0 ? 'ابتدا از بخش داده پایه یک پروژه تعریف کنید' : 'یک پروژه را از بالا انتخاب کنید'}
            </div>
          ) : tab === 'budget' ? (
            <BudgetPage masterProjectId={projectId} />
          ) : tab === 'contracts' ? (
            <ContractsPage masterProjectId={projectId} />
          ) : tab === 'certificates' ? (
            <PaymentCertificatesPage masterProjectId={projectId} />
          ) : tab === 'payments' ? (
            <PaymentsRecordPage masterProjectId={projectId} />
          ) : tab === 'guarantees' ? (
            <GuaranteesPage masterProjectId={projectId} />
          ) : tab === 'cost' ? (
            <CostManagementPage masterProjectId={projectId} />
          ) : (
            <FinancialReportsPage masterProjectId={projectId} />
          )}
        </div>
      </div>
    </div>
  )
}
