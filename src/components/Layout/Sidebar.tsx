import { useRef, useState } from 'react'
import { LayoutDashboard, Map, BarChart3, Plus, FolderKanban, PenTool, Info, CalendarRange, Download, Upload, ShieldAlert, Pencil, Trash2, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useCurrentRole } from '../../store/useMembersStore'
import { canEdit } from '../../lib/permissions'
import { exportProjectJson, parseProjectJson } from '../../lib/projectIO'
import { Logo } from '../common/Logo'
import { NewProjectModal } from './NewProjectModal'
import type { ProjectSummary } from '../../lib/supabaseData'
import type { Page } from '../../App'

interface SidebarProps {
  page: Page
  onPageChange: (p: Page) => void
  onNewProject: () => void
  /** Mobile drawer state — irrelevant at md+ where the sidebar is always visible in-flow. */
  mobileOpen: boolean
  onMobileClose: () => void
}

const NAV: { id: Page; label: string; icon: typeof Map }[] = [
  { id: 'viewer', label: 'نقشه ایزومتریک', icon: Map },
  { id: 'schematic', label: 'طراح نقشه شماتیک', icon: PenTool },
  { id: 'schedule', label: 'برنامه زمان‌بندی', icon: CalendarRange },
  { id: 'risks', label: 'ریسک‌ها', icon: ShieldAlert },
  { id: 'onepager', label: 'داشبورد مدیریتی', icon: LayoutDashboard },
  { id: 'reports', label: 'گزارش‌ها', icon: BarChart3 },
  { id: 'about', label: 'درباره ما', icon: Info },
]

export function Sidebar({ page, onPageChange, onNewProject, mobileOpen, onMobileClose }: SidebarProps) {
  const projects = useStore((s) => s.projects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const currentProject = useStore((s) => s.currentProject())
  const selectProject = useStore((s) => s.selectProject)
  const importProject = useStore((s) => s.importProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const role = useCurrentRole()
  const editable = canEdit(role)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nav = NAV.filter((n) => n.id !== 'schematic' || editable)
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const handleImportFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const project = parseProjectJson(String(reader.result ?? ''))
      if (project) {
        await importProject(project)
      } else {
        window.alert('فایل JSON پروژه معتبر نیست.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onMobileClose} />
      )}
      <aside
        className={`no-print fixed inset-y-0 right-0 z-40 flex h-full w-72 flex-col glass-panel !rounded-none border-l-0 border-t-0 border-b-0 transition-transform duration-200 md:static md:z-auto md:w-64 md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo size={36} className="shrink-0 rounded-xl shadow-lg shadow-brand-500/20" />
        <div className="leading-tight flex-1 min-w-0">
          <p className="text-sm font-bold">پایش ایزومتریک</p>
          <p className="text-[11px] text-muted">Piping Progress Tracker</p>
        </div>
        <button onClick={onMobileClose} className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-white/5 md:hidden">
          <X size={16} />
        </button>
      </div>

      <nav className="px-3 space-y-1">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              onPageChange(id)
              onMobileClose()
            }}
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
          <div
            key={p.id}
            className={`group flex items-center gap-1 rounded-lg text-xs transition-colors ${
              p.id === currentProjectId ? 'bg-white/10 text-current font-medium' : 'text-secondary hover:bg-white/5'
            }`}
          >
            <button
              onClick={() => {
                selectProject(p.id)
                onMobileClose()
              }}
              className="flex-1 min-w-0 truncate px-3 py-2 text-right"
            >
              {p.name}
            </button>
            {editable &&
              (confirmDeleteId === p.id ? (
                <div className="flex items-center gap-1 shrink-0 pl-1.5">
                  <button
                    onClick={() => {
                      deleteProject(p.id)
                      setConfirmDeleteId(null)
                    }}
                    className="text-[10px] text-red-400 hover:underline"
                  >
                    تایید حذف
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)} className="text-[10px] text-secondary hover:underline">
                    انصراف
                  </button>
                </div>
              ) : (
                <div className="hidden shrink-0 items-center gap-0.5 pl-1.5 group-hover:flex">
                  <button
                    onClick={() => setEditingProject(p)}
                    className="rounded p-1 text-muted hover:text-brand-400 transition-colors"
                    title="ویرایش پروژه"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(p.id)}
                    className="rounded p-1 text-muted hover:text-red-400 transition-colors"
                    title="حذف پروژه"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
          </div>
        ))}
      </div>

      <div className="px-3 py-2 flex items-center gap-1.5 border-t" style={{ borderColor: 'var(--border-soft)' }}>
        <button
          disabled={!currentProject}
          onClick={() => currentProject && exportProjectJson(currentProject)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-secondary hover:bg-white/5 disabled:opacity-30 transition-colors"
          title="خروجی JSON پروژه فعلی برای انتقال به دستگاه دیگر"
        >
          <Download size={12} /> خروجی پروژه
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-secondary hover:bg-white/5 transition-colors"
          title="ورود پروژه از فایل JSON"
        >
          <Upload size={12} /> ورود پروژه
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleImportFile(f)
            e.target.value = ''
          }}
        />
      </div>

      <div className="px-5 py-4 text-[11px] text-muted border-t" style={{ borderColor: 'var(--border-soft)' }}>
        ذخیره‌سازی ابری (Supabase) — اشتراکی بین اعضای دعوت‌شده
      </div>

      {editingProject && <NewProjectModal project={editingProject} onClose={() => setEditingProject(null)} />}
      </aside>
    </>
  )
}
