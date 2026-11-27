/**
 * The contractor's daily report (DR) sheets, as printed on site: activity progress, operations and obstacles, the
 * manpower list and the machinery list in four side-by-side bands, and the next-day forecast. Everything is read from
 * the day's site-status reports and the registered rows — nothing is typed here.
 */
import type { Activity, Report, ReportLine, ReportResource } from '../types'
import { EQUIP_CATALOG, EQUIP_COLS, MAN_CATALOG, MAN_COLS, type ResField } from './resourceCatalog'
import { chainText } from './chainage'

export interface BandRow { section: string; span: number; name: string; vals: number[] }
export interface Bands { head: string[]; bands: BandRow[][]; total: number[] }

const isReg = (r: Report) => r.formKey === 'work' && r.status !== 'draft' && r.status !== 'incomplete' && r.status !== 'rejected'

/**
 * Manpower or machinery of the day summed over the given site-status reports, laid out like the paper: every row of the
 * catalog (zeros included) grouped by section, the sections distributed over `n` bands of nearly equal height without
 * splitting a section, and the grand total.
 */
export function resourceBands(resources: Pick<ReportResource, 'kind' | 'section' | 'name' | ResField>[], kind: 'man' | 'equip', n = 4): Bands {
  const cols = kind === 'man' ? MAN_COLS : EQUIP_COLS
  const catalog = kind === 'man' ? MAN_CATALOG : EQUIP_CATALOG
  const sums = new Map<string, number[]>()
  const extra = new Map<string, string[]>() // rows typed on site that are not in the catalog, per section
  const key = (s: string, nm: string) => `${s}|${nm}`
  for (const r of resources) {
    if (r.kind !== kind) continue
    const k = key(r.section, r.name)
    const v = sums.get(k) ?? cols.map(() => 0)
    cols.forEach(([f], i) => { v[i] += Number(r[f]) || 0 })
    sums.set(k, v)
    if (!catalog.some((c) => c.section === r.section && c.items.includes(r.name))) { const e = extra.get(r.section) ?? []; if (!e.includes(r.name)) e.push(r.name); extra.set(r.section, e) }
  }
  const sections = [...catalog.map((c) => ({ section: c.section, items: [...c.items, ...(extra.get(c.section) ?? [])] })), ...[...extra.entries()].filter(([s]) => !catalog.some((c) => c.section === s)).map(([section, items]) => ({ section, items }))]
  const rowsOf = (s: { section: string; items: string[] }): BandRow[] => s.items.map((name, i) => ({ section: i === 0 ? s.section : '', span: i === 0 ? s.items.length : 0, name, vals: sums.get(key(s.section, name)) ?? cols.map(() => 0) }))
  const all = sections.map(rowsOf)
  // sections in order over n bands so that the tallest band is as short as possible (linear partition; a section is never split)
  const len = all.map((x) => x.length), m = len.length
  const pre = [0]; for (const l of len) pre.push(pre[pre.length - 1] + l)
  const best: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity)), cut: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  best[0][0] = 0
  for (let k = 1; k <= n; k++) for (let i = 0; i <= m; i++) for (let j = 0; j <= i; j++) { const v = Math.max(best[k - 1][j], pre[i] - pre[j]); if (v < best[k][i]) { best[k][i] = v; cut[k][i] = j } }
  const bounds: number[] = []; for (let k = n, i = m; k > 0; k--) { bounds.unshift(cut[k][i]); i = cut[k][i] }
  const bands: BandRow[][] = bounds.map((from, k) => all.slice(from, k + 1 < bounds.length ? bounds[k + 1] : m).flat())
  while (bands.length < n) bands.push([])
  const total = cols.map((_, i) => [...sums.values()].reduce((x, v) => x + v[i], 0))
  return { head: cols.map(([, l]) => l), bands, total }
}

export interface ProgressRow { activity: Activity; base: number; kmFrom: number | null; kmTo: number | null; prev: number; today: number; cum: number; remaining: number; pct: number; note: string }

