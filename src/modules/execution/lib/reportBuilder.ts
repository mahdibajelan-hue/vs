/**
 * Report builder (audit M3): one engine for every execution report — type → sections → tables, then the same tables feed the
 * on-screen preview, the printed / PDF page (with the ISO document-control block) and the Excel file. Nothing is entered here:
 * every number comes from the daily reports through the module's own calculations (periodReport / progress), so a report
 * built twice from the same data is the same report. The issued copy stores these tables (ex_issued_docs.content).
 */
import type { Activity, Baseline, BaselineLine, Report, ReportLine, ReportResource, Stoppage } from '../types'
import { activityRows, byDimension, dailyMatrix, resourceSummary, statusSummary, stoppageSummary } from './periodReport'
import { deviationDrivers, physicalProgress, plannedOverall, type EmployerMode } from './progress'
import { jalaliText, type Period } from './periods'
import { drDisciplines, drLocations, drNarrative, drRegisters, drResources, type CsData, type DrTable } from './stationDr'
import { dayHeader, dayNarrative, dayNext, dayProgress, dayReports, resourceBands, sideFont, thicknessRows, type Bands } from './dailyDr'
import { chainText } from './chainage'

export type SectionKey = 'dr_progress' | 'dr_ops' | 'dr_man' | 'dr_equip' | 'dr_next' | 'summary' | 'volumes' | 'daily' | 'fronts' | 'resources' | 'stoppages' | 'deviation' | 'status' | 'payable' | 'disciplines' | 'locations' | 'registers' | 'narrative' | 'crew' | 'fleet'
export const SECTION_LABEL: Record<SectionKey, string> = {
  dr_progress: 'پیشرفت عملیات اجرایی (برگهٔ DR)', dr_ops: 'شرح عملیات و موانع و مشکلات', dr_man: 'لیست نیروی انسانی', dr_equip: 'لیست ماشین‌آلات و تجهیزات', dr_next: 'پیش‌بینی عملیات اجرایی روز آینده',
  summary: 'خلاصهٔ مدیریتی', volumes: 'احجام اجرایی به تفکیک فعالیت', daily: 'کارکرد روزانه', fronts: 'عملکرد جبهه‌های کاری', resources: 'نیروی انسانی و ماشین‌آلات',
  stoppages: 'توقفات و علل', deviation: 'انحراف از برنامه (عوامل اصلی)', status: 'وضعیت گزارش‌ها و تأییدها', payable: 'مبنای صورت‌وضعیت (تأییدشده × فی)',
  disciplines: 'روکش احجام به تفکیک دیسیپلین', locations: 'احجام به تفکیک محل اجرا', registers: 'ثبت‌های ایستگاه (پایپینگ، مکانیکال)', narrative: 'اهم فعالیت‌ها و موانع', crew: 'نیروی انسانی به تفکیک بخش', fleet: 'ماشین‌آلات به تفکیک گروه',
}
export type PeriodMode = 'day' | 'week' | 'month' | 'range'
export interface ReportType { key: string; label: string; period: PeriodMode; sections: SectionKey[] }
export const REPORT_TYPES: ReportType[] = [
  // the contractor's daily report (DR) as printed on site — the hydrostatic-test sheet is not part of it
  { key: 'daily', label: 'گزارش روزانه', period: 'day', sections: ['dr_progress', 'dr_ops', 'dr_man', 'dr_equip', 'dr_next'] },
  { key: 'weekly', label: 'گزارش هفتگی', period: 'week', sections: ['summary', 'volumes', 'daily', 'fronts', 'resources', 'stoppages', 'status'] },
  { key: 'monthly', label: 'گزارش ماهانه', period: 'month', sections: ['summary', 'volumes', 'fronts', 'resources', 'stoppages', 'deviation', 'status'] },
  { key: 'activity', label: 'گزارش عملکرد فعالیت', period: 'range', sections: ['volumes', 'daily'] },
  { key: 'front', label: 'گزارش عملکرد جبههٔ کاری', period: 'range', sections: ['fronts', 'volumes', 'stoppages'] },
  { key: 'resources', label: 'گزارش منابع انسانی و ماشین‌آلات', period: 'range', sections: ['resources'] },
  { key: 'volumes', label: 'گزارش احجام اجرایی', period: 'range', sections: ['volumes'] },
  { key: 'progress', label: 'گزارش پیشرفت فیزیکی', period: 'range', sections: ['summary', 'volumes', 'deviation'] },
  { key: 'deviation', label: 'گزارش انحراف از برنامه', period: 'range', sections: ['deviation'] },
  { key: 'stoppages', label: 'گزارش مشکلات و موانع', period: 'range', sections: ['stoppages', 'status'] },
  { key: 'contractor', label: 'گزارش عملکرد پیمانکار', period: 'range', sections: ['summary', 'fronts', 'stoppages', 'status'] },
  { key: 'payable', label: 'گزارش اطلاعات صورت‌وضعیت', period: 'range', sections: ['payable', 'volumes'] },
  { key: 'station_daily', label: 'گزارش روزانهٔ ایستگاه (قالب DR)', period: 'day', sections: ['summary', 'disciplines', 'locations', 'registers', 'narrative', 'crew', 'fleet'] },
]
export const typeOf = (k: string) => REPORT_TYPES.find((t) => t.key === k) ?? REPORT_TYPES[2]

