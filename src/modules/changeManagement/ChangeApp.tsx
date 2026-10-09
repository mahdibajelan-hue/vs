import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { BarChart3, CircleHelp, FileBarChart, GitPullRequestArrow, ListChecks, Loader2, Plus, Scale } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useDeepLinkStore } from '../../store/useDeepLinkStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { HelpButton } from '../issues/components/Help'
import '../issues/issues.css'
import './change.css'
import { useChangeStore } from './store/useChangeStore'
import { useChangeCtx } from './lib/useChangeData'
import { canSubmit } from './lib/changeFlow'
import { CM_HELP } from './lib/help'
import { RequestDrawer, type DrawerTab } from './components/RequestDrawer'
import { RequestFormModal } from './components/RequestFormModal'
import { DashboardPage } from './pages/DashboardPage'

const RequestsPage = lazy(() => import('./pages/RequestsPage').then((m) => ({ default: m.RequestsPage })))
const RulesPage = lazy(() => import('./pages/RulesPage').then((m) => ({ default: m.RulesPage })))
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const HelpPage = lazy(() => import('./pages/HelpPage').then((m) => ({ default: m.HelpPage })))

export type ChangeTab = 'dashboard' | 'requests' | 'rules' | 'reports' | 'help'
export interface PageProps { onOpen: (id: string, tab?: DrawerTab) => void; onNew: () => void }
const NAV: { id: ChangeTab; label: string; icon: LucideIcon; color: string; help: keyof typeof CM_HELP }[] = [
  { id: 'dashboard', label: 'داشبورد', icon: BarChart3, color: '#f59e0b', help: 'dashboard' },
  { id: 'requests', label: 'درخواست‌ها', icon: ListChecks, color: '#0ea5e9', help: 'list' },
  { id: 'rules', label: 'قواعد تصویب', icon: Scale, color: '#8b5cf6', help: 'rules' },
  { id: 'reports', label: 'گزارش‌ها', icon: FileBarChart, color: '#14b8a6', help: 'reports' },
  { id: 'help', label: 'راهنما', icon: CircleHelp, color: '#64748b', help: 'help' },
]

/** مدیریت تغییرات پروژه — standalone module. Users, projects, contracts and roles come from the central platform; the approval route comes from the rule engine. */
export function ChangeApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const loaded = useChangeStore((s) => s.loaded)
  const error = useChangeStore((s) => s.error)
  const projects = useChangeStore((s) => s.projects)
  const scope = useChangeStore((s) => s.scopeProjectId)
  const setScope = useChangeStore((s) => s.setScope)
  const fetchAll = useChangeStore((s) => s.fetchAll)
  const ctx = useChangeCtx()
  const [tab, setTab] = useState<ChangeTab>('dashboard')
  const [open, setOpen] = useState<{ id: string; tab: DrawerTab } | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  useEffect(() => { fetchAll() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    if (!contextProjectId) return
    setScope(contextProjectId); setTab('requests'); setLocked(true)
    return () => { if (useChangeStore.getState().scopeProjectId !== 'all') setScope('all') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pendingLink = useDeepLinkStore((s) => s.pending)
  const clearLink = useDeepLinkStore((s) => s.clear)
  useEffect(() => { if (loaded && pendingLink?.module === 'change') { setOpen({ id: pendingLink.recordId, tab: 'flow' }); clearLink() } }, [loaded, pendingLink, clearLink])

  const cur = useMemo(() => NAV.find((n) => n.id === tab)!, [tab])
  useEffect(() => { document.getElementById('im-main')?.scrollTo({ top: 0 }); document.querySelector('.im-nav-tab[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [tab])
  const canNew = useMemo(() => (scope === 'all' ? projects.some((p) => canSubmit(ctx.perms(p.id))) || ctx.perms(null).isAdmin : canSubmit(ctx.perms(scope))), [scope, projects, ctx])
  const page: PageProps = { onOpen: (id, t = 'flow') => setOpen({ id, tab: t }), onNew: () => setNewOpen(true) }

  return (
    <div className="im-root cm-root" dir="rtl">
      <header className="im-head">
        <div className="im-head-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <span className="im-logo" aria-hidden style={{ background: 'linear-gradient(135deg, #f59e0b, #b45309)' }}><GitPullRequestArrow size={22} /></span>
            <div style={{ minWidth: 0, lineHeight: 1.3 }}><h1 className="im-head-title">مدیریت تغییرات</h1><p className="im-head-eyebrow">Project Change Management</p></div>
          </div>
          <div className="im-actions" style={{ minWidth: 0 }}>
            {!locked && projects.length > 1 && (
              <select className="im-select-pill" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="پروژه">
                <option value="all">همهٔ پروژه‌ها</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code ? p.code + ' · ' : ''}{p.name}</option>)}
              </select>
            )}
            {tab !== 'help' && <HelpButton content={CM_HELP[cur.help]} />}
            {canNew && <button className="im-btn im-btn-primary im-btn-lg" onClick={() => setNewOpen(true)}><Plus size={18} strokeWidth={2.6} /> درخواست جدید</button>}
            <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
          </div>
        </div>
        <nav className="im-nav" role="tablist" aria-label="بخش‌های مدیریت تغییرات">
          {NAV.map((n) => <button key={n.id} role="tab" aria-selected={tab === n.id} className="im-nav-tab" style={{ ['--c' as string]: n.color }} onClick={() => setTab(n.id)}><n.icon size={15} aria-hidden />{n.label}</button>)}
        </nav>
      </header>
      <StorageErrorBanner />
      <main className="im-main" id="im-main">
        {!loaded ? (
          <div className="im-page" style={{ display: 'grid', gap: 12 }}>
            <div className="im-kpi-grid">{Array.from({ length: 6 }, (_, k) => <div key={k} className="im-skeleton" style={{ height: 92, borderRadius: 16 }} />)}</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>{error ? <span className="im-err">{error}</span> : <Loader2 size={20} className="animate-spin" style={{ color: 'var(--im-accent)' }} aria-label="در حال بارگذاری" />}</div>
          </div>
        ) : (
          <>
            {error && <div className="im-page"><div className="im-err" role="alert">{error}</div></div>}
            <Suspense fallback={<div className="im-page"><div className="im-skeleton" style={{ height: 240 }} /></div>}>
              <div key={tab}>
                {tab === 'dashboard' && <DashboardPage {...page} />}
                {tab === 'requests' && <RequestsPage {...page} />}
                {tab === 'rules' && <RulesPage {...page} />}
                {tab === 'reports' && <ReportsPage {...page} />}
                {tab === 'help' && <HelpPage />}
              </div>
            </Suspense>
          </>
        )}
      </main>
      {canNew && <button className="im-fab" onClick={() => setNewOpen(true)} aria-label="درخواست جدید"><Plus size={26} /></button>}
      {newOpen && <RequestFormModal defaultProjectId={scope !== 'all' ? scope : undefined} onClose={() => setNewOpen(false)} onSaved={(id) => setOpen({ id, tab: 'flow' })} />}
      {open && <RequestDrawer key={open.id} requestId={open.id} initialTab={open.tab} onClose={() => setOpen(null)} />}
    </div>
  )
}
