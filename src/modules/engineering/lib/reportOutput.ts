/** Output of the engineering reports: a clean printout (A4 landscape, RTL) and an Excel sheet. */
export type SheetRow = Record<string, string | number>

const PRINT_CSS = `@page{size:A4 landscape;margin:12mm 10mm}
*{box-sizing:border-box}body{margin:0;font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl;color:#0f172a;font-size:10.5px}
h2{font-size:15px;margin:0}.er-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;border-bottom:2px solid #0f172a;padding-bottom:6px}
.er-head p{margin:2px 0 0;color:#475569;font-size:10px}
.er-sum{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.er-sum>div{border:1px solid #cbd5e1;border-radius:6px;padding:4px 9px;display:grid}
.er-sum small{color:#64748b;font-size:9px}.er-sum b{font-size:12px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;page-break-inside:auto}tr{page-break-inside:avoid}
thead{display:table-header-group}tfoot{display:table-row-group}
th{background:#e2e8f0;font-weight:800;font-size:9.5px;padding:4px 5px;border:1px solid #94a3b8;text-align:right}
td{padding:3px 5px;border:1px solid #cbd5e1;vertical-align:top}
td.n{text-align:left;direction:ltr;white-space:nowrap}td.c{white-space:nowrap}.code{font-family:'JetBrains Mono',Consolas,monospace;font-size:9px;direction:ltr;text-align:left;white-space:nowrap}
tr.g td{background:#eef2ff;font-weight:800}tr.s td{font-weight:800;background:#f8fafc}tfoot td{font-weight:900;background:#c7d2fe}
.er-dot{display:inline-block;width:7px;height:7px;border-radius:99px;margin-left:4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.er-bars>div{display:grid;grid-template-columns:200px 1fr 120px;gap:8px;align-items:center;margin-bottom:4px}
.er-bars i{display:block;height:8px;border-radius:8px;background:var(--c);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.er-two{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}h3{font-size:11.5px;margin:8px 0 4px}
.er-empty{padding:20px;text-align:center;color:#64748b}
.er-sign{display:grid!important;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:22px;page-break-inside:avoid}
.er-sign>div{border-top:1px solid #0f172a;padding-top:6px;text-align:center;font-weight:800;min-height:60px}
.foot{margin-top:10px;color:#64748b;font-size:9px}`

/** print one report: its markup alone, in a hidden frame, so the app's menus and colours never reach the paper */
export function printReport(el: HTMLElement, title: string) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  Object.assign(frame.style, { position: 'fixed', width: '0', height: '0', border: '0', right: '0', bottom: '0' })
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc || !frame.contentWindow) { frame.remove(); return }
  const fonts = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis"]')].map((l) => `<link rel="stylesheet" href="${l.href}">`).join('')
  doc.open()
  doc.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${title.replace(/</g, '')}</title>${fonts}<style>${PRINT_CSS}</style></head><body>${el.innerHTML}<div class="foot">تهیه‌شده در سامانهٔ رستا · ${new Date().toLocaleString('fa-IR')}</div></body></html>`)
  doc.close()
  const go = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 1500) }
  // wait for the web font, so the printout is not set in a fallback face
  const ready = (doc as Document & { fonts?: FontFaceSet }).fonts?.ready
  if (ready) void Promise.race([ready, new Promise((r) => setTimeout(r, 1500))]).then(go)
  else setTimeout(go, 400)
}

/** download rows as an .xlsx file with one right-to-left sheet */
export async function xlsxDownload(rows: SheetRow[], sheetName: string, fileName: string) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(rows)
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  ws['!cols'] = keys.map((k) => ({ wch: Math.min(60, Math.max(k.length + 2, ...rows.map((r) => String(r[k] ?? '').length + 2))) }))
  const wb = XLSX.utils.book_new()
  wb.Workbook = { Views: [{ RTL: true }] }
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, fileName.replace(/[\\/:*?"<>|]/g, ' '))
}