export interface Cell { v: string | number; n?: boolean }
export interface Table { key: SectionKey; title: string; head: string[]; rows: Cell[][]; note?: string
  /** the manpower / machinery list in four bands, as on the daily sheet */
  bands?: Bands
  /** starts a new printed page */
  page?: boolean }
export interface Kpi { label: string; value: string }
export interface BuiltReport { title: string; period: { from: string; to: string; label: string }; filters: { front?: string; activityIds?: string[] }; kpis: Kpi[]; tables: Table[]
  /** the daily sheet's header: site and weather of the day, and the site reports it was built from */
  header?: { label: string; value: string }[]; sources?: string[] }

export interface BuildCtx {
  activities: Activity[]; reports: Report[]; lines: ReportLine[]; resources: ReportResource[]; stoppages: Stoppage[]
  baselines: Baseline[]; blines: BaselineLine[]; baseOf: (a: Activity, asOf: string) => number; employer: EmployerMode; groupWeights?: Record<string, number>
  /** the compressor-station registers, for the DR's piping / mechanical rows */
  cs?: CsData
}
export interface PayRow { activityId: string; qty: number; unitPrice: number }

const STOP_FA: Record<string, string> = { material: 'کمبود مصالح', drawing: 'نقشه و مهندسی', land: 'تحویل زمین', permit: 'مجوز', weather: 'شرایط جوی', equipment: 'خرابی تجهیزات', manpower: 'کمبود نیرو', hse: 'HSE', other: 'سایر', employer: 'کارفرما' }
const STATUS_FA: Record<string, string> = { draft: 'پیش‌نویس', incomplete: 'ناقص', submitted: 'در انتظار بررسی', partially_approved: 'تأیید جزئی', approved: 'تأییدشده', returned: 'برگشتی', rejected: 'ردشده', pending: 'در انتظار', }
const r2 = (x: number) => Math.round(x * 100) / 100
const faN = (x: number) => x.toLocaleString('fa-IR', { maximumFractionDigits: 2 })
const pctS = (x: number) => `${faN(r2(x * 100))}٪`

/** the data narrowed to one front and/or some activities — filters act on the source rows, so every section agrees */
export function narrow(c: BuildCtx, f: { front?: string; activityIds?: string[] }): BuildCtx {
  if (!f.front && !f.activityIds?.length) return c
  const reports = f.front ? c.reports.filter((r) => r.front === f.front) : c.reports
  const ids = new Set(reports.map((r) => r.id))
  const acts = f.activityIds?.length ? new Set(f.activityIds) : null
  return {
    ...c, reports,
    activities: acts ? c.activities.filter((a) => acts.has(a.id)) : c.activities,
    lines: c.lines.filter((l) => ids.has(l.reportId) && (!acts || (l.activityId != null && acts.has(l.activityId)))),
    resources: c.resources.filter((r) => ids.has(r.reportId)), stoppages: c.stoppages.filter((s) => ids.has(s.reportId)),
  }
}

