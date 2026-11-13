import {
  IcBarrelCoin, IcColumn, IcControlPanel, IcCrane, IcFlare, IcGateValve, IcHardHats, IcHydroTest, IcManifold, IcWeldXray, IcPig, IcPipeStack,
  IcPulseGauge, IcRadarScope, IcReroute, IcRowMarker, IcSafetyValve, IcScheduleBars, IcSpectacleBlind, IcStatement, IcWellhead, type NavIcon,
} from './industryIcons'
import { PROJECT_SCOPED_MODULES, type ModuleKey } from '../../../store/useModuleStore'
import type { MasterProject } from '../../../modules/masterdata/types'

/**
 * اتاق فرمان پروژه — what lives inside the radar (project-scoped modules), grouped the way a project team thinks.
 * Organization-wide modules (portfolio, reporting, estimation, missions, supervision, competency, users) stay on the home page.
 */
export interface ProjectNavItem {
  id: string
  /** null = the radar overview itself */
  module: ModuleKey | null
  label: string
  /** an industrial line icon (industryIcons.tsx), drawn on lucide's grid */
  icon: NavIcon
  accent: string
  /** shown as a sub-item of another entry (e.g. quality control, tests and stations under execution) */
  parent?: string
}
export interface ProjectNavGroup { id: string; label: string; items: ProjectNavItem[] }

export const PROJECT_NAV: ProjectNavGroup[] = [
  { id: 'watch', label: 'پایش', items: [
    { id: 'overview', module: null, label: 'رادار پروژه', icon: IcRadarScope, accent: '#22c55e' },
    { id: 'dashboard', module: 'projectdashboard', label: 'داشبورد پروژه', icon: IcControlPanel, accent: '#60a5fa' },
    { id: 'health', module: 'healthcenter', label: 'مرکز سلامت پروژه', icon: IcPulseGauge, accent: '#2dd4bf' },
    // Stage-Gate is the lifecycle of record; the EPC control tower lives inside it as a tab
    { id: 'stagegate', module: 'stagegate', label: 'چرخهٔ عمر (Stage-Gate)', icon: IcGateValve, accent: '#38bdf8' },
  ] },
  { id: 'time', label: 'زمان و اجرا', items: [
    { id: 'scheduling', module: 'scheduling', label: 'برنامه‌ریزی و کنترل زمان', icon: IcScheduleBars, accent: '#14b8a6' },
    { id: 'engineering', module: 'engineering', label: 'پیشرفت مهندسی', icon: IcColumn, accent: '#818cf8' },
    { id: 'material', module: 'material', label: 'کنترل و تأمین کالا', icon: IcPipeStack, accent: '#f59e0b' },
    { id: 'execution', module: 'execution', label: 'مدیریت اجرا', icon: IcCrane, accent: '#fb923c' },
    { id: 'weldqc', module: 'weldqc', label: 'کنترل کیفیت', icon: IcWeldXray, accent: '#0891b2', parent: 'execution' },
    { id: 'testing', module: 'testing', label: 'آزمایش‌ها (هیدروتست)', icon: IcHydroTest, accent: '#0ea5e9', parent: 'execution' },
    { id: 'stationpiping', module: 'stationpiping', label: 'ایستگاه‌ها (پایپینگ و جوشکاری)', icon: IcManifold, accent: '#6366f1', parent: 'execution' },
    { id: 'pssr', module: 'pssr', label: 'آمادگی راه‌اندازی (PSSR)', icon: IcSafetyValve, accent: '#f97316' },
  ] },
  { id: 'money', label: 'قرارداد و هزینه', items: [
    { id: 'finance', module: 'finance', label: 'قراردادها و مالی', icon: IcBarrelCoin, accent: '#10b981' },
    { id: 'statements', module: 'statements', label: 'تولید صورت‌وضعیت (E·P·C)', icon: IcStatement, accent: '#14b8a6' },
    { id: 'change', module: 'change', label: 'مدیریت تغییرات', icon: IcReroute, accent: '#eab308' },
  ] },
  { id: 'risk', label: 'ریسک و مسائل', items: [
    { id: 'risk', module: 'risk', label: 'مدیریت ریسک', icon: IcFlare, accent: '#f43f5e' },
    { id: 'taskissue', module: 'taskissue', label: 'موانع و اقدامات', icon: IcSpectacleBlind, accent: '#f97316' },
    { id: 'stakeholders', module: 'stakeholders', label: 'مدیریت ذینفعان', icon: IcHardHats, accent: '#a78bfa' },
  ] },
  { id: 'assets', label: 'زمین و دارایی', items: [
    { id: 'landacq', module: 'landacq', label: 'تملک و آزادسازی اراضی', icon: IcRowMarker, accent: '#84cc16' },
    { id: 'pipepulse', module: 'pipepulse', label: 'PipePulse', icon: IcPig, accent: '#0ea5e9' },
    { id: 'twin', module: 'pipelinedigitaltwin', label: 'دوقلوی دیجیتال', icon: IcWellhead, accent: '#38bdf8' },
  ] },
]

