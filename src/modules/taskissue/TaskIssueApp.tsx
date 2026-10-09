import { useEffect, useMemo, useRef, useState } from 'react'
import { ListChecks, Loader2, OctagonAlert } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuthStore } from '../../store/useAuthStore'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { createTaskIssueEngine } from './legacy/engine'
import { ISSUES_VIEW_HTML, TASKS_VIEW_HTML, TASK_OVERLAYS_HTML } from './viewHtml'
import './taskissue.css'

type Section = 'tasks' | 'issues'

/** مدیریت موانع و اقدامات (Issue & Task Management) — two sections in one module:
 *  «پایش اقدامات» (task control tower) and «پیگیری موانع پروژه‌ها» (issue tracker with calendar and reports).
 *  Both are the original engines from the Quick-Win Challenge app, mounted on their original markup. */
export function TaskIssueApp({ onExitToHub, onBackToRadar, embedded = false }: { onExitToHub: () => void; onBackToRadar: () => void; /** inside the Issue & Task hub: no own title bar / shortcuts, fills the parent */ embedded?: boolean }) {
  const profile = useAuthStore((s) => s.profile)
  const [section, setSection] = useState<Section>('tasks')
  const [access, setAccess] = useState<{ project_name: string }[] | null>(null)
  const engineRef = useRef<ReturnType<typeof createTaskIssueEngine> | null>(null)
  const sectionRef = useRef<Section>('tasks')

  useEffect(() => {
    if (!profile) return
    ;(async () => {
      if (profile.isAdmin) { setAccess([]); return }
      const { data: u } = await supabase.from('tm_users').select('user_id').eq('email', profile.email)
      const ids = (u ?? []).map((r) => r.user_id as string)
      const { data: pu } = ids.length ? await supabase.from('tm_project_users').select('project_name').in('user_id', ids) : { data: [] }
      setAccess((pu ?? []).map((r) => ({ project_name: r.project_name as string })))
    })()
  }, [profile])

  const engine = useMemo(() => {
    if (!profile || !access) return null
    return createTaskIssueEngine({
      _supabase: supabase,
      currentUser: { email: profile.email },
      currentProfile: { role: profile.isAdmin ? 'admin' : 'manager' },
      myProjectAccess: access,
      switchView: (v: string) => { if (v === 'tasks') setSection('tasks') },
    })
  }, [profile, access])
  engineRef.current = engine
  sectionRef.current = section

  useEffect(() => {
    if (!engine) return
    if (section === 'tasks') engine.loadTasksView()
    else engine.loadIssueTrackingView()
  }, [engine, section])

  return (
    <div className={`ti-root flex flex-col overflow-hidden ${embedded ? 'h-full w-full rounded-2xl' : 'h-screen w-screen'}`} dir="rtl">
      <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ background: '#101a30' }}>
        {!embedded && (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[#ffffff]" style={{ background: 'linear-gradient(135deg, #7c2d12, #b45309)' }}>
              <ListChecks size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-extrabold text-slate-800">مدیریت موانع و اقدامات</h2>
              <p className="text-xs text-slate-500" dir="ltr">Issue &amp; Task Management</p>
            </div>
          </div>
        )}
        <nav className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
          <TabBtn active={section === 'tasks'} onClick={() => setSection('tasks')} icon={<ListChecks size={14} />} label="پایش اقدامات" />
          <TabBtn active={section === 'issues'} onClick={() => setSection('issues')} icon={<OctagonAlert size={14} />} label="پیگیری موانع پروژه‌ها" />
        </nav>
        {!embedded && <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />}
      </header>
      <StorageErrorBanner />

      <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        {!engine && <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>}
        <div id="tasksView" className={`space-y-5 ${section === 'tasks' ? '' : 'hidden'}`} dangerouslySetInnerHTML={{ __html: TASKS_VIEW_HTML }} />
        <div id="issueTrackingView" className={`space-y-5 ${section === 'issues' ? '' : 'hidden'}`} dangerouslySetInnerHTML={{ __html: ISSUES_VIEW_HTML }} />
      </main>
      <div dangerouslySetInnerHTML={{ __html: TASK_OVERLAYS_HTML }} />
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${active ? 'bg-amber-600 text-[#ffffff]' : 'text-slate-600 hover:bg-white/5'}`}
    >
      {icon} {label}
    </button>
  )
}
