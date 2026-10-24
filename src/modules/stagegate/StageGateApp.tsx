import { useEffect, useMemo, useRef, useState } from 'react'
import { Link2, Loader2, Orbit, Target } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuthStore } from '../../store/useAuthStore'
import { useModuleStore } from '../../store/useModuleStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { useLifecycleStore } from '../lifecycle/store/useLifecycleStore'
import { ControlTowerPage } from '../lifecycle/pages/ControlTowerPage'
import { MilestonesPage } from '../lifecycle/pages/MilestonesPage'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { createStageGateEngine } from './legacy/engine'
import { linkSgProject, loadSgProjects, type SgProjectRef } from './sgProjects'
import './stagegate.css'

type View = 'lifecycle' | 'tower' | 'milestones'

/** Stage-Gate lifecycle (9-gate model, orbit + Gantt master plan) — the lifecycle of record of the platform.
 * The lifecycle view is the original engine mounted on #lcBody. Each Stage-Gate project is linked to a master project
 * (sg_projects.master_project_id): opened from Project Radar it shows that project only. The EPC control tower
 * (health, early warnings, milestones) of the former lifecycle module lives here as a second tab. */
export function StageGateApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const profile = useAuthStore((s) => s.profile)
  const masterProjects = useMasterDataStore((s) => s.projects)
  const mdLoaded = useMasterDataStore((s) => s.loaded)
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const [projects, setProjects] = useState<SgProjectRef[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('lifecycle')
  const [linkMsg, setLinkMsg] = useState<string | null>(null)
  const engineRef = useRef<ReturnType<typeof createStageGateEngine> | null>(null)

  const refresh = () => loadSgProjects().then((p) => { setProjects(p); setLoading(false); return p })
  useEffect(() => { void refresh(); if (!mdLoaded) void useMasterDataStore.getState().fetchAll() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const engine = useMemo(() => {
    if (!profile) return null
    return createStageGateEngine({
      _supabase: supabase,
      currentUser: { email: profile.email },
      currentProfile: { role: profile.isAdmin ? 'admin' : 'manager' },
      myProjectAccess: projects.map((p) => ({ project_name: p.name })),
    })
  }, [profile, projects])
  engineRef.current = engine

  // inside a project (from the radar): the Stage-Gate project linked to it, nothing else
  const locked = !!contextProjectId
  const lockedSg = locked ? projects.find((p) => p.masterProjectId === contextProjectId) ?? null : null
  // opened from the lifecycle report with a project named
  const [entry] = useState(() => useModuleStore.getState().takeEntryTab())
  useEffect(() => {
    if (!engine || selected) return
    const name = lockedSg?.name ?? (!locked && entry && projects.some((p) => p.name === entry) ? entry : null)
    if (name) void load(name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, lockedSg, entry, projects])

  async function load(name: string) {
    setSelected(name)
    setView('lifecycle')
    if (name && engineRef.current) await engineRef.current.openLifecyclePreview(name)
  }

  const current = projects.find((p) => p.name === selected) ?? null
  const master = current?.masterProjectId ? masterProjects.find((m) => m.id === current.masterProjectId) ?? null : null

  // the control tower reads the former lifecycle module's data for the linked master project
  const selectPlcProject = useLifecycleStore((s) => s.selectProject)
  // the tower reads its bundle from Stage-Gate (G1…G9), not from the former lifecycle templates
  useEffect(() => {
    if (!master || view === 'lifecycle') return
    useLifecycleStore.getState().setSgMode(true)
    void selectPlcProject(master.id)
  }, [master, view, selectPlcProject])
  // the engine renders into #lcBody: when coming back to the lifecycle tab, draw it again
  useEffect(() => { if (view === 'lifecycle' && selected && engineRef.current) void engineRef.current.openLifecyclePreview(selected) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [view])

  const linkTo = async (masterId: string) => {
    if (!current) return
    const r = await linkSgProject(current.name, masterId || null)
    setLinkMsg(r.ok ? (masterId ? 'اتصال ذخیره شد.' : 'اتصال برداشته شد.') : r.error ?? 'خطا')
    await refresh()
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" dir="rtl" style={{ background: 'var(--bg-app)' }}>
      <header className="sg-root no-print flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ background: 'var(--sg-head)' }}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[#ffffff]" style={{ background: 'linear-gradient(135deg, #0e2a5e, #0f766e)' }}>
            <Orbit size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-extrabold text-slate-800">چرخه عمر پروژه — Stage-Gate</h2>
            <p className="text-xs text-slate-500">مدل ۹ گیتی: تعریف تا تسویه حساب. پروژه: <b id="lcProjectNameLabel" className="text-slate-700">{selected || '—'}</b>{master ? <> · <span className="text-slate-600">{master.officialName}</span></> : null}</p>
          </div>
        </div>
        <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
      </header>
      <StorageErrorBanner />

      {selected && (
        <nav className="sg-root no-print flex shrink-0 gap-1 border-b px-3 py-2 sm:px-5" style={{ background: 'var(--sg-nav)' }} role="tablist" aria-label="بخش‌های چرخه عمر">
          <SgTab on={view === 'lifecycle'} onClick={() => setView('lifecycle')} icon={<Orbit size={14} />} label="چرخهٔ عمر و گیت‌ها" />
          <SgTab on={view !== 'lifecycle'} onClick={() => setView('tower')} icon={<Target size={14} />} label="برج کنترل EPC" disabled={!master} title={master ? undefined : 'برای برج کنترل، پروژه باید به اطلاعات پایه وصل باشد'} />
        </nav>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className={`sg-root space-y-4 p-3 sm:p-5 ${view === 'lifecycle' ? '' : 'hidden'}`} style={{ minHeight: '100%' }}>
          {locked ? (
            !loading && !lockedSg && (
              <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">
                این پروژه هنوز به یک پروژهٔ Stage-Gate وصل نشده است. اتصال از همین ماژول (بیرون از رادار) انجام می‌شود.
              </div>
            )
          ) : (
            <div className="no-print grid grid-cols-1 gap-2 rounded-2xl border bg-white p-4 md:grid-cols-3">
              <select value={selected} onChange={(e) => void load(e.target.value)} className="rounded-xl border p-2.5 text-xs md:col-span-2" disabled={loading}>
                <option value="">{loading ? 'در حال بارگذاری…' : 'یک پروژه را انتخاب کنید'}</option>
                {projects.map((p) => {
                  const m = p.masterProjectId ? masterProjects.find((x) => x.id === p.masterProjectId) : null
                  return <option key={p.name} value={p.name}>{p.name}{m ? ` ← ${m.officialName}` : ''}</option>
                })}
              </select>
              {profile?.isAdmin && current ? (
                <label className="flex items-center gap-2 text-[11px] text-slate-500">
                  <Link2 size={14} className="shrink-0" />
                  <select value={current.masterProjectId ?? ''} onChange={(e) => void linkTo(e.target.value)} className="min-w-0 flex-1 rounded-xl border p-2.5 text-xs" aria-label="اتصال به پروژهٔ اطلاعات پایه">
                    <option value="">بدون اتصال به اطلاعات پایه</option>
                    {masterProjects.map((m) => <option key={m.id} value={m.id}>{m.officialName}</option>)}
                  </select>
                </label>
              ) : <span />}
              {linkMsg && <p className="text-[11px] text-slate-500 md:col-span-3">{linkMsg}</p>}
            </div>
          )}

          <div id="lcBody">
            {loading ? (
              <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>
            ) : !locked && (
              <div className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-400">برای مشاهدهٔ چرخه عمر، پروژه‌ای را انتخاب کنید.</div>
            )}
          </div>
        </div>

        {view !== 'lifecycle' && master && (
          <div className="plc-canvas min-h-full">
            {view === 'tower' ? (
              <ControlTowerPage project={master} backLabel="چرخهٔ عمر و گیت‌ها" onBack={() => setView('lifecycle')} onOpenStage={() => setView('lifecycle')} onOpenMilestones={() => setView('milestones')} />
            ) : (
              <MilestonesPage projectId={master.id} onBack={() => setView('tower')} />
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function SgTab({ on, onClick, icon, label, disabled, title }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean; title?: string }) {
  return (
    <button type="button" role="tab" aria-selected={on} disabled={disabled} title={title} onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 ${on ? 'bg-blue-900 text-[#ffffff]' : 'text-slate-500 hover:bg-slate-50'}`}>
      {icon} {label}
    </button>
  )
}
