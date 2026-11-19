/**
 * The compressor-station daily report (DR) tables, laid out like the site's own report: the quantity summary by
 * discipline («روکش احجام اجرای کار»), civil works by location × work package, the station registers (piping in inch-dia,
 * NDT, hydrotest, spools, mechanical equipment in %), the day's main activities and obstacles, and the manpower and
 * machinery by section. Everything is read from the daily reports and registers — nothing is typed twice.
 *
 * How the price-list rows map to the DR: activity.chapter = discipline (Civil, Piping, Electrical, Instrument,
 * Mechanical …), activity.area = location (توربوکمپرسورها، اسلیپر هدر اصلی …), activity.title = work package.
 */
import type { Activity, Report, ReportLine, ReportResource, Stoppage } from '../types'
import type { Period } from './periods'
import { isRegistered, lineValue, type EmployerMode } from './progress'
import { EQ_STEPS, equipmentEarned, inchDia, type CsEquipment, type CsLine, type CsSpool, type CsTestPack, type CsWeld } from './csCore'
import { DEFAULT_QC_RULES, ndtPlan, type QcRules } from './csQc'

export interface Cell { v: string | number; n?: boolean }
export interface DrTable { title: string; head: string[]; rows: Cell[][]; note?: string }
export interface DrCtx { activities: Activity[]; reports: Report[]; lines: ReportLine[]; resources: ReportResource[]; stoppages: Stoppage[]; baseOf: (a: Activity, asOf: string) => number; employer: EmployerMode }
export interface CsData { lines: CsLine[]; spools: CsSpool[]; welds: CsWeld[]; equipment: CsEquipment[]; packs: CsTestPack[]; rules?: QcRules }

const r2 = (x: number) => Math.round(x * 100) / 100
const pctS = (x: number) => `${r2(x * 100).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪`
const inP = (d: string | null | undefined, p: Period) => !!d && d >= p.from && d <= p.to
const before = (d: string | null | undefined, p: Period) => !!d && d < p.from

interface QRow { activity: Activity; base: number; prev: number; period: number }
/** every active price-list row with its reported quantity before and in the period (reported = submitted, not rejected) */
function quantities(c: DrCtx, p: Period): QRow[] {
  const work = new Map(c.reports.filter((r) => r.formKey === 'work' && isRegistered(r) && r.reportDate <= p.to).map((r) => [r.id, r]))
  const m = new Map<string, QRow>()
  for (const a of c.activities) if (a.active) m.set(a.id, { activity: a, base: c.baseOf(a, p.to), prev: 0, period: 0 })
  for (const l of c.lines) {
    const r = work.get(l.reportId); const x = l.activityId ? m.get(l.activityId) : undefined
    if (!r || !x) continue
    const v = lineValue(l, 'registered', c.employer)
    if (r.reportDate < p.from) x.prev += v; else x.period += v
  }
  return [...m.values()]
}
const numRow = (base: number, prev: number, period: number): Cell[] => {
  const cum = prev + period
  return [{ v: r2(base), n: true }, { v: r2(prev), n: true }, { v: r2(period), n: true }, { v: r2(cum), n: true }, { v: r2(Math.max(0, base - cum)), n: true }, { v: base > 0 ? pctS(Math.min(1, cum / base)) : '—', n: true }]
}
const HEAD_Q = ['حجم کل', 'تا روز قبل', 'امروز / دوره', 'تا کنون', 'باقیمانده', 'درصد پیشرفت']

/** «روکش احجام اجرای کار»: each discipline's work packages, summed over the locations */
export function drDisciplines(c: DrCtx, p: Period): DrTable {
  const groups = new Map<string, Map<string, { title: string; unit: string; base: number; prev: number; period: number }>>()
  for (const q of quantities(c, p)) {
    const d = q.activity.chapter || 'سایر'
    const g = groups.get(d) ?? new Map(); groups.set(d, g)
    const k = `${q.activity.title}|${q.activity.unit}`
    const x = g.get(k) ?? { title: q.activity.title, unit: q.activity.unit, base: 0, prev: 0, period: 0 }
    x.base += q.base; x.prev += q.prev; x.period += q.period; g.set(k, x)
  }
  const rows: Cell[][] = []
  let i = 0
  for (const [d, g] of groups) [...g.values()].forEach((x, j) => rows.push([{ v: ++i, n: true }, { v: j === 0 ? d : '' }, { v: x.title }, { v: x.unit }, ...numRow(x.base, x.prev, x.period)]))
  return { title: 'روکش احجام اجرای کار (به تفکیک دیسیپلین)', head: ['ردیف', 'دیسیپلین', 'بسته کاری', 'واحد', ...HEAD_Q], rows, note: 'مقادیر گزارش‌شده در گزارش‌های کارکرد ارسال‌شده (ردیف‌های ردشده حساب نمی‌شوند)؛ هر بسته کاری جمع همهٔ محل‌های اجرا است.' }
}

