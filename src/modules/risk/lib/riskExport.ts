import { formatJalali } from '../../../lib/jalali'
import { RM_CATEGORY_LABEL_FA, RM_RESPONSE_STRATEGY_LABEL_FA, RM_RISK_STATUS_LABEL_FA, type RmRisk } from '../types'
import { RISK_LEVEL_LABEL_FA } from './riskScore'
import { ZONE_LABEL_FA } from './riskPolicy'
import type { RiskState } from './riskState'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export interface ExportCtx { project: (id: string) => string; user: (id: string | null | undefined) => string; category: (k: string | null | undefined) => string; states: Map<string, RiskState> }

export const REGISTER_HEADERS = ['کد', 'پروژه', 'عنوان', 'دسته', 'نوع', 'وضعیت', 'ذاتی', 'فعلی', 'باقیمانده', 'سطح', 'ناحیهٔ باقیمانده', 'راهبرد', 'مالک', 'مسئول پایش', 'مرجع تأیید', 'علت', 'رویداد', 'پیامد', 'تاریخ شناسایی', 'موعد بازنگری', 'کیلومتر از', 'کیلومتر تا', 'ایستگاه', 'پیمانکار', 'منبع']
export function registerRows(risks: RmRisk[], c: ExportCtx): (string | number)[][] {
  return risks.map((r) => { const s = c.states.get(r.id)!; return [r.code, c.project(r.projectId), r.title, c.category(r.category), r.riskType === 'threat' ? 'تهدید' : 'فرصت', RM_RISK_STATUS_LABEL_FA[r.status], s.inherent, s.current, s.residual, RISK_LEVEL_LABEL_FA[s.level], ZONE_LABEL_FA[s.residualZone], RM_RESPONSE_STRATEGY_LABEL_FA[r.responseStrategy], c.user(r.ownerId), c.user(r.monitorId), c.user(r.approverId), r.cause, r.riskEvent, r.consequence, formatJalali(r.identifiedDate), formatJalali(s.reviewDue), r.kmFrom ?? '', r.kmTo ?? '', r.station, r.contractor, r.source] })
}

export async function downloadXlsx(filename: string, sheets: { name: string; headers: string[]; rows: (string | number | null)[][] }[]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([s.headers, ...s.rows])
    ws['!cols'] = s.headers.map((h, i) => ({ wch: Math.min(48, Math.max(h.length + 2, ...s.rows.slice(0, 80).map((r) => String(r[i] ?? '').length + 2))) }))
    ws['!views'] = [{ rightToLeft: true }]
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx')
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

/** Printable RTL table in a new window (browser print → Save as PDF). */
export function printTable(title: string, subtitle: string, filters: string[], headers: string[], rows: (string | number | null)[][]): boolean {
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font-family:Vazirmatn,Tahoma,sans-serif;margin:22px;color:#111}h1{font-size:19px;margin:0 0 4px}.sub{color:#555;font-size:12px;margin-bottom:8px}.chips span{display:inline-block;background:#f1f5f9;border-radius:10px;padding:2px 10px;margin:0 0 4px 6px;font-size:11px}
table{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:8px}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:right;vertical-align:top}th{background:#e2e8f0}tr:nth-child(even) td{background:#f8fafc}
@media print{body{margin:8mm}thead{display:table-header-group}tr{break-inside:avoid}@page{size:A4 landscape}}</style></head><body>
<h1>${esc(title)}</h1><div class="sub">${esc(subtitle)} · تاریخ تهیه ${formatJalali(new Date().toISOString().slice(0, 10))} · ${rows.length} ردیف</div>
<div class="chips">${filters.length ? filters.map((f) => `<span>${esc(f)}</span>`).join('') : '<span>بدون فیلتر</span>'}</div>
<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(String(c ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open(); w.document.write(html); w.document.close()
  return true
}
export const catLabelFallback = (k: string | null | undefined) => (k ? RM_CATEGORY_LABEL_FA[k] ?? k : '—')
