import type { CellBinding } from './gridTypes'

/** PROPOSED bindings of the approved «DAILY WELDING REPORT» sheet (pilot). Every other cell — titles, table, stamps grid, totals block, signature boxes — is left exactly as the approved sheet. Each binding must be confirmed by the form owner. */
export const WELDING_BINDINGS: CellBinding[] = [
  { cell: 'A2', source: 'project.title', mode: 'replace', note: 'عنوان رسمی پروژه (در فایل: «پروژه احداث خط انتقال گاز»)' },
  { cell: 'A4', source: 'line.pipeSpec', mode: 'replace', note: 'مشخصات لوله: قطر، گرید، استاندارد (در فایل: Pipe " , API 5L X , API 1104)' },
  { cell: 'K4', source: 'header.wpsNo', mode: 'append', note: 'شمارهٔ WPS بعد از برچسب «WPS NO. :»' },
  { cell: 'D5', source: 'report.number', mode: 'replace', note: 'شمارهٔ گزارش (Report Number)' },
  { cell: 'H5', source: 'page.no', mode: 'replace', note: 'شمارهٔ صفحه' },
  { cell: 'K5', source: 'page.total', mode: 'replace', note: 'تعداد کل صفحه‌ها (بعد از OF)' },
  { cell: 'P5', source: 'report.date', mode: 'replace', note: 'تاریخ گزارش' },
]
/** the logo anchored at row 1 / column I of the approved sheet is the employer's logo */
export const WELDING_LOGO_SLOTS: { anchor: string; slot: 'employer' | 'consultant' | 'contractor' }[] = [{ anchor: '0,8', slot: 'employer' }]

export interface WeldingValuesInput { projectTitle: string; diameterIn: string; pipeGrade: string; pipeStandard: string; wpsNo: string; reportNo: string; page: number; pages: number; dateJalali: string }
/** Resolves the bindings into the text of the target cells; `append` keeps the label that is already in the approved cell. */
export function weldingValues(i: WeldingValuesInput, fixed: Record<string, string>): Record<string, string> {
  const src: Record<string, string> = {
    'project.title': i.projectTitle,
    'line.pipeSpec': `Pipe ${i.diameterIn}" , ${i.pipeGrade} , ${i.pipeStandard}`,
    'header.wpsNo': i.wpsNo, 'report.number': i.reportNo, 'page.no': String(i.page), 'page.total': String(i.pages), 'report.date': i.dateJalali,
  }
  const out: Record<string, string> = {}
  for (const b of WELDING_BINDINGS) {
    const v = src[b.source] ?? ''
    if (!v) continue
    out[b.cell] = b.mode === 'append' ? `${(fixed[b.cell] ?? '').trim()} ${v}` : v
  }
  return out
}