/** civil (or any) works by location × work package, as the DR's location sheets */
export function drLocations(c: DrCtx, p: Period, discipline = ''): DrTable {
  const qs = quantities(c, p).filter((q) => q.activity.area && (!discipline || q.activity.chapter === discipline))
  const byArea = new Map<string, QRow[]>()
  for (const q of qs) { const a = byArea.get(q.activity.area) ?? []; a.push(q); byArea.set(q.activity.area, a) }
  const rows: Cell[][] = []
  let i = 0
  for (const [area, list] of byArea) list.sort((a, b) => a.activity.sort - b.activity.sort).forEach((q, j) => rows.push([{ v: ++i, n: true }, { v: j === 0 ? area : '' }, { v: q.activity.title }, { v: q.activity.unit }, ...numRow(q.base, q.prev, q.period)]))
  return { title: `احجام به تفکیک محل اجرا${discipline ? ` — ${discipline}` : ''}`, head: ['ردیف', 'محل اجرا', 'بسته کاری', 'واحد', ...HEAD_Q], rows }
}

/** the station registers in the DR's units: fit-up / welding in dia-inch, NDT joints, spools, hydrotest and equipment % */
export function drRegisters(cs: CsData, p: Period): DrTable {
  const welds = cs.welds.filter((w) => !w.archived)
  const sumId = (f: (w: CsWeld) => string | null) => { let prev = 0, per = 0; for (const w of welds) { const d = f(w); if (before(d, p)) prev += inchDia(w); else if (inP(d, p)) per += inchDia(w) } return [prev, per] as const }
  const totId = welds.reduce((n, w) => n + inchDia(w), 0)
  const fit = sumId((w) => w.fitupDate ?? w.weldDate), wel = sumId((w) => w.weldDate)
  const required = ndtPlan(cs.lines, cs.welds, cs.rules ?? DEFAULT_QC_RULES).reduce((n, x) => n + x.required, 0)
  let ndtPrev = 0, ndtPer = 0
  for (const w of welds) if (w.ndtResult === 'accept') { if (before(w.ndtDate, p)) ndtPrev++; else if (inP(w.ndtDate, p)) ndtPer++ }
  const spools = cs.spools.filter((s) => !s.archived)
  const kg = spools.reduce((n, s) => n + (s.weightKg ?? 0), 0)
  let spPrev = 0, spPer = 0
  for (const s of spools) { const d = s.stageDates.erected; if (before(d, p)) spPrev += s.weightKg ?? 0; else if (inP(d, p)) spPer += s.weightKg ?? 0 }
  const packs = cs.packs.filter((x) => !x.archived)
  let tpPrev = 0, tpPer = 0
  for (const x of packs) if (x.testDate) { if (before(x.testDate, p)) tpPrev++; else if (inP(x.testDate, p)) tpPer++ }
  const rows: Cell[][] = [
    [{ v: 'Piping' }, { v: 'فیت‌آپ' }, { v: 'dia/inch' }, ...numRow(totId, fit[0], fit[1])],
    [{ v: '' }, { v: 'جوشکاری' }, { v: 'dia/inch' }, ...numRow(totId, wel[0], wel[1])],
    [{ v: '' }, { v: 'آزمون غیرمخرب (قبول)' }, { v: 'سرجوش' }, ...numRow(required, ndtPrev, ndtPer)],
    [{ v: '' }, { v: 'نصب اسپول' }, { v: 'کیلوگرم' }, ...numRow(kg, spPrev, spPer)],
    [{ v: '' }, { v: 'هیدروتست (تست‌پک)' }, { v: 'تست‌پک' }, ...numRow(packs.length, tpPrev, tpPer)],
  ]
  const tot = EQ_STEPS.reduce((n, s) => n + s.weight, 0)
  cs.equipment.filter((e) => !e.archived).forEach((e, i) => {
    let prev = 0, per = 0
    for (const s of EQ_STEPS) { const d = e.steps[s.key]; if (before(d, p)) prev += s.weight / tot; else if (inP(d, p)) per += s.weight / tot }
    rows.push([{ v: i === 0 ? 'Mechanical' : '' }, { v: `${e.tag}${e.title ? ` — ${e.title}` : ''}` }, { v: 'درصد' }, { v: '۱۰۰٪' }, { v: pctS(prev) }, { v: pctS(per) }, { v: pctS(equipmentEarned(e)) }, { v: pctS(1 - equipmentEarned(e)) }, { v: pctS(equipmentEarned(e)) }])
  })
  return { title: 'ثبت‌های ایستگاه (پایپینگ و مکانیکال)', head: ['دیسیپلین', 'بسته کاری', 'واحد', ...HEAD_Q], rows, note: 'از ثبت لاین، اسپول، سرجوش، تست‌پک و تجهیزات؛ NDT کل = سرجوش‌هایی که طبق برنامهٔ NDT باید آزمون شوند.' }
}

