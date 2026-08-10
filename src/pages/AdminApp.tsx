import { useState } from 'react'
import { ArrowRight, Database, Users } from 'lucide-react'
import { useAuthStore } from '../store/useAuthStore'
import { UnifiedAdminPage } from './UnifiedAdminPage'
import { MasterDataApp } from '../modules/masterdata/MasterDataApp'
import { SignOutButton } from '../components/Auth/SignOutButton'

type Tab = 'users' | 'masterdata'

/**
 * Shell for the admin-gated 'admin' hub module — two tabs sharing one header/back-button:
 * "کاربران" (the existing cross-module user/membership view) and "داده‌های پایه" (the new
 * centralized Organization/Portfolio/Program/Project master data, see
 * supabase/schema.sql section 12). Both are admin-only, mirroring RASTA's own Master Data
 * nav sketch which nests Users alongside Organizations/Portfolios/Programs/Projects.
 */
export function AdminApp({ onExitToHub }: { onExitToHub: () => void }) {
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const [tab, setTab] = useState<Tab>('users')

  if (!isAdmin) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 p-8" style={{ background: 'var(--bg-app)' }}>
        <p className="text-sm text-muted">این بخش فقط برای ادمین سامانه در دسترس است.</p>
        <div className="flex items-center gap-2">
          <button onClick={onExitToHub} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3.5 py-2 text-xs text-secondary hover:bg-white/5 transition-colors">
            <ArrowRight size={13} /> بازگشت به ماژول‌ها
          </button>
          <SignOutButton />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <header className="flex shrink-0 items-center justify-between glass-panel !rounded-none border-t-0 border-x-0 px-4 py-3">
        <div className="flex items-center gap-1">
          <TabButton active={tab === 'users'} icon={Users} label="کاربران" onClick={() => setTab('users')} />
          <TabButton active={tab === 'masterdata'} icon={Database} label="داده‌های پایه" onClick={() => setTab('masterdata')} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onExitToHub} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3.5 py-2 text-xs text-secondary hover:bg-white/5 transition-colors">
            <ArrowRight size={13} /> بازگشت به ماژول‌ها
          </button>
          <SignOutButton />
        </div>
      </header>

      <div className="min-h-0 flex-1 flex flex-col">{tab === 'users' ? <UnifiedAdminPage /> : <MasterDataApp />}</div>
    </div>
  )
}

function TabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Users; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm transition-colors ${
        active ? 'bg-brand-500/15 text-brand-300 font-medium' : 'text-secondary hover:bg-white/5'
      }`}
    >
      <Icon size={15} />
      {label}
    </button>
  )
}