export function buildReport(src: BuildCtx, p: Period, type: ReportType, sections: SectionKey[], filters: { front?: string; activityIds?: string[] } = {}, pay?: PayRow[]): BuiltReport {
  const c = narrow(src, filters)
  const ctx = { activities: c.activities, reports: c.reports, lines: c.lines, resources: c.resources, stoppages: c.stoppages }
  const base = (a: Activity) => c.baseOf(a, p.to)
  const tables: Table[] = []
  const kpis: Kpi[] = []
  const actRows = activityRows(ctx, p, base, c.employer)
  const stops = stoppageSummary(ctx, p)
  const days = dayReports(c.reports, p.to, filters.front)
  let header: BuiltReport['header']
  for (const s of sections) {
    if (s.startsWith('dr_')) header ??= dayHeader(days)
    if (s === 'dr_progress') {
      tables.push({ key: s, title: 'گزارش روزانهٔ عملیات اجرایی', page: true, head: ['ردیف', 'شرح عملیات', 'واحد', 'مقدار کل', 'کیلومتراژ از', 'کیلومتراژ تا', 'کارکرد تا روز قبل', 'کارکرد امروز', 'کارکرد تا امروز', 'مقدار باقیمانده', 'درصد پیشرفت تجمعی', 'توضیحات'],
        rows: (() => {
          const acts = dayProgress(c.activities, c.reports, c.lines, p.to, base)
          const rows: Cell[][] = acts.map((r, i) => [{ v: i + 1, n: true }, { v: r.activity.title }, { v: r.activity.unit }, { v: r2(r.base), n: true }, { v: chainText(r.kmFrom) }, { v: chainText(r.kmTo) }, { v: r2(r.prev), n: true }, { v: r2(r.today), n: true }, { v: r2(r.cum), n: true }, { v: r2(r.remaining), n: true }, { v: pctS(r.pct), n: true }, { v: r.note }])
          // pipe entry, stringing and welding by wall thickness, from the site minutes
          let k = acts.length
          for (const t of thicknessRows(c.reports, c.lines, p.to)) {
            const label = `${t.title} — ${t.thk === -1 ? 'مجموع' : t.thk == null ? 'ضخامت نامشخص' : `ضخامت ${t.thk.toLocaleString('fa-IR')}″`}`
            rows.push([{ v: t.unit === 'متر' ? '' : ++k, n: true }, { v: t.unit === 'متر' ? '' : label }, { v: t.unit }, { v: '' }, { v: '' }, { v: '' }, { v: r2(t.prev), n: true }, { v: r2(t.today), n: true }, { v: r2(t.cum), n: true }, { v: '' }, { v: '' }, { v: '' }])
          }
          return rows
        })(),
        note: 'کارکرد = مقدار گزارش‌شده (تأییدشده با مقدار تأییدی و در انتظار بررسی)؛ ردیف‌های ردشده شمرده نمی‌شوند.' })
      continue
    }
    if (s === 'dr_ops') {
      const n = dayNarrative(days), pad = (a: string[], k: number) => [...a, ...Array(Math.max(0, k - a.length)).fill('')]
      tables.push({ key: s, title: 'شرح عملیات', page: true, head: ['ردیف', 'شرح عملیات'], rows: pad(n.ops, 12).map((x, i) => [{ v: i + 1, n: true }, { v: x }]) })
      tables.push({ key: s, title: 'موانع و مشکلات', head: ['ردیف', 'موانع و مشکلات'], rows: pad(n.obstacles, 3).map((x, i) => [{ v: i + 1, n: true }, { v: x }]) })
      continue
    }
    if (s === 'dr_man' || s === 'dr_equip') {
      const kind = s === 'dr_man' ? 'man' : 'equip'
      const ids = new Set(days.map((r) => r.id))
      const b = resourceBands(c.resources.filter((x) => ids.has(x.reportId)), kind)
      tables.push({ key: s, title: kind === 'man' ? 'لیست نیروی انسانی' : 'لیست ماشین‌آلات سبک و سنگین و تجهیزات اجرایی', page: true, head: ['قسمت', kind === 'man' ? 'نیروی انسانی' : 'تجهیزات', ...b.head], bands: b,
        rows: [...b.bands.flat().map((r) => [{ v: r.section }, { v: r.name }, ...r.vals.map((v) => ({ v, n: true }))]), [{ v: 'جمع کل' }, { v: '' }, ...b.total.map((v) => ({ v, n: true }))]] })
      continue
    }
    if (s === 'dr_next') {
      const n = dayNext(days)
      const rows = n.rows.map((x) => [{ v: x.op }, { v: x.kmFrom }, { v: x.kmTo }, { v: x.unit }, { v: x.qty, n: true }, { v: x.crew }, { v: x.note }])
      tables.push({ key: s, title: 'گزارش پیش‌بینی عملیات اجرایی روز آینده', page: true, head: ['نوع عملیات', 'کیلومتراژ از', 'کیلومتراژ تا', 'واحد', 'مقدار', 'نفر اجرا', 'ملاحظات'], rows,
        note: [n.date ? `تاریخ پیش‌بینی: ${jalaliText(n.date)}` : '', n.hours ? `جمع ساعت کاری: ${faN(n.hours)} ساعت` : '', n.condition].filter(Boolean).join(' · ') || undefined })
      continue
    }
    if (s === 'summary') {
      const prog = physicalProgress({ ...c, asOf: p.to, mode: 'approved', groupWeights: c.groupWeights, employer: c.employer })
      const plan = plannedOverall({ ...c, asOf: p.to, groupWeights: c.groupWeights })
      const st = statusSummary(ctx, p)
      const reps = Object.values(st.reports).reduce((x, y) => x + y, 0)
      const man = resourceSummary(ctx, p).filter((r) => r.kind === 'man').reduce((x, r) => x + r.avgActive, 0)
      kpis.push({ label: 'گزارش‌های دوره', value: faN(reps) }, { label: 'تأییدشده', value: faN(st.reports.approved ?? 0) },
        { label: 'پیشرفت واقعی (تأییدشده)', value: pctS(prog.overall) }, { label: 'پیشرفت برنامه‌ای', value: plan.overall == null ? '—' : pctS(plan.overall) },
        { label: 'انحراف', value: plan.overall == null ? '—' : `${faN(r2((prog.overall - plan.overall) * 100))} واحد درصد` },
        { label: 'میانگین نفرات فعال در روز', value: faN(r2(man)) }, { label: 'ساعات توقف', value: faN(r2(stops.reduce((x, y) => x + y.hours, 0))) })
      continue
    }
    if (s === 'volumes') tables.push({ key: s, title: SECTION_LABEL[s], head: ['ردیف', 'شرح فعالیت', 'واحد', 'مقدار پیمان', 'تجمعی قبل', 'تأییدشدهٔ دوره', 'در انتظار تأیید', 'ردشده', 'تجمعی تأییدشده', 'درصد'],
      rows: actRows.map((r) => [{ v: r.activity.itemNo }, { v: r.activity.title }, { v: r.activity.unit }, { v: r2(r.base), n: true }, { v: r2(r.prevApproved), n: true }, { v: r2(r.approvedCounted), n: true }, { v: r2(r.pending), n: true }, { v: r2(r.rejected), n: true }, { v: r2(r.cumApproved), n: true }, { v: pctS(r.pct), n: true }]),
      note: 'مقادیر دوره جمع مقادیر روزانهٔ همان دوره است و تجمعی = تجمعی قبل + دوره؛ هیچ ستونی از جمع تجمعی‌ها ساخته نشده است.' })
    if (s === 'daily') { const m = dailyMatrix(ctx, p); tables.push({ key: s, title: SECTION_LABEL[s], head: ['شرح فعالیت', ...m.days.map((d) => jalaliText(d).slice(5)), 'جمع'], rows: m.rows.map((r) => [{ v: r.activity.title }, ...m.days.map((d) => ({ v: r2(r.byDay[d] ?? 0), n: true })), { v: r2(r.total), n: true }]), note: 'گزارش‌شده و تأییدشده (بدون ردشده‌ها).' }) }
    if (s === 'fronts') tables.push({ key: s, title: SECTION_LABEL[s], head: ['جبهه', 'فعالیت', 'واحد', 'گزارش‌شده', 'تأییدشده'], rows: byDimension(ctx, p, 'front', () => '').map((r) => [{ v: r.key }, { v: r.activity.title }, { v: r.activity.unit }, { v: r2(r.registered), n: true }, { v: r2(r.approved), n: true }]) })
    if (s === 'resources') tables.push({ key: s, title: SECTION_LABEL[s], head: ['نوع', 'عنوان', 'میانگین فعال در روز', 'میانگین غیرفعال', 'جمع ساعات', 'روزهای حضور'], rows: resourceSummary(ctx, p).map((r) => [{ v: r.kind === 'man' ? 'نیروی انسانی' : 'ماشین‌آلات' }, { v: r.name }, { v: r2(r.avgActive), n: true }, { v: r2(r.avgIdle), n: true }, { v: r2(r.hours), n: true }, { v: r.days, n: true }]) })
    if (s === 'stoppages') tables.push({ key: s, title: SECTION_LABEL[s], head: ['علت', 'تعداد', 'ساعات'], rows: stops.map((r) => [{ v: STOP_FA[r.category] ?? r.category }, { v: r.count, n: true }, { v: r2(r.hours), n: true }]) })
    if (s === 'deviation') tables.push({ key: s, title: SECTION_LABEL[s], head: ['ردیف', 'فعالیت', 'برنامه‌ای', 'واقعی', 'سهم از انحراف کل (واحد درصد)'],
      rows: deviationDrivers({ ...c, asOf: p.to, groupWeights: c.groupWeights, employer: c.employer }).slice(0, 12).map((d) => [{ v: d.activity.itemNo }, { v: d.activity.title }, { v: pctS(d.planned), n: true }, { v: pctS(d.actual), n: true }, { v: r2(d.points * 100), n: true }]) })
    if (s === 'status') { const st = statusSummary(ctx, p); tables.push({ key: s, title: SECTION_LABEL[s], head: ['موضوع', 'وضعیت', 'تعداد'], rows: [...Object.entries(st.reports).map(([k, v]) => [{ v: 'گزارش' }, { v: STATUS_FA[k] ?? k }, { v, n: true }]), ...Object.entries(st.lines).map(([k, v]) => [{ v: 'ردیف کارکرد' }, { v: STATUS_FA[k] ?? k }, { v, n: true }])] as Cell[][] }) }
    if (s === 'disciplines' || s === 'locations' || s === 'registers' || s === 'narrative' || s === 'crew' || s === 'fleet') {
      const dc = { ...c, baseOf: c.baseOf }
      const t: DrTable | null = s === 'disciplines' ? drDisciplines(dc, p) : s === 'locations' ? drLocations(dc, p) : s === 'registers' ? (c.cs ? drRegisters(c.cs, p) : null) : s === 'narrative' ? drNarrative(dc, p) : drResources(dc, p, s === 'crew' ? 'man' : 'equip')
      if (t) tables.push({ key: s, title: t.title, head: t.head, rows: t.rows, note: t.note, page: s === 'locations' || s === 'registers' || s === 'disciplines' })
      continue
    }
    if (s === 'payable') {
      const acts = new Map(c.activities.map((a) => [a.id, a]))
      const rows = (pay ?? []).filter((x) => x.qty > 0 && acts.has(x.activityId))
      tables.push({ key: s, title: SECTION_LABEL[s], head: ['ردیف', 'شرح', 'واحد', 'مقدار تجمعی قابل‌پرداخت', 'فی', 'مبلغ تجمعی (ریال)'],
        rows: rows.map((x) => { const a = acts.get(x.activityId)!; return [{ v: a.itemNo }, { v: a.title }, { v: a.unit }, { v: r2(x.qty), n: true }, { v: x.unitPrice, n: true }, { v: Math.round(x.qty * x.unitPrice), n: true }] }),
        note: pay ? 'محاسبه‌شده در سرور (ex_payable_basis) از ردیف‌های تأییدشده تا پایان دوره؛ با گام الزامی کارفرما فقط مقدار تأییدشدهٔ کارفرما.' : 'مبنای سرور دریافت نشد.' })
    }
  }
  return { title: type.label, period: { from: p.from, to: p.to, label: p.label }, filters, kpis, tables, header, sources: days.map((r) => r.reportNo) }
}

