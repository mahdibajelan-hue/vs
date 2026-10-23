import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowRight, Bell, CheckCircle2,
  Clock3, Heart, PanelRightOpen, Radar as RadarIcon, RefreshCw,
  ShieldAlert, X,
} from 'lucide-react'
import { useModuleStore, type ModuleKey } from '../../../store/useModuleStore'
import { hasModuleAccess, useModuleAccessStore } from '../../../store/useModuleAccessStore'
import { useMasterDataStore } from '../../../modules/masterdata/store/useMasterDataStore'
import { useProjectContextStore } from '../../../store/useProjectContextStore'
import { useNotificationStore } from '../../../store/useNotificationStore'
import { RadarProjectPicker } from './RadarProjectPicker'
import { RadarSidebar } from './RadarSidebar'
import { MobileRadar } from './MobileRadar'
import { projectBadges, rememberProject, type ProjectNavItem } from './projectNav'
import './radarShell.css'
import { SignOutButton } from '../SignOutButton'
import { HeartbeatBar } from './HeartbeatBar'
import { RadarDisplay } from './RadarDisplay'
import { CriticalSignalsPanel, ContractPanel, LifecyclePanel, NextGatePanel, PerformanceRingCard, SignalStatCard } from './RadarPanels'
import { buildRadarData } from './radarLiveData'
import {
  DEFAULT_RADAR_DATA, SIGNAL_CATEGORY_LABEL_EN, STATUS_COLOR, STATUS_LABEL_EN, buildMockRadarData,
  type RadarData, type SignalCategory,
} from './radarTypes'

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

export function ProjectRadarPage({ onBack }: { onBack: () => void }) {
  const accessibleModules = useModuleAccessStore((s) => s.accessibleModules)

  const mdLoaded = useMasterDataStore((s) => s.loaded)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const masterProjects = useMasterDataStore((s) => s.projects)
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  // the whole context follows the chosen project, so modules that filter by portfolio/program agree with it
  const pickProject = (id: string | null) => {
    const p = id ? masterProjects.find((x) => x.id === id) : null
    if (p) rememberProject(p.id)
    useProjectContextStore.setState({ portfolioId: p?.portfolioId ?? null, programId: p?.programId ?? null, projectId: p?.id ?? null, phaseId: null })
  }
  const notifications = useNotificationStore((s) => s.items)
  const projectOf = useNotificationStore((s) => s.projectOf)
  const badgeFor = useMemo(() => projectBadges(notifications, projectOf, contextProjectId), [notifications, projectOf, contextProjectId])

  useEffect(() => {
    if (!mdLoaded) fetchMasterData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedProject = useMemo(() => masterProjects.find((p) => p.id === contextProjectId) ?? null, [masterProjects, contextProjectId])

  // Shows the deterministic mock instantly (no loading flicker), then upgrades in place to live
  // Risk/Issue data once fetchProjectIntelligence resolves — a project with no confirmed module
  // mapping yet just keeps looking like the mock, same "unmapped" convention Reporting already uses.
  const [data, setData] = useState<RadarData>(DEFAULT_RADAR_DATA)
  useEffect(() => {
    if (!selectedProject) {
      setData(DEFAULT_RADAR_DATA)
      return
    }
    const projectIdCode = selectedProject.projectIdCode || selectedProject.projectCode
    setData(buildMockRadarData(selectedProject.id, selectedProject.officialName, projectIdCode))
    let cancelled = false
    buildRadarData(selectedProject.id, selectedProject.officialName, projectIdCode).then((live) => {
      if (!cancelled) setData(live)
    })
    return () => {
      cancelled = true
    }
  }, [selectedProject])

  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(100)
  const [categoryFilter, setCategoryFilter] = useState<SignalCategory | 'all'>('all')
  const [notifOpen, setNotifOpen] = useState(false)
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
  // phones get their own one-column radar (MobileRadar); the instrument panel below is for wider screens
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const on = (e: MediaQueryListEvent) => setIsPhone(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
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

  const handleNavClick = (item: ProjectNavItem) => {
    if (!isDesktop) setSidebarOpen(false)
    if (!item.module) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    useModuleStore.getState().enterModule(item.module, 'project')
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

  if (!contextProjectId || (mdLoaded && !selectedProject)) {
    return <RadarProjectPicker onPick={pickProject} onBack={onBack} />
  }


  if (isPhone && selectedProject) {
    return (
      <MobileRadar
        project={selectedProject}
        data={data}
        canSee={isVisible}
        badgeFor={badgeFor}
        onItem={handleNavClick}
        onSwitch={() => pickProject(null)}
        onHome={onBack}
      />
    )
  }

  return (
    <div dir="ltr" className="radar-en relative min-h-screen w-screen overflow-x-clip" style={{ background: 'var(--bg-app)' }}>
      <div className="radar-page-texture" aria-hidden="true" />
      {/* Reserves space for the floating sidebar instead of letting it overlap the content
          (the sidebar itself is `position: fixed`, so it takes no layout space on its own). */}
      <div className="relative z-10 transition-[margin] duration-300" style={{ marginRight: isDesktop && sidebarOpen ? '17rem' : 0 }}>
      {/* ── Topbar ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            title="صفحهٔ اصلی"
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

        {!sidebarOpen && (
          <button type="button" dir="rtl" onClick={() => setSidebarOpen(true)} className="rs-open">
            <PanelRightOpen size={15} aria-hidden /> ماژول‌های پروژه
          </button>
        )}

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

      <main className="min-w-0 flex-1 p-4 sm:p-6">
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
            with the lifecycle card inside a shared, narrower wrapper. The stat-card column (right
            next to Lifecycle) and Lifecycle itself are both narrowed so the radar column gets the
            extra space. */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[210px_minmax(0,1fr)_158px_168px] xl:items-stretch">
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

      {selectedProject && (
        <RadarSidebar
          project={selectedProject}
          active="overview"
          canSee={isVisible}
          badgeFor={badgeFor}
          open={sidebarOpen}
          overlay={!isDesktop}
          onItem={handleNavClick}
          onSwitch={() => pickProject(null)}
          onHome={onBack}
          onClose={() => setSidebarOpen(false)}
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
