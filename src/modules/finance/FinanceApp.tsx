import { useEffect, useState } from 'react'
import { Banknote, FileText, Home, LayoutDashboard, LineChart, Loader2, Receipt } from 'lucide-react'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { useFinanceStore } from './store/useFinanceStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { SignOutButton } from '../../components/Auth/SignOutButton'
import { BudgetPage } from './pages/BudgetPage'
import { ContractsPage } from './pages/ContractsPage'
import { PaymentCertificatesPage } from './pages/PaymentCertificatesPage'
import { FinancialDashboardPage } from './pages/FinancialDashboardPage'
import { CashFlowForecastPage } from './pages/CashFlowForecastPage'

export const FINANCE_ACCENT = '#10b981'

type Tab = 'dashboard' | 'budget' | 'contracts' | 'certificates' | 'cashflow'

const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'داشبورد مالی', icon: LayoutDashboard },
  { id: 'budget', label: 'بودجه', icon: Banknote },
  { id: 'contracts', label: 'قرارداد', icon: FileText },
  { id: 'certificates', label: 'صورت‌وضعیت', icon: Receipt },
  { id: 'cashflow', label: 'جریان نقدی و پیش‌بینی', icon: LineChart },
]

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

  const [projectId, setProjectId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')

  useEffect(() => {
    if (!masterDataLoaded) fetchMasterData()
    if (!financeLoaded) fetchFinance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (projects.length > 0 && !projectId) setProjectId(projects[0].id)
  }, [projects, projectId])

  if ((masterDataLoading && !masterDataLoaded) || (!financeLoaded && !masterDataLoaded)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: FINANCE_ACCENT }} />
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-2 glass-panel !rounded-none border-t-0 border-x-0 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border" style={{ borderColor: `${FINANCE_ACCENT}55`, background: `${FINANCE_ACCENT}1a` }}>
            <Banknote size={18} style={{ color: FINANCE_ACCENT }} />
          </div>
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-extrabold">مدیریت مالی پروژه</p>
            <p className="text-[10px] text-muted" dir="ltr">
              Financial Management
            </p>
          </div>
          <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
          {tab !== 'cashflow' && (
            <select
              value={projectId ?? ''}
              onChange={(e) => setProjectId(e.target.value || null)}
              className="w-36 rounded-lg bg-black/20 border border-white/10 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400 sm:w-auto"
            >
              <option value="">پروژه‌ای انتخاب کنید</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.officialName}
                </option>
              ))}
            </select>
          )}
        </div>

        <nav className="order-3 hidden w-full items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 lg:order-none lg:flex lg:w-auto">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              style={tab === id ? { background: `${FINANCE_ACCENT}2a`, color: FINANCE_ACCENT } : undefined}
            >
              <Icon size={13} />
              <span className={tab === id ? '' : 'text-secondary'}>{label}</span>
            </button>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button onClick={onExitToHub} className="flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-1.5 text-xs text-secondary hover:bg-white/5 sm:px-3">
            <Home size={13} /> <span className="hidden sm:inline">بازگشت به ماژول‌ها</span>
          </button>
          <SignOutButton className="flex items-center gap-1.5 rounded-full border border-red-400/25 px-2 py-1.5 text-xs text-red-300 hover:bg-red-500/10 sm:px-3" />
        </div>
      </header>

      <StorageErrorBanner />

      <div className="flex-1 min-h-0 overflow-y-auto p-3 pb-16 sm:p-4 lg:pb-4">
        {tab === 'cashflow' ? (
          <CashFlowForecastPage />
        ) : !projectId ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            {projects.length === 0 ? 'ابتدا از بخش داده پایه یک پروژه تعریف کنید' : 'یک پروژه را از بالا انتخاب کنید'}
          </div>
        ) : tab === 'dashboard' ? (
          <FinancialDashboardPage masterProjectId={projectId} />
        ) : tab === 'budget' ? (
          <BudgetPage masterProjectId={projectId} />
        ) : tab === 'contracts' ? (
          <ContractsPage masterProjectId={projectId} />
        ) : (
          <PaymentCertificatesPage masterProjectId={projectId} />
        )}
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex items-center justify-around overflow-x-auto border-t bg-[var(--bg-panel-solid)] py-1.5 lg:hidden" style={{ borderColor: 'var(--border-soft)' }}>
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[9px] shrink-0"
            style={{ color: tab === id ? FINANCE_ACCENT : 'var(--text-muted)' }}
          >
            <Icon size={16} />
            <span className="max-w-[4.2rem] truncate">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
