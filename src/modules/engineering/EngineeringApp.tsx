import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Gauge, Link2, ListChecks, Loader2, Ruler, ShieldCheck, FileStack } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import '../issues/issues.css'
import '../finance/finance-dashboard.css'
import '../material/material-control.css'
import '../execution/execution.css'
import { useExecutionStore } from '../execution/store/useExecutionStore'
import { useMaterialControlStore } from '../material/store/useMaterialControlStore'
import { useMaterialStore } from '../material/store/useMaterialStore'
import { useEpcStore } from '../execution/store/useEpcStore'
import { buildEngTasks, lensOf } from './lib/roles'
import { ErrorBoundary } from '../../components/common/ErrorBoundary'
import { useAuthStore } from '../../store/useAuthStore'

export const ENGINEERING_ACCENT = '#6366f1'
type Tab = 'dash' | 'my' | 'register' | 'links' | 'impact'
const NAV: { id: Tab; label: string; icon: LucideIcon; color: string }[] = [
  { id: 'dash', label: 'داشبورد مهندسی', icon: Gauge, color: '#6366f1' },
  { id: 'my', label: 'کارهای من', icon: ListChecks, color: '#ec4899' },
  { id: 'register', label: 'فهرست مدارک', icon: FileStack, color: '#0ea5e9' },
  { id: 'links', label: 'ارتباط مدارک و فعالیت‌ها', icon: Link2, color: '#14b8a6' },
  { id: 'impact', label: 'آمادگی و اثر تأخیر', icon: ShieldCheck, color: '#f97316' },
]
const EngPage = lazy(() => import('./pages/EngPage').then((m) => ({ default: m.EngPage })))

/**
 * «پایش پیشرفت مهندسی و آمادگی اجرا» — a module of its own. It monitors the document register, weighted engineering progress, the links
 * from documents to activities, execution readiness and the schedule impact of late documents. It manages no files, revisions or correspondence.
 * Activities, baselines and productivity inputs are read from the execution module; the readiness result flows back into its engine.
 */
export function EngineeringApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const projects = useMasterDataStore((s) => s.projects)
  const mdLoaded = useMasterDataStore((s) => s.loaded)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const exLoaded = useExecutionStore((s) => s.loaded)
  const fetchEx = useExecutionStore((s) => s.fetchAll)
  const csLoaded = useMaterialControlStore((s) => s.loaded)
  const fetchControl = useMaterialControlStore((s) => s.fetchAll)
  const matLoaded = useMaterialStore((s) => s.loaded)
  const fetchMaterial = useMaterialStore((s) => s.fetchAll)
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const [tab, setTab] = useState<Tab>('dash')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    if (!mdLoaded) fetchMasterData()
    if (!exLoaded) void fetchEx()
    if (!matLoaded) fetchMaterial()
    if (!csLoaded) void fetchControl()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!projects.length || projectId) return
    if (contextProjectId && projects.some((p) => p.id === contextProjectId)) { setProjectId(contextProjectId); setLocked(true) } else setProjectId(projects[0].id)
  }, [projects, projectId, contextProjectId])
  const loading = !mdLoaded || !exLoaded
  const engDocs = useEpcStore((s) => s.engDocs)
  const exRoles = useExecutionStore((s) => s.roles)
  const isAdmin = useAuthStore((s) => !!s.profile?.isAdmin)
  const uid = useAuthStore((s) => s.profile?.id)
  const myCount = useMemo(() => {
    if (!projectId) return 0
    const mine = exRoles.filter((r) => r.projectId === projectId && r.userId === uid && r.active).map((r) => r.role)
    return buildEngTasks(engDocs.filter((d) => d.projectId === projectId), isAdmin ? 'manager' : lensOf(mine), new Date().toISOString().slice(0, 10)).length
  }, [exRoles, uid, engDocs, projectId, isAdmin])

  return (
    <div className="im-root fn-root mt-root ex-root" dir="rtl" style={{ ['--im-accent' as string]: ENGINEERING_ACCENT }}>
      <header className="im-head no-print">
        <div className="im-head-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <span className="im-logo" aria-hidden style={{ background: 'linear-gradient(135deg, #818cf8, #6366f1 70%, #3730a3)', boxShadow: '0 10px 22px -10px #6366f1, inset 0 1px 0 rgba(255,255,255,.35)' }}><Ruler size={22} /></span>
            <div style={{ minWidth: 0, lineHeight: 1.3 }}>
              <h1 className="im-head-title">پیشرفت مهندسی و آمادگی اجرا</h1>
              <p className="im-head-eyebrow">Engineering Progress &amp; Execution Readiness</p>
            </div>
          </div>
          <div className="im-actions" style={{ minWidth: 0 }}>
            {projects.length > 0 && (locked
              ? <span className="im-select-pill" style={{ pointerEvents: 'none' }}>{projects.find((p) => p.id === projectId)?.officialName}</span>
              : <select className="im-select-pill" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)} aria-label="پروژه">{projects.map((p) => <option key={p.id} value={p.id}>{p.officialName}</option>)}</select>)}
            <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
          </div>
        </div>
        <nav className="im-nav" role="tablist" aria-label="بخش‌های پایش مهندسی">
          {NAV.map((n) => (
            <button key={n.id} role="tab" aria-selected={tab === n.id} className="im-nav-tab" style={{ ['--c' as string]: n.color }} onClick={() => setTab(n.id)}><n.icon size={15} aria-hidden />{n.label}{n.id === 'my' && myCount > 0 && <em className="im-nav-badge" style={{ fontStyle: 'normal', marginInlineStart: 4, background: '#ef4444', color: '#fff', borderRadius: 99, padding: '0 6px', fontSize: 10.5 }}>{myCount.toLocaleString('fa-IR')}</em>}</button>
          ))}
        </nav>
      </header>
      <StorageErrorBanner />
      <main className="im-main" id="im-main">
        {loading ? (
          <div className="im-page" style={{ display: 'grid', gap: 12 }}>
            <div className="im-skeleton" style={{ height: 150, borderRadius: 22 }} />
            <div style={{ display: 'flex', justifyContent: 'center' }}><Loader2 size={20} className="animate-spin" style={{ color: 'var(--im-accent)' }} aria-label="در حال بارگذاری" /></div>
          </div>
        ) : !projectId ? (
          <div className="im-page"><div className="im-card im-empty">{projects.length === 0 ? 'ابتدا از «اطلاعات پایه» یک پروژه تعریف کنید.' : 'یک پروژه را از بالای صفحه انتخاب کنید.'}</div></div>
        ) : (
          <div className="im-page" key={`${tab}:${projectId}`}>
            <ErrorBoundary area="پایش مهندسی"><Suspense fallback={<div className="im-skeleton" style={{ height: 240 }} />}><EngPage projectId={projectId} sub={tab} /></Suspense></ErrorBoundary>
          </div>
        )}
      </main>
    </div>
  )
}
