/**
 * Portfolio resource capacity from what is really on site (council item) — manpower and equipment as recorded in the
 * approved daily reports of the execution module, not role coverage in master data.
 *
 *  - deployed     = average units on the project (total on the daily report)
 *  - working      = average active units
 *  - idle         = available but not working
 *  - unavailable  = in repair, stopped or on leave
 *  - utilisation  = working ÷ deployed
 *  - planned      = the scheduling module's resource limit (max units) when one is defined; a gap is shown only
 *                   against a real plan, never against an assumed one.
 */

export type ResKind = 'man' | 'equip'

export interface ResUsageRow {
  projectId: string
  ym: string
  kind: ResKind
  name: string
  days: number
  avgTotal: number
  avgActive: number
  avgIdle: number
  avgUnavailable: number
  peakTotal: number
  lastDate: string
}

export interface ResPlanRow { projectId: string; name: string; kind: string; maxUnits: number; execMatch: string }

export interface ResLine {
  kind: ResKind
  name: string
  deployed: number
  working: number
  idle: number
  unavailable: number
  utilisation: number | null
  planned: number | null
  /** deployed − planned (negative = short of plan) */
  gap: number | null
  projects: { projectId: string; deployed: number; working: number }[]
}

export interface ResProjectLine {
  projectId: string
  manDeployed: number
  manWorking: number
  equipDeployed: number
  equipWorking: number
  equipIdle: number
  equipUnavailable: number
  manUtil: number | null
  equipUtil: number | null
  lastDate: string
  days: number
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null)
const planKind = (k: string): ResKind | null => (/^(man|labou?r|human|personnel|crew)/i.test(k) ? 'man' : /^(equip|machine|plant)/i.test(k) ? 'equip' : null)

/** the most recent month that has data for each project — "today's" capacity, not an average over history */
export function latestMonthRows(rows: ResUsageRow[]) {
  const latest = new Map<string, string>()
  for (const r of rows) if (!latest.has(r.projectId) || r.ym > latest.get(r.projectId)!) latest.set(r.projectId, r.ym)
  return rows.filter((r) => latest.get(r.projectId) === r.ym)
}

export function byResource(rows: ResUsageRow[], plans: ResPlanRow[]): ResLine[] {
  const m = new Map<string, ResLine>()
  for (const r of latestMonthRows(rows)) {
    const key = `${r.kind}|${r.name}`
    const l = m.get(key) ?? { kind: r.kind, name: r.name, deployed: 0, working: 0, idle: 0, unavailable: 0, utilisation: null, planned: null, gap: null, projects: [] }
    l.deployed += r.avgTotal; l.working += r.avgActive; l.idle += r.avgIdle; l.unavailable += r.avgUnavailable
    l.projects.push({ projectId: r.projectId, deployed: r.avgTotal, working: r.avgActive })
    m.set(key, l)
  }
  for (const p of plans) {
    const kind = planKind(p.kind)
    const name = (p.execMatch || p.name).trim()
    if (!kind || !name || !(p.maxUnits > 0)) continue
    const key = `${kind}|${name}`
    const l = m.get(key) ?? { kind, name, deployed: 0, working: 0, idle: 0, unavailable: 0, utilisation: null, planned: null, gap: null, projects: [] }
    l.planned = (l.planned ?? 0) + p.maxUnits
    m.set(key, l)
  }
  for (const l of m.values()) {
    l.utilisation = ratio(l.working, l.deployed)
    l.gap = l.planned != null ? l.deployed - l.planned : null
  }
  return [...m.values()].sort((a, b) => (a.kind === b.kind ? b.deployed - a.deployed : a.kind === 'man' ? -1 : 1))
}

export function byProject(rows: ResUsageRow[]): ResProjectLine[] {
  const m = new Map<string, ResProjectLine>()
  for (const r of latestMonthRows(rows)) {
    const l = m.get(r.projectId) ?? { projectId: r.projectId, manDeployed: 0, manWorking: 0, equipDeployed: 0, equipWorking: 0, equipIdle: 0, equipUnavailable: 0, manUtil: null, equipUtil: null, lastDate: '', days: 0 }
    if (r.kind === 'man') { l.manDeployed += r.avgTotal; l.manWorking += r.avgActive }
    else { l.equipDeployed += r.avgTotal; l.equipWorking += r.avgActive; l.equipIdle += r.avgIdle; l.equipUnavailable += r.avgUnavailable }
    if (r.lastDate > l.lastDate) l.lastDate = r.lastDate
    l.days = Math.max(l.days, r.days)
    m.set(r.projectId, l)
  }
  for (const l of m.values()) { l.manUtil = ratio(l.manWorking, l.manDeployed); l.equipUtil = ratio(l.equipWorking, l.equipDeployed) }
  return [...m.values()].sort((a, b) => b.manDeployed - a.manDeployed)
}

/** portfolio headcount and fleet per month (sum over projects of each month's daily average) */
export function monthlyTrend(rows: ResUsageRow[]) {
  const m = new Map<string, { ym: string; man: number; manWorking: number; equip: number; equipWorking: number }>()
  for (const r of rows) {
    const t = m.get(r.ym) ?? { ym: r.ym, man: 0, manWorking: 0, equip: 0, equipWorking: 0 }
    if (r.kind === 'man') { t.man += r.avgTotal; t.manWorking += r.avgActive } else { t.equip += r.avgTotal; t.equipWorking += r.avgActive }
    m.set(r.ym, t)
  }
  return [...m.values()].sort((a, b) => a.ym.localeCompare(b.ym))
}

export type ResFlag = 'idle' | 'unavailable' | 'short' | 'shared'
export const RES_FLAG_FA: Record<ResFlag, string> = {
  idle: 'بیکاری بالا (بیش از ۱۵٪ آماده ولی بدون کار)',
  unavailable: 'خارج از کار بالا — تعمیر، توقف یا مرخصی بیش از ۱۵٪',
  short: 'کمتر از برنامهٔ منابع',
  shared: 'هم‌زمان در چند پروژه — رقابت بر سر منبع',
}

export function flagsOf(l: ResLine): ResFlag[] {
  const f: ResFlag[] = []
  if (l.deployed > 0 && l.idle / l.deployed > 0.15) f.push('idle')
  if (l.deployed > 0 && l.unavailable / l.deployed > 0.15) f.push('unavailable')
  if (l.gap != null && l.planned != null && l.gap < -0.1 * l.planned) f.push('short')
  if (l.projects.length > 1) f.push('shared')
  return f
}
