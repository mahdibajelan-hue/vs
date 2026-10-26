import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Link2, Loader2, Orbit } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuthStore } from '../../store/useAuthStore'
import { useModuleStore } from '../../store/useModuleStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ensureEpcStores, epcProgressOf, epcWindowOf } from '../epc/epcProgressLoader'
import { weightsFromReport } from '../epc/epcProgress'
import { createStageGateEngine } from './legacy/engine'
import { linkSgProject, loadSgProjects, type SgProjectRef } from './sgProjects'
import { SgGuideDialog } from './SgGuideDialog'
import { loadPssrSummary, type PssrSummary } from '../pssr/lib/pssrSummary'
import './stagegate.css'

/** Stage-Gate lifecycle (9-gate model, orbit + gate pages) — the lifecycle of record of the platform. The original
 * engine is mounted on #lcBody. Each Stage-Gate project is linked to a master project (sg_projects.master_project_id):
 * opened from Project Radar it shows that project only. The whole-project master plan (Gantt) lives in Scheduling. */
export function StageGateApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const profile = useAuthStore((s) => s.profile)
  const masterProjects = useMasterDataStore((s) => s.projects)
  const mdLoaded = useMasterDataStore((s) => s.loaded)
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const [projects, setProjects] = useState<SgProjectRef[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [linkMsg, setLinkMsg] = useState<string | null>(null)
  const [guide, setGuide] = useState<{ phase: string | null } | null>(null)
  const pssrRef = useRef(new Map<string, PssrSummary | null>())
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
      onOpenGuide: (phase: string | null) => setGuide({ phase }),
      getPssr: (name: string) => pssrRef.current.get(name) ?? null,
      onOpenModule: (key: 'engineering' | 'material' | 'execution' | 'pssr') => useModuleStore.getState().enterModule(key, contextProjectId ? 'project' : undefined),
      // the EPC phase reads the engineering / material / execution modules (once their stores are loaded)
      getEpcWindow: (name: string) => { const m = projects.find((p) => p.name === name)?.masterProjectId; return m ? epcWindowOf(m) : null },
      getEpcLive: (name: string, report: Record<string, unknown> | null) => { const m = projects.find((p) => p.name === name)?.masterProjectId; return m ? epcProgressOf(m, weightsFromReport(report)) : null },
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
    const mid = projects.find((p) => p.name === name)?.masterProjectId
    const [, ps] = await Promise.all([ensureEpcStores(), mid ? loadPssrSummary(mid).catch(() => null) : Promise.resolve(null)])
    pssrRef.current.set(name, ps)
    if (name && engineRef.current) await engineRef.current.openLifecyclePreview(name)
  }

  const current = projects.find((p) => p.name === selected) ?? null
  const master = current?.masterProjectId ? masterProjects.find((m) => m.id === current.masterProjectId) ?? null : null


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
            <h2 className="truncate text-base font-extrabold text-slate-800">چرخهٔ عمر پروژه</h2>
            <p className="truncate text-xs text-slate-500" title={master?.officialName ?? selected}>{master?.officialName ?? (selected || 'پروژه‌ای انتخاب نشده')}</p>
            <span id="lcProjectNameLabel" hidden>{selected}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setGuide({ phase: null })} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-extrabold text-[#ffffff]" style={{ background: 'linear-gradient(135deg, #2563eb, #0ea5e9)' }}>
            <BookOpen size={15} aria-hidden /> راهنما
          </button>
        <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
        </div>
      </header>
      {guide && <SgGuideDialog phase={guide.phase} onClose={() => setGuide(null)} />}
      <StorageErrorBanner />


      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="sg-root space-y-4 p-3 sm:p-5" style={{ minHeight: '100%' }}>
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

      </main>
    </div>
  )
}
