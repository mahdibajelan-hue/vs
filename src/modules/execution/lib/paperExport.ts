import type { FormDef } from './formCatalog'
import { chainText } from './chainage'
import { formatJalali } from '../../../lib/jalali'
import type { Report, ReportLine, ReportResource } from '../types'

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'report'

/** the width the sheets are drawn for (the preview's width on a desktop): print and PDF never depend on the screen */
const PAPER_W = 960
/** printable A4 width at 96 dpi, 8 mm margins: portrait 194 mm, landscape 281 mm */
const A4_PX = { portrait: 733, landscape: 1062 }

/**
 * The paper alone, in its own page: a hidden frame holding a copy of the sheet at a fixed width with the app's
 * stylesheets and the light theme — whatever module or screen it was opened from. Print and PDF both start here, so
 * a phone prints the same sheet as a desktop.
 */
async function paperFrame(node: HTMLElement): Promise<{ frame: HTMLIFrameElement; doc: Document; body: HTMLElement; landscape: boolean; dispose: () => void }> {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: `${PAPER_W + 40}px`, height: '1200px', border: '0', visibility: 'hidden' })
  document.body.appendChild(frame)
  const doc = frame.contentDocument!
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((e) => e.outerHTML).join('')
  doc.open()
  doc.write(`<!doctype html><html dir="rtl" lang="fa" data-theme="light"><head><meta charset="utf-8"><base href="${document.baseURI}">${styles}
    <style>html,body{margin:0;padding:0;background:#fff!important;color:#111827}body{width:${PAPER_W}px;padding:0 20px}
    .ex-paper{border:0!important;border-radius:0!important}html body #paper,html body #paper *{visibility:visible!important}html body #paper .mt-printable{position:static!important;inset:auto!important;width:auto!important;margin:0!important}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;letter-spacing:normal}</style></head>
    <body><div id="paper">${node.innerHTML}</div></body></html>`)
  doc.close()
  const body = doc.getElementById('paper') as HTMLElement
  // the sheet's fonts and images (logos, signatures) must be in before it is printed or photographed
  await new Promise((r) => (doc.readyState === 'complete' ? r(null) : frame.addEventListener('load', () => r(null), { once: true })))
  await Promise.all([...doc.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = () => r(null) }))))
  try { await doc.fonts.ready } catch { /* old browser: print anyway */ }
  await new Promise((r) => setTimeout(r, 120))
  const landscape = body.scrollWidth > body.scrollHeight * 1.15
  return { frame, doc, body, landscape, dispose: () => frame.remove() }
}

/** Print the paper (signatures included) on A4, scaled to the page width. */
export async function printPaper(node: HTMLElement): Promise<void> {
  const p = await paperFrame(node)
  const zoom = Math.min(1, A4_PX[p.landscape ? 'landscape' : 'portrait'] / p.body.scrollWidth)
  const st = p.doc.createElement('style')
  st.textContent = `@page{size:A4 ${p.landscape ? 'landscape' : 'portrait'};margin:8mm}@media print{body{width:auto;padding:0}#paper{zoom:${zoom}}.no-print{display:none!important}tr{break-inside:avoid}}`
  p.doc.head.appendChild(st)
  const win = p.frame.contentWindow!
  const done = () => setTimeout(p.dispose, 400)
  win.addEventListener('afterprint', done, { once: true })
  win.focus()
  win.print()
  setTimeout(p.dispose, 60_000) // a browser that never fires afterprint
}

/** The printed paper (as shown in the preview, signatures included) saved as an A4 PDF: drawn at the sheet's own width,
 *  laid on as many pages as it needs; a wide sheet goes on landscape pages. */
export async function exportPaperPdf(node: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  const p = await paperFrame(node)
  try {
    const canvas = await html2canvas(p.body, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: PAPER_W + 40, width: p.body.scrollWidth, height: p.body.scrollHeight })
    const pdf = new jsPDF({ orientation: p.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
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
  } finally { p.dispose() }
}

/** a field as the paper shows it: option labels, chainage as 40+109, dates in the Persian calendar */
const val = (form: FormDef | null, key: string, v: unknown): string => {
  if (v == null || v === '') return ''
  const f = form ? [...form.header, ...form.columns].find((x) => x.key === key) : undefined
  if (f?.kind === 'km') return chainText(v)
  if (f?.kind === 'date') return formatJalali(String(v)) || String(v)
  return f?.options?.find((o) => o.value === String(v))?.label ?? String(v)
}
const num = (v: unknown): number | string => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : String(v ?? ''))

