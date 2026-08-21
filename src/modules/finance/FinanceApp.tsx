import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  Bell,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  ClipboardList,
  FileText,
  FileWarning,
  FolderKanban,
  Info,
  Landmark,
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
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { buildFinanceNotifications, type FinNotification } from './lib/financeNotifications'
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
import { ClaimsPage } from './pages/ClaimsPage'
import { RetentionPage } from './pages/RetentionPage'

/** Signature brass/ledger accent — see finance-dashboard.css for the full "EPC ledger control tower" token system. */
export const FINANCE_ACCENT = '#c9a654'

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
  | 'claims'
  | 'retention'
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
  { id: 'claims', label: 'کلایم پیمانکار', icon: FileWarning },
  { id: 'retention', label: 'حسن انجام کار', icon: Landmark },
  { id: 'reports', label: 'گزارش‌ها', icon: ClipboardList },
  { id: 'settings', label: 'تنظیمات', icon: Settings },
]

/** Tabs that operate on a single selected project and need the project dropdown in the topbar. */
const PROJECT_SCOPED_TABS = new Set<Tab>(['contracts', 'certificates', 'payments', 'budget', 'cost', 'reports', 'guarantees', 'claims', 'retention'])

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
  claims: { title: 'کلایم پیمانکار', subtitle: 'ثبت و پیگیری ادعاهای پیمانکار' },
  retention: { title: 'حسن انجام کار', subtitle: 'بدهی و برنامه آزادسازی حسن انجام کار' },
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
  const contracts = useFinanceStore((s) => s.contracts)
  const certificates = useFinanceStore((s) => s.certificates)
  const guarantees = useFinanceStore((s) => s.guarantees)
  const claims = useFinanceStore((s) => s.claims)
  const retentionReleases = useFinanceStore((s) => s.retentionReleases)
  const profile = useAuthStore((s) => s.profile)

  const [projectId, setProjectId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
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
  const notifications = useMemo(
    () => buildFinanceNotifications(contracts, certificates, guarantees, claims, retentionReleases),
    [contracts, certificates, guarantees, claims, retentionReleases],
  )

  const openNotification = (n: FinNotification) => {
    setTab(n.tab)
    if (n.masterProjectId) setProjectId(n.masterProjectId)
    setNotifOpen(false)
  }

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
        <div className="flex items-center gap-3 px-4 py-5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ border: `1.5px solid ${FINANCE_ACCENT}`, boxShadow: `inset 0 0 0 3px ${FINANCE_ACCENT}22` }}
          >
            <Banknote size={16} style={{ color: FINANCE_ACCENT }} />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-extrabold text-white">مدیریت مالی پروژه</p>
            <p className="truncate text-[9.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--fin-nav-text-muted)', fontFamily: 'var(--font-mono)' }} dir="ltr">
              RASTA · Ledger
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
          <div className="mt-3">
            <ModuleHeaderActions onExitToHub={onExitToHub} />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ background: 'var(--fin-topbar-bg)', backdropFilter: 'blur(10px)' }}>
          <div className="min-w-0">
            <p className="truncate text-[10.5px] font-semibold tracking-[0.02em]" style={{ color: 'var(--fin-nav-text-muted)' }}>
              {meta.subtitle}
            </p>
            <h1 className="truncate text-lg font-bold text-white" style={{ fontFamily: "'Noto Naskh Arabic', var(--font-sans)" }}>
              {meta.title}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {PROJECT_SCOPED_TABS.has(tab) && (
              <select
                value={projectId ?? ''}
                onChange={(e) => setProjectId(e.target.value || null)}
                className="fin-input w-40"
                style={{ background: 'rgba(201,166,84,0.08)', color: '#fff', borderColor: 'rgba(201,166,84,0.22)' }}
              >
                <option value="">پروژه‌ای انتخاب کنید</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id} style={{ color: '#1b2333' }}>
                    {p.officialName}
                  </option>
                ))}
              </select>
            )}
            <span className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] sm:flex" style={{ background: 'rgba(201,166,84,0.08)', color: 'var(--fin-nav-text)' }}>
              <Calendar size={12} /> سال مالی {jy.toLocaleString('fa-IR')}
            </span>
            <span className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] md:flex" style={{ background: 'rgba(201,166,84,0.08)', color: 'var(--fin-nav-text-muted)' }}>
              <Calendar size={12} /> آخرین به‌روزرسانی: {jy.toLocaleString('fa-IR')}/{String(todayJalali().jm).padStart(2, '0')}/{String(todayJalali().jd).padStart(2, '0')} (
              {JALALI_MONTHS[todayJalali().jm - 1]})
            </span>
            <button
              onClick={toggleFinTheme}
              title={finLight ? 'حالت تاریک' : 'حالت روشن'}
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'rgba(201,166,84,0.08)', color: 'var(--fin-nav-text)' }}
            >
              {finLight ? <Moon size={14} /> : <Sun size={14} />}
            </button>
            <div className="relative">
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="relative flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: 'rgba(201,166,84,0.08)', color: 'var(--fin-nav-text)' }}
                title="اعلان‌ها"
              >
                <Bell size={14} />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white" style={{ background: '#b5573a' }}>
                    {notifications.length.toLocaleString('fa-IR')}
                  </span>
                )}
              </button>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="fin-card absolute left-0 top-full z-50 mt-2 w-80 max-w-[85vw] overflow-hidden p-0 sm:w-96">
                    <div className="fin-eyebrow m-0 px-4 pt-3">
                      <Bell size={12} /> اعلان‌ها ({notifications.length.toLocaleString('fa-IR')})
                    </div>
                    <div className="max-h-80 overflow-y-auto px-2 pb-2">
                      {notifications.length === 0 ? (
                        <p className="fin-text-muted px-2 py-6 text-center text-[11px]">اعلان فعالی وجود ندارد.</p>
                      ) : (
                        notifications.map((n) => {
                          const Icon = n.severity === 'bad' ? AlertTriangle : n.severity === 'warn' ? AlertTriangle : Info
                          const tone = n.severity === 'bad' ? 'var(--fin-bad)' : n.severity === 'warn' ? 'var(--fin-warn)' : 'var(--fin-info)'
                          return (
                            <button key={n.id} onClick={() => openNotification(n)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2.5 text-right hover:opacity-80">
                              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: `${tone}1a` }}>
                                <Icon size={12} style={{ color: tone }} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="fin-text block text-[11.5px] leading-5">{n.text}</span>
                                <span className="num mt-0.5 block text-[10px] font-bold" style={{ color: tone }}>
                                  {n.daysLabel}
                                </span>
                              </span>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => setTab('settings')}
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'rgba(201,166,84,0.08)', color: 'var(--fin-nav-text)' }}
              title="تنظیمات"
            >
              <Settings size={14} />
            </button>
            <button onClick={() => setMobileNavOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-lg text-white lg:hidden" style={{ background: 'rgba(201,166,84,0.08)' }}>
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
          ) : tab === 'claims' ? (
            <ClaimsPage masterProjectId={projectId} />
          ) : tab === 'retention' ? (
            <RetentionPage masterProjectId={projectId} />
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
