import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ClipboardCheck, FileBarChart2, Loader2, Settings2, UsersRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { resetModuleScroll, revealTab } from '../../lib/revealTab'
import '../issues/issues.css'
import './supervision.css'
import { useSupervisionStore } from './store/useSupervisionStore'
import { thisMonth, type Ym } from './lib/svMonth'
import { DayPage } from './pages/DayPage'

const MonthPage = lazy(() => import('./pages/MonthPage').then((m) => ({ default: m.MonthPage })))
const ReportPage = lazy(() => import('./pages/ReportPage').then((m) => ({ default: m.ReportPage })))
const RosterPage = lazy(() => import('./pages/RosterPage').then((m) => ({ default: m.RosterPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

type Tab = 'day' | 'month' | 'report' | 'roster' | 'settings'
const NAV: { id: Tab; label: string; icon: LucideIcon; color: string }[] = [
  { id: 'day', label: 'حضور روزانه', icon: ClipboardCheck, color: '#22d3ee' },
  { id: 'month', label: 'جدول ماه', icon: CalendarDays, color: '#34d399' },
  { id: 'report', label: 'گزارش ماه', icon: FileBarChart2, color: '#a78bfa' },
  { id: 'roster', label: 'نفرات و خودروها', icon: UsersRound, color: '#f59e0b' },
  { id: 'settings', label: 'تنظیمات', icon: Settings2, color: '#94a3b8' },
]
const PROJECT_KEY = 'sv.project'
const safeGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

/** حضور و غیاب دستگاه نظارت — daily attendance of supervisors and employer representatives, meals, rented cars, monthly payroll report. */
export function SupervisionApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const projects = useMasterDataStore((s) => s.projects)
  const mdLoaded = useMasterDataStore((s) => s.loaded)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const load = useSupervisionStore((s) => s.load)
  const loading = useSupervisionStore((s) => s.loading)
  const error = useSupervisionStore((s) => s.error)
  const [tab, setTab] = useState<Tab>('day')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [month, setMonth] = useState<Ym>(thisMonth())

  useEffect(() => { if (!mdLoaded) void fetchMasterData() }, [mdLoaded, fetchMasterData])
  useEffect(() => {
    if (!projects.length || projectId) return
    const saved = safeGet(PROJECT_KEY)
    setProjectId([contextProjectId, saved].find((id) => id && projects.some((p) => p.id === id)) ?? projects[0].id)
  }, [projects, projectId, contextProjectId])
  useEffect(() => { if (projectId) { safeSet(PROJECT_KEY, projectId); void load(projectId) } }, [projectId, load])
  useEffect(() => { resetModuleScroll(); revealTab('.im-nav-tab[aria-selected="true"]') }, [tab])

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId])
  const body = () => {
    if (!projectId) return <div className="im-card im-empty">{mdLoaded && !projects.length ? 'ابتدا از «اطلاعات پایه» یک پروژه تعریف کنید.' : 'در حال بارگذاری پروژه‌ها…'}</div>
    switch (tab) {
      case 'day': return <DayPage onGoRoster={() => setTab('roster')} />
      case 'month': return <MonthPage month={month} onMonth={setMonth} />
      case 'report': return <ReportPage month={month} onMonth={setMonth} projectName={project?.officialName ?? ''} />
      case 'roster': return <RosterPage />
      case 'settings': return <SettingsPage month={month} onMonth={setMonth} />
    }
  }

  return (
    <div className="im-root sv-root" dir="rtl">
      <header className="im-head no-print">
        <div className="im-head-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <span className="im-logo" aria-hidden style={{ background: 'linear-gradient(135deg, #22d3ee, #0e7490 70%, #155e75)', boxShadow: '0 10px 22px -10px #0891b2, inset 0 1px 0 rgba(255,255,255,.35)' }}><ClipboardCheck size={22} /></span>
            <div style={{ minWidth: 0, lineHeight: 1.3 }}>
              <h1 className="im-head-title">حضور و غیاب دستگاه نظارت</h1>
              <p className="im-head-eyebrow">Site Supervision Attendance</p>
            </div>
          </div>
          <div className="im-actions" style={{ minWidth: 0 }}>
            {projects.length > 0 && (
              <select className="im-select-pill" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)} aria-label="پروژه">
                {projects.map((p) => <option key={p.id} value={p.id}>{p.officialName}</option>)}
              </select>
            )}
            <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
          </div>
        </div>
        <nav className="im-nav" role="tablist" aria-label="بخش‌های حضور و غیاب دستگاه نظارت">
          {NAV.map((n) => (
            <button key={n.id} role="tab" aria-selected={tab === n.id} className="im-nav-tab" style={{ ['--c' as string]: n.color }} onClick={() => setTab(n.id)}>
              <n.icon size={15} aria-hidden />{n.label}
            </button>
          ))}
        </nav>
      </header>
      <StorageErrorBanner />
      <main className="im-main" id="im-main">
        <div className="im-page" key={tab}>
          {error && <div className="im-card" role="alert" style={{ marginBottom: 12, color: 'var(--im-coral)', fontWeight: 700 }}>{error}</div>}
          {loading ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="im-skeleton" style={{ height: 120, borderRadius: 18 }} />
              {Array.from({ length: 4 }, (_, k) => <div key={k} className="im-skeleton" style={{ height: 62, borderRadius: 14 }} />)}
              <div style={{ display: 'flex', justifyContent: 'center' }}><Loader2 size={20} className="animate-spin" style={{ color: 'var(--im-accent)' }} aria-label="در حال بارگذاری" /></div>
            </div>
          ) : <Suspense fallback={<div className="im-skeleton" style={{ height: 240 }} />}>{body()}</Suspense>}
        </div>
      </main>
    </div>
  )
}
