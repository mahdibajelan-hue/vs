/**
 * Periodic reports (reporting phase 5): the daily site report, the weekly and the monthly project report, and the
 * management summary across projects — each a set of section tiles that show the period at a glance and carry the
 * detail tables behind them.
 *
 * Rules:
 *  - period-dated records (daily reports, production, work volumes, manpower, stoppages, QC findings, documents,
 *    material movements, certificates, payments, issues, changes) are counted inside the period only; state figures
 *    (progress, SPI/CPI, open risks) are "as of" their latest record and the tile says so
 *  - a source with no records is "not recorded", never zero — the tile shows an empty state instead of a 0
 *  - every figure is compared with the same-length period before it where that comparison means something
 * Pure: the loader gathers the input; nothing here reads a store or the network.
 */
import { isoToJalali, jalaliMonthLength, jalaliToIso, JALALI_MONTHS } from '../../../lib/jalali'
import { jd, deviations, earlyWarnings, summarise, DISCIPLINE_FA, type ProjectFacts } from './analyticsCore'

export type PeriodKind = 'daily' | 'weekly' | 'monthly'
export type Tone = 'bad' | 'warn' | 'good' | 'none'

/* ── input ─────────────────────────────────────────────────────────── */

export interface SiteInput {
  projectId: string
  project: string
  /** every registered report of the project (all forms), with its form title */
  reports: { id: string; formKey: string; formTitle: string; date: string; status: string; front: string }[]
  /** production figures of the technical forms, one row per report × metric × group */
  production: { date: string; formKey: string; formTitle: string; metric: string; group: string; unit: string; value: number; approved: boolean }[]
  /** work volumes reported against the contract activities */
  work: { date: string; activityId: string; activity: string; chapter: string; unit: string; baseQty: number; qty: number; approvedQty: number | null; unitPrice: number; weight: number }[]
  resources: { date: string; kind: 'man' | 'equip'; name: string; section: string; total: number; active: number; idle: number; stopped: number; repair: number }[]
  stoppages: { date: string; category: string; hours: number; responsibility: string; critical: boolean; description: string }[]
  qc: { createdAt: string; closedAt: string | null; severity: string; status: string; kind: string; note: string }[]
  docs: { docNo: string; title: string; discipline: string; status: string; plannedPrepared: string | null; actualPrepared: string | null; plannedApproved: string | null; actualApproved: string | null; critical: boolean }[] | null
  materials: { date: string; kind: string; kindLabel: string; qty: number; material: string; unit: string; status: string }[] | null
  receipts: { date: string; number: string; location: string }[] | null
  shipments: { number: string; date: string | null; eta: string | null; ata: string | null; status: string; origin: string }[] | null
  orders: { number: string; date: string | null; status: string }[] | null
  discrepancies: { detectedAt: string; status: string; kind: string; cause: string }[] | null
  certificates: { number: string; contract: string; date: string | null; gross: number; certified: number; paid: number; status: string }[] | null
  payments: { date: string; amount: number; contract: string }[] | null
  facts: ProjectFacts | null
}

/* ── output ────────────────────────────────────────────────────────── */

export type Chart =
  | { kind: 'columns'; items: { key: string; label: string; value: number; color?: string; note?: string }[]; unit?: string }
  | { kind: 'donut'; parts: { key: string; label: string; value: number; color: string }[]; center?: string; sub?: string }
  | { kind: 'bars'; items: { key: string; label: string; value: number; display?: string; color?: string; note?: string }[] }
  | { kind: 'gauge'; value: number | null; min: number; max: number; bands: { to: number; color: string }[]; target?: number; display: string; label: string }
  | { kind: 'progress'; actual: number; planned: number; label: string }
  | { kind: 'spark'; values: number[]; color: string }

export interface DetailTable { title: string; head: string[]; rows: string[][]; tones?: Tone[]; note?: string }
export interface Stat { label: string; value: string; tone?: Tone; sub?: string }
export interface Tile {
  key: string
  title: string
  /** lucide icon name, chosen by the page */
  icon: string
  color: string
  tone: Tone
  /** the figure the tile leads with */
  headline: Stat
  stats: Stat[]
  chart: Chart | null
  /** one line the reader takes away */
  note: string
  detail: DetailTable[]
  /** set when the source has no records in reach — the tile shows this instead of figures */
  empty: string | null
  /** a project the tile opens (management summary rows) */
  projectId?: string
}
export interface PeriodReport {
  kind: PeriodKind | 'executive'
  title: string
  subject: string
  from: string
  to: string
  periodLabel: string
  prevLabel: string
  generatedAt: string
  kpis: (Stat & { key: string; color: string; spark?: number[] })[]
  highlights: { text: string; tone: Tone }[]
  tiles: Tile[]
  caveats: string[]
}

/* ── helpers ───────────────────────────────────────────────────────── */

const DAY = 86400000
export const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10)
const span = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY) + 1
export const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: 0 })
const inP = (d: string | null | undefined, from: string, to: string) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const delta = (cur: number, prev: number, unit = '') => (prev === 0 && cur === 0 ? 'بدون تغییر' : prev === 0 ? 'دورهٔ قبل ثبتی نداشت' : `${cur >= prev ? '▲' : '▼'} ${fa(Math.abs(((cur - prev) / prev) * 100))}٪ نسبت به دورهٔ قبل${unit}`)
export function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const a = Math.abs(n), s = n < 0 ? '−' : ''
  if (a >= 1e12) return `${s}${fa(a / 1e12, 1)} هزار میلیارد`
  if (a >= 1e9) return `${s}${fa(a / 1e9, 1)} میلیارد`
  if (a >= 1e6) return `${s}${fa(a / 1e6, 1)} میلیون`
  return `${s}${fa(a)}`
}
/** a short Jalali day label: «۵ آبان» */
export function dayLabel(iso: string): string {
  const j = isoToJalali(iso)
  return j ? `${fa(j.jd)} ${JALALI_MONTHS[j.jm - 1]}` : iso
}
const isOpenIssue = (s: string) => s !== 'approved' && s !== 'rejected' && s !== 'closed'
const REGISTERED = new Set(['submitted', 'partially_approved', 'approved'])

/** the period a report covers: a day; Saturday to the date (the Iranian week); the Jalali month up to the date */
export function periodOf(kind: PeriodKind, date: string): { from: string; to: string; prevFrom: string; prevTo: string; label: string; prevLabel: string } {
  if (kind === 'daily') return { from: date, to: date, prevFrom: addDays(date, -1), prevTo: addDays(date, -1), label: jd(date), prevLabel: 'روز قبل' }
  if (kind === 'weekly') {
    const wd = (new Date(`${date}T00:00:00Z`).getUTCDay() + 1) % 7 // Saturday = 0
    const from = addDays(date, -wd)
    return { from, to: date, prevFrom: addDays(from, -7), prevTo: addDays(from, -1), label: `${jd(from)} تا ${jd(date)}`, prevLabel: 'هفتهٔ قبل' }
  }
  const j = isoToJalali(date)
  if (!j) return { from: addDays(date, -29), to: date, prevFrom: addDays(date, -59), prevTo: addDays(date, -30), label: `${jd(addDays(date, -29))} تا ${jd(date)}`, prevLabel: 'ماه قبل' }
  const from = jalaliToIso(j.jy, j.jm, 1)
  const pm = j.jm === 1 ? { y: j.jy - 1, m: 12 } : { y: j.jy, m: j.jm - 1 }
  return { from, to: date, prevFrom: jalaliToIso(pm.y, pm.m, 1), prevTo: jalaliToIso(pm.y, pm.m, jalaliMonthLength(pm.y, pm.m)), label: `${JALALI_MONTHS[j.jm - 1]} ${fa(j.jy).replace(/٬/g, '')}${date < jalaliToIso(j.jy, j.jm, jalaliMonthLength(j.jy, j.jm)) ? ` (تا ${fa(j.jd)}م)` : ''}`, prevLabel: 'ماه قبل' }
}

/** the same report one period earlier or later: a day, a week, or the previous / next Jalali month (ending on its last day) */
export function shiftPeriod(kind: PeriodKind, date: string, dir: 1 | -1): string {
  if (kind === 'daily') return addDays(date, dir)
  if (kind === 'weekly') return addDays(date, 7 * dir)
  if (dir < 0) return periodOf('monthly', date).prevTo
  const j = isoToJalali(date)
  if (!j) return addDays(date, 30)
  const n = j.jm === 12 ? { y: j.jy + 1, m: 1 } : { y: j.jy, m: j.jm + 1 }
  return jalaliToIso(n.y, n.m, jalaliMonthLength(n.y, n.m))
}

/** the days of a period, or its weeks when it is long — the x-axis of the period's column charts */
function buckets(from: string, to: string): { key: string; label: string; from: string; to: string }[] {
  const n = span(from, to)
  if (n <= 16) return Array.from({ length: n }, (_, i) => { const d = addDays(from, i); return { key: d, label: dayLabel(d), from: d, to: d } })
  const out: { key: string; label: string; from: string; to: string }[] = []
  for (let d = from; d <= to; d = addDays(d, 7)) { const e = addDays(d, 6) < to ? addDays(d, 6) : to; out.push({ key: d, label: `${dayLabel(d)}`, from: d, to: e }) }
  return out
}

