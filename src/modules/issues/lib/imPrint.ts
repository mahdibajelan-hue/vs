import { formatJalali } from '../../../lib/jalali'
import { IM_PRIORITY_LABEL_FA, type ImIssue } from '../types'
import { IM_STAGE_LABEL_FA, dayDiff, effectiveDue, stageOf } from './imModel'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export interface PrintCtx { project: (id: string) => string; user: (id: string | null | undefined) => string; today: string; filterSummary: string[]; title?: string }

/** Self-contained printable HTML (RTL) for the issues matching the current filters. */
export function issuesPrintHtml(list: ImIssue[], ctx: PrintCtx): string {
  const rows = list.map((i, n) => {
    const due = effectiveDue(i)
    const late = dayDiff(due, ctx.today)
    const delay = stageOf(i) === 'closed' ? 'بسته‌شده' : late > 0 ? `${late} روز تأخیر` : `${-late} روز مانده`
    return `<tr><td>${n + 1}</td><td>${esc(i.code ?? '')}</td><td>${esc(i.title)}</td><td>${esc(ctx.project(i.projectId))}</td><td>${esc(IM_STAGE_LABEL_FA[stageOf(i)] ?? '')}</td><td>${esc(IM_PRIORITY_LABEL_FA[i.severity ?? i.priority] ?? '')}</td><td>${esc(ctx.user(i.pursuerId))}</td><td>${formatJalali(due)}</td><td class="${late > 0 && stageOf(i) !== 'closed' ? 'late' : ''}">${delay}</td></tr>`
  }).join('')
  const overdue = list.filter((i) => stageOf(i) !== 'closed' && dayDiff(effectiveDue(i), ctx.today) > 0).length
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(ctx.title ?? 'گزارش مسائل')}</title><style>
body{font-family:Vazirmatn,Tahoma,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}.sub{color:#555;font-size:12px;margin-bottom:10px}
.chips span{display:inline-block;background:#f1f5f9;border-radius:10px;padding:2px 10px;margin:0 0 4px 6px;font-size:11.5px}
table{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:10px}th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:right}th{background:#e2e8f0}tr:nth-child(even) td{background:#f8fafc}.late{color:#b91c1c;font-weight:700}
@media print{body{margin:10mm}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body>
<h1>${esc(ctx.title ?? 'گزارش مسائل')}</h1>
<div class="sub">تاریخ تهیه: ${formatJalali(ctx.today)} · ${list.length} مسئله · ${overdue} تأخیردار</div>
<div class="chips">${ctx.filterSummary.length ? ctx.filterSummary.map((s) => `<span>${esc(s)}</span>`).join('') : '<span>بدون فیلتر</span>'}</div>
<table><thead><tr><th>#</th><th>شناسه</th><th>عنوان</th><th>پروژه</th><th>مرحله</th><th>شدت</th><th>مسئول انجام</th><th>سررسید</th><th>وضعیت زمانی</th></tr></thead><tbody>${rows}</tbody></table>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`
}

export function openPrint(html: string): boolean {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open(); w.document.write(html); w.document.close()
  return true
}