/** progress of every activity on the day: reported (pending + approved) quantities, as the contractor's sheet counts them */
export function dayProgress(activities: Activity[], reports: Report[], lines: ReportLine[], day: string, baseOf: (a: Activity) => number): ProgressRow[] {
  const rep = new Map(reports.filter(isReg).map((r) => [r.id, r]))
  const acts = new Map(activities.map((a) => [a.id, a]))
  const out = new Map<string, ProgressRow>()
  for (const l of lines) {
    if (!l.activityId || l.status === 'rejected') continue
    const r = rep.get(l.reportId), a = acts.get(l.activityId)
    if (!r || !a || r.reportDate > day) continue
    let x = out.get(a.id)
    if (!x) { x = { activity: a, base: baseOf(a), kmFrom: null, kmTo: null, prev: 0, today: 0, cum: 0, remaining: 0, pct: 0, note: '' }; out.set(a.id, x) }
    const q = l.status === 'approved' ? l.approvedQty ?? l.qty : l.qty
    x.cum += q
    if (r.reportDate === day) {
      x.today += q
      if (l.kmFrom != null) x.kmFrom = x.kmFrom == null ? l.kmFrom : Math.min(x.kmFrom, l.kmFrom)
      if (l.kmTo != null) x.kmTo = x.kmTo == null ? l.kmTo : Math.max(x.kmTo, l.kmTo)
      if (l.note && !x.note.includes(l.note)) x.note = x.note ? `${x.note}؛ ${l.note}` : l.note
    } else x.prev += q
  }
  for (const x of out.values()) { x.remaining = x.base - x.cum; x.pct = x.base > 0 ? x.cum / x.base : 0 }
  return [...out.values()].sort((a, b) => (a.activity.sort - b.activity.sort) || a.activity.itemNo.localeCompare(b.activity.itemNo, 'fa', { numeric: true }))
}

const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter((x) => x.trim()) : [])

/** the day's site-status reports (one per front, or the chosen front) */
export const dayReports = (reports: Report[], day: string, front?: string) => reports.filter((r) => isReg(r) && r.reportDate === day && !r.completionOf && (!front || r.front === front))

/** operations (12 lines) and obstacles (3 lines) of the day, as on the sheet */
export function dayNarrative(days: Report[]): { ops: string[]; obstacles: string[] } {
  const tag = (r: Report, x: string) => (days.length > 1 && r.front ? `${r.front}: ${x}` : x)
  return { ops: days.flatMap((r) => list(r.data?.ops).map((x) => tag(r, x))), obstacles: days.flatMap((r) => list(r.data?.obstacles).map((x) => tag(r, x))) }
}

export interface NextRow { op: string; kmFrom: string; kmTo: string; unit: string; qty: number; crew: string; note: string }
/** the next-day forecast of the day's reports */
export function dayNext(days: Report[]): { date: string; hours: number; condition: string; rows: NextRow[] } {
  let date = '', hours = 0, condition = ''
  const rows: NextRow[] = []
  for (const r of days) {
    const n = r.data?.nextDay as { date?: string; hours?: number; condition?: string; rows?: { op?: string; kmFrom?: number; kmTo?: number; unit?: string; qty?: number; crew?: string; note?: string }[] } | undefined
    if (!n) continue
    date ||= n.date ?? ''; hours = Math.max(hours, Number(n.hours) || 0); condition ||= n.condition ?? ''
    for (const x of n.rows ?? []) if (x.op?.trim()) rows.push({ op: x.op, kmFrom: x.kmFrom ? chainText(x.kmFrom) : '', kmTo: x.kmTo ? chainText(x.kmTo) : '', unit: x.unit ?? '', qty: Number(x.qty) || 0, crew: x.crew ?? '', note: x.note ?? '' })
  }
  return { date, hours, condition, rows }
}

const WEATHER: Record<string, string> = { sunny: 'آفتابی', partly: 'نیمه‌ابری', cloudy: 'ابری', rainy: 'بارانی', snowy: 'برفی', stormy: 'طوفانی' }
const SITE: Record<string, string> = { active: 'فعال', partial: 'فعالیت محدود', stopped: 'تعطیل' }
const GROUND: Record<string, string> = { dry: 'خشک', mud: 'گل', wet: 'خیس', frozen: 'یخ‌زده', snow: 'برفی' }
/** the sheet's header row: site and weather of the day (the first report of the day that has them) */
export function dayHeader(days: Report[]): { label: string; value: string }[] {
  const d = days.find((r) => r.data?.weather || r.data?.siteStatus)?.data ?? {}
  const t = (k: string) => (d[k] == null || d[k] === '' ? '—' : `${Number(d[k]).toLocaleString('fa-IR')}`)
  return [
    { label: 'وضعیت کارگاه', value: SITE[String(d.siteStatus ?? '')] ?? '—' }, { label: 'وضعیت هوا', value: WEATHER[String(d.weather ?? '')] ?? '—' },
    { label: 'کمینهٔ دما (°C)', value: t('tempMin') }, { label: 'وضعیت زمین', value: GROUND[String(d.groundStatus ?? '')] ?? '—' },
    { label: 'میزان رطوبت', value: d.humidity ? `${t('humidity')}٪` : '—' }, { label: 'بیشینهٔ دما (°C)', value: t('tempMax') },
  ]
}

/** font size (px) that lets a section name written down the side fit the height of its rows */
export const sideFont = (name: string, rows: number, rowPx = 15) => Math.max(5.5, Math.min(9.5, (rows * rowPx) / Math.max(1, String(name ?? "").length * 0.62)))