const C = { indigo: '#6366f1', sky: '#0ea5e9', teal: '#14b8a6', amber: '#f59e0b', rose: '#f43f5e', violet: '#a78bfa', green: '#22c55e', orange: '#f97316', cyan: '#06b6d4', pink: '#ec4899', slate: '#64748b' }
const PALETTE = [C.indigo, C.sky, C.teal, C.amber, C.rose, C.violet, C.green, C.orange, C.cyan, C.pink]
const RESP_FA: Record<string, string> = { contractor: 'پیمانکار', employer: 'کارفرما', force_majeure: 'قوهٔ قاهره', third_party: 'شخص ثالث', shared: 'مشترک', '': 'تعیین‌نشده' }
const SEV_FA: Record<string, string> = { high: 'شدید', medium: 'متوسط', low: 'جزئی' }
const SEV_C: Record<string, string> = { high: C.rose, medium: C.amber, low: C.sky }
const PRIO_FA: Record<string, string> = { critical: 'بحرانی', high: 'بالا', medium: 'متوسط', low: 'کم' }
const PRIO_C: Record<string, string> = { critical: C.rose, high: C.orange, medium: C.amber, low: C.sky }
const toneOf = (bad: boolean, warn: boolean): Tone => (bad ? 'bad' : warn ? 'warn' : 'good')
const emptyTile = (key: string, title: string, icon: string, color: string, empty: string): Tile => ({ key, title, icon, color, tone: 'none', headline: { label: '', value: '—' }, stats: [], chart: null, note: '', detail: [], empty })

/* ── site report (daily / weekly / monthly) ───────────────────────── */

