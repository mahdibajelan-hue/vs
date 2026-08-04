import { Moon, Sun, Building2, MapPin, LogOut, UserCircle2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useAuthStore } from '../../store/useAuthStore'
import type { Project } from '../../types'

export function Topbar({ project, title }: { project: Project | null; title: string }) {
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const username = useAuthStore((s) => s.username)
  const logout = useAuthStore((s) => s.logout)

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
        {username && (
          <span className="hidden sm:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-secondary">
            <UserCircle2 size={14} /> {username}
          </span>
        )}
        <button
          onClick={toggleTheme}
          className="glass-panel rounded-lg p-2 hover:brightness-125 transition"
          title="تغییر پوسته"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          onClick={logout}
          className="glass-panel rounded-lg p-2 hover:brightness-125 transition text-red-400"
          title="خروج از حساب"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
