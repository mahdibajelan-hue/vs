import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, Award, Banknote, BarChart3, Bell, Briefcase, Calculator, CheckCircle2, ChevronDown,
  Clock3, FileText, GitBranch, Package, Radar as RadarIcon, RefreshCw, Route, Settings, ShieldAlert,
  ShieldCheck, Sparkles, Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ModuleKey } from '../../store/useModuleStore'
import { hasModuleAccess, useModuleAccessStore } from '../../store/useModuleAccessStore'
import { useMasterDataStore } from '../../modules/masterdata/store/useMasterDataStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { SignOutButton } from './SignOutButton'
import { RadarDisplay } from './radar/RadarDisplay'
import { CriticalSignalsPanel, ContractPanel, EpcPanel, KpiRingCard, KpiStatRow, LifecyclePanel, NextGatePanel } from './radar/RadarPanels'
import {
  DEFAULT_RADAR_DATA, SIGNAL_CATEGORY_LABEL_FA, STATUS_COLOR, STATUS_LABEL_FA, buildMockRadarData, toFa,
  type SignalCategory,
} from './radar/radarTypes'

/** Primary sidebar — the 9 items from the brief, each mapped to a real RASTA module wherever one
 * exists. Two (Change Management, Document Center) have no backing module yet, so they behave
 * like the old hub's "soon" cards: a toast, not a dead link. */
interface NavItem {
  id: string
  moduleKey: ModuleKey | null
  title: string
  englishTag: string
  icon: LucideIcon
  accent: string
  badge?: number
}

/** Every other existing RASTA module that isn't one of the 9 headline items — kept reachable in a
 * compact secondary row so this redesign never strands functionality that shipped before it. */
const OTHER_MODULES: { key: ModuleKey; title: string; icon: LucideIcon; accent: string }[] = [
  { key: 'pipepulse', title: 'PipePulse', icon: Sparkles, accent: '#0ea5e9' },
  { key: 'material', title: 'تامین کالا', icon: Package, accent: '#f59e0b' },
  { key: 'executive', title: 'مدیریت سبد پروژه‌ها', icon: Briefcase, accent: '#6366f1' },
  { key: 'competency', title: 'ارزیابی شایستگی', icon: Award, accent: '#a855f7' },
  { key: 'estimator', title: 'برآورد هزینه', icon: Calculator, accent: '#F2B705' },
  { key: 'pipelinedigitaltwin', title: 'دوقلوی دیجیتال', icon: Route, accent: '#38bdf8' },
  { key: 'admin', title: 'مدیریت کاربران', icon: Users, accent: '#c9a227' },
]

const CATEGORY_FILTERS: { key: SignalCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'همه' },
  { key: 'risk', label: SIGNAL_CATEGORY_LABEL_FA.risk },
  { key: 'issue', label: SIGNAL_CATEGORY_LABEL_FA.issue },
  { key: 'delay', label: SIGNAL_CATEGORY_LABEL_FA.delay },
  { key: 'change', label: SIGNAL_CATEGORY_LABEL_FA.change },
  { key: 'contract', label: SIGNAL_CATEGORY_LABEL_FA.contract },
  { key: 'gate', label: SIGNAL_CATEGORY_LABEL_FA.gate },
  { key: 'milestone', label: SIGNAL_CATEGORY_LABEL_FA.milestone },
]

const SCAN_DURATION_MS = 1400

