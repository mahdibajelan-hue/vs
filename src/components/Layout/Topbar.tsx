import { useState } from 'react'
import { Moon, Sun, Building2, MapPin, LogOut, UserCircle2, Users } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useCurrentRole } from '../../store/useMembersStore'
import { UserManagementModal } from '../Auth/UserManagementModal'
import { ROLE_LABEL_FA, type Project } from '../../types'

export function Topbar({ project, title }: { project: Project | null; title: string }) {
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const currentUser = useAuthStore((s) => s.currentUser())
  const role = useCurrentRole()
  const signOut = useAuthStore((s) => s.signOut)
  const [showUsers, setShowUsers] = useState(false)

  return (
    <header className="no-print flex items-center justify-between glass-panel !rounded-none border-t-0 border-x-0 px-6 py-3.5">
      <div>
        <h1 className="text-base font-bold">{title}</h1>
        {project && (
          <div className="mt-0.5 flex items-center gap-3 text-xs text-secondary">
            <span className="flex items-center gap-1">
              <Building2 size={12} /> {project.client || 'بدون کارفرما'}
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={12} /> {project.location || 'بدون موقعیت'}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {currentUser && (
          <button
            onClick={() => project && setShowUsers(true)}
            disabled={!project}
            className="hidden sm:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-secondary hover:bg-white/5 disabled:opacity-50 transition-colors"
            title="اعضای پروژه"
          >
            <UserCircle2 size={14} />
            {currentUser.fullName || currentUser.email}
            {role && <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{ROLE_LABEL_FA[role]}</span>}
          </button>
        )}
        <button
          onClick={() => project && setShowUsers(true)}
          disabled={!project}
          className="glass-panel rounded-lg p-2 hover:brightness-125 disabled:opacity-50 transition"
          title="اعضای پروژه"
        >
          <Users size={16} />
        </button>
        <button
          onClick={toggleTheme}
          className="glass-panel rounded-lg p-2 hover:brightness-125 transition"
          title="تغییر پوسته"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          onClick={() => signOut()}
          className="glass-panel rounded-lg p-2 hover:brightness-125 transition text-red-400"
          title="خروج از حساب"
        >
          <LogOut size={16} />
        </button>
      </div>
      {showUsers && project && <UserManagementModal onClose={() => setShowUsers(false)} />}
    </header>
  )
}