export interface DocMeta { projectName: string; projectCode: string; headerLines: string[]; docNo: string; revision: number | null; status: string; issueDate: string
  prepared: string; checked: string; approved: string; preparedAt?: string; checkedAt?: string; approvedAt?: string; distribution: string; attachments: string; footer: string
  history: { revision: number; date: string; reason: string; status: string }[]
  /** the three parties' names and logos for the letterhead (employer · consultant · contractor) */
  parties?: Partial<Record<'employer' | 'consultant' | 'contractor', { name?: string; logo?: string }>> }
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const num = (v: number) => (Number.isInteger(v) ? v.toLocaleString('fa-IR') : v.toLocaleString('fa-IR', { maximumFractionDigits: 2 }))
export const DOC_STATUS_FA: Record<string, string> = { preview: 'پیش‌نمایش — صادر نشده', issued: 'صادرشده (IFR)', checked: 'بررسی‌شده', approved: 'تأییدشده (معتبر)', superseded: 'منسوخ — نسخهٔ معتبر نیست' }

/**
 * The printable page (also the PDF via the browser's print), laid out like the contractor's daily sheet: on every printed
 * page the letterhead (parties' logos, project title), the report number / date row and the four-signature row repeat
 * (table header / footer groups); the sections follow, each sheet of the daily report on its own page. The document
 * control (revision history, distribution) closes the report.
 */
