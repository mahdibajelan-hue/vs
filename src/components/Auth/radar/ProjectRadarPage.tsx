import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, Banknote, Bell, CheckCircle2,
  ChevronsRight, Clock3, FileText, GitBranch, Heart, Orbit, Package, Radar as RadarIcon, RefreshCw, Route,
  ShieldAlert, ShieldCheck, Sparkles, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ModuleKey } from '../../../store/useModuleStore'
import { hasModuleAccess, useModuleAccessStore } from '../../../store/useModuleAccessStore'
import { useMasterDataStore } from '../../../modules/masterdata/store/useMasterDataStore'
import { useProjectContextStore } from '../../../store/useProjectContextStore'
import { SignOutButton } from '../SignOutButton'
import { HeartbeatBar } from './HeartbeatBar'
import { RadarDisplay } from './RadarDisplay'
import { CriticalSignalsPanel, ContractPanel, LifecyclePanel, NextGatePanel, PerformanceRingCard, SignalStatCard } from './RadarPanels'
/** Lazy — the Risk Universe scene pulls in three.js/@react-three/fiber, which would otherwise
 * bloat every visitor's initial bundle just to reach the rest of Project Radar. */
const RiskIssueUniversePage = lazy(() => import('./universe/RiskIssueUniversePage').then((m) => ({ default: m.RiskIssueUniversePage })))
import {
  DEFAULT_RADAR_DATA, SIGNAL_CATEGORY_LABEL_EN, STATUS_COLOR, STATUS_LABEL_EN, buildMockRadarData,
  type SignalCategory,
} from './radarTypes'

/** Sidebar entries — the per-project operational modules named explicitly in the brief (Risk,
 * Issue, Change, Finance, Contract, PipePulse, Digital Twin, ...) plus the Lifecycle/EPC pages
 * this radar itself summarizes. Cross-cutting/strategic modules (Portfolio, Reporting,
 * Competency, Estimator, Admin) live on the Home screen instead, not here. */
interface NavItem {
  id: string
  moduleKey: ModuleKey | null
  title: string
  icon: LucideIcon
  accent: string
  badge?: number
  /** Overrides the default moduleKey/toast behavior entirely — used for the Risk & Issue
   * Universe entry, which swaps in a sibling view inside Radar itself rather than navigating
   * to a separate top-level module. */
  onClick?: () => void
}

const CATEGORY_FILTERS: { key: SignalCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'risk', label: SIGNAL_CATEGORY_LABEL_EN.risk },
  { key: 'issue', label: SIGNAL_CATEGORY_LABEL_EN.issue },
  { key: 'delay', label: SIGNAL_CATEGORY_LABEL_EN.delay },
  { key: 'change', label: SIGNAL_CATEGORY_LABEL_EN.change },
  { key: 'contract', label: SIGNAL_CATEGORY_LABEL_EN.contract },
  { key: 'gate', label: SIGNAL_CATEGORY_LABEL_EN.gate },
  { key: 'milestone', label: SIGNAL_CATEGORY_LABEL_EN.milestone },
]

const SCAN_DURATION_MS = 1400

