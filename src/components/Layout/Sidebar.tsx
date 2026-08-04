import { LayoutDashboard, Map, BarChart3, Plus, FolderKanban } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { Page } from '../../App'

interface SidebarProps {
  page: Page
  onPageChange: (p: Page) => void
  onNewProject: () => void
}

const NAV: { id: Page; label: string; icon: typeof Map }[] = [
  { id: 'viewer', label: 'نقشه ایزومتریک', icon: Map },
  { id: 'onepager', label: 'داشبورد مدیریتی', icon: LayoutDashboard },
  { id: 'reports', label: 'گزارش‌ها', icon: BarChart3 },
]

export function Sidebar({ page, onPageChange, onNewProject }: SidebarProps) {
  const projects = useStore((s) => s.projects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const selectProject = useStore((s) => s.selectProject)

  return (
    <aside className="no-print flex h-full w-64 flex-col glass-panel !rounded-none border-l-0 border-t-0 border-b-0">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white font-bold shadow-lg shadow-brand-500/20">
          IP
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold">پایش ایزومتریک</p>
          <p className="text-[11px] text-muted">Piping Progress Tracker</p>
        </div>
      </div>

      <nav className="px-3 space-y-1">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onPageChange(id)}
            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors ${
              page === id ? 'bg-brand-500/15 text-brand-300 font-medium' : 'text-secondary hover:bg-white/5'
            }`}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-6 flex items-center justify-between px-5 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <FolderKanban size={13} /> پروژه‌ها
        </span>
        <button onClick={onNewProject} className="text-brand-400 hover:text-brand-300">
          <Plus size={15} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => selectProject(p.id)}
            className={`w-full truncate rounded-lg px-3 py-2 text-right text-xs transition-colors ${
              p.id === currentProjectId ? 'bg-white/10 text-current font-medium' : 'text-secondary hover:bg-white/5'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="px-5 py-4 text-[11px] text-muted border-t" style={{ borderColor: 'var(--border-soft)' }}>
        ذخیره‌سازی محلی (Local Browser Storage)
      </div>
    </aside>
  )
}
