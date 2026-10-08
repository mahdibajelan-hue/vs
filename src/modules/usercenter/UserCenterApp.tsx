import { useEffect, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import './usercenter.css'
import { useUserCenterStore } from './store/useUserCenterStore'
import { ToastProvider } from './components/ui'
import { CreateUserDialog } from './components/CreateUserDialog'
import { INITIAL_LIST_STATE, UserListPage, type ListState } from './pages/UserListPage'
import { UserProfilePage, type ProfileTab } from './pages/UserProfilePage'

type View = { kind: 'list' } | { kind: 'user'; id: string; tab: ProfileTab; edit: boolean }

/**
 * User 360° Management Center — the admin's single place for a user's whole life cycle: directory → 360° profile
 * (details, role & type, project matrix, permission matrix, access manager, audit trail). Mounted by AdminApp's
 * «کاربران» tab; it only reads/writes through its own store plus the shared master-data access store.
 */
export function UserCenterApp() {
  const load = useUserCenterStore((s) => s.load)
  const loaded = useUserCenterStore((s) => s.loaded)
  const error = useUserCenterStore((s) => s.error)
  const [view, setView] = useState<View>({ kind: 'list' })
  const [list, setList] = useState<ListState>(INITIAL_LIST_STATE)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  const open = (id: string, tab: ProfileTab = 'info', edit = false) => {
    setView({ kind: 'user', id, tab, edit })
    document.getElementById('uc-scroll')?.scrollTo({ top: 0 })
  }

  return (
    <ToastProvider>
      <div className="uc-root min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6" id="uc-scroll" dir="rtl">
        {error && (
          <div role="alert" className="mx-auto mb-4 flex max-w-[1280px] items-center gap-3 rounded-xl px-4 py-3 text-[13px]" style={{ background: 'color-mix(in srgb, var(--uc-bad) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--uc-bad) 35%, transparent)' }}>
            <AlertCircle size={16} style={{ color: 'var(--uc-bad)' }} />
            <span className="flex-1 leading-7">بارگذاری اطلاعات کاربران انجام نشد: {error}</span>
            <button className="uc-btn uc-btn-sm" onClick={() => load()}><RefreshCw size={13} /> تلاش دوباره</button>
          </div>
        )}
        {view.kind === 'list' ? (
          <UserListPage state={list} setState={(patch) => setList((s) => ({ ...s, ...patch }))} onOpen={open} onCreate={() => setCreating(true)} />
        ) : (
          <UserProfilePage userId={view.id} tab={view.tab} edit={view.edit} onTab={(tab, edit = false) => setView({ kind: 'user', id: view.id, tab, edit })} onBack={() => setView({ kind: 'list' })} />
        )}
        {creating && <CreateUserDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); if (id) open(id, 'projects') }} />}
      </div>
    </ToastProvider>
  )
}