/** Modules reached only through the radar (they are no longer tiles on the home page). */
export const PROJECT_MODULES = PROJECT_SCOPED_MODULES

/** 'issues' and 'taskissue' are the same module (مدیریت موانع و اقدامات): one menu entry, one badge. */
export const navModule = (key: ModuleKey): ModuleKey => (key === 'issues' ? 'taskissue' : key)

/**
 * Menu badge inside a project: only that project's items of the module (the bell itself still shows everything).
 * `work` is the person's waiting work from «کارتابل من»; a module shows the larger of its alerts and its work, since
 * some of the same things reach both lists and must not be counted twice.
 */
export function projectBadges(items: { id: string; module: ModuleKey }[], projectOf: Record<string, string>, projectId: string | null, work: { module: ModuleKey; projectId: string | null }[] = []): (key: ModuleKey) => number {
  const bell = new Map<ModuleKey, number>(), mine = new Map<ModuleKey, number>()
  const add = (m: Map<ModuleKey, number>, k: ModuleKey) => m.set(navModule(k), (m.get(navModule(k)) ?? 0) + 1)
  if (projectId) {
    for (const n of items) if (projectOf[n.id] === projectId) add(bell, n.module)
    for (const w of work) if (w.projectId === projectId) add(mine, w.module)
  }
  return (key) => Math.max(bell.get(key) ?? 0, mine.get(key) ?? 0)
}

// ── recently opened projects (per browser) ──────────────────────────────────
const RECENT_KEY = 'farin.radar.recent'
export function recentProjects(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] } catch { return [] }
}
export function setRecentProjects(ids: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, 50))) } catch { /* private mode */ }
}
export function rememberProject(id: string) {
  setRecentProjects([id, ...recentProjects().filter((x) => x !== id)])
}
/** Most recently opened first (every project ever opened, in visit order), then the never-opened ones by name. */
export function orderProjects(list: MasterProject[], rec: string[] = recentProjects()): MasterProject[] {
  const rank = (p: MasterProject) => { const i = rec.indexOf(p.id); return i < 0 ? 999 : i }
  return [...list].sort((a, b) => rank(a) - rank(b) || a.officialName.localeCompare(b.officialName, 'fa'))
}

/** Share of the contract period already elapsed (0–100), from real master data; null when the dates are missing. */
export function timeElapsed(p: MasterProject, today = new Date()): number | null {
  const start = p.contractStartDate ?? p.plannedStartDate
  const end = p.revisedCompletionDate ?? p.contractualCompletionDate ?? p.plannedFinishDate
  if (!start || !end) return null
  const s = Date.parse(start), e = Date.parse(end)
  if (!(e > s)) return null
  return Math.max(0, Math.min(100, Math.round(((today.getTime() - s) / (e - s)) * 100)))
}
export const projectEnd = (p: MasterProject) => p.revisedCompletionDate ?? p.contractualCompletionDate ?? p.plannedFinishDate