/**
 * The report's data as an Excel workbook laid out like the paper: right-to-left, a title and header block, a bordered
 * table with a shaded heading that repeats on every printed page, column widths that fit the content, a font that
 * shows Persian on every Windows (Tahoma), and A4 page setup — the data only, no signatures.
 */
export async function exportReportXlsx(x: { title: string; projectName: string; orgName: string; report: Report; form: FormDef | null; lines: ReportLine[]; resources: ReportResource[] }): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const r = x.report
  const wb = new ExcelJS.Workbook()
  wb.creator = 'سامانهٔ فرین'
  const FONT = 'Tahoma'
  let cols: string[] = [], body: (string | number)[][] = []
  if (x.form && x.form.columns.length) {
    cols = ['ردیف', ...x.form.columns.map((c) => c.label)]
    body = x.lines.map((l, i) => [i + 1, ...x.form!.columns.map((c) => { const v = l.detail[c.key]; return c.kind === 'num' ? num(v) : val(x.form, c.key, v) })])
  } else {
    cols = ['نوع', 'بخش', 'عنوان', 'کل', 'فعال']
    body = x.resources.filter((s) => s.totalQty || s.activeQty).map((s) => [s.kind === 'man' ? 'نیروی انسانی' : 'ماشین‌آلات', s.section, s.name, s.totalQty, s.activeQty])
  }
  const n = Math.max(cols.length, 2)
  const ws = wb.addWorksheet('گزارش', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 0 }],
    pageSetup: { paperSize: 9, orientation: n > 8 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  })
  const thin = { style: 'thin' as const, color: { argb: 'FF6B7280' } }
  const box = { top: thin, left: thin, bottom: thin, right: thin }

  // title + header block (label / value pairs)
  ws.addRow([x.title]); ws.mergeCells(1, 1, 1, n)
  Object.assign(ws.getCell(1, 1), { font: { name: FONT, size: 14, bold: true }, alignment: { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' } })
  ws.getRow(1).height = 26
  const info: [string, string][] = [['پروژه', x.projectName], ['شمارهٔ گزارش', r.reportNo], ['تاریخ', formatJalali(r.reportDate) || r.reportDate], ['جبهه', r.front || ''], ['پیمانکار', x.orgName || '']]
  if (x.form) for (const h of x.form.header) { const v = r.data[h.key]; if (v != null && v !== '') info.push([h.label, val(x.form, h.key, v)]) }
  for (const [k, v] of info) {
    const row = ws.addRow([k, v]); ws.mergeCells(row.number, 2, row.number, n)
    row.getCell(1).font = { name: FONT, size: 10, bold: true }; row.getCell(2).font = { name: FONT, size: 10 }
    row.eachCell((c) => { c.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl', wrapText: true } })
  }
  ws.addRow([])

  // the table
  const headRow = ws.addRow(cols)
  headRow.height = 30
  headRow.eachCell((c) => { c.font = { name: FONT, size: 10, bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }; c.border = box; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder: 'rtl' } })
  for (const b of body) {
    const row = ws.addRow(b)
    for (let i = 1; i <= cols.length; i++) { const c = row.getCell(i); c.font = { name: FONT, size: 10 }; c.border = box; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder: 'rtl' } }
  }
  ws.pageSetup.printTitlesRow = `${headRow.number}:${headRow.number}`

  // the free-text parts of the work report
  if (!x.form) {
    const list = (k: string) => (Array.isArray(r.data[k]) ? (r.data[k] as unknown[]).map(String) : [])
    for (const [t, k] of [['شرح عملیات', 'ops'], ['موانع و مشکلات', 'obstacles']] as const) {
      if (!list(k).length) continue
      ws.addRow([]); const h = ws.addRow([t]); h.getCell(1).font = { name: FONT, size: 11, bold: true }
      for (const o of list(k)) { const row = ws.addRow([o]); ws.mergeCells(row.number, 1, row.number, n); Object.assign(row.getCell(1), { font: { name: FONT, size: 10 }, alignment: { horizontal: 'right', wrapText: true, readingOrder: 'rtl' } }) }
    }
  }

  // widths from the longest text in each column (header labels wrap, so they count less)
  const width = (v: unknown) => String(v ?? '').length
  for (let i = 1; i <= n; i++) {
    const longest = Math.max(i === 1 ? 10 : 6, Math.ceil(width(cols[i - 1]) * 0.6), ...body.map((b) => width(b[i - 1])))
    ws.getColumn(i).width = Math.min(40, longest + 3)
  }

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a'); a.href = url; a.download = `${safe(`${r.reportNo} ${x.title}`)}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