export function renderReportHtml(r: BuiltReport, m: DocMeta): string {
  const cell = (c: Cell) => `<td${c.n ? ' class="n"' : ''}>${typeof c.v === 'number' ? num(c.v) : esc(c.v)}</td>`
  const bands = (t: Table) => { const b = t.bands!; const head = `<tr><th class="sec">قسمت</th><th>${esc(t.head[1])}</th>${b.head.map((h) => `<th class="v">${esc(h)}</th>`).join('')}</tr>`
    return `<div class="bands">${b.bands.map((band) => `<table class="band"><thead>${head}</thead><tbody>${band.map((x) => `<tr${x.vals[0] ? ' class="on"' : ''}>${x.span ? `<td class="sec" rowspan="${x.span}"><span style="font-size:${sideFont(x.section, x.span, 14).toFixed(1)}px">${esc(x.section)}</span></td>` : ''}<td class="nm">${esc(x.name)}</td>${x.vals.map((v) => `<td class="v">${v ? num(v) : '·'}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('')}</div>
      <table class="tot"><tr><th>جمع کل</th>${b.head.map((h, i) => `<td><small>${esc(h)}</small><b>${num(b.total[i])}</b></td>`).join('')}</tr></table>` }
  let first = true
  const table = (t: Table) => { const brk = t.page && !first; first = false
    return `<section${brk ? ' class="pg"' : ''}><h2>${esc(t.title)}</h2>${t.bands ? bands(t) : t.rows.length ? `<table class="grid"><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((row) => `<tr>${row.map(cell).join('')}</tr>`).join('')}</tbody></table>` : '<p class="empty">در این دوره داده‌ای ثبت نشده است.</p>'}${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}</section>` }
  const superseded = m.status === 'superseded'
  const P = m.parties ?? {}
  const logo = (k: 'employer' | 'consultant' | 'contractor') => (P[k]?.logo ? `<img src="${esc(P[k]!.logo)}" alt="${esc(P[k]!.name ?? '')}">` : P[k]?.name ? `<span class="pn">${esc(P[k]!.name)}</span>` : '')
  const info = [...(r.header ?? []), { label: 'شمارهٔ گزارش', value: m.docNo || r.sources?.join('، ') || '—' }, { label: 'تاریخ', value: r.period.from === r.period.to ? jalaliText(r.period.from) : r.period.label }]
  const head = `<div class="lh"><div class="lh-r">${logo('employer')}${logo('consultant')}</div><div class="lh-c">${m.headerLines.map((l) => `<div>${esc(l)}</div>`).join('')}<div class="pj">${esc(m.projectName)}</div><div class="rt">${esc(r.title)}${r.filters.front ? ` — ${esc(r.filters.front)}` : ''}</div></div><div class="lh-l">${logo('contractor')}</div></div>
<div class="info">${info.map((x) => `<div><span>${esc(x.label)}:</span> <b>${esc(x.value)}</b></div>`).join('')}${m.docNo ? `<div><span>بازنگری:</span> <b>${m.revision ?? '—'}</b></div><div><span>وضعیت:</span> <b>${esc(DOC_STATUS_FA[m.status] ?? m.status)}</b></div>` : ''}</div>`
  const signs = `<table class="sg"><tr><th>کنترل پروژهٔ پیمانکار</th><th>سرپرست کارگاه پیمانکار</th><th>دستگاه نظارت</th><th>نمایندهٔ کارفرما</th></tr><tr><td></td><td></td><td></td><td></td></tr></table>`
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(m.docNo || r.title)}</title><style>
@page { size: A4; margin: 8mm 7mm 8mm; }
*{box-sizing:border-box} body{font-family:Vazirmatn,Tahoma,sans-serif;font-size:9pt;color:#111;margin:0;line-height:1.45}
.frame{width:100%;border-collapse:collapse;table-layout:fixed} .frame>thead>tr>td,.frame>tfoot>tr>td,.frame>tbody>tr>td{padding:0;border:0}
.lh{display:grid;grid-template-columns:22% 56% 22%;align-items:center;border:1.5px solid #222;border-bottom:0;padding:4px 6px;min-height:64px}
.lh img{max-height:42px;max-width:46%;object-fit:contain;margin:1px 3px} .lh-r{text-align:right} .lh-l{text-align:left} .pn{font-size:8pt;font-weight:700;display:inline-block;margin:2px}
.lh-c{text-align:center;font-weight:700;font-size:10pt;line-height:1.5} .lh-c .pj{font-size:10.5pt} .lh-c .rt{margin-top:2px;font-size:11.5pt;border-top:1px solid #999;padding-top:2px}
.info{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1.5px solid #222;border-bottom:0;margin-bottom:6px} .info>div{border-bottom:1.5px solid #222;border-inline-start:1px solid #999;padding:2px 6px;font-size:8.3pt} .info span{color:#444}
.sg{width:100%;border-collapse:collapse;margin-top:6px} .sg th{border:1.5px solid #222;background:#f3f4f6;font-size:8.5pt;padding:3px;width:25%} .sg td{border:1.5px solid #222;height:58px}
section.pg{break-before:page} h2{font-size:10.5pt;margin:6px 0 4px;text-align:center;background:#e5e7eb;border:1px solid #555;padding:3px}
table.grid{width:100%;border-collapse:collapse;font-size:8pt} table.grid td{word-break:break-word} table.grid th:first-child{width:32px} table.grid tr{break-inside:avoid} table.grid th,table.grid td{border:1px solid #666;padding:2px 4px} table.grid th{background:#eef0f3;font-weight:700;font-size:8.5pt} td.n{text-align:center;font-variant-numeric:tabular-nums}
.bands{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));align-items:start} .band{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7.6pt}
.band th,.band td{border:1px solid #555;padding:0 2px;height:14px;line-height:1.2} .band th{background:#e5e7eb} .band .v{width:8.5%;text-align:center} .band th.v{writing-mode:vertical-rl;transform:rotate(180deg);height:40px;padding:2px 0}
.band .sec{width:9%;padding:0;background:#f9fafb;overflow:hidden} .band td.sec span{display:block;writing-mode:vertical-rl;transform:rotate(180deg);margin:auto;font-weight:700;padding:1px 0;line-height:1.1;max-height:100%} .band .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .band tr.on td{font-weight:700}
.tot{width:100%;border-collapse:collapse;margin-top:3px} .tot th,.tot td{border:1.5px solid #111;padding:2px 6px;text-align:center} .tot th{background:#e5e7eb;width:16%} .tot small{display:block;font-size:7pt;color:#444}
.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:4px} .kpi div{border:1px solid #999;padding:4px} .kpi b{display:block;font-size:11pt}
.note{color:#444;font-size:7.8pt;margin:2px 0} .empty{color:#777;text-align:center}
.wm{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:54pt;color:rgba(200,0,0,.12);transform:rotate(-25deg);pointer-events:none}
.dc{break-inside:avoid;margin-top:8px} .dc table{width:100%;border-collapse:collapse;font-size:8pt} .dc th,.dc td{border:1px solid #888;padding:2px 4px}
</style></head><body>${superseded ? '<div class="wm">منسوخ — SUPERSEDED</div>' : m.status === 'preview' ? '<div class="wm">پیش‌نمایش</div>' : ''}
<table class="frame"><thead><tr><td>${head}</td></tr></thead><tfoot><tr><td>${signs}</td></tr></tfoot><tbody><tr><td>
${r.kpis.length ? `<section><h2>${SECTION_LABEL.summary}</h2><div class="kpi">${r.kpis.map((k) => `<div><span class="note">${esc(k.label)}</span><b>${esc(k.value)}</b></div>`).join('')}</div></section>` : ''}
${r.tables.map(table).join('')}
${m.docNo ? `<section class="dc"><h2>کنترل مدرک</h2><table><tr><th>تهیه‌کننده</th><th>بررسی‌کننده</th><th>تأییدکننده</th></tr><tr><td>${esc(m.prepared)} ${esc(m.preparedAt ?? '')}</td><td>${esc(m.checked)} ${esc(m.checkedAt ?? '')}</td><td>${esc(m.approved)} ${esc(m.approvedAt ?? '')}</td></tr></table>
<table style="margin-top:4px"><tr><th>بازنگری</th><th>تاریخ</th><th>شرح / علت</th><th>وضعیت</th></tr>${(m.history.length ? m.history : [{ revision: m.revision ?? 0, date: m.issueDate, reason: 'صدور اولیه', status: m.status }]).map((h) => `<tr><td class="n">${h.revision}</td><td>${esc(h.date)}</td><td>${esc(h.reason || 'صدور اولیه')}</td><td>${esc(DOC_STATUS_FA[h.status] ?? h.status)}</td></tr>`).join('')}</table>
${m.distribution ? `<p class="note">توزیع: ${esc(m.distribution)}</p>` : ''}</section>` : ''}
${m.footer ? `<p class="note">${esc(m.footer)}</p>` : ''}
<p class="note">تولیدشده در سامانهٔ فرین از گزارش‌های روزانهٔ ثبت‌شده${r.sources?.length && r.header ? ` (${esc(r.sources.join('، '))})` : ''}؛ هر عدد تا گزارش منبع قابل ردیابی است.</p>
</td></tr></tbody></table></body></html>`
}
