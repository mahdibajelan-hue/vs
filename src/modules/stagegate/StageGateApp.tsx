import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Orbit } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuthStore } from '../../store/useAuthStore'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { createStageGateEngine } from './legacy/engine'
import './stagegate.css'

/** Stage-Gate lifecycle (9-gate model, orbit + Gantt master plan) — ported from the Quick-Win Challenge app.
 * The view itself is the original engine mounted on #lcBody; this shell only supplies the project picker,
 * the signed-in user and the module header. */
export function StageGateApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const profile = useAuthStore((s) => s.profile)
  const [projects, setProjects] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const engineRef = useRef<ReturnType<typeof createStageGateEngine> | null>(null)

  useEffect(() => {
    supabase.from('sg_projects').select('name, is_guide').order('name').then(({ data }) => {
      const names = (data ?? []).filter((p) => !p.is_guide).map((p) => p.name as string)
      setProjects(names)
      setLoading(false)
    })
  }, [])

  const engine = useMemo(() => {
    if (!profile) return null
    return createStageGateEngine({
      _supabase: supabase,
      currentUser: { email: profile.email },
      currentProfile: { role: profile.isAdmin ? 'admin' : 'manager' },
      myProjectAccess: projects.map((p) => ({ project_name: p })),
    })
  }, [profile, projects])
  engineRef.current = engine

  async function load(name: string) {
    setSelected(name)
    if (name && engineRef.current) await engineRef.current.openLifecyclePreview(name)
  }

  return (
    <div className="sg-root flex h-screen w-screen flex-col overflow-hidden" dir="rtl">
      <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ background: '#101a30' }}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[#ffffff]" style={{ background: 'linear-gradient(135deg, #0e2a5e, #0f766e)' }}>
            <Orbit size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-extrabold text-slate-800">چرخه عمر پروژه — Stage-Gate</h2>
            <p className="text-xs text-slate-500">مدل ۹ گیتی: تعریف تا تسویه حساب. پروژه: <b id="lcProjectNameLabel" className="text-slate-700">—</b></p>
          </div>
        </div>
        <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
      </header>
      <StorageErrorBanner />

      <main className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-5">
        <div className="no-print grid grid-cols-1 gap-2 rounded-2xl border bg-white p-4 md:grid-cols-3">
          <select
            value={selected}
            onChange={(e) => load(e.target.value)}
            className="rounded-xl border p-2.5 text-xs md:col-span-2"
            disabled={loading}
          >
            <option value="">{loading ? 'در حال بارگذاری…' : 'یک پروژه را انتخاب کنید'}</option>
            {projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button
            type="button"
            onClick={() => load(selected)}
            disabled={!selected}
            className="rounded-xl bg-blue-900 px-4 py-2.5 text-xs font-bold text-[#ffffff] disabled:opacity-40"
          >
            بارگذاری
          </button>
        </div>

        <div id="lcBody">
          {loading ? (
            <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>
          ) : (
            <div className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-400">برای مشاهدهٔ چرخه عمر، پروژه‌ای را انتخاب کنید.</div>
          )}
        </div>
      </main>
    </div>
  )
}