/** the day's main activities (report notes) and the obstacles (stoppages) */
export function drNarrative(c: DrCtx, p: Period): DrTable {
  const reps = c.reports.filter((r) => isRegistered(r) && inP(r.reportDate, p)).sort((a, b) => a.reportDate.localeCompare(b.reportDate))
  const rows: Cell[][] = []
  let i = 0
  for (const r of reps) for (const t of r.notes.split(/\n+/).map((x) => x.trim()).filter(Boolean)) rows.push([{ v: ++i, n: true }, { v: 'فعالیت' }, { v: r.front || '—' }, { v: t }])
  const ids = new Map(reps.map((r) => [r.id, r]))
  for (const s of c.stoppages) { const r = ids.get(s.reportId); if (r && s.description) rows.push([{ v: ++i, n: true }, { v: 'مانع / مشکل' }, { v: r.front || '—' }, { v: `${s.description}${s.hours ? ` (${r2(s.hours).toLocaleString('fa-IR')} ساعت)` : ''}` }]) }
  return { title: 'اهم فعالیت‌های انجام‌شده و موانع', head: ['ردیف', 'نوع', 'جبهه / ناحیه', 'شرح'], rows }
}

/** manpower or machinery by section, as the DR's resource sheets (per day; a longer period shows the daily average) */
export function drResources(c: DrCtx, p: Period, kind: 'man' | 'equip'): DrTable {
  const reps = new Map(c.reports.filter((r) => r.formKey === 'work' && isRegistered(r) && inP(r.reportDate, p)).map((r) => [r.id, r]))
  const days = new Set([...reps.values()].map((r) => r.reportDate)).size || 1
  const m = new Map<string, { section: string; name: string; total: number; active: number; idle: number; notes: Set<string> }>()
  for (const x of c.resources) {
    if (x.kind !== kind || !reps.has(x.reportId)) continue
    const k = `${x.section}|${x.name}`
    const y = m.get(k) ?? { section: x.section || '—', name: x.name, total: 0, active: 0, idle: 0, notes: new Set<string>() }
    y.active += x.activeQty; y.idle += x.idleQty + x.leaveQty + x.stoppedQty + x.repairQty; y.total += x.totalQty || x.activeQty + x.idleQty + x.leaveQty + x.stoppedQty + x.repairQty
    if (x.note) y.notes.add(x.note); m.set(k, y)
  }
  const list = [...m.values()].sort((a, b) => a.section.localeCompare(b.section, 'fa') || a.name.localeCompare(b.name, 'fa'))
  const rows: Cell[][] = list.map((y, i) => [{ v: i === 0 || list[i - 1].section !== y.section ? y.section : '' }, { v: y.name }, { v: r2(y.total / days), n: true }, { v: r2(y.active / days), n: true }, { v: r2(y.idle / days), n: true }, { v: [...y.notes].join('، ') }])
  const sum = list.reduce((a, y) => ({ t: a.t + y.total, a: a.a + y.active, i: a.i + y.idle }), { t: 0, a: 0, i: 0 })
  if (list.length) rows.push([{ v: 'جمع کل' }, { v: '' }, { v: r2(sum.t / days), n: true }, { v: r2(sum.a / days), n: true }, { v: r2(sum.i / days), n: true }, { v: '' }])
  return { title: kind === 'man' ? 'نیروی انسانی' : 'ماشین‌آلات', head: [kind === 'man' ? 'بخش' : 'گروه', kind === 'man' ? 'سمت / تخصص' : 'نام دستگاه', 'کل', 'فعال', 'غیرفعال', 'توضیحات'], rows, note: days > 1 ? `میانگین روزانهٔ ${days.toLocaleString('fa-IR')} روز گزارش` : undefined }
}

