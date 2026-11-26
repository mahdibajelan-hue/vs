import type { FormDef } from './formCatalog'
import type { Report, ReportLine, ReportResource } from '../types'

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'report'

/** The printed paper (as shown in the preview, signatures included) saved as an A4 PDF: rendered to an image and laid on
 *  as many pages as it needs; a wide sheet goes on landscape pages. */
export async function exportPaperPdf(node: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: node.scrollWidth })
  const landscape = canvas.width > canvas.height * 1.15
  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 8
  const w = pw - m * 2, pxPerMm = canvas.width / w, sliceH = Math.floor((ph - m * 2) * pxPerMm)
  for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
    const part = document.createElement('canvas')
    part.width = canvas.width; part.height = Math.min(sliceH, canvas.height - y)
    part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height)
    if (page) pdf.addPage()
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', m, m, w, part.height / pxPerMm)
  }
  pdf.save(`${safe(filename)}.pdf`)
}

const val = (form: FormDef | null, key: string, v: unknown): string => {
  if (v == null) return ''
  const f = form ? [...form.header, ...form.columns].find((x) => x.key === key) : undefined
  return f?.options?.find((o) => o.value === String(v))?.label ?? String(v)
}

/** The report's data as an Excel workbook (RTL): a header block and the table of rows — the data only, no signatures. */
export async function exportReportXlsx(x: { title: string; projectName: string; orgName: string; report: Report; form: FormDef | null; lines: ReportLine[]; resources: ReportResource[] }): Promise<void> {
  const XLSX = await import('xlsx')
  const r = x.report
  const head: (string | number)[][] = [[x.title], ['پروژه', x.projectName], ['شمارهٔ گزارش', r.reportNo], ['تاریخ', r.reportDate], ['جبهه', r.front || ''], ['پیمانکار', x.orgName || '']]
  if (x.form) for (const h of x.form.header) { const v = r.data[h.key]; if (v != null && v !== '') head.push([h.label, val(x.form, h.key, v)]) }
  const wb = XLSX.utils.book_new()
  const rows: (string | number)[][] = [...head, []]
  if (x.form && x.form.columns.length) {
    rows.push(['ردیف', ...x.form.columns.map((c) => c.label)])
    x.lines.forEach((l, i) => rows.push([i + 1, ...x.form!.columns.map((c) => { const v = l.detail[c.key]; return typeof v === 'number' ? v : val(x.form, c.key, v) })]))
  } else if (!x.form) {
    rows.push(['نیروی انسانی و ماشین‌آلات'], ['نوع', 'بخش', 'عنوان', 'کل', 'فعال'])
    for (const s of x.resources.filter((s) => s.totalQty || s.activeQty)) rows.push([s.kind === 'man' ? 'نفر' : 'ماشین', s.section, s.name, s.totalQty, s.activeQty])
    const list = (k: string) => (Array.isArray(r.data[k]) ? (r.data[k] as unknown[]).map(String) : [])
    if (list('ops').length) { rows.push([], ['شرح عملیات']); for (const o of list('ops')) rows.push([o]) }
    if (list('obstacles').length) { rows.push([], ['موانع و مشکلات']); for (const o of list('obstacles')) rows.push([o]) }
  }
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!views'] = [{ RTL: true }] as never
  XLSX.utils.book_append_sheet(wb, ws, 'گزارش')
  XLSX.writeFile(wb, `${safe(`${r.reportNo} ${x.title}`)}.xlsx`)
}