export function ModuleHub({ onEnterModule }: { onEnterModule: (key: ModuleKey) => void }) {
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)
  const accessibleModules = useModuleAccessStore((s) => s.accessibleModules)

  const mdLoaded = useMasterDataStore((s) => s.loaded)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const masterProjects = useMasterDataStore((s) => s.projects)
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const setContextProject = useProjectContextStore((s) => s.setProject)

  useEffect(() => {
    if (!mdLoaded) fetchMasterData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedProject = useMemo(() => masterProjects.find((p) => p.id === contextProjectId) ?? null, [masterProjects, contextProjectId])

  const data = useMemo(() => {
    if (!selectedProject) return DEFAULT_RADAR_DATA
    return buildMockRadarData(selectedProject.id, selectedProject.officialName, selectedProject.projectIdCode || selectedProject.projectCode)
  }, [selectedProject])

  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(100)
  const [categoryFilter, setCategoryFilter] = useState<SignalCategory | 'all'>('all')
  const [notifOpen, setNotifOpen] = useState(false)
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)

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
    { id: 'radar', moduleKey: null, title: 'Project Radar', englishTag: 'رادار پروژه', icon: RadarIcon, accent: 'var(--radar-green)' },
    { id: 'lifecycle-nav', moduleKey: 'lifecycle', title: 'راهبر چرخه عمر', englishTag: 'Lifecycle Navigator', icon: GitBranch, accent: 'var(--radar-cyan)' },
    { id: 'epc-tower', moduleKey: 'lifecycle', title: 'برج کنترل EPC', englishTag: 'EPC Control Tower', icon: ShieldCheck, accent: 'var(--radar-amber)' },
    { id: 'contract', moduleKey: 'finance', title: 'کنترل قرارداد', englishTag: 'Contract Control', icon: Banknote, accent: '#10b981' },
    { id: 'risk', moduleKey: 'risk', title: 'مدیریت ریسک', englishTag: 'Risk Management', icon: ShieldAlert, accent: '#e74c3c', badge: data.kpi.activeRisks },
    { id: 'issue', moduleKey: 'issues', title: 'مدیریت مسائل', englishTag: 'Issue Management', icon: Activity, accent: '#a78bfa', badge: data.kpi.openIssues },
    { id: 'change', moduleKey: null, title: 'مدیریت تغییرات', englishTag: 'Change Management', icon: RefreshCw, accent: '#f59e0b', badge: data.kpi.pendingChanges },
    { id: 'docs', moduleKey: null, title: 'مرکز اسناد', englishTag: 'Document Center', icon: FileText, accent: '#64748b' },
    { id: 'reports', moduleKey: 'reporting', title: 'گزارش و تحلیل', englishTag: 'Reports & Analytics', icon: BarChart3, accent: '#2dd4bf' },
  ]
  const NAV_ITEMS = ALL_NAV_ITEMS.filter((n) => n.moduleKey === null || isVisible(n.moduleKey))

  const handleNavClick = (item: NavItem) => {
    if (item.id === 'radar') return
    if (!item.moduleKey) {
      setNotice(`«${item.title}» به‌زودی راه‌اندازی می‌شود`)
      window.clearTimeout(noticeTimer.current)
      noticeTimer.current = window.setTimeout(() => setNotice(null), 2600)
      return
    }
    onEnterModule(item.moduleKey)
  }

  const otherModules = OTHER_MODULES.filter((m) => isVisible(m.key))
  const statusColor = STATUS_COLOR[data.status]

  return (
    <div className="relative min-h-screen w-screen" style={{ background: 'var(--bg-app)' }}>
      {/* ── Topbar ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border" style={{ borderColor: 'color-mix(in srgb, var(--radar-green) 40%, transparent)', background: 'color-mix(in srgb, var(--radar-green) 10%, transparent)' }}>
            <RadarIcon size={19} style={{ color: 'var(--radar-green)' }} />
          </div>
          <div className="leading-tight">
            <p className="text-base font-extrabold tracking-wide">PROJECT RADAR</p>
            <p className="eyebrow-en text-[9px] text-muted" dir="ltr">Live Project Intelligence</p>
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-[11px]">
          <span className="text-muted">پروژه:</span>
          <button
            onClick={() => setProjectPickerOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-bold"
            style={{ borderColor: 'var(--border-soft)' }}
          >
            {selectedProject ? selectedProject.officialName : data.projectName}
            <ChevronDown size={12} className="text-muted" />
          </button>
          <span className="hidden text-muted sm:inline">شناسه:</span>
          <span className="num hidden font-bold sm:inline">{data.projectIdCode}</span>
          {projectPickerOpen && (
            <div
              className="absolute top-full z-30 mt-2 max-h-72 w-64 overflow-y-auto rounded-xl border p-1.5 shadow-2xl"
              style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)', insetInlineStart: 0 }}
            >
              <button
                onClick={() => { setContextProject(null); setProjectPickerOpen(false) }}
                className="block w-full rounded-lg px-2.5 py-1.5 text-right text-[11px] hover:bg-white/5"
              >
                نمای پیش‌فرض (نمونه)
              </button>
              {masterProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setContextProject(p.id); setProjectPickerOpen(false) }}
                  className="block w-full truncate rounded-lg px-2.5 py-1.5 text-right text-[11px] hover:bg-white/5"
                >
                  {p.officialName}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[11px] font-bold disabled:opacity-70"
            style={{ borderColor: 'color-mix(in srgb, var(--radar-green) 45%, var(--border-soft))', color: 'var(--radar-green)' }}
          >
            <RadarIcon size={14} className={scanning ? 'animate-spin' : ''} />
            {scanning ? `در حال اسکن... ${toFa(Math.round(scanProgress))}٪` : 'RADAR SCAN'}
          </button>

          <div className="relative">
            <button onClick={() => setNotifOpen((v) => !v)} className="relative flex h-9 w-9 items-center justify-center rounded-xl border" style={{ borderColor: 'var(--border-soft)' }}>
              <Bell size={15} />
              {data.kpi.activeRisksHigh + data.kpi.openIssuesHigh > 0 && (
                <span className="absolute -top-1 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {toFa(data.kpi.activeRisksHigh + data.kpi.openIssuesHigh)}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute top-full z-30 mt-2 w-72 rounded-xl border p-2 shadow-2xl" style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)', insetInlineEnd: 0 }}>
                <p className="mb-1.5 px-1.5 text-[10px] font-bold text-muted">هشدارهای با اولویت بالا</p>
                {data.signals.filter((s) => s.severity === 'critical' || s.severity === 'high').slice(0, 5).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[11px] hover:bg-white/5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.severity === 'critical' ? '#ef4444' : 'var(--radar-amber)' }} />
                    <span className="truncate">{s.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isVisible('admin') && (
            <button onClick={() => onEnterModule('admin')} title="تنظیمات و مدیریت کاربران" className="flex h-9 w-9 items-center justify-center rounded-xl border" style={{ borderColor: 'var(--border-soft)' }}>
              <Settings size={15} />
            </button>
          )}
          <SignOutButton className="flex h-9 items-center gap-1.5 rounded-xl border border-red-400/25 px-3 text-[11px] text-red-300 hover:bg-red-500/10 transition-colors" />
        </div>
      </header>

      <div className="flex">
        {/* ── Sidebar (desktop) ────────────────────────────────────────── */}
        <aside className="hidden w-56 shrink-0 border-l p-3 lg:flex lg:flex-col lg:gap-1" style={{ borderColor: 'var(--border-soft)' }}>
          {NAV_ITEMS.map((item) => (
            <SidebarButton key={item.id} item={item} active={item.id === 'radar'} onClick={() => handleNavClick(item)} />
          ))}
          {otherModules.length > 0 && (
            <>
              <p className="mb-1 mt-4 px-2 text-[9px] font-bold text-muted">سایر ماژول‌ها</p>
              <div className="flex flex-wrap gap-1.5 px-1">
                {otherModules.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => onEnterModule(m.key)}
                    title={m.title}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-white/5"
                    style={{ borderColor: 'var(--border-soft)' }}
                  >
                    <m.icon size={14} style={{ color: m.accent }} />
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          {/* Mobile nav strip */}
          <nav className="mb-4 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item)}
                className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold"
                style={{ borderColor: item.id === 'radar' ? item.accent : 'var(--border-soft)', color: item.id === 'radar' ? item.accent : undefined }}
              >
                <item.icon size={12} /> {item.title}
              </button>
            ))}
          </nav>

          {/* Status + scan filters */}
          <div className="hub-fade-in mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-bold text-muted">PROJECT STATUS</span>
              <span className="flex items-center gap-1.5 text-sm font-extrabold" style={{ color: statusColor }}>
                <span className="radar-live-dot h-2 w-2 rounded-full" style={{ background: statusColor }} />
                {STATUS_LABEL_FA[data.status].toUpperCase()}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setCategoryFilter(f.key)}
                  className="rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors"
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
          </div>

          {/* Main grid: KPI rings | Radar | Lifecycle */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div className="grid grid-cols-2 gap-3 lg:col-span-1 lg:grid-cols-1">
              <KpiRingCard title="سلامت پروژه" pct={data.kpi.health} color="var(--radar-green)" sub={data.kpi.health >= 70 ? 'GOOD' : data.kpi.health >= 50 ? 'FAIR' : 'POOR'} />
              <KpiRingCard title="پیشرفت پروژه" pct={data.kpi.progressActual} color="var(--radar-cyan)" sub={`برنامه ${toFa(data.kpi.progressPlanned)}٪ · واریانس ${toFa(data.kpi.progressActual - data.kpi.progressPlanned)}٪`} />
              <KpiRingCard title="عملکرد هزینه" pct={Math.round(data.kpi.cpi * 100)} color="var(--radar-amber)" sub={`CPI ${toFa(data.kpi.cpi.toFixed(2))}`} />
              <KpiRingCard title="عملکرد زمان" pct={Math.round(data.kpi.spi * 100)} color="#ef4444" sub={`SPI ${toFa(data.kpi.spi.toFixed(2))}`} />
            </div>

            <div className="lg:col-span-2">
              <RadarDisplay signals={visibleSignals} dimmed={scanning} />
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <KpiStatRow icon={ShieldAlert} label="ریسک فعال" value={data.kpi.activeRisks} sub={`${toFa(data.kpi.activeRisksHigh)} بالا`} color="#e74c3c" />
                <KpiStatRow icon={Activity} label="مسئله باز" value={data.kpi.openIssues} sub={`${toFa(data.kpi.openIssuesHigh)} بالا`} color="#a78bfa" />
                <KpiStatRow icon={Clock3} label="فعالیت معوق" value={data.kpi.delayedActivities} color="var(--radar-amber)" />
                <KpiStatRow icon={RefreshCw} label="تغییر در انتظار" value={data.kpi.pendingChanges} color="#f59e0b" />
                <KpiStatRow icon={CheckCircle2} label="نقطه عطف پیش‌رو" value={data.kpi.upcomingMilestones} sub="۳۰ روز آینده" color="var(--radar-green)" />
              </div>
            </div>

            <div className="lg:col-span-1">
              <LifecyclePanel stages={data.lifecycle} overallPct={Math.round((data.lifecycle.filter((s) => s.state === 'done').length / data.lifecycle.length) * 100)} />
            </div>
          </div>

          {/* Bottom row: signals, gate, contract, epc */}
          <div className={`mt-4 grid grid-cols-1 gap-4 ${data.epc ? 'lg:grid-cols-2 xl:grid-cols-4' : 'lg:grid-cols-3'}`}>
            <CriticalSignalsPanel signals={data.signals} />
            <NextGatePanel gate={data.nextGate} />
            <ContractPanel contract={data.contract} />
            {data.epc && <EpcPanel dims={data.epc} />}
          </div>

          {/* Footer status bar */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-[10px] text-muted" style={{ borderColor: 'var(--border-soft)' }}>
            <span>منبع داده: نمونه (Mock) — آماده اتصال به API</span>
            <span className="num">پروژه‌ها: {toFa(masterProjects.length || 1)}</span>
            <span className="flex items-center gap-1.5">
              <span className="radar-live-dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--radar-green)' }} />
              اتصال زنده
            </span>
          </div>
        </main>
      </div>

      {notice && (
        <div className="hub-toast fixed bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/15 bg-[var(--bg-panel-solid)] px-5 py-2.5 text-xs font-medium shadow-2xl">
          <span className="flex items-center gap-2">
            <Clock3 size={14} className="text-brand-400" />
            {notice}
          </span>
        </div>
      )}

      {(projectPickerOpen || notifOpen) && (
        <button
          className="fixed inset-0 z-20 cursor-default"
          onClick={() => { setProjectPickerOpen(false); setNotifOpen(false) }}
          aria-label="بستن"
        />
      )}
    </div>
  )
}

function SidebarButton({ item, active, onClick }: { item: NavItem; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-right text-[12px] font-bold transition-colors hover:bg-white/5"
      style={{ color: active ? item.accent : undefined, background: active ? 'color-mix(in srgb, var(--radar-green) 8%, transparent)' : undefined }}
    >
      <item.icon size={15} style={{ color: item.accent }} />
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className="num rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold">{toFa(item.badge)}</span>
      )}
    </button>
  )
}
