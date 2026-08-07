import { useState } from 'react'
import { Menu, Moon, Sun, Building2, MapPin, LogOut, UserCircle2, Users } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useCurrentRole } from '../../store/useMembersStore'
import { UserManagementModal } from '../Auth/UserManagementModal'
import { ProfileModal } from '../Auth/ProfileModal'
import { ROLE_LABEL_FA, type Project } from '../../types'

export function Topbar({ project, title, onMenuClick }: { project: Project | null; title: string; onMenuClick: () => void }) {
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const currentUser = useAuthStore((s) => s.currentUser())
  const role = useCurrentRole()
  const signOut = useAuthStore((s) => s.signOut)
  const [showUsers, setShowUsers] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  return (
    <header className="no-print flex items-center justify-between gap-2 glass-panel !rounded-none border-t-0 border-x-0 px-3 py-3 sm:px-6 sm:py-3.5">
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={onMenuClick} className="shrink-0 rounded-lg p-2 text-secondary hover:bg-white/5 transition-colors lg:hidden" title="منو">
          <Menu size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-bold truncate">{title}</h1>
          {project && (
            <div className="mt-0.5 flex items-center gap-3 text-xs text-secondary">
              <span className="hidden sm:flex items-center gap-1 truncate">
                <Building2 size={12} className="shrink-0" /> <span className="truncate">{project.client || 'بدون کارفرما'}</span>
              </span>
              <span className="hidden sm:flex items-center gap-1 truncate">
                <MapPin size={12} className="shrink-0" /> <span className="truncate">{project.location || 'بدون موقعیت'}</span>
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {currentUser && (
          <button
            onClick={() => setShowProfile(true)}
            className="hidden sm:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors"
            title="پروفایل من"
          >
            {currentUser.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
            ) : (
              <UserCircle2 size={14} />
            )}
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
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </header>
  )
}
