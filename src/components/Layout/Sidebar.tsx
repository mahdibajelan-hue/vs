import { useRef, useState } from 'react'
import { LayoutDashboard, Map, BarChart3, Plus, FolderKanban, PenTool, Info, CalendarRange, ClipboardList, Download, Upload, Pencil, Trash2, X, UserCircle2, Network } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useCurrentRole } from '../../store/useMembersStore'
import { canEdit } from '../../lib/permissions'
import { exportProjectJson, parseProjectJson } from '../../lib/projectIO'
import { Logo } from '../common/Logo'
import { NewProjectModal } from './NewProjectModal'
import { ROLE_LABEL_FA } from '../../types'
import type { ProjectSummary } from '../../lib/supabaseData'
import type { Page } from '../../App'

interface SidebarProps {
  page: Page
  onPageChange: (p: Page) => void
  onNewProject: () => void
  /** Mobile drawer state — irrelevant at lg+ where the sidebar is always visible in-flow. */
  mobileOpen: boolean
  onMobileClose: () => void
}

const NAV: { id: Page; label: string; icon: typeof Map }[] = [
  { id: 'viewer', label: 'نقشه ایزومتریک', icon: Map },
  { id: 'worklog', label: 'کارکرد روزانه', icon: ClipboardList },
  { id: 'schematic', label: 'طراحی نقشه شماتیک', icon: PenTool },
  { id: 'schedule', label: 'برنامه زمان‌بندی', icon: CalendarRange },
  { id: 'onepager', label: 'داشبورد مدیریتی', icon: LayoutDashboard },
  { id: 'reports', label: 'گزارش‌ها', icon: BarChart3 },
  { id: 'portfolio', label: 'تحلیل سه‌سطحی', icon: Network },
  { id: 'about', label: 'درباره ما', icon: Info },
]

export function Sidebar({ page, onPageChange, onNewProject, mobileOpen, onMobileClose }: SidebarProps) {
  const projects = useStore((s) => s.projects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const currentProject = useStore((s) => s.currentProject())
  const selectProject = useStore((s) => s.selectProject)
  const importProject = useStore((s) => s.importProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const currentUser = useAuthStore((s) => s.currentUser())
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const role = useCurrentRole()
  const editable = canEdit(role, isAdmin)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onMobileClose} />
      )}
      <aside
        className={`no-print fixed inset-y-0 right-0 z-40 flex h-full w-72 flex-col glass-panel !rounded-none border-l-0 border-t-0 border-b-0 transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
      <div className="flex items-center gap-2.5 px-5 py-4">
        <Logo size={32} className="shrink-0 rounded-xl shadow-lg shadow-brand-500/20" />
        <div className="leading-tight flex-1 min-w-0">
          <p style={{ fontFamily: "'Montserrat', sans-serif" }} className="text-sm font-extrabold tracking-wide">
            PipePulse
          </p>
          <p className="text-[10px] text-muted">Piping Progress Intelligence</p>
        </div>
        <button onClick={onMobileClose} className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-white/5 lg:hidden">
          <X size={16} />
        </button>
      </div>

      {currentUser && (
        <div className="mx-3 mb-2 flex items-center gap-2.5 rounded-xl bg-white/[0.04] p-2.5 border" style={{ borderColor: 'var(--border-soft)' }}>
          {currentUser.avatarUrl ? (
            <img src={currentUser.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white">
              <UserCircle2 size={20} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{currentUser.fullName || currentUser.email}</p>
            {role && <span className="mt-0.5 inline-block rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] text-brand-300">{ROLE_LABEL_FA[role]}</span>}
          </div>
        </div>
      )}

      <nav className="px-3 space-y-1">
        {NAV.map(({ id, label, icon: Icon }) => (
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

      <div className="mx-3 mt-6 flex-1 min-h-0 flex flex-col rounded-2xl border border-brand-400/15 bg-gradient-to-b from-brand-500/[0.07] to-transparent overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-brand-300">
            <FolderKanban size={13} /> پروژه‌ها
          </span>
          <button onClick={onNewProject} className="text-brand-400 hover:text-brand-300">
            <Plus size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {projects.map((p) => (
            <div
              key={p.id}
              className={`group flex items-center gap-1 rounded-lg text-xs transition-colors ${
                p.id === currentProjectId ? 'bg-brand-500/15 text-current font-medium' : 'text-secondary hover:bg-white/5'
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
      </div>

      <div className="px-3 py-2 mt-2 flex items-center gap-1.5 border-t" style={{ borderColor: 'var(--border-soft)' }}>
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
