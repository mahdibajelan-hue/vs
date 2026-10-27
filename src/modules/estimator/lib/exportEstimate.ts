import type { EstFullInputs, EstMethod, EstProject, EstResults } from '../types'
import { METHOD_META, type MethodResult } from './methods'
import { annualCashFlow, buildCashFlowTimeline, computeSensitivity, estimateKpis, estimateRange, LIFECYCLE_PHASE_LABEL, MATURITY, maturityOf } from './calc'

const RISK_CATEGORY_LABEL: Record<string, string> = {
  fx: 'ارزی', procurement: 'تأمین کالا', geotechnical: 'ژئوتکنیک', schedule: 'زمان‌بندی',
  hse: 'HSE', contractor: 'پیمانکار', permit: 'مجوز/تملک', weather: 'آب‌وهوا', other: 'سایر',
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'estimate'

/** Workbook with one sheet per view of the estimate — summary, cost breakdown, monthly and yearly
 * cash flow, risks, long-lead items and the assumptions behind the number. Amounts are written as
 * numbers (not formatted text) so they can be summed and charted in Excel. */
export async function exportEstimateToExcel(project: EstProject, inputs: EstFullInputs, results: EstResults, versionLabel?: string, methods: MethodResult[] = [], chosen: EstMethod = 'parametric') {
  const XLSX = await import('xlsx')
  const eur = inputs.overhead.fxEurPerUsd, rial = inputs.overhead.fxRialPerUsd
  const cf = buildCashFlowTimeline(inputs, results)
  const k = estimateKpis(project, inputs, results, cf)
  const m = maturityOf(inputs)
  const chm = methods.find((x) => x.method === chosen)
  const rg = chm ? { low: chm.low / eur, high: chm.high / eur } : estimateRange(results.grand, m)
  const round = (n: number) => Math.round(n)
  const wb = XLSX.utils.book_new()
  const sheet = (rows: Record<string, unknown>[], name: string, widths: number[]) => {
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = widths.map((wch) => ({ wch }))
    ;(ws as Record<string, unknown>)['!views'] = [{ RTL: true }]
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  sheet([
    { 'شرح': 'پروژه', 'مقدار': project.name },
    { 'شرح': 'نسخه', 'مقدار': versionLabel ?? 'محاسبهٔ جاری' },
    { 'شرح': 'تاریخ تهیه', 'مقدار': new Date().toLocaleDateString('fa-IR') },
    { 'شرح': 'مرحلهٔ تعریف', 'مقدار': MATURITY[m].label },
    { 'شرح': 'روش برآورد', 'مقدار': METHOD_META[chosen].label },
    { 'شرح': 'نرخ یورو در سامانه (ریال)', 'مقدار': round(inputs.overhead.fxRialPerEur ?? rial / eur) },
    { 'شرح': 'برآورد کل (یورو)', 'مقدار': round(results.grand * eur) },
    { 'شرح': 'برآورد کل (ریال)', 'مقدار': round(results.grand * rial) },
    { 'شرح': 'برآورد کل (دلار)', 'مقدار': round(results.grand) },
    { 'شرح': 'کران پایین بازهٔ دقت (یورو)', 'مقدار': round(rg.low * eur) },
    { 'شرح': 'کران بالای بازهٔ دقت (یورو)', 'مقدار': round(rg.high * eur) },
    { 'شرح': 'طول کل خط (کیلومتر)', 'مقدار': k.lengthKm },
    { 'شرح': 'هزینهٔ هر کیلومتر (یورو)', 'مقدار': round(k.usdPerKm * eur) },
    { 'شرح': 'مدت کل تا راه‌اندازی (ماه)', 'مقدار': k.totalMonths },
    { 'شرح': 'اوج نیاز نقدینگی ماهانه (یورو)', 'مقدار': round(k.peakMonthlyUsd * eur) },
    { 'شرح': 'ماه اوج', 'مقدار': k.peakMonth },
  ], 'خلاصه', [34, 40])

  const cbs = [
    ...results.sections.map((s) => ({ 'سرفصل': s.label, 'گروه': 'مستقیم', 'دلار': round(s.totalUsd), 'یورو': round(s.totalUsd * eur), 'ریال': round(s.totalUsd * rial), 'سهم از کل': +(s.totalUsd / results.grand).toFixed(4), 'توضیح': s.note ?? '' })),
    { 'سرفصل': 'جمع هزینه‌های مستقیم', 'گروه': 'جمع', 'دلار': round(results.direct), 'یورو': round(results.direct * eur), 'ریال': round(results.direct * rial), 'سهم از کل': +(results.direct / results.grand).toFixed(4), 'توضیح': '' },
    ...([['مهندسی و طراحی', results.eng, inputs.overhead.eng], ['مدیریت پروژه (EPCM)', results.pm, inputs.overhead.pm], ['بیمه و ضمانت‌نامه', results.ins, inputs.overhead.ins], ['پیش‌بینی‌نشده', results.contingency, inputs.overhead.contingency], ['ذخیرهٔ نوسان ارزی/تورمی', results.escalation, inputs.overhead.escalation]] as [string, number, number][])
      .map(([l, v, r]) => ({ 'سرفصل': l, 'گروه': 'غیرمستقیم و ذخایر', 'دلار': round(v), 'یورو': round(v * eur), 'ریال': round(v * rial), 'سهم از کل': +(v / results.grand).toFixed(4), 'توضیح': `${(r * 100).toFixed(1)}٪` })),
    { 'سرفصل': 'جمع کل برآورد', 'گروه': 'جمع', 'دلار': round(results.grand), 'یورو': round(results.grand * eur), 'ریال': round(results.grand * rial), 'سهم از کل': 1, 'توضیح': '' },
  ]
  if (methods.length) sheet(methods.map((x) => ({ 'روش': METHOD_META[x.method].label, 'مبنای عدد نهایی': x.method === chosen ? 'بله' : '', 'برآورد (یورو)': x.available ? round(x.eur) : null, 'کران پایین (یورو)': x.available ? round(x.low) : null, 'کران بالا (یورو)': x.available ? round(x.high) : null, 'توضیح': x.available ? x.note : x.reason ?? '' })), 'روش‌های برآورد', [28, 14, 18, 18, 18, 60])
  sheet(cbs, 'ریز برآورد', [30, 16, 16, 16, 20, 10, 50])

  sheet(cf.map((p) => ({ 'ماه': p.month, 'فاز': LIFECYCLE_PHASE_LABEL[p.phase], 'هزینهٔ ماه (یورو)': round(p.monthlyUsd * eur), 'تجمعی (یورو)': round(p.cumulativeUsd * eur), 'پیشرفت مالی تجمعی': +(p.cumulativeUsd / (results.grand || 1)).toFixed(4) })), 'نقدینگی ماهانه', [6, 20, 18, 18, 16])
  sheet(annualCashFlow(cf).map((y) => ({ 'سال پروژه': y.year, 'فازها': y.phases.map((ph) => LIFECYCLE_PHASE_LABEL[ph]).join('، '), 'نیاز سال (یورو)': round(y.usd * eur), 'نیاز سال (ریال)': round(y.usd * rial), 'تجمعی (یورو)': round(y.cumulativeUsd * eur) })), 'نقدینگی سالانه', [10, 40, 18, 22, 18])
  sheet(inputs.risks.map((r) => ({ 'ریسک': r.title, 'دسته': RISK_CATEGORY_LABEL[r.category], 'احتمال': r.likelihood, 'اثر': r.impact, 'امتیاز': r.likelihood * r.impact, 'اقدام کاهش': r.mitigation })), 'ریسک‌ها', [40, 14, 8, 8, 8, 50])
  const designWindow = inputs.lifecycle.consultantSelectionMonths + inputs.lifecycle.basicDesignMonths
  sheet(inputs.longLeadItems.map((it) => ({ 'قلم': it.title, 'مدت تأمین (ماه)': it.leadTimeMonths, 'وضعیت': it.leadTimeMonths > designWindow ? 'باید پیش از پایان طراحی پایه سفارش شود' : 'در دورهٔ طراحی قابل تأمین', 'توضیحات': it.notes })), 'اقلام بلندمدت', [36, 14, 36, 50])
  sheet(computeSensitivity(project, inputs).map((s) => ({ 'فرضیه': s.label, 'کمینهٔ کل (یورو)': round(s.lowGrandUsd * eur), 'بیشینهٔ کل (یورو)': round(s.highGrandUsd * eur), 'دامنهٔ نوسان (یورو)': round(s.swingUsd * eur) })), 'حساسیت', [26, 18, 18, 18])
  sheet([
    { 'فرض': 'نرخ یورو به دلار', 'مقدار': eur },
    { 'فرض': 'نرخ ریال به دلار', 'مقدار': rial },
    { 'فرض': 'انتخاب مشاور (ماه)', 'مقدار': inputs.lifecycle.consultantSelectionMonths },
    { 'فرض': 'طراحی پایه (ماه)', 'مقدار': inputs.lifecycle.basicDesignMonths },
    { 'فرض': 'انتخاب پیمانکار EPC (ماه)', 'مقدار': inputs.lifecycle.epcContractorSelectionMonths },
    { 'فرض': 'اجرا و راه‌اندازی (ماه)', 'مقدار': inputs.lifecycle.executionMonths },
    ...(project.hasOnshore ? [
      { 'فرض': 'خط خشکی — طول (km)', 'مقدار': inputs.specs.onshore.lengthKm },
      { 'فرض': 'خط خشکی — قطر (اینچ)', 'مقدار': inputs.specs.onshore.diameterIn },
      { 'فرض': 'خط خشکی — ضخامت (mm)', 'مقدار': inputs.specs.onshore.wtMm },
      { 'فرض': 'خط خشکی — ضریب توپوگرافی', 'مقدار': inputs.specs.onshore.terrain },
    ] : []),
    ...(project.hasOffshore ? [
      { 'فرض': 'خط دریایی — طول (km)', 'مقدار': inputs.specs.offshore.lengthKm },
      { 'فرض': 'خط دریایی — قطر (اینچ)', 'مقدار': inputs.specs.offshore.diameterIn },
      { 'فرض': 'خط دریایی — ضخامت (mm)', 'مقدار': inputs.specs.offshore.wtMm },
    ] : []),
    ...(project.hasCompressorStation ? [
      { 'فرض': 'تقویت فشار — تعداد ایستگاه', 'مقدار': inputs.specs.compressor.stationCount },
      { 'فرض': 'تقویت فشار — توان هر ایستگاه (MW)', 'مقدار': inputs.specs.compressor.ratedPowerMwPerStation },
    ] : []),
  ], 'فرضیات', [36, 18])

  XLSX.writeFile(wb, `${safeName(project.name)}-estimate.xlsx`)
}

/** Opens the A4 report (already rendered off-screen with inline styles) in its own window and
 * starts printing — the browser's «Save as PDF» then keeps the text selectable and sharp. */
export function printReportElement(el: HTMLElement, title: string) {
  const w = window.open('', '_blank', 'width=900,height=1200')
  if (!w) return false
  w.document.write(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800;900&family=Fira+Code:wght@400;600;700&display=swap">
<style>@page{size:A4;margin:0}html,body{margin:0;background:#E5E9EF}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.est-page{margin:12px auto;box-shadow:0 6px 24px rgba(15,47,65,.18)}
@media print{html,body{background:#fff}.est-page{margin:0;box-shadow:none;break-after:page;page-break-after:always}.est-page:last-child{break-after:auto;page-break-after:auto}}</style>
</head><body>${el.innerHTML}<script>document.fonts&&document.fonts.ready?document.fonts.ready.then(()=>setTimeout(()=>window.print(),150)):window.onload=()=>window.print()</script></body></html>`)
  w.document.close()
  return true
}

/** PDF download: each A4 page of the report is captured on its own and placed on its own PDF
 * page, so page breaks always fall where the report puts them; JPEG keeps the file small. */
export async function exportReportPagesToPdf(container: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  const pages = Array.from(container.querySelectorAll<HTMLElement>('.est-page'))
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const w = pdf.internal.pageSize.getWidth(), h = pdf.internal.pageSize.getHeight()
  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    if (i > 0) pdf.addPage()
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, w, h)
  }
  pdf.save(filename)
}