export function ProjectRadarPage({ onBack, onEnterModule }: { onBack: () => void; onEnterModule: (key: ModuleKey) => void }) {
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)
  const accessibleModules = useModuleAccessStore((s) => s.accessibleModules)

  const mdLoaded = useMasterDataStore((s) => s.loaded)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const masterProjects = useMasterDataStore((s) => s.projects)
  const masterPortfolios = useMasterDataStore((s) => s.portfolios)
  const masterPrograms = useMasterDataStore((s) => s.programs)
  const {
    portfolioId: contextPortfolioId, programId: contextProgramId, projectId: contextProjectId,
    setPortfolio: setContextPortfolio, setProgram: setContextProgram, setProject: setContextProject,
  } = useProjectContextStore()

  useEffect(() => {
    if (!mdLoaded) fetchMasterData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedProject = useMemo(() => masterProjects.find((p) => p.id === contextProjectId) ?? null, [masterProjects, contextProjectId])

  // Portfolio → Program → Project cascade for the picker below — each level narrows the next,
  // same pattern as the global ContextSwitcher (masterdata module), reused here so the Radar's
  // own picker stays in sync with the shared project context that Risk/Issue/Finance/... read.
  const programOptions = contextPortfolioId ? masterPrograms.filter((p) => p.portfolioId === contextPortfolioId) : masterPrograms
  const projectOptions = contextProgramId
    ? masterProjects.filter((p) => p.programId === contextProgramId)
    : contextPortfolioId
      ? masterProjects.filter((p) => p.portfolioId === contextPortfolioId)
      : masterProjects

  const data = useMemo(() => {
    if (!selectedProject) return DEFAULT_RADAR_DATA
    return buildMockRadarData(selectedProject.id, selectedProject.officialName, selectedProject.projectIdCode || selectedProject.projectCode)
  }, [selectedProject])

  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(100)
  const [categoryFilter, setCategoryFilter] = useState<SignalCategory | 'all'>('all')
  const [notifOpen, setNotifOpen] = useState(false)
  const [universeOpen, setUniverseOpen] = useState(false)
  // Below the `lg` breakpoint the sidebar overlays the page instead of pushing it, and starts
  // closed so the radar itself isn't squeezed into a sliver on a phone screen.
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024)
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches)
      setSidebarOpen(e.matches)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const runScan = () => {
    if (scanning) return
    setScanning(true)
    setScanProgress(0)
    const started = performance.now()
    const tick = (now: number) => {
      const pct = Math.min(100, ((now - started) / SCAN_DURATION_MS) * 100)
      setScanProgress(pct)
      if (pct < 100) requestAnimationFrame(tick)
      else setTimeout(() => setScanning(false), 200)
    }
    requestAnimationFrame(tick)
  }

  const visibleSignals = useMemo(
    () => (categoryFilter === 'all' ? data.signals : data.signals.filter((s) => s.category === categoryFilter)),
    [data.signals, categoryFilter],
  )

  const isVisible = (key: ModuleKey) => hasModuleAccess(accessibleModules, key)

  const ALL_NAV_ITEMS: NavItem[] = [
    { id: 'lifecycle-nav', moduleKey: 'lifecycle', title: 'Lifecycle Navigator', icon: GitBranch, accent: 'var(--radar-cyan)' },
    { id: 'epc-tower', moduleKey: 'lifecycle', title: 'EPC Control Tower', icon: ShieldCheck, accent: 'var(--radar-amber)' },
    { id: 'risk', moduleKey: 'risk', title: 'Risk Management', icon: ShieldAlert, accent: '#e74c3c', badge: data.kpi.activeRisks },
    { id: 'issue', moduleKey: 'issues', title: 'Issue Management', icon: Activity, accent: '#a78bfa', badge: data.kpi.openIssues },
    { id: 'universe', moduleKey: null, title: 'Risk & Issue Universe', icon: Orbit, accent: '#a78bfa', onClick: () => setUniverseOpen(true) },
    { id: 'change', moduleKey: null, title: 'Change Management', icon: RefreshCw, accent: '#f59e0b', badge: data.kpi.pendingChanges },
    { id: 'finance', moduleKey: 'finance', title: 'Financial Management', icon: Banknote, accent: '#10b981' },
    { id: 'contract', moduleKey: 'finance', title: 'Contract Control', icon: FileText, accent: '#10b981' },
    { id: 'material', moduleKey: 'material', title: 'Material Supply', icon: Package, accent: '#f59e0b' },
    { id: 'pipepulse', moduleKey: 'pipepulse', title: 'PipePulse', icon: Sparkles, accent: '#0ea5e9' },
    { id: 'twin', moduleKey: 'pipelinedigitaltwin', title: 'Digital Twin', icon: Route, accent: '#38bdf8' },
    { id: 'docs', moduleKey: null, title: 'Document Center', icon: FileText, accent: '#64748b' },
  ]
  const NAV_ITEMS = ALL_NAV_ITEMS.filter((n) => n.moduleKey === null || isVisible(n.moduleKey))

  const handleNavClick = (item: NavItem) => {
    if (item.onClick) {
      item.onClick()
      return
    }
    if (!item.moduleKey) {
      setNotice(`"${item.title}" is coming soon`)
      window.clearTimeout(noticeTimer.current)
      noticeTimer.current = window.setTimeout(() => setNotice(null), 2600)
      return
    }
    onEnterModule(item.moduleKey)
  }

  const statusColor = STATUS_COLOR[data.status]
  const displayName = selectedProject ? selectedProject.officialName : (data.projectNameEn ?? data.projectName)

  // Performance-strip derived values (Project/Time/Cost/Quality Performance cards)
  const healthCaption = data.kpi.health >= 85 ? 'EXCELLENT' : data.kpi.health >= 70 ? 'GOOD' : data.kpi.health >= 50 ? 'FAIR' : 'POOR'
  const healthColor = data.kpi.health >= 70 ? 'var(--radar-green)' : data.kpi.health >= 50 ? 'var(--radar-amber)' : '#ef4444'
  const timeVariance = data.kpi.progressActual - data.kpi.progressPlanned
  const timeColor = timeVariance < 0 ? 'var(--radar-amber)' : 'var(--radar-green)'
  const timeCaption = timeVariance < 0 ? 'BEHIND' : timeVariance > 0 ? 'AHEAD' : 'ON SCHEDULE'
  const costColor = data.kpi.costVariancePct >= 0 ? 'var(--radar-green)' : 'var(--radar-amber)'
  const costCaption = data.kpi.costVariancePct >= 0 ? 'AHEAD' : 'OVER BUDGET'
  const qualityColor = data.kpi.qualityPct >= 70 ? 'var(--radar-green)' : 'var(--radar-amber)'
  const qualityCaption = data.kpi.qualityPct >= 85 ? 'EXCELLENT' : data.kpi.qualityPct >= 70 ? 'GOOD' : 'FAIR'

  if (universeOpen) {
    return (
      <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)', color: 'var(--text-muted)' }}>Loading Risk Universe…</div>}>
        <RiskIssueUniversePage
          projectName={displayName}
          seed={selectedProject?.id ?? 'default'}
          onBack={() => setUniverseOpen(false)}
        />
      </Suspense>
    )
  }

  return (
    <div dir="ltr" className="radar-en relative min-h-screen w-screen" style={{ background: 'var(--bg-app)' }}>
      <div className="radar-page-texture" aria-hidden="true" />
      {/* Reserves space for the floating sidebar instead of letting it overlap the content
          (the sidebar itself is `position: fixed`, so it takes no layout space on its own). */}
      <div className="relative z-10 transition-[margin] duration-300" style={{ marginInlineStart: isDesktop && sidebarOpen ? '16rem' : 0 }}>
      {/* ── Topbar ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            title="Back to Modules"
            className="flex h-10 w-10 items-center justify-center rounded-xl border transition-colors hover:bg-white/5"
            style={{ borderColor: 'var(--border-soft)' }}
          >
            <ArrowRight size={16} className="rotate-180" />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border" style={{ borderColor: 'color-mix(in srgb, var(--radar-green) 40%, transparent)', background: 'color-mix(in srgb, var(--radar-green) 10%, transparent)' }}>
            <RadarIcon size={19} style={{ color: 'var(--radar-green)' }} />
          </div>
          <div className="leading-tight">
            <p className="text-base font-extrabold tracking-wide">PROJECT RADAR</p>
            <p className="text-[9px] font-bold tracking-wide text-muted">LIVE PROJECT INTELLIGENCE</p>
          </div>
        </div>

        <div dir="rtl" className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <select
            value={contextPortfolioId ?? ''}
            onChange={(e) => setContextPortfolio(e.target.value || null)}
            className="input max-w-[9.5rem] truncate rounded-lg px-2 py-1.5 font-bold outline-none"
            style={{ borderColor: 'var(--border-soft)' }}
          >
            <option value="">سبد پروژه: همه</option>
            {masterPortfolios.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={contextProgramId ?? ''}
            onChange={(e) => setContextProgram(e.target.value || null)}
            disabled={programOptions.length === 0}
            className="input max-w-[9.5rem] truncate rounded-lg px-2 py-1.5 font-bold outline-none disabled:opacity-40"
            style={{ borderColor: 'var(--border-soft)' }}
          >
            <option value="">طرح: همه</option>
            {programOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={contextProjectId ?? ''}
            onChange={(e) => setContextProject(e.target.value || null)}
            className="input max-w-[11rem] truncate rounded-lg px-2 py-1.5 font-bold outline-none"
            style={{ borderColor: 'var(--radar-green)', color: 'var(--radar-green)' }}
          >
            <option value="">پروژه: نمونه پیش‌فرض</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.officialName}</option>
            ))}
          </select>

          <span dir="ltr" className="hidden text-muted sm:inline">ID:</span>
          <span dir="ltr" className="num hidden font-bold sm:inline">{data.projectIdCode}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-bold tracking-wide disabled:opacity-70"
            style={{ borderColor: 'color-mix(in srgb, var(--radar-green) 45%, var(--border-soft))', color: 'var(--radar-green)' }}
          >
            <RadarIcon size={14} className={scanning ? 'animate-spin' : ''} />
            {scanning ? `SCANNING... ${Math.round(scanProgress)}%` : 'RADAR SCAN'}
            <span className="hidden items-center gap-2 sm:flex">
              <Activity size={12} className="opacity-60" />
              <X size={12} className="opacity-60" />
            </span>
          </button>

          <div className="relative">
            <button onClick={() => setNotifOpen((v) => !v)} className="relative flex h-9 w-9 items-center justify-center rounded-xl border" style={{ borderColor: 'var(--border-soft)' }}>
              <Bell size={15} />
              {data.kpi.activeRisksHigh + data.kpi.openIssuesHigh > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {data.kpi.activeRisksHigh + data.kpi.openIssuesHigh}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute top-full z-30 mt-2 w-72 rounded-xl border p-2 shadow-2xl" style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)', insetInlineEnd: 0 }}>
                <p className="mb-1.5 px-1.5 text-[10px] font-bold text-muted">HIGH-PRIORITY ALERTS</p>
                {data.signals.filter((s) => s.severity === 'critical' || s.severity === 'high').slice(0, 5).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[11px] hover:bg-white/5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.severity === 'critical' ? '#ef4444' : 'var(--radar-amber)' }} />
                    <span className="truncate">{s.titleEn}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <SignOutButton
            className="flex h-9 items-center gap-1.5 rounded-xl border border-red-400/25 px-3 text-[11px] text-red-300 hover:bg-red-500/10 transition-colors"
            title="Sign out and return to login"
          >
            Sign Out
          </SignOutButton>
        </div>
      </header>

      <main className="min-w-0 flex-1 p-4 ps-10 sm:p-6 sm:ps-12">
        {/* Bold project title, with the Project Status + Radar Mode indicators pulled up beside it
            (previously a separate row below) so the wide empty space next to the headline on
            desktop gets used instead of left blank. */}
        <div className="hub-fade-in mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl" style={{ background: 'linear-gradient(90deg, var(--text-primary), var(--radar-green))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {displayName}
            </h1>
            <p className="num mt-1 text-xs text-muted">
              {data.projectIdCode} · Report {data.reportDateEn}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-bold text-muted">PROJECT STATUS</span>
              <span className="flex items-center gap-1.5 text-sm font-extrabold" style={{ color: statusColor }}>
                <Heart size={13} className="radar-heart-beat" style={{ color: statusColor, fill: statusColor }} />
                {STATUS_LABEL_EN[data.status]}
              </span>
              <HeartbeatBar status={data.status} color={statusColor} />
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-bold text-muted">RADAR MODE</span>
              <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold" style={{ borderColor: 'var(--border-soft)', color: 'var(--radar-green)' }}>
                LIVE SCAN
                <span className="radar-live-dot h-2 w-2 rounded-full" style={{ background: 'var(--radar-green)' }} />
              </span>
            </div>
          </div>
        </div>

        <div className="hub-fade-in mb-4 flex flex-wrap gap-1.5">
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setCategoryFilter(f.key)}
              className="rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors"
              style={{
                borderColor: categoryFilter === f.key ? 'var(--radar-green)' : 'var(--border-soft)',
                color: categoryFilter === f.key ? 'var(--radar-green)' : undefined,
                background: categoryFilter === f.key ? 'color-mix(in srgb, var(--radar-green) 10%, transparent)' : undefined,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Main grid: performance rings | Radar | risk/issue stack | Lifecycle — four siblings so
            the radar (the hero element) gets the lion's share of the width instead of competing
            with the lifecycle card inside a shared, narrower wrapper. Lifecycle sits in the
            rightmost column, narrowed down so the radar column gets the extra space. */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[210px_minmax(0,1fr)_190px_168px] xl:items-stretch">
          <div className="flex flex-col gap-3">
            <PerformanceRingCard
              title="PROJECT HEALTH"
              pct={data.kpi.health} color={healthColor} ringSub="/100"
              bigValue={String(data.kpi.health)} bigValueColor="var(--text-primary)"
              caption={healthCaption} captionColor={healthColor}
            />
            <PerformanceRingCard
              title="TIME PERFORMANCE"
              pct={data.kpi.progressActual} color={timeColor} ringUnit="%"
              bigValue={`${timeVariance > 0 ? '+' : ''}${timeVariance}%`} bigValueColor={timeColor}
              caption={timeCaption} captionColor={timeColor}
            />
            <PerformanceRingCard
              title="COST PERFORMANCE"
              pct={data.kpi.costPerformancePct} color={costColor} ringUnit="%"
              bigValue={`${data.kpi.costVariancePct > 0 ? '+' : ''}${data.kpi.costVariancePct}%`} bigValueColor={costColor}
              caption={costCaption} captionColor={costColor}
            />
            <PerformanceRingCard
              title="QUALITY PERFORMANCE"
              pct={data.kpi.qualityPct} color={qualityColor} ringUnit="%"
              bigValue={qualityCaption} bigValueColor={qualityColor}
            />
          </div>

          <div className="relative flex items-center justify-center p-4 sm:p-6">
            <RadarDisplay signals={visibleSignals} dimmed={scanning} />
          </div>

          <div className="flex flex-col gap-2">
            <SignalStatCard icon={ShieldAlert} label="ACTIVE RISKS" value={data.kpi.activeRisks} badge={`HIGH ${data.kpi.activeRisksHigh}`} badgeColor="#e74c3c" color="#e74c3c" />
            <SignalStatCard icon={Activity} label="OPEN ISSUES" value={data.kpi.openIssues} badge={`HIGH ${data.kpi.openIssuesHigh}`} badgeColor="#a78bfa" color="#a78bfa" />
            <SignalStatCard icon={Clock3} label="DELAYED ACTIVITIES" value={data.kpi.delayedActivities} color="var(--radar-amber)" />
            <SignalStatCard icon={RefreshCw} label="PENDING CHANGES" value={data.kpi.pendingChanges} color="#38bdf8" />
            <SignalStatCard icon={CheckCircle2} label="UPCOMING MILESTONES" value={data.kpi.upcomingMilestones} badge="NEXT 30 DAYS" badgeColor="var(--radar-green)" color="var(--radar-green)" />
          </div>

          <LifecyclePanel
            stages={data.lifecycle}
            overallPct={Math.round(data.lifecycle.reduce((sum, s) => sum + s.progressPct, 0) / data.lifecycle.length)}
          />
        </div>

        {/* Bottom row: critical signals | next gate | contract summary */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_2.3fr_1.5fr]">
          <CriticalSignalsPanel signals={data.signals} />
          <NextGatePanel gate={data.nextGate} stages={data.lifecycle} />
          <ContractPanel contract={data.contract} />
        </div>

        {/* Footer status bar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-[10px] text-muted" style={{ borderColor: 'var(--border-soft)' }}>
          <span>DATA SOURCE: SAMPLE (MOCK) — READY FOR API CONNECTION</span>
          <span className="num">PROJECTS: {masterProjects.length || 1}</span>
          <span className="flex items-center gap-1.5">
            <span className="radar-live-dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--radar-green)' }} />
            LIVE CONNECTION
          </span>
        </div>
      </main>
      </div>

      {/* ── Floating sidebar (all breakpoints) — docked to the visual right edge, which in this
          RTL app is `inset-inline-start` (inline-end resolves to the LEFT under dir="rtl"). ── */}
      <aside
        className="fixed bottom-0 top-0 z-40 w-64 overflow-y-auto border-e p-3 shadow-2xl transition-transform duration-300"
        style={{
          insetInlineStart: 0,
          background: 'var(--bg-panel-solid)',
          borderColor: 'var(--border-soft)',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-[10px] font-bold text-muted">PROJECT MODULES</p>
          <button onClick={() => setSidebarOpen(false)} className="flex h-6 w-6 items-center justify-center rounded-lg hover:bg-white/5" title="Hide Menu">
            <ChevronsRight size={14} className="rotate-180 text-muted" />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <SidebarButton key={item.id} item={item} onClick={() => handleNavClick(item)} />
          ))}
        </div>
      </aside>

      {/* Toggle tab — stays reachable when the drawer is hidden, slides with it when open. */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        className="fixed top-24 z-40 flex h-9 w-7 items-center justify-center rounded-e-lg border border-s-0 shadow-lg transition-[inset-inline-start] duration-300"
        style={{
          insetInlineStart: sidebarOpen ? '16rem' : 0,
          background: 'var(--bg-panel-solid)',
          borderColor: 'var(--border-soft)',
        }}
        title={sidebarOpen ? 'Hide Menu' : 'Show Menu'}
      >
        <ChevronsRight size={14} className="text-muted transition-transform duration-300" style={{ transform: sidebarOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      {notice && (
        <div className="hub-toast fixed bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/15 bg-[var(--bg-panel-solid)] px-5 py-2.5 text-xs font-medium shadow-2xl">
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-brand-400" />
            {notice}
          </span>
        </div>
      )}

      {/* On mobile the sidebar overlays instead of pushing content, so tapping outside it closes it. */}
      {sidebarOpen && !isDesktop && (
        <button
          className="fixed inset-0 z-30 cursor-default bg-black/50"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        />
      )}

      {notifOpen && (
        <button
          className="fixed inset-0 z-20 cursor-default"
          onClick={() => setNotifOpen(false)}
          aria-label="Close"
        />
      )}
    </div>
  )
}

function SidebarButton({ item, onClick }: { item: NavItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12px] font-bold transition-colors hover:bg-white/5"
    >
      <item.icon size={15} style={{ color: item.accent }} />
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className="num rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold">{item.badge}</span>
      )}
    </button>
  )
}