export function buildSiteReport(kind: PeriodKind, date: string, inp: SiteInput, today: string): PeriodReport {
  const p = periodOf(kind, date)
  const { from, to, prevFrom, prevTo } = p
  const bks = buckets(from, to)
  const tiles: Tile[] = []
  const caveats: string[] = []
  const regReports = inp.reports.filter((r) => REGISTERED.has(r.status))
  const f = inp.facts

  // 1 progress & schedule — state as of the latest metrics
  const m = f?.input.metrics
  if (!m) tiles.push(emptyTile('progress', 'پیشرفت و برنامه', 'TrendingUp', C.indigo, 'شاخص پیشرفت این پروژه در دسترس نیست.'))
  else {
    const gap = m.lifecycle.actual - m.lifecycle.planned
    const curve = m.curve.filter((c) => c.earned != null)
    const inPer = m.curve.filter((c) => inP(c.date, prevFrom, to))
    tiles.push({
      key: 'progress', title: 'پیشرفت و برنامه', icon: 'TrendingUp', color: C.indigo, tone: toneOf(gap <= -10, gap <= -3),
      headline: { label: 'پیشرفت واقعی', value: `${fa(m.lifecycle.actual, 1)}٪`, sub: `برنامه ${fa(m.lifecycle.planned, 1)}٪` },
      stats: [
        { label: 'فاصله از برنامه', value: `${gap >= 0 ? '+' : '−'}${fa(Math.abs(gap), 1)} واحد`, tone: toneOf(gap <= -10, gap <= -3) },
        { label: 'SPI', value: m.evm?.spi == null ? '—' : fa(m.evm.spi, 2), tone: m.evm?.spi == null ? 'none' : toneOf(m.evm.spi < 0.9, m.evm.spi < 0.95) },
        { label: 'CPI', value: m.evm?.cpi == null ? '—' : fa(m.evm.cpi, 2), tone: m.evm?.cpi == null ? 'none' : toneOf(m.evm.cpi < 0.9, m.evm.cpi < 0.95) },
      ],
      chart: { kind: 'progress', actual: m.lifecycle.actual, planned: m.lifecycle.planned, label: 'پیشرفت کل چرخهٔ عمر' },
      note: `وضعیت در ${jd(m.asOf)}؛ ${gap >= 0 ? 'جلوتر از' : 'عقب‌تر از'} برنامه به اندازهٔ ${fa(Math.abs(gap), 1)} واحد درصد.`,
      detail: [
        ...(f?.disciplines.length ? [{ title: 'پیشرفت رشته‌ها', head: ['رشته', 'واقعی', 'برنامه', 'فاصله', 'سهم وزنی'], rows: f.disciplines.map((d) => [DISCIPLINE_FA[d.key], `${fa(d.actual, 1)}٪`, d.planned == null ? '—' : `${fa(d.planned, 1)}٪`, d.planned == null ? '—' : fa(d.actual - d.planned, 1), `${fa((d.weight / (sum(f.disciplines.map((x) => x.weight)) || 1)) * 100, 1)}٪`]), tones: f.disciplines.map((d) => (d.planned == null ? 'none' : toneOf(d.actual - d.planned <= -10, d.actual - d.planned <= -3)) as Tone) }] : []),
        ...(inPer.length || curve.length ? [{ title: 'منحنی پیشرفت EPC', head: ['تاریخ', 'برنامه', 'کسب‌شده', 'فاصله'], rows: (inPer.length ? inPer : curve.slice(-6)).map((c) => [jd(c.date), `${fa(c.planned, 1)}٪`, c.earned == null ? '—' : `${fa(c.earned, 1)}٪`, c.earned == null ? '—' : fa(c.earned - c.planned, 1)]) }] : []),
        ...(m.evm ? [{ title: 'ارزش کسب‌شده', head: ['شاخص', 'مقدار'], rows: [['بودجه (BAC)', money(m.evm.bac)], ['پیش‌بینی تمام‌شده (EAC)', money(m.evm.eac)], ['انحراف در پایان (VAC)', money(m.evm.vac)], ['SPI', m.evm.spi == null ? '—' : fa(m.evm.spi, 2)], ['CPI', m.evm.cpi == null ? '—' : fa(m.evm.cpi, 2)]] }] : []),
      ],
      empty: null,
    })
  }

  // 2 production — the technical forms' figures in the period
  const prod = inp.production.filter((x) => inP(x.date, from, to))
  const prodPrev = inp.production.filter((x) => inP(x.date, prevFrom, prevTo))
  const prodAll = inp.production.filter((x) => x.date <= to)
  if (!inp.production.length) tiles.push(emptyTile('production', 'تولید و عملیات اجرایی', 'Factory', C.sky, 'فرم فنی (ریسه، خمکاری، جوشکاری، رادیوگرافی و …) برای این پروژه ثبت نشده است.'))
  else {
    const keyOf = (x: SiteInput['production'][number]) => `${x.formKey}|${x.metric}|${x.unit}`
    const agg = new Map<string, { form: string; metric: string; unit: string; cur: number; prev: number; all: number; pending: number }>()
    const touch = (x: SiteInput['production'][number]) => { const k = keyOf(x); const a = agg.get(k) ?? { form: x.formTitle, metric: x.metric, unit: x.unit, cur: 0, prev: 0, all: 0, pending: 0 }; agg.set(k, a); return a }
    for (const x of prod) { const a = touch(x); a.cur += x.value; if (!x.approved) a.pending += x.value }
    for (const x of prodPrev) touch(x).prev += x.value
    for (const x of prodAll) touch(x).all += x.value
    const rows = [...agg.values()].filter((a) => a.cur > 0 || a.prev > 0).sort((a, b) => b.cur - a.cur)
    const forms = new Set(prod.filter((x) => x.value > 0).map((x) => x.formKey))
    const welds = prod.filter((x) => x.formKey === 'welding' && /سرجوش|جوش/.test(x.metric) && /عدد|سرجوش/.test(x.unit)).reduce((n, x) => n + x.value, 0)
    const perDay = bks.map((b) => new Set(inp.production.filter((x) => inP(x.date, b.from, b.to) && x.value > 0).map((x) => x.formKey)).size)
    tiles.push({
      key: 'production', title: 'تولید و عملیات اجرایی', icon: 'Factory', color: C.sky, tone: forms.size ? 'good' : 'warn',
      headline: { label: 'فرم فنی فعال در دوره', value: fa(forms.size), sub: `${fa(rows.filter((r) => r.cur > 0).length)} شاخص تولید` },
      stats: [
        ...(welds ? [{ label: 'سرجوش در دوره', value: fa(welds) }] : []),
        { label: 'شاخص‌های در انتظار تأیید', value: fa(rows.filter((r) => r.pending > 0).length), tone: rows.some((r) => r.pending > 0) ? 'warn' as Tone : 'good' as Tone },
      ],
      chart: kind === 'daily'
        ? { kind: 'bars', items: rows.filter((r) => r.cur > 0).slice(0, 7).map((r, i) => ({ key: `${r.form}|${r.metric}`, label: `${r.metric} — ${r.form.replace(/^گزارش (روزانه )?/, '')}`, value: r.all ? r.cur / r.all : 0, display: `${fa(r.cur, 1)} ${r.unit}`, color: PALETTE[i % PALETTE.length], note: `تجمعی ${fa(r.all, 1)} ${r.unit}` })) }
        : { kind: 'columns', items: bks.map((b, i) => ({ key: b.key, label: b.label, value: perDay[i], color: C.sky })), unit: 'فرم فنی' },
      note: forms.size ? `${fa(forms.size)} نوع عملیات در دوره گزارش شده است${welds ? `؛ ${fa(welds)} سرجوش` : ''}.` : 'در این دوره فرم فنی ثبت نشده است.',
      detail: [{ title: 'شاخص‌های تولید', head: ['فرم', 'شاخص', 'واحد', 'این دوره', 'دورهٔ قبل', 'تجمعی تا پایان دوره', 'در انتظار تأیید'], rows: rows.map((r) => [r.form, r.metric, r.unit, fa(r.cur, 1), fa(r.prev, 1), fa(r.all, 1), r.pending ? fa(r.pending, 1) : '—']), tones: rows.map((r) => (r.pending > 0 ? 'warn' : 'none') as Tone), note: '«در انتظار تأیید» مقدار گزارش‌شده‌ای است که هنوز تأیید نظارت را ندارد.' }],
      empty: null,
    })
  }

  // 3 work volumes against the contract activities
  if (!inp.work.length) tiles.push(emptyTile('work', 'احجام کار و فعالیت‌ها', 'ClipboardCheck', C.teal, 'حجم کاری روی فعالیت‌های قرارداد گزارش نشده است.'))
  else {
    const byAct = new Map<string, { title: string; chapter: string; unit: string; base: number; cur: number; appr: number; all: number; value: number; w: number }>()
    for (const x of inp.work.filter((w) => w.date <= to)) {
      const a = byAct.get(x.activityId) ?? { title: x.activity, chapter: x.chapter, unit: x.unit, base: x.baseQty, cur: 0, appr: 0, all: 0, value: 0, w: x.weight }
      a.all += x.approvedQty ?? x.qty
      if (inP(x.date, from, to)) { a.cur += x.qty; a.appr += x.approvedQty ?? 0; a.value += x.qty * x.unitPrice }
      byAct.set(x.activityId, a)
    }
    const acts = [...byAct.values()].filter((a) => a.cur > 0).sort((a, b) => b.value - a.value || b.cur - a.cur)
    const value = sum(acts.map((a) => a.value))
    const prevValue = sum(inp.work.filter((x) => inP(x.date, prevFrom, prevTo)).map((x) => x.qty * x.unitPrice))
    const earned = sum(acts.map((a) => (a.base > 0 ? (a.cur / a.base) * a.w : 0)))
    tiles.push({
      key: 'work', title: 'احجام کار و فعالیت‌ها', icon: 'ClipboardCheck', color: C.teal, tone: acts.length ? 'good' : 'warn',
      headline: { label: 'ارزش ریالی کار انجام‌شده', value: money(value), sub: delta(value, prevValue) },
      stats: [{ label: 'فعالیت دارای حجم', value: fa(acts.length) }, { label: 'سهم وزنی کسب‌شده', value: `${fa(earned, 2)}٪` }],
      chart: acts.length ? { kind: 'bars', items: acts.slice(0, 6).map((a, i) => ({ key: a.title, label: a.title, value: a.value || a.cur, display: a.value ? money(a.value) : `${fa(a.cur, 1)} ${a.unit}`, color: PALETTE[(i + 2) % PALETTE.length], note: `${fa(a.cur, 1)} ${a.unit}${a.base ? ` · ${fa((a.all / a.base) * 100, 1)}٪ از کل` : ''}` })) } : null,
      note: acts.length ? `بیشترین ارزش: ${acts[0].title}.` : 'در این دوره حجم کاری ثبت نشده است.',
      detail: [{ title: 'حجم کار هر فعالیت', head: ['فعالیت', 'فصل', 'واحد', 'این دوره', 'تأییدشده', 'تجمعی', 'مقدار قرارداد', 'پیشرفت فعالیت', 'ارزش دوره'], rows: acts.map((a) => [a.title, a.chapter || '—', a.unit, fa(a.cur, 2), a.appr ? fa(a.appr, 2) : '—', fa(a.all, 2), a.base ? fa(a.base, 2) : '—', a.base ? `${fa((a.all / a.base) * 100, 1)}٪` : '—', money(a.value)]) }],
      empty: null,
    })
  }

  // 4–5 manpower and machinery
  for (const k of ['man', 'equip'] as const) {
    const title = k === 'man' ? 'نیروی انسانی' : 'ماشین‌آلات'
    const icon = k === 'man' ? 'Users' : 'Truck', color = k === 'man' ? C.violet : C.orange
    const all = inp.resources.filter((r) => r.kind === k)
    const cur = all.filter((r) => inP(r.date, from, to)), prev = all.filter((r) => inP(r.date, prevFrom, prevTo))
    if (!all.length) { tiles.push(emptyTile(k, title, icon, color, `${title} در گزارش‌های روزانه ثبت نشده است.`)); continue }
    const days = new Set(cur.map((r) => r.date)).size, pdays = new Set(prev.map((r) => r.date)).size
    const avg = (xs: typeof cur, d: number, f: (r: (typeof cur)[number]) => number) => (d ? sum(xs.map(f)) / d : 0)
    const tot = avg(cur, days, (r) => r.total), act = avg(cur, days, (r) => r.active), ptot = avg(prev, pdays, (r) => r.total)
    const util = tot ? (act / tot) * 100 : null
    const byName = new Map<string, { section: string; total: number; active: number; idle: number; stopped: number; repair: number }>()
    for (const r of cur) { const a = byName.get(r.name) ?? { section: r.section, total: 0, active: 0, idle: 0, stopped: 0, repair: 0 }; a.total += r.total; a.active += r.active; a.idle += r.idle; a.stopped += r.stopped; a.repair += r.repair; byName.set(r.name, a) }
    const names = [...byName].map(([n, a]) => ({ n, ...a, total: a.total / (days || 1), active: a.active / (days || 1), idle: a.idle / (days || 1), stopped: a.stopped / (days || 1), repair: a.repair / (days || 1) })).sort((a, b) => b.total - a.total)
    const series = bks.map((b) => { const xs = all.filter((r) => inP(r.date, b.from, b.to)); const d = new Set(xs.map((r) => r.date)).size; return d ? sum(xs.map((r) => r.total)) / d : 0 })
    const bySection = new Map<string, number>()
    for (const x of names) bySection.set(x.section || 'سایر', (bySection.get(x.section || 'سایر') ?? 0) + x.total)
    tiles.push({
      key: k, title, icon, color, tone: !days ? 'warn' : util == null ? 'none' : toneOf(util < 60, util < 80),
      headline: { label: kind === 'daily' ? (k === 'man' ? 'نفر در کارگاه' : 'دستگاه در کارگاه') : (k === 'man' ? 'میانگین روزانهٔ نفرات' : 'میانگین روزانهٔ دستگاه‌ها'), value: days ? fa(tot, kind === 'daily' ? 0 : 1) : '—', sub: days ? delta(tot, ptot) : 'در این دوره ثبت نشده' },
      stats: [{ label: k === 'man' ? 'فعال' : 'در کار', value: days ? fa(act, 1) : '—' }, { label: k === 'man' ? 'سهم نیروی فعال' : 'بهره‌وری', value: util == null ? '—' : `${fa(util)}٪`, tone: util == null ? 'none' : toneOf(util < 60, util < 80) }, ...(kind !== 'daily' ? [{ label: 'روزهای دارای گزارش', value: fa(days) }] : [])],
      chart: kind === 'daily'
        ? (bySection.size > 1 ? { kind: 'donut', parts: [...bySection].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([s, v], i) => ({ key: s, label: s, value: Math.round(v), color: PALETTE[(i + (k === 'man' ? 5 : 7)) % PALETTE.length] })), sub: k === 'man' ? 'نفر' : 'دستگاه' } : { kind: 'gauge', value: util, min: 0, max: 100, bands: [{ to: 60, color: C.rose }, { to: 80, color: C.amber }, { to: 100, color: C.green }], target: 80, display: util == null ? '—' : `${fa(util)}٪`, label: k === 'man' ? 'نیروی فعال' : 'بهره‌وری' })
        : { kind: 'columns', items: bks.map((b, i) => ({ key: b.key, label: b.label, value: Math.round(series[i]), color })), unit: k === 'man' ? 'نفر' : 'دستگاه' },
      note: days ? `${k === 'man' ? 'بیشترین نیرو' : 'بیشترین دستگاه'}: ${names[0]?.n ?? '—'} (${fa(names[0]?.total ?? 0, 1)}).` : 'در این دوره ثبت نشده است.',
      detail: [{ title: `${title} ${kind === 'daily' ? 'روز گزارش' : '— میانگین روزانهٔ دوره'}`, head: k === 'man' ? ['عنوان', 'بخش', 'کل', 'فعال', 'غیرفعال', 'متوقف'] : ['دستگاه', 'بخش', 'کل', 'در کار', 'بیکار', 'متوقف', 'تعمیر'], rows: names.map((x) => k === 'man' ? [x.n, x.section || '—', fa(x.total, 1), fa(x.active, 1), fa(x.idle, 1), fa(x.stopped, 1)] : [x.n, x.section || '—', fa(x.total, 1), fa(x.active, 1), fa(x.idle, 1), fa(x.stopped, 1), fa(x.repair, 1)]) }],
      empty: null,
    })
  }

  // 6 stoppages
  const st = inp.stoppages.filter((s) => inP(s.date, from, to) && s.hours > 0)
  const stPrev = sum(inp.stoppages.filter((s) => inP(s.date, prevFrom, prevTo)).map((s) => s.hours))
  const stH = sum(st.map((s) => s.hours))
  const byCat = new Map<string, number>()
  for (const s of st) byCat.set(s.category, (byCat.get(s.category) ?? 0) + s.hours)
  tiles.push({
    key: 'stoppages', title: 'توقفات و تأخیرات', icon: 'TimerOff', color: C.rose, tone: st.some((s) => s.critical) ? 'bad' : stH > 0 ? 'warn' : 'good',
    headline: { label: 'ساعت توقف', value: fa(stH, 1), sub: delta(stH, stPrev) },
    stats: [{ label: 'رویداد توقف', value: fa(st.length) }, { label: 'روی مسیر بحرانی', value: fa(st.filter((s) => s.critical).length), tone: st.some((s) => s.critical) ? 'bad' : 'good' }],
    chart: byCat.size ? { kind: 'donut', parts: [...byCat].sort((a, b) => b[1] - a[1]).map(([c, h], i) => ({ key: c, label: c, value: Math.round(h * 10) / 10, color: [C.rose, C.orange, C.amber, C.violet, C.sky, C.teal, C.slate][i % 7] })), center: fa(stH, 1), sub: 'ساعت' } : null,
    note: stH ? `بیشترین علت: ${[...byCat].sort((a, b) => b[1] - a[1])[0][0]}.` : 'در این دوره توقفی ثبت نشده است.',
    detail: st.length ? [{ title: 'رویدادهای توقف', head: ['تاریخ', 'علت', 'ساعت', 'مسئولیت', 'مسیر بحرانی', 'شرح'], rows: [...st].sort((a, b) => a.date.localeCompare(b.date)).map((s) => [jd(s.date), s.category, fa(s.hours, 1), RESP_FA[s.responsibility] ?? s.responsibility, s.critical ? 'بله' : '—', s.description || '—']), tones: st.map((s) => (s.critical ? 'bad' : 'warn') as Tone) }] : [],
    empty: null,
  })

  // 7 quality
  const qcOpen = inp.qc.filter((q) => q.createdAt.slice(0, 10) <= to && (!q.closedAt || q.closedAt.slice(0, 10) > to))
  const qcNew = inp.qc.filter((q) => inP(q.createdAt, from, to)), qcClosed = inp.qc.filter((q) => inP(q.closedAt, from, to))
  const rtForms = regReports.filter((r) => inP(r.date, from, to) && (r.formKey === 'rt_report' || r.formKey === 'weld_repair'))
  const repairs = prod.filter((x) => x.formKey === 'weld_repair').reduce((n, x) => n + (/تعداد|عدد/.test(x.unit) ? x.value : 0), 0)
  if (!inp.qc.length && !rtForms.length) tiles.push(emptyTile('quality', 'کیفیت و بازرسی', 'ShieldCheck', C.green, 'یافتهٔ کیفی یا گزارش رادیوگرافی برای این پروژه ثبت نشده است.'))
  else {
    const bySev = new Map<string, number>()
    for (const q of qcOpen) bySev.set(q.severity, (bySev.get(q.severity) ?? 0) + 1)
    tiles.push({
      key: 'quality', title: 'کیفیت و بازرسی', icon: 'ShieldCheck', color: C.green, tone: toneOf(qcOpen.some((q) => q.severity === 'high'), qcOpen.length > 0),
      headline: { label: 'یافتهٔ کیفی باز', value: fa(qcOpen.length), sub: `${fa(qcNew.length)} تازه · ${fa(qcClosed.length)} بسته‌شده در دوره` },
      stats: [{ label: 'گزارش رادیوگرافی و تعمیر', value: fa(rtForms.length) }, ...(repairs ? [{ label: 'تعمیر جوش', value: fa(repairs), tone: 'warn' as Tone }] : [])],
      chart: bySev.size ? { kind: 'donut', parts: ['high', 'medium', 'low'].filter((s) => bySev.get(s)).map((s) => ({ key: s, label: SEV_FA[s] ?? s, value: bySev.get(s) ?? 0, color: SEV_C[s] ?? C.slate })), sub: 'یافتهٔ باز' } : null,
      note: qcOpen.length ? `${fa(qcOpen.filter((q) => q.severity === 'high').length)} یافتهٔ شدید باز است.` : 'یافتهٔ کیفی بازی وجود ندارد.',
      detail: [...(inp.qc.length ? [{ title: 'یافته‌های کیفی', head: ['ثبت', 'نوع', 'شدت', 'وضعیت', 'بستن', 'شرح'], rows: inp.qc.filter((q) => qcOpen.includes(q) || qcNew.includes(q) || qcClosed.includes(q)).map((q) => [jd(q.createdAt), q.kind || '—', SEV_FA[q.severity] ?? q.severity, q.closedAt && q.closedAt.slice(0, 10) <= to ? 'بسته' : 'باز', q.closedAt ? jd(q.closedAt) : '—', q.note || '—']) }] : []),
        ...(rtForms.length ? [{ title: 'گزارش‌های رادیوگرافی و تعمیر جوش در دوره', head: ['تاریخ', 'فرم', 'جبهه', 'وضعیت'], rows: rtForms.map((r) => [jd(r.date), r.formTitle, r.front || '—', r.status === 'approved' ? 'تأییدشده' : 'در انتظار تأیید']) }] : [])],
      empty: null,
    })
  }

  // 8 engineering & documents
  if (!inp.docs?.length) tiles.push(emptyTile('engineering', 'مهندسی و مدارک', 'FileStack', C.cyan, 'فهرست مدارک مهندسی برای این پروژه ثبت نشده است.'))
  else {
    const d = inp.docs
    const prep = d.filter((x) => inP(x.actualPrepared, from, to)), appr = d.filter((x) => inP(x.actualApproved, from, to))
    const planned = d.filter((x) => inP(x.plannedApproved, from, to))
    const overdue = d.filter((x) => x.plannedApproved && x.plannedApproved.slice(0, 10) <= to && (!x.actualApproved || x.actualApproved.slice(0, 10) > to))
    const approvedAll = d.filter((x) => x.actualApproved && x.actualApproved.slice(0, 10) <= to).length
    const pct = (approvedAll / d.length) * 100
    tiles.push({
      key: 'engineering', title: 'مهندسی و مدارک', icon: 'FileStack', color: C.cyan, tone: toneOf(overdue.some((x) => x.critical), overdue.length > 0),
      headline: { label: 'مدرک تأییدشده در دوره', value: fa(appr.length), sub: `${fa(planned.length)} مدرک برای این دوره برنامه‌ریزی شده بود` },
      stats: [{ label: 'تهیه‌شده در دوره', value: fa(prep.length) }, { label: 'معوق تا پایان دوره', value: fa(overdue.length), tone: overdue.length ? 'bad' : 'good' }, { label: 'تأییدشده از کل', value: `${fa(pct, 1)}٪` }],
      chart: { kind: 'gauge', value: pct, min: 0, max: 100, bands: [{ to: 50, color: C.rose }, { to: 80, color: C.amber }, { to: 100, color: C.green }], display: `${fa(pct, 1)}٪`, label: `${fa(approvedAll)} از ${fa(d.length)} مدرک` },
      note: overdue.length ? `${fa(overdue.length)} مدرک از موعد تأیید گذشته${overdue.some((x) => x.critical) ? `، از جمله ${fa(overdue.filter((x) => x.critical).length)} مدرک بحرانی` : ''}.` : 'مدرک معوقی نیست.',
      detail: [
        ...(appr.length || prep.length ? [{ title: 'مدارک تهیه یا تأییدشده در دوره', head: ['شماره', 'عنوان', 'رشته', 'تهیه', 'تأیید'], rows: [...new Set([...prep, ...appr])].map((x) => [x.docNo, x.title, x.discipline || '—', jd(x.actualPrepared), jd(x.actualApproved)]) }] : []),
        ...(overdue.length ? [{ title: 'مدارک معوق', head: ['شماره', 'عنوان', 'رشته', 'موعد تأیید', 'تأخیر (روز)', 'بحرانی'], rows: [...overdue].sort((a, b) => (a.plannedApproved ?? '').localeCompare(b.plannedApproved ?? '')).map((x) => [x.docNo, x.title, x.discipline || '—', jd(x.plannedApproved), fa(span(x.plannedApproved as string, to) - 1), x.critical ? 'بله' : '—']), tones: overdue.map((x) => (x.critical ? 'bad' : 'warn') as Tone) }] : []),
      ],
      empty: null,
    })
  }

  // 9 materials & procurement
  const mats = inp.materials, rec = inp.receipts ?? [], ship = inp.shipments ?? [], pos = inp.orders ?? [], disc = inp.discrepancies ?? []
  if (!mats?.length && !rec.length && !ship.length && !pos.length) tiles.push(emptyTile('materials', 'کالا، انبار و تأمین', 'Package', C.amber, 'دادهٔ کنترل متریال برای این پروژه ثبت نشده است.'))
  else {
    const mv = (mats ?? []).filter((x) => inP(x.date, from, to) && x.status !== 'voided')
    const byKind = new Map<string, { n: number; label: string }>()
    for (const x of mv) { const a = byKind.get(x.kind) ?? { n: 0, label: x.kindLabel }; a.n++; byKind.set(x.kind, a) }
    const recIn = rec.filter((x) => inP(x.date, from, to))
    const arrived = ship.filter((x) => inP(x.ata, from, to))
    const late = ship.filter((x) => x.eta && x.eta.slice(0, 10) <= to && !x.ata)
    const poIn = pos.filter((x) => inP(x.date, from, to))
    const discNew = disc.filter((x) => inP(x.detectedAt, from, to)), discOpen = disc.filter((x) => x.status === 'open' || x.status === 'in_review')
    tiles.push({
      key: 'materials', title: 'کالا، انبار و تأمین', icon: 'Package', color: C.amber, tone: toneOf(late.length > 0, discOpen.length > 0),
      headline: { label: 'تراکنش انبار در دوره', value: fa(mv.length), sub: `${fa(recIn.length)} رسید انبار · ${fa(arrived.length)} محموله رسیده` },
      stats: [{ label: 'سفارش خرید صادرشده', value: fa(poIn.length) }, { label: 'محمولهٔ دیرکرد', value: fa(late.length), tone: late.length ? 'bad' : 'good' }, { label: 'مغایرت باز', value: fa(discOpen.length), tone: discOpen.length ? 'warn' : 'good' }],
      chart: byKind.size ? { kind: 'columns', items: [...byKind].map(([k, a], i) => ({ key: k, label: a.label, value: a.n, color: PALETTE[(i + 3) % PALETTE.length] })), unit: 'تراکنش' } : null,
      note: late.length ? `${fa(late.length)} محموله از تاریخ پیش‌بینی رسیدن گذشته است.` : mv.length ? 'جابه‌جایی کالا مطابق ثبت انبار.' : 'در این دوره جابه‌جایی کالا ثبت نشده است.',
      detail: [
        ...(mv.length ? [{ title: 'تراکنش‌های انبار', head: ['تاریخ', 'نوع', 'کالا', 'مقدار', 'واحد', 'وضعیت'], rows: [...mv].sort((a, b) => a.date.localeCompare(b.date)).map((x) => [jd(x.date), x.kindLabel, x.material, fa(x.qty, 2), x.unit, x.status === 'posted' ? 'ثبت قطعی' : 'در انتظار']) }] : []),
        ...(recIn.length ? [{ title: 'رسیدهای انبار', head: ['تاریخ', 'شماره', 'محل'], rows: recIn.map((x) => [jd(x.date), x.number, x.location || '—']) }] : []),
        ...(arrived.length || late.length ? [{ title: 'محموله‌ها', head: ['شماره', 'مبدأ', 'ارسال', 'پیش‌بینی رسیدن', 'رسیدن', 'وضعیت'], rows: [...arrived, ...late].map((x) => [x.number, x.origin || '—', jd(x.date), jd(x.eta), jd(x.ata), x.ata ? 'رسیده' : 'دیرکرد']), tones: [...arrived.map(() => 'good' as Tone), ...late.map(() => 'bad' as Tone)] }] : []),
        ...(poIn.length ? [{ title: 'سفارش‌های خرید', head: ['شماره', 'تاریخ', 'وضعیت'], rows: poIn.map((x) => [x.number, jd(x.date), x.status]) }] : []),
        ...(discNew.length || discOpen.length ? [{ title: 'مغایرت‌های کالا', head: ['شناسایی', 'نوع', 'علت احتمالی', 'وضعیت'], rows: [...new Set([...discNew, ...discOpen])].slice(0, 60).map((x) => [jd(x.detectedAt), x.kind, x.cause || '—', x.status]) }] : []),
      ],
      empty: null,
    })
  }

  // 10 finance — weekly and monthly
  if (kind !== 'daily') {
    if (!inp.certificates?.length && !inp.payments?.length) tiles.push(emptyTile('finance', 'مالی و صورت‌وضعیت', 'Wallet', C.pink, 'صورت‌وضعیت یا پرداختی برای قراردادهای این پروژه ثبت نشده است.'))
    else {
      const certs = (inp.certificates ?? []).filter((c) => inP(c.date, from, to))
      const pays = (inp.payments ?? []).filter((x) => inP(x.date, from, to))
      const paid = sum(pays.map((x) => x.amount)), prevPaid = sum((inp.payments ?? []).filter((x) => inP(x.date, prevFrom, prevTo)).map((x) => x.amount))
      const cert = sum(certs.map((c) => c.certified || c.gross))
      const unpaid = (inp.certificates ?? []).filter((c) => (c.date ?? '') <= to && c.certified > c.paid)
      const series = bks.map((b) => sum((inp.payments ?? []).filter((x) => inP(x.date, b.from, b.to)).map((x) => x.amount)))
      tiles.push({
        key: 'finance', title: 'مالی و صورت‌وضعیت', icon: 'Wallet', color: C.pink, tone: unpaid.length ? 'warn' : 'good',
        headline: { label: 'پرداخت در دوره', value: money(paid), sub: delta(paid, prevPaid) },
        stats: [{ label: 'صورت‌وضعیت در دوره', value: fa(certs.length) }, { label: 'مبلغ تأییدشدهٔ دوره', value: money(cert) }, { label: 'مانده پرداخت‌نشده', value: money(sum(unpaid.map((c) => c.certified - c.paid))), tone: unpaid.length ? 'warn' : 'good' }],
        chart: series.some((x) => x > 0) ? { kind: 'columns', items: bks.map((b, i) => ({ key: b.key, label: b.label, value: series[i], color: C.pink })), unit: 'ریال' } : null,
        note: unpaid.length ? `${fa(unpaid.length)} صورت‌وضعیت تأییدشده هنوز کامل پرداخت نشده است.` : 'صورت‌وضعیت پرداخت‌نشده‌ای نیست.',
        detail: [
          ...(certs.length ? [{ title: 'صورت‌وضعیت‌های دوره', head: ['شماره', 'قرارداد', 'تاریخ', 'ناخالص', 'تأییدشده', 'پرداخت‌شده', 'وضعیت'], rows: certs.map((c) => [c.number, c.contract, jd(c.date), money(c.gross), money(c.certified), money(c.paid), c.status]) }] : []),
          ...(pays.length ? [{ title: 'پرداخت‌های دوره', head: ['تاریخ', 'قرارداد', 'مبلغ'], rows: pays.map((x) => [jd(x.date), x.contract, money(x.amount)]) }] : []),
          ...(unpaid.length ? [{ title: 'صورت‌وضعیت‌های با مانده', head: ['شماره', 'قرارداد', 'تاریخ', 'تأییدشده', 'پرداخت‌شده', 'مانده'], rows: unpaid.map((c) => [c.number, c.contract, jd(c.date), money(c.certified), money(c.paid), money(c.certified - c.paid)]), tones: unpaid.map(() => 'warn' as Tone) }] : []),
        ],
        empty: null,
      })
    }
  }

  // 11 risks & issues
  const iss = f?.issues ?? null
  if (!f || (!iss?.length && !f.input.risks?.length)) tiles.push(emptyTile('issues', 'ریسک‌ها و مسائل', 'AlertTriangle', C.orange, 'ریسک یا مسئله‌ای برای این پروژه ثبت نشده است.'))
  else {
    const open = (iss ?? []).filter((i) => isOpenIssue(i.status))
    const od = open.filter((i) => i.due && i.due.slice(0, 10) < to)
    const opened = (iss ?? []).filter((i) => inP(i.createdAt, from, to)), closed = (iss ?? []).filter((i) => inP(i.closedAt, from, to))
    const risks = (f.input.risks ?? []).filter((r) => r.status !== 'closed')
    const hot = risks.filter((r) => r.level === 'critical' || r.level === 'high')
    const byP = new Map<string, number>()
    for (const i of open) byP.set(i.priority, (byP.get(i.priority) ?? 0) + 1)
    tiles.push({
      key: 'issues', title: 'ریسک‌ها و مسائل', icon: 'AlertTriangle', color: C.orange, tone: toneOf(od.some((i) => i.priority === 'critical' || i.priority === 'high'), od.length > 0 || hot.length > 0),
      headline: { label: 'مسئلهٔ باز', value: fa(open.length), sub: `${fa(opened.length)} تازه · ${fa(closed.length)} بسته‌شده در دوره` },
      stats: [{ label: 'مسئلهٔ معوق', value: fa(od.length), tone: od.length ? 'bad' : 'good' }, { label: 'ریسک بحرانی و بالا', value: fa(hot.length), tone: hot.length ? 'warn' : 'good' }],
      chart: byP.size ? { kind: 'donut', parts: ['critical', 'high', 'medium', 'low'].filter((p) => byP.get(p)).map((p) => ({ key: p, label: PRIO_FA[p], value: byP.get(p) ?? 0, color: PRIO_C[p] })), sub: 'مسئلهٔ باز' } : null,
      note: od.length ? `${fa(od.length)} مسئلهٔ باز از مهلت رفع گذشته است.` : 'مسئلهٔ معوقی نیست.',
      detail: [
        ...(open.length ? [{ title: 'مسائل باز', head: ['مسئله', 'اولویت', 'دسته', 'مهلت', 'مسئول'], rows: [...open].sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9')).map((i) => [i.title, PRIO_FA[i.priority] ?? i.priority, i.category ?? '—', jd(i.due), i.owner ?? '—']), tones: open.map((i) => (i.due && i.due.slice(0, 10) < to ? 'bad' : 'none') as Tone) }] : []),
        ...(closed.length ? [{ title: 'مسائل بسته‌شده در دوره', head: ['مسئله', 'اولویت', 'بستن'], rows: closed.map((i) => [i.title, PRIO_FA[i.priority] ?? i.priority, jd(i.closedAt)]) }] : []),
        ...(hot.length ? [{ title: 'ریسک‌های بحرانی و بالا', head: ['ریسک', 'امتیاز', 'سطح', 'مالک'], rows: hot.sort((a, b) => b.score - a.score).map((r) => [r.title, fa(r.score), r.level === 'critical' ? 'بحرانی' : 'بالا', r.owner ?? '—']), tones: hot.map((r) => (r.level === 'critical' ? 'bad' : 'warn') as Tone) }] : []),
      ],
      empty: null,
    })
  }

  // 12 decisions, actions and changes — weekly and monthly
  if (kind !== 'daily' && f) {
    const decs = f.input.decisions.filter((d) => d.status === 'pending' || d.status === 'in_review')
    const odDec = decs.filter((d) => d.requiredBy && d.requiredBy.slice(0, 10) < to)
    const acts = f.input.actions.filter((a) => a.status !== 'completed' && a.status !== 'cancelled')
    const odAct = acts.filter((a) => a.dueDate && a.dueDate.slice(0, 10) < to)
    const ch = (f.changes ?? []).filter((c) => inP(c.submittedAt, from, to))
    tiles.push({
      key: 'decisions', title: 'تصمیم‌ها، اقدامات و تغییرات', icon: 'Gavel', color: C.violet, tone: toneOf(odDec.length > 0, odAct.length > 0),
      headline: { label: 'تصمیم در انتظار', value: fa(decs.length), sub: `${fa(odDec.length)} مورد از موعد گذشته` },
      stats: [{ label: 'اقدام باز', value: fa(acts.length) }, { label: 'اقدام معوق', value: fa(odAct.length), tone: odAct.length ? 'bad' : 'good' }, { label: 'درخواست تغییر در دوره', value: fa(ch.length) }],
      chart: decs.length || acts.length ? { kind: 'bars', items: [{ key: 'd', label: 'تصمیم در انتظار', value: decs.length, color: C.violet }, { key: 'do', label: 'تصمیم معوق', value: odDec.length, color: C.rose }, { key: 'a', label: 'اقدام باز', value: acts.length, color: C.sky }, { key: 'ao', label: 'اقدام معوق', value: odAct.length, color: C.orange }] } : null,
      note: odDec.length ? `${fa(odDec.length)} تصمیم از موعد گذشته و منتظر مدیریت است.` : 'تصمیم معوقی نیست.',
      detail: [
        ...(decs.length ? [{ title: 'تصمیم‌های در انتظار', head: ['تصمیم', 'موعد', 'مرجع'], rows: decs.map((d) => [d.title, jd(d.requiredBy), d.owner ?? '—']), tones: decs.map((d) => (d.requiredBy && d.requiredBy.slice(0, 10) < to ? 'bad' : 'none') as Tone) }] : []),
        ...(acts.length ? [{ title: 'اقدام‌های باز', head: ['اقدام', 'سررسید', 'مسئول'], rows: acts.map((a) => [a.title, jd(a.dueDate), a.owner ?? '—']), tones: acts.map((a) => (a.dueDate && a.dueDate.slice(0, 10) < to ? 'bad' : 'none') as Tone) }] : []),
        ...(ch.length ? [{ title: 'درخواست‌های تغییر دوره', head: ['شماره', 'عنوان', 'وضعیت', 'مبلغ پیشنهادی', 'روز پیشنهادی'], rows: ch.map((c) => [c.number || '—', c.title, c.status, c.proposedCost == null ? '—' : money(c.proposedCost), c.proposedDays == null ? '—' : fa(c.proposedDays)]) }] : []),
      ],
      empty: null,
    })
  }

  // 13 reporting discipline — are the site's reports in?
  const inPer = inp.reports.filter((r) => inP(r.date, from, to))
  const reg = inPer.filter((r) => REGISTERED.has(r.status)), pend = inPer.filter((r) => !REGISTERED.has(r.status))
  const days = span(from, to), daysWith = new Set(reg.map((r) => r.date)).size
  const cover = (daysWith / days) * 100
  tiles.push({
    key: 'compliance', title: 'انضباط گزارش‌دهی', icon: 'CalendarCheck', color: C.slate, tone: !inp.reports.length ? 'none' : toneOf(cover < 50, cover < 85 || pend.length > 0),
    headline: { label: kind === 'daily' ? 'گزارش ثبت‌شده' : 'روزهای دارای گزارش', value: kind === 'daily' ? fa(reg.length) : `${fa(daysWith)} از ${fa(days)}`, sub: `${fa(pend.length)} گزارش پیش‌نویس یا نیازمند تکمیل` },
    stats: [{ label: 'تأییدشده', value: fa(inPer.filter((r) => r.status === 'approved').length) }, { label: 'در انتظار بررسی', value: fa(inPer.filter((r) => r.status === 'submitted' || r.status === 'partially_approved').length) }],
    chart: kind === 'daily' ? null : { kind: 'columns', items: bks.map((b) => ({ key: b.key, label: b.label, value: inp.reports.filter((r) => inP(r.date, b.from, b.to) && REGISTERED.has(r.status)).length, color: C.slate })), unit: 'گزارش' },
    note: inp.reports.length ? (pend.length ? `${fa(pend.length)} گزارش هنوز ارسال نشده یا ناقص است.` : 'همهٔ گزارش‌های دوره ارسال شده‌اند.') : 'گزارش کارگاهی برای این پروژه ثبت نشده است.',
    detail: inPer.length ? [{ title: 'گزارش‌های دوره', head: ['تاریخ', 'فرم', 'جبهه', 'وضعیت'], rows: [...inPer].sort((a, b) => a.date.localeCompare(b.date)).map((r) => [jd(r.date), r.formTitle, r.front || '—', STATUS_FA[r.status] ?? r.status]), tones: inPer.map((r) => (REGISTERED.has(r.status) ? 'none' : 'warn') as Tone) }] : [],
    empty: inp.reports.length ? null : 'گزارش کارگاهی برای این پروژه ثبت نشده است.',
  })

  // headline KPIs and narrative
  const t = (k: string) => tiles.find((x) => x.key === k)
  const kpis: PeriodReport['kpis'] = []
  const push = (k: string, color: string, spark?: number[]) => { const x = t(k); if (x && !x.empty) kpis.push({ key: k, color, label: x.headline.label, value: x.headline.value, sub: x.headline.sub, tone: x.tone, spark }) }
  push('progress', C.indigo)
  push('man', C.violet, kind === 'daily' ? undefined : bks.map((b) => sum(inp.resources.filter((r) => r.kind === 'man' && inP(r.date, b.from, b.to)).map((r) => r.total))))
  push('equip', C.orange)
  push('work', C.teal)
  push('stoppages', C.rose)
  push('issues', C.amber)
  const highlights: PeriodReport['highlights'] = []
  for (const x of tiles) if (!x.empty && x.note && (x.tone === 'bad' || x.tone === 'warn')) highlights.push({ text: `${x.title}: ${x.note}`, tone: x.tone })
  if (!highlights.length) highlights.push({ text: 'در این دوره موضوع نیازمند توجه فوری ثبت نشده است.', tone: 'good' })
  if (f && f.report.confidence === 'low') caveats.push('دادهٔ برخی منابع این پروژه کهنه یا ناقص است؛ جزئیات در «کیفیت داده» مرکز تحلیل.')
  caveats.push('پیشرفت، SPI، CPI و ریسک‌ها آخرین وضعیت ثبت‌شده‌اند؛ بقیهٔ ارقام به دورهٔ گزارش محدودند.')
  if (date > today) caveats.push('تاریخ گزارش بعد از امروز است.')

  return {
    kind, title: kind === 'daily' ? 'گزارش روزانهٔ کارگاه' : kind === 'weekly' ? 'گزارش هفتگی پروژه' : 'گزارش ماهانهٔ پروژه',
    subject: inp.project, from, to, periodLabel: p.label, prevLabel: p.prevLabel, generatedAt: today, kpis, highlights, tiles, caveats,
  }
}

const STATUS_FA: Record<string, string> = { draft: 'پیش‌نویس', incomplete: 'نیازمند تکمیل', submitted: 'در انتظار بررسی', partially_approved: 'تأیید جزئی', approved: 'تأییدشده', returned: 'بازگشت برای اصلاح', rejected: 'ردشده' }

/* ── management summary across projects ───────────────────────────── */

const HEALTH: Record<string, { label: string; color: string }> = { green: { label: 'سالم', color: C.green }, yellow: { label: 'نیازمند توجه', color: C.amber }, red: { label: 'بحرانی', color: C.rose }, black: { label: 'گیت مسدود', color: '#94a3b8' }, none: { label: 'بدون داده', color: C.slate } }

export function buildExecutiveSummary(kind: Exclude<PeriodKind, 'daily'>, date: string, list: ProjectFacts[], scopeLabel: string, today: string): PeriodReport {
  const p = periodOf(kind, date)
  const { from, to } = p
  const sm = summarise(list)
  const tiles: Tile[] = []
  const healthOf = (f: ProjectFacts) => f.input.metrics?.health?.status ?? 'none'

  // health
  const hc = new Map<string, number>()
  for (const f of list) hc.set(healthOf(f), (hc.get(healthOf(f)) ?? 0) + 1)
  const bad = list.filter((f) => healthOf(f) === 'red' || healthOf(f) === 'black')
  tiles.push({
    key: 'health', title: 'سلامت پروژه‌ها', icon: 'HeartPulse', color: C.green, tone: toneOf(bad.length > list.length / 3, bad.length > 0),
    headline: { label: 'پروژهٔ بحرانی یا مسدود', value: fa(bad.length), sub: `از ${fa(list.length)} پروژه` },
    stats: Object.entries(HEALTH).filter(([k]) => hc.get(k)).map(([k, h]) => ({ label: h.label, value: fa(hc.get(k) ?? 0) })),
    chart: { kind: 'donut', parts: Object.entries(HEALTH).map(([k, h]) => ({ key: k, label: h.label, value: hc.get(k) ?? 0, color: h.color })), sub: 'پروژه' },
    note: bad.length ? `بیشترین نگرانی: ${bad.slice(0, 3).map((f) => f.name).join('، ')}.` : 'پروژهٔ بحرانی نیست.',
    detail: [{ title: 'وضعیت سلامت پروژه‌ها', head: ['پروژه', 'سلامت', 'عامل اصلی', 'موانع گیت'], rows: list.map((f) => [f.name, HEALTH[healthOf(f)].label, f.input.metrics?.health?.drivenBy ?? '—', f.input.metrics?.health?.blockers?.slice(0, 2).join('؛ ') || '—']), tones: list.map((f) => (healthOf(f) === 'red' || healthOf(f) === 'black' ? 'bad' : healthOf(f) === 'yellow' ? 'warn' : 'none') as Tone) }],
    empty: list.length ? null : 'پروژه‌ای در این محدوده نیست.',
  })

  // progress gap per project
  const withM = list.filter((f) => f.input.metrics)
  const gaps = withM.map((f) => ({ f, gap: f.input.metrics!.lifecycle.actual - f.input.metrics!.lifecycle.planned })).sort((a, b) => a.gap - b.gap)
  const wa = withM.length ? sum(withM.map((f) => f.input.metrics!.lifecycle.actual)) / withM.length : 0
  const wp = withM.length ? sum(withM.map((f) => f.input.metrics!.lifecycle.planned)) / withM.length : 0
  tiles.push({
    key: 'progress', title: 'پیشرفت در برابر برنامه', icon: 'TrendingUp', color: C.indigo, tone: toneOf(wa - wp <= -10, wa - wp <= -3),
    headline: { label: 'میانگین پیشرفت', value: `${fa(wa, 1)}٪`, sub: `برنامه ${fa(wp, 1)}٪` },
    stats: [{ label: 'پروژه عقب‌تر از ۱۰ واحد', value: fa(gaps.filter((g) => g.gap <= -10).length), tone: gaps.some((g) => g.gap <= -10) ? 'bad' : 'good' }, { label: 'با شاخص پیشرفت', value: fa(withM.length) }],
    chart: gaps.length ? { kind: 'bars', items: gaps.slice(0, 8).map((g) => ({ key: g.f.id, label: g.f.name, value: Math.abs(g.gap), display: `${g.gap >= 0 ? '+' : '−'}${fa(Math.abs(g.gap), 1)}`, color: g.gap <= -10 ? C.rose : g.gap <= -3 ? C.amber : C.green, note: `${fa(g.f.input.metrics!.lifecycle.actual, 1)}٪ در برابر ${fa(g.f.input.metrics!.lifecycle.planned, 1)}٪` })) } : null,
    note: gaps.length && gaps[0].gap < 0 ? `بیشترین عقب‌ماندگی: ${gaps[0].f.name} (${fa(Math.abs(gaps[0].gap), 1)} واحد).` : 'پروژه‌ها مطابق برنامه‌اند.',
    detail: [{ title: 'پیشرفت پروژه‌ها', head: ['پروژه', 'مرحله', 'واقعی', 'برنامه', 'فاصله', 'SPI', 'CPI'], rows: gaps.map((g) => [g.f.name, g.f.phase?.title ?? '—', `${fa(g.f.input.metrics!.lifecycle.actual, 1)}٪`, `${fa(g.f.input.metrics!.lifecycle.planned, 1)}٪`, fa(g.gap, 1), g.f.input.metrics!.evm?.spi == null ? '—' : fa(g.f.input.metrics!.evm!.spi as number, 2), g.f.input.metrics!.evm?.cpi == null ? '—' : fa(g.f.input.metrics!.evm!.cpi as number, 2)]), tones: gaps.map((g) => toneOf(g.gap <= -10, g.gap <= -3)) }],
    empty: withM.length ? null : 'هیچ پروژه‌ای شاخص پیشرفت ندارد.',
  })

  // cost
  const evm = withM.filter((f) => f.input.metrics!.evm && f.input.metrics!.evm.bac > 0)
  const bac = sum(evm.map((f) => f.input.metrics!.evm!.bac)), eac = sum(evm.map((f) => f.input.metrics!.evm!.eac ?? f.input.metrics!.evm!.bac))
  const over = evm.filter((f) => (f.input.metrics!.evm!.vac ?? 0) < 0).sort((a, b) => (a.input.metrics!.evm!.vac ?? 0) - (b.input.metrics!.evm!.vac ?? 0))
  tiles.push({
    key: 'cost', title: 'هزینه و پیش‌بینی', icon: 'Wallet', color: C.pink, tone: toneOf(eac > bac * 1.1, eac > bac),
    headline: { label: 'پیش‌بینی تمام‌شده (EAC)', value: money(eac), sub: `بودجه ${money(bac)}` },
    stats: [{ label: 'پروژهٔ بیش از بودجه', value: fa(over.length), tone: over.length ? 'bad' : 'good' }, { label: 'دارای EVM', value: fa(evm.length) }],
    chart: over.length ? { kind: 'bars', items: over.slice(0, 7).map((f) => ({ key: f.id, label: f.name, value: -(f.input.metrics!.evm!.vac as number), display: money(f.input.metrics!.evm!.vac), color: C.rose })) } : null,
    note: over.length ? `${fa(over.length)} پروژه پیش‌بینی بیش از بودجه دارند.` : 'پیش‌بینی هیچ پروژه‌ای از بودجه بیشتر نیست.',
    detail: [{ title: 'ارزش کسب‌شدهٔ پروژه‌ها', head: ['پروژه', 'BAC', 'EAC', 'VAC', 'CPI'], rows: evm.map((f) => { const e = f.input.metrics!.evm!; return [f.name, money(e.bac), money(e.eac), money(e.vac), e.cpi == null ? '—' : fa(e.cpi, 2)] }), tones: evm.map((f) => ((f.input.metrics!.evm!.vac ?? 0) < 0 ? 'bad' : 'none') as Tone) }],
    empty: evm.length ? null : 'هیچ پروژه‌ای دادهٔ ارزش کسب‌شده ندارد.',
  })

  // material deviations by domain
  const devs = list.flatMap(deviations).filter((d) => d.severity === 'material')
  const byDom = new Map<string, number>()
  for (const d of devs) byDom.set(d.domain, (byDom.get(d.domain) ?? 0) + 1)
  tiles.push({
    key: 'deviations', title: 'انحرافات مهم', icon: 'Activity', color: C.rose, tone: devs.length ? 'bad' : 'good',
    headline: { label: 'انحراف بالاتر از آستانه', value: fa(devs.length), sub: `در ${fa(sm.critical.length)} پروژه` },
    stats: [{ label: 'هشدار با اهمیت بالا', value: fa(sm.warnings.length), tone: sm.warnings.length ? 'warn' : 'good' }],
    chart: byDom.size ? { kind: 'donut', parts: [...byDom].sort((a, b) => b[1] - a[1]).map(([k, n], i) => ({ key: k, label: devs.find((d) => d.domain === k)?.metric.split(' ')[0] ? DOMAIN_LABEL[k] ?? k : k, value: n, color: PALETTE[(i + 4) % PALETTE.length] })), sub: 'انحراف' } : null,
    note: sm.critical.length ? `بیشترین انحراف: ${sm.critical.slice(0, 2).map((c) => c.project).join('، ')}.` : 'انحراف مهمی دیده نشد.',
    detail: [
      ...(devs.length ? [{ title: 'انحرافات مهم', head: ['پروژه', 'حوزه', 'شاخص', 'مقدار', 'مرجع'], rows: devs.map((d) => [d.project, DOMAIN_LABEL[d.domain] ?? d.domain, d.metric, d.actual, d.reference]), tones: devs.map(() => 'bad' as Tone) }] : []),
      ...(sm.warnings.length ? [{ title: 'هشدارهای پیش‌نگر', head: ['پروژه', 'هشدار', 'دلیل'], rows: list.flatMap(earlyWarnings).filter((w) => w.severity === 'high').map((w) => [w.project, w.title, w.reason]) }] : []),
    ],
    empty: null,
  })

  // decisions
  const odDec = sm.decisions.filter((d) => d.overdue)
  tiles.push({
    key: 'decisions', title: 'تصمیم‌های موردنیاز مدیریت', icon: 'Gavel', color: C.violet, tone: toneOf(odDec.length > 0, sm.decisions.length > 0),
    headline: { label: 'تصمیم در انتظار', value: fa(sm.decisions.length), sub: `${fa(odDec.length)} مورد از موعد گذشته` },
    stats: [],
    chart: sm.decisions.length ? { kind: 'donut', parts: [{ key: 'od', label: 'موعد گذشته', value: odDec.length, color: C.rose }, { key: 'p', label: 'در موعد', value: sm.decisions.length - odDec.length, color: C.violet }], sub: 'تصمیم' } : null,
    note: odDec.length ? `قدیمی‌ترین تصمیم معوق: ${odDec[0].title} (${odDec[0].project}).` : 'تصمیم معوقی نیست.',
    detail: sm.decisions.length ? [{ title: 'تصمیم‌های در انتظار', head: ['پروژه', 'تصمیم', 'موعد', 'مرجع', 'وضعیت'], rows: sm.decisions.map((d) => [d.project, d.title, jd(d.dueBy), d.owner ?? '—', d.overdue ? 'موعد گذشته' : 'در انتظار']), tones: sm.decisions.map((d) => (d.overdue ? 'bad' : 'none') as Tone) }] : [],
    empty: null,
  })

  // issues flow in the period
  const iss = list.flatMap((f) => (f.issues ?? []).map((i) => ({ f, i })))
  const open = iss.filter((x) => isOpenIssue(x.i.status)), od = open.filter((x) => x.i.due && x.i.due.slice(0, 10) < to)
  const opened = iss.filter((x) => inP(x.i.createdAt, from, to)).length, closed = iss.filter((x) => inP(x.i.closedAt, from, to)).length
  const perProj = new Map<string, { f: ProjectFacts; n: number }>()
  for (const x of od) perProj.set(x.f.id, { f: x.f, n: (perProj.get(x.f.id)?.n ?? 0) + 1 })
  tiles.push({
    key: 'issues', title: 'مسائل و موانع', icon: 'AlertTriangle', color: C.orange, tone: toneOf(od.length > 5, od.length > 0),
    headline: { label: 'مسئلهٔ باز', value: fa(open.length), sub: `${fa(opened)} تازه · ${fa(closed)} بسته‌شده در دوره` },
    stats: [{ label: 'معوق', value: fa(od.length), tone: od.length ? 'bad' : 'good' }],
    chart: perProj.size ? { kind: 'bars', items: [...perProj.values()].sort((a, b) => b.n - a.n).slice(0, 7).map((x) => ({ key: x.f.id, label: x.f.name, value: x.n, color: C.orange })) } : null,
    note: opened > closed ? 'ورود مسئله از رفع آن بیشتر است؛ موجودی مسائل رو به افزایش است.' : 'رفع مسائل هم‌پای ورود آن‌هاست.',
    detail: od.length ? [{ title: 'مسائل معوق', head: ['پروژه', 'مسئله', 'اولویت', 'مهلت', 'مسئول'], rows: od.map((x) => [x.f.name, x.i.title, PRIO_FA[x.i.priority] ?? x.i.priority, jd(x.i.due), x.i.owner ?? '—']), tones: od.map(() => 'bad' as Tone) }] : [],
    empty: iss.length ? null : 'مسئله‌ای ثبت نشده است.',
  })

  // risks
  const rs = list.flatMap((f) => (f.input.risks ?? []).filter((r) => r.status !== 'closed').map((r) => ({ f, r })))
  const hot = rs.filter((x) => x.r.level === 'critical' || x.r.level === 'high').sort((a, b) => b.r.score - a.r.score)
  const lv = new Map<string, number>()
  for (const x of rs) lv.set(x.r.level, (lv.get(x.r.level) ?? 0) + 1)
  tiles.push({
    key: 'risks', title: 'ریسک‌ها', icon: 'ShieldAlert', color: C.amber, tone: toneOf(hot.some((x) => x.r.level === 'critical'), hot.length > 0),
    headline: { label: 'ریسک بحرانی و بالا', value: fa(hot.length), sub: `از ${fa(rs.length)} ریسک فعال` },
    stats: [],
    chart: lv.size ? { kind: 'donut', parts: ['critical', 'high', 'medium', 'low'].filter((l) => lv.get(l)).map((l) => ({ key: l, label: PRIO_FA[l], value: lv.get(l) ?? 0, color: PRIO_C[l] })), sub: 'ریسک فعال' } : null,
    note: hot.length ? `بالاترین ریسک: ${hot[0].r.title} (${hot[0].f.name}).` : 'ریسک بحرانی یا بالایی ثبت نشده است.',
    detail: hot.length ? [{ title: 'ریسک‌های بحرانی و بالا', head: ['پروژه', 'ریسک', 'امتیاز', 'سطح', 'مالک'], rows: hot.map((x) => [x.f.name, x.r.title, fa(x.r.score), PRIO_FA[x.r.level], x.r.owner ?? '—']), tones: hot.map((x) => (x.r.level === 'critical' ? 'bad' : 'warn') as Tone) }] : [],
    empty: rs.length ? null : 'ریسکی ثبت نشده است.',
  })

  // per-project cards — each opens that project's monthly report
  const projTiles: Tile[] = list.map((f) => {
    const m = f.input.metrics, h = healthOf(f)
    const dv = deviations(f).filter((d) => d.severity === 'material').length
    return {
      key: `p:${f.id}`, projectId: f.id, title: f.name, icon: 'Building2', color: HEALTH[h].color, tone: h === 'red' || h === 'black' ? 'bad' : h === 'yellow' ? 'warn' : h === 'green' ? 'good' : 'none',
      headline: { label: 'پیشرفت', value: m ? `${fa(m.lifecycle.actual, 1)}٪` : '—', sub: m ? `برنامه ${fa(m.lifecycle.planned, 1)}٪` : 'شاخص ندارد' },
      stats: [{ label: 'سلامت', value: HEALTH[h].label, tone: h === 'red' || h === 'black' ? 'bad' : h === 'yellow' ? 'warn' : 'none' }, { label: 'انحراف مهم', value: fa(dv), tone: dv ? 'bad' : 'good' }],
      chart: m ? { kind: 'progress', actual: m.lifecycle.actual, planned: m.lifecycle.planned, label: '' } : null,
      note: f.phase ? `مرحلهٔ ${f.phase.title}` : '', detail: [], empty: null,
    }
  })

  const kpis: PeriodReport['kpis'] = [
    { key: 'health', color: C.green, label: 'پروژه‌ها', value: fa(list.length), sub: `${fa(bad.length)} بحرانی یا مسدود`, tone: bad.length ? 'bad' : 'good' },
    { key: 'progress', color: C.indigo, label: 'میانگین پیشرفت', value: `${fa(wa, 1)}٪`, sub: `برنامه ${fa(wp, 1)}٪`, tone: toneOf(wa - wp <= -10, wa - wp <= -3) },
    { key: 'cost', color: C.pink, label: 'پیش‌بینی تمام‌شده', value: money(eac), sub: `بودجه ${money(bac)}`, tone: toneOf(eac > bac * 1.1, eac > bac) },
    { key: 'deviations', color: C.rose, label: 'انحراف مهم', value: fa(devs.length), sub: `${fa(sm.warnings.length)} هشدار`, tone: devs.length ? 'bad' : 'good' },
    { key: 'decisions', color: C.violet, label: 'تصمیم در انتظار', value: fa(sm.decisions.length), sub: `${fa(odDec.length)} معوق`, tone: odDec.length ? 'bad' : 'good' },
  ]
  const highlights: PeriodReport['highlights'] = [
    ...(bad.length ? [{ text: `${fa(bad.length)} پروژه بحرانی یا با گیت مسدود: ${bad.slice(0, 4).map((f) => f.name).join('، ')}.`, tone: 'bad' as Tone }] : []),
    ...(gaps.length && gaps[0].gap <= -10 ? [{ text: `بیشترین عقب‌ماندگی از برنامه: ${gaps[0].f.name} با ${fa(Math.abs(gaps[0].gap), 1)} واحد درصد.`, tone: 'bad' as Tone }] : []),
    ...(over.length ? [{ text: `${fa(over.length)} پروژه پیش‌بینی هزینهٔ بیش از بودجه دارند؛ بیشترین: ${over[0].name}.`, tone: 'warn' as Tone }] : []),
    ...(odDec.length ? [{ text: `${fa(odDec.length)} تصمیم مدیریتی از موعد گذشته است.`, tone: 'bad' as Tone }] : []),
    ...sm.patterns.filter((x) => x.escalate).slice(0, 2).map((x) => ({ text: `موضوع مشترک در ${fa(x.projects.length)} پروژه: ${x.text}.`, tone: 'warn' as Tone })),
  ]
  if (!highlights.length) highlights.push({ text: 'در این محدوده موضوع نیازمند تصمیم فوری نیست.', tone: 'good' })
  return {
    kind: 'executive', title: `خلاصهٔ مدیریتی ${kind === 'weekly' ? 'هفتگی' : 'ماهانه'}`, subject: scopeLabel, from, to, periodLabel: p.label, prevLabel: p.prevLabel, generatedAt: today,
    kpis, highlights, tiles: [...tiles, ...projTiles],
    caveats: ['سلامت، پیشرفت و ارزش کسب‌شده آخرین وضعیت ثبت‌شدهٔ هر پروژه‌اند؛ جریان مسائل به دورهٔ گزارش محدود است.', ...(sm.lowConfidence.length ? [`دادهٔ ${fa(sm.lowConfidence.length)} پروژه کهنه یا ناقص است.`] : [])],
  }
}

const DOMAIN_LABEL: Record<string, string> = { schedule: 'زمان و پیشرفت', cost: 'هزینه', engineering: 'مهندسی', procurement: 'تأمین کالا', construction: 'اجرا', contract: 'قرارداد', risk: 'ریسک', issues: 'مسائل', execution: 'توقفات', decisions: 'تصمیم و اقدام' }
