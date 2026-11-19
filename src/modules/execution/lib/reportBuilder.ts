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

export type SectionKey = 'summary' | 'volumes' | 'daily' | 'fronts' | 'resources' | 'stoppages' | 'deviation' | 'status' | 'payable' | 'disciplines' | 'locations' | 'registers' | 'narrative' | 'crew' | 'fleet'
export const SECTION_LABEL: Record<SectionKey, string> = {
  summary: 'خلاصهٔ مدیریتی', volumes: 'احجام اجرایی به تفکیک فعالیت', daily: 'کارکرد روزانه', fronts: 'عملکرد جبهه‌های کاری', resources: 'نیروی انسانی و ماشین‌آلات',
  stoppages: 'توقفات و علل', deviation: 'انحراف از برنامه (عوامل اصلی)', status: 'وضعیت گزارش‌ها و تأییدها', payable: 'مبنای صورت‌وضعیت (تأییدشده × فی)',
  disciplines: 'روکش احجام به تفکیک دیسیپلین', locations: 'احجام به تفکیک محل اجرا', registers: 'ثبت‌های ایستگاه (پایپینگ، مکانیکال)', narrative: 'اهم فعالیت‌ها و موانع', crew: 'نیروی انسانی به تفکیک بخش', fleet: 'ماشین‌آلات به تفکیک گروه',
}
export type PeriodMode = 'day' | 'week' | 'month' | 'range'
export interface ReportType { key: string; label: string; period: PeriodMode; sections: SectionKey[] }
export const REPORT_TYPES: ReportType[] = [
  { key: 'daily', label: 'گزارش روزانه', period: 'day', sections: ['summary', 'volumes', 'resources', 'stoppages'] },
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
export interface Table { key: SectionKey; title: string; head: string[]; rows: Cell[][]; note?: string }
export interface Kpi { label: string; value: string }
export interface BuiltReport { title: string; period: { from: string; to: string; label: string }; filters: { front?: string; activityIds?: string[] }; kpis: Kpi[]; tables: Table[] }

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
  for (const s of sections) {
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
      if (t) tables.push({ key: s, title: t.title, head: t.head, rows: t.rows, note: t.note })
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
  return { title: type.label, period: { from: p.from, to: p.to, label: p.label }, filters, kpis, tables }
}

export interface DocMeta { projectName: string; projectCode: string; headerLines: string[]; docNo: string; revision: number | null; status: string; issueDate: string
  prepared: string; checked: string; approved: string; preparedAt?: string; checkedAt?: string; approvedAt?: string; distribution: string; attachments: string; footer: string
  history: { revision: number; date: string; reason: string; status: string }[] }
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const num = (v: number) => (Number.isInteger(v) ? v.toLocaleString('fa-IR') : v.toLocaleString('fa-IR', { maximumFractionDigits: 2 }))
export const DOC_STATUS_FA: Record<string, string> = { preview: 'پیش‌نمایش — صادر نشده', issued: 'صادرشده (IFR)', checked: 'بررسی‌شده', approved: 'تأییدشده (معتبر)', superseded: 'منسوخ — نسخهٔ معتبر نیست' }

/** the printable page (also the PDF via the browser's print): ISO header, sections, signatures, revision history, distribution */
export function renderReportHtml(r: BuiltReport, m: DocMeta): string {
  const table = (t: Table) => `<section><h2>${esc(t.title)}</h2>${t.rows.length ? `<table><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((row) => `<tr>${row.map((c) => `<td${c.n ? ' class="n"' : ''}>${typeof c.v === 'number' ? num(c.v) : esc(c.v)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="empty">در این دوره داده‌ای ثبت نشده است.</p>'}${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}</section>`
  const superseded = m.status === 'superseded'
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(m.docNo || r.title)}</title><style>
@page { size: A4; margin: 16mm 12mm 18mm; @bottom-center { content: "صفحه " counter(page) " از " counter(pages); font: 9pt Vazirmatn, Tahoma, sans-serif; color: #555 } @bottom-left { content: "${esc(m.docNo)} · Rev ${m.revision ?? '-'}"; font: 8pt Tahoma, sans-serif; color: #777 } }
*{box-sizing:border-box} body{font-family:Vazirmatn,Tahoma,sans-serif;font-size:10pt;color:#111;margin:0;line-height:1.6}
.iso{width:100%;border-collapse:collapse;margin-bottom:10px} .iso td{border:1px solid #444;padding:4px 6px;vertical-align:middle} .iso .t{font-size:14pt;font-weight:700;text-align:center} .iso .k{color:#555;font-size:8.5pt;white-space:nowrap}
h2{font-size:11.5pt;margin:14px 0 6px;border-bottom:2px solid #1f4e79;padding-bottom:2px;color:#1f4e79} table{width:100%;border-collapse:collapse;page-break-inside:auto} tr{page-break-inside:avoid}
th,td{border:1px solid #999;padding:3px 5px} th{background:#e8eef5;font-weight:600;font-size:9pt} td.n{text-align:left;direction:ltr;font-variant-numeric:tabular-nums}
.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:6px} .kpi div{border:1px solid #bbb;padding:5px;border-radius:4px} .kpi b{display:block;font-size:12pt}
.note{color:#555;font-size:8.5pt;margin:3px 0} .empty{color:#777} .sign td{height:62px;vertical-align:top;width:33%}
.wm{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:54pt;color:rgba(200,0,0,.12);transform:rotate(-25deg);pointer-events:none}
</style></head><body>${superseded ? '<div class="wm">منسوخ — SUPERSEDED</div>' : m.status === 'preview' ? '<div class="wm">پیش‌نمایش</div>' : ''}
<table class="iso"><tr><td rowspan="3" style="width:28%">${m.headerLines.map((l) => `<div>${esc(l)}</div>`).join('')}<div><b>${esc(m.projectName)}</b></div></td><td class="t" rowspan="2" colspan="2">${esc(r.title)}<div style="font-size:10pt;font-weight:400">${esc(r.period.label)}${r.filters.front ? ` · ${esc(r.filters.front)}` : ''}</div></td>
<td><span class="k">Document No. / شمارهٔ مدرک</span><br><b dir="ltr">${esc(m.docNo || '—')}</b></td></tr>
<tr><td><span class="k">Revision / بازنگری</span><br><b>${m.revision == null ? '—' : m.revision}</b></td></tr>
<tr><td><span class="k">Issue Date / تاریخ صدور</span><br>${esc(m.issueDate)}</td><td><span class="k">Period / دوره</span><br>${esc(jalaliText(r.period.from))} تا ${esc(jalaliText(r.period.to))}</td><td><span class="k">Status / وضعیت</span><br><b>${esc(DOC_STATUS_FA[m.status] ?? m.status)}</b></td></tr></table>
${r.kpis.length ? `<section><h2>${SECTION_LABEL.summary}</h2><div class="kpi">${r.kpis.map((k) => `<div><span class="k">${esc(k.label)}</span><b>${esc(k.value)}</b></div>`).join('')}</div></section>` : ''}
${r.tables.map(table).join('')}
<section><h2>امضاها</h2><table class="sign"><tr><th>Prepared By / تهیه‌کننده</th><th>Checked By / بررسی‌کننده</th><th>Approved By / تأییدکننده</th></tr>
<tr><td>${esc(m.prepared)}<br><span class="note">${esc(m.preparedAt ?? '')}</span></td><td>${esc(m.checked)}<br><span class="note">${esc(m.checkedAt ?? '')}</span></td><td>${esc(m.approved)}<br><span class="note">${esc(m.approvedAt ?? '')}</span></td></tr></table></section>
<section><h2>Revision History / سوابق بازنگری</h2><table><thead><tr><th>Rev</th><th>تاریخ</th><th>شرح / علت بازنگری</th><th>وضعیت</th></tr></thead><tbody>${(m.history.length ? m.history : [{ revision: m.revision ?? 0, date: m.issueDate, reason: 'صدور اولیه', status: m.status }]).map((h) => `<tr><td class="n">${h.revision}</td><td>${esc(h.date)}</td><td>${esc(h.reason || 'صدور اولیه')}</td><td>${esc(DOC_STATUS_FA[h.status] ?? h.status)}</td></tr>`).join('')}</tbody></table></section>
<section><h2>Distribution & Attachments / توزیع و پیوست‌ها</h2><table><tr><th style="width:25%">توزیع</th><td>${esc(m.distribution || '—')}</td></tr><tr><th>پیوست‌ها</th><td>${esc(m.attachments || '—')}</td></tr></table></section>
${m.footer ? `<p class="note">${esc(m.footer)}</p>` : ''}
<p class="note">تولیدشده در سامانهٔ فرین از گزارش‌های روزانهٔ ثبت‌شده؛ هر عدد تا گزارش روزانهٔ منبع قابل ردیابی است.</p></body></html>`
}
