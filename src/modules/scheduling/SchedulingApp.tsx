import { Suspense, lazy, useEffect, useState } from 'react'
import { BookOpen, ChartGantt, CalendarClock, Dices, PencilRuler, Gauge, GitCompare, Link2, Loader2, TrendingUp, Upload } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { ErrorBoundary } from '../../components/common/ErrorBoundary'
import '../issues/issues.css'
import '../finance/finance-dashboard.css'
import '../material/material-control.css'
import '../execution/execution.css'
import { useExecutionStore } from '../execution/store/useExecutionStore'
import { useMaterialStore } from '../material/store/useMaterialStore'

export const SCHEDULING_ACCENT = '#0ea5a4'
export type SchTab = 'dash' | 'import' | 'versions' | 'gantt' | 'analysis' | 'links' | 'edit' | 'risk' | 'help'
const NAV: { id: SchTab; label: string; icon: LucideIcon; color: string }[] = [
  { id: 'dash', label: 'داشبورد برنامه', icon: Gauge, color: '#0ea5a4' },
  { id: 'import', label: 'ورود برنامه', icon: Upload, color: '#6366f1' },
  { id: 'versions', label: 'نسخه‌ها و خط مبنا', icon: GitCompare, color: '#8b5cf6' },
  { id: 'gantt', label: 'گانت', icon: ChartGantt, color: '#0ea5e9' },
  { id: 'analysis', label: 'تحلیل انحراف', icon: TrendingUp, color: '#f97316' },
  { id: 'links', label: 'اتصال‌ها و آمادگی', icon: Link2, color: '#14b8a6' },
  { id: 'edit', label: 'ویرایش برنامه', icon: PencilRuler, color: '#f59e0b' },
  { id: 'risk', label: 'تحلیل کمی (ماژول ریسک)', icon: Dices, color: '#ec4899' },
  { id: 'help', label: 'راهنمای ماژول', icon: BookOpen, color: '#64748b' },
]
const SchPage = lazy(() => import('./pages/SchPage').then((m) => ({ default: m.SchPage })))

/**
 * «برنامه‌ریزی و کنترل زمان پروژه» — the project's schedule: import from Excel / Primavera P6, versions and the approved baseline, critical path and forecast,
 * deviation from the baseline, links to execution / engineering / supply / risk / issues, and quantitative (Monte Carlo) risk analysis.
 * Its own tables are sch_*; execution, engineering, material, risk and issues stay the owners of their data and are only read.
 */
export function SchedulingApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const projects = useMasterDataStore((s) => s.projects)
  const mdLoaded = useMasterDataStore((s) => s.loaded)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const exLoaded = useExecutionStore((s) => s.loaded)
  const fetchEx = useExecutionStore((s) => s.fetchAll)
  const matLoaded = useMaterialStore((s) => s.loaded)
  const fetchMaterial = useMaterialStore((s) => s.fetchAll)
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const [tab, setTab] = useState<SchTab>('dash')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    if (!mdLoaded) fetchMasterData()
    if (!exLoaded) void fetchEx()
    if (!matLoaded) fetchMaterial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!projects.length || projectId) return
    if (contextProjectId && projects.some((p) => p.id === contextProjectId)) { setProjectId(contextProjectId); setLocked(true) } else setProjectId(projects[0].id)
  }, [projects, projectId, contextProjectId])
  const loading = !mdLoaded || !exLoaded

  return (
    <div className="im-root fn-root mt-root ex-root" dir="rtl" style={{ ['--im-accent' as string]: SCHEDULING_ACCENT }}>
      <header className="im-head no-print">
        <div className="im-head-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <span className="im-logo" aria-hidden style={{ background: 'linear-gradient(135deg, #2dd4bf, #0ea5a4 70%, #115e59)', boxShadow: '0 10px 22px -10px #0ea5a4, inset 0 1px 0 rgba(255,255,255,.35)' }}><CalendarClock size={22} /></span>
            <div style={{ minWidth: 0, lineHeight: 1.3 }}>
              <h1 className="im-head-title">برنامه‌ریزی و کنترل زمان پروژه</h1>
              <p className="im-head-eyebrow">Project Scheduling &amp; Time Control</p>
            </div>
          </div>
          <div className="im-actions" style={{ minWidth: 0 }}>
            {projects.length > 0 && (locked
              ? <span className="im-select-pill" style={{ pointerEvents: 'none' }}>{projects.find((p) => p.id === projectId)?.officialName}</span>
              : <select className="im-select-pill" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)} aria-label="پروژه">{projects.map((p) => <option key={p.id} value={p.id}>{p.officialName}</option>)}</select>)}
            <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
          </div>
        </div>
        <nav className="im-nav" role="tablist" aria-label="بخش‌های برنامه‌ریزی و کنترل زمان">
          {NAV.map((n) => (
            <button key={n.id} role="tab" aria-selected={tab === n.id} className="im-nav-tab" style={{ ['--c' as string]: n.color }} onClick={() => setTab(n.id)}><n.icon size={15} aria-hidden />{n.label}</button>
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
            <ErrorBoundary area="برنامه‌ریزی و کنترل زمان"><Suspense fallback={<div className="im-skeleton" style={{ height: 240 }} />}><SchPage projectId={projectId} tab={tab} go={setTab} /></Suspense></ErrorBoundary>
          </div>
        )}
      </main>
    </div>
  )
}
