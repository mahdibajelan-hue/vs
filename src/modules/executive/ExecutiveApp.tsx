import { useEffect } from 'react'
import { Briefcase, Home, Loader2 } from 'lucide-react'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { SignOutButton } from '../../components/Auth/SignOutButton'
import { PortfolioDashboardPage } from '../reporting/pages/PortfolioDashboardPage'

const MODULE_ACCENT = '#6366f1'

/**
 * Standalone hub module for Portfolio Management — deliberately its own top-level app (not a tab
 * inside Reporting) so it reads as a distinct executive tool for senior management, reachable in
 * one click from the hub rather than buried inside another module's nav.
 */
export function ExecutiveApp({ onExitToHub }: { onExitToHub: () => void }) {
  const masterDataLoaded = useMasterDataStore((s) => s.loaded)
  const masterDataLoading = useMasterDataStore((s) => s.loading)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)

  useEffect(() => {
    if (!masterDataLoaded) fetchMasterData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (masterDataLoading && !masterDataLoaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: MODULE_ACCENT }} />
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-2 glass-panel !rounded-none border-t-0 border-x-0 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border" style={{ borderColor: `${MODULE_ACCENT}55`, background: `${MODULE_ACCENT}1a` }}>
            <Briefcase size={18} style={{ color: MODULE_ACCENT }} />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-extrabold">مدیریت سبد پروژه‌ها</p>
            <p className="text-[10px] text-muted" dir="ltr">
              Portfolio Management
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button onClick={onExitToHub} className="flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-1.5 text-xs text-secondary hover:bg-white/5 sm:px-3">
            <Home size={13} /> <span className="hidden sm:inline">بازگشت به ماژول‌ها</span>
          </button>
          <SignOutButton className="flex items-center gap-1.5 rounded-full border border-red-400/25 px-2 py-1.5 text-xs text-red-300 hover:bg-red-500/10 sm:px-3" />
        </div>
      </header>

      <StorageErrorBanner />

      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
        <PortfolioDashboardPage />
      </div>
    </div>
  )
}