// ── the DR's breakdown as price-list rows ───────────────────────────────
export interface DrRow { chapter: string; area: string; title: string; unit: string }
const CIVIL_PACKAGES: [string, string][] = [['خاک‌برداری', 'متر مکعب'], ['بتن مگر', 'متر مکعب'], ['آرماتوربندی', 'کیلوگرم'], ['قالب‌بندی', 'متر مربع'], ['بتن‌ریزی', 'متر مکعب'], ['بکفیل', 'متر مکعب']]
export const CIVIL_LOCATIONS = ['توربوکمپرسورها', 'اسلیپر هدر اصلی', 'پایپ اسلیپر ثانویه (پیش‌ساخته)', 'اسکرابرها', 'داکت بانک', 'دیچ آب‌های سطحی', 'اسلیپرهای دیگر', 'فونداسیون شلتر ژنراتورهای اضطراری', 'فونداسیون Air Receiver', 'فونداسیون Wet Air Receiver', 'فونداسیون Platforms', 'فونداسیون Pipe Supports', 'فونداسیون Vent Stack', 'فونداسیون Lighting', 'کالورت', 'فونداسیون صاعقه‌گیر']
/** the rows of a compressor-station daily report (DR): every discipline and, for civil, every location × work package */
export const STATION_DR_TEMPLATE: DrRow[] = [
  ...CIVIL_LOCATIONS.flatMap((area) => CIVIL_PACKAGES.map(([title, unit]) => ({ chapter: 'سیویل صنعتی', area, title, unit }))),
  ...[['آرماتوربندی', 'کیلوگرم'], ['قالب‌بندی', 'متر مربع'], ['بتن‌ریزی', 'متر مکعب']].map(([title, unit]) => ({ chapter: 'سیویل صنعتی', area: 'Concrete Paving', title, unit })),
  { chapter: 'محوطه‌سازی', area: 'محوطه', title: 'خاک‌برداری', unit: 'متر مکعب' }, { chapter: 'محوطه‌سازی', area: 'محوطه', title: 'خاک‌ریزی', unit: 'متر مکعب' },
  ...['تأمین استراکچر فلزی', 'ساخت استراکچر فلزی', 'نصب استراکچر فلزی'].map((title) => ({ chapter: 'استراکچر فلزی', area: '', title, unit: 'تن' })),
  ...[['فیت‌آپ', 'dia/inch'], ['جوشکاری', 'dia/inch'], ['رادیوگرافی', 'سرجوش'], ['گالوانیزه', 'متر مربع'], ['پلی‌اتیلن', 'متر'], ['سندبلاست', 'متر مربع'], ['پرایمر', 'متر مربع'], ['رنگ لایهٔ دوم', 'متر مربع'], ['رنگ لایهٔ سوم', 'متر مربع'], ['هیدروتست', 'M/inch']].map(([title, unit]) => ({ chapter: 'Piping', area: '', title, unit })),
  ...[['سینی و نردبان کابل', 'متر'], ['کابل‌کشی برق', 'متر'], ['سربندی برق', 'عدد'], ['کابل ارت', 'متر'], ['نصب تابلوهای برق (MV, LV, …)', 'درصد'], ['سیستم روشنایی', 'درصد'], ['سیستم تلکام، پیجینگ و CCTV', 'درصد'], ['نصب ترانسفورماتورها', 'درصد']].map(([title, unit]) => ({ chapter: 'Electrical', area: '', title, unit })),
  ...[['سینی و نردبان ابزار دقیق', 'متر'], ['کابل‌کشی ابزار دقیق', 'متر'], ['سربندی ابزار دقیق', 'عدد'], ['نصب تابلوهای ابزار دقیق', 'عدد'], ['ادوات ابزار دقیق', 'عدد'], ['کالیبراسیون', 'عدد'], ['لوپ چک', 'عدد']].map(([title, unit]) => ({ chapter: 'Instrument', area: '', title, unit })),
  ...['توربوکمپرسور A', 'توربوکمپرسور B', 'اسکرابر', 'کولرهای هوایی', 'ژنراتور', 'پکیج کمپرسور هوا', 'مخزن ذخیرهٔ هوا'].map((title) => ({ chapter: 'Mechanical', area: '', title, unit: 'درصد' })),
]
/** template rows not yet in the project (matched on discipline + location + work package) */
export function missingDrRows(existing: Pick<Activity, 'chapter' | 'area' | 'title'>[]): DrRow[] {
  const norm = (x: string) => x.replace(/[\s‌‌]+/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  const have = new Set(existing.map((a) => `${norm(a.chapter)}|${norm(a.area)}|${norm(a.title)}`))
  return STATION_DR_TEMPLATE.filter((r) => !have.has(`${norm(r.chapter)}|${norm(r.area)}|${norm(r.title)}`))
}
