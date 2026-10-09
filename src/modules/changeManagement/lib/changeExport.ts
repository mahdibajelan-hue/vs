import { formatJalali } from '../../../lib/jalali'
import { STATUS_FA, STEP_KIND_FA, STEP_STATUS_FA, TYPE_FA, type ChangeHistory, type ChangeRequest, type ChangeStep } from '../types'
import { ACTION_FA } from './changeFlow'
export { downloadXlsx, printTable } from '../../risk/lib/riskExport'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const d = (iso: string | null | undefined) => (iso ? formatJalali(iso.slice(0, 10)) : '—')
const n = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('en-US'))

/** Single-request printout (browser print → PDF): identification, impact, route snapshot, decisions and history. */
export function printRequest(r: ChangeRequest, steps: ChangeStep[], history: ChangeHistory[], ctx: { projectName: (id: string) => string; contractLabel: (r: ChangeRequest) => string; userName: (id: string | null) => string }): boolean {
  const b = r.routeSnapshot?.basis
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(r.crNumber)}</title><style>
body{font-family:Vazirmatn,Tahoma,sans-serif;margin:22px;color:#111;font-size:12px}h1{font-size:18px;margin:0}h2{font-size:13px;margin:14px 0 4px;border-bottom:2px solid #f59e0b;padding-bottom:2px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 14px}.g div span{color:#555}
table{width:100%;border-collapse:collapse;margin-top:4px}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:right;vertical-align:top;font-size:11px}th{background:#e2e8f0}@media print{@page{size:A4}body{margin:8mm}}</style></head><body>
<h1>فرم درخواست تغییر ${esc(r.crNumber)} — ${esc(r.title)}</h1><div>${esc(STATUS_FA[r.status])} · ${esc(ctx.projectName(r.masterProjectId))} · ${esc(ctx.contractLabel(r))}</div>
<h2>مشخصات و آثار</h2><div class="g"><div><span>نوع:</span> ${esc(r.changeType ? TYPE_FA[r.changeType] : '—')}</div><div><span>اثر مالی درخواستی:</span> ${n(r.proposedCost)}</div><div><span>اثر زمانی درخواستی:</span> ${n(r.proposedDays)} روز</div>
<div><span>مبلغ مصوب:</span> ${n(r.approvedCost)}</div><div><span>مدت مصوب:</span> ${n(r.approvedDays)} روز</div><div><span>تاریخ تصویب:</span> ${d(r.approvedAt)}</div>
<div><span>مبلغ پایه:</span> ${n(b?.base_amount)}</div><div><span>درصد جاری:</span> ${b?.current_pct ?? '—'}٪</div><div><span>درصد تجمعی:</span> ${b?.cum_pct ?? '—'}٪</div></div>
<p><b>شرح:</b> ${esc(r.description)}</p><p><b>دلیل:</b> ${esc(r.reason)}</p>${r.evaluationNote ? `<p><b>ارزیابی:</b> ${esc(r.evaluationNote)}</p>` : ''}
<h2>مسیر تصویب${r.routeSnapshot?.rule_set ? ` (نسخهٔ قواعد ${r.routeSnapshot.rule_set.version}: ${esc(r.routeSnapshot.rule_set.name)})` : ''}</h2>${r.routeSnapshot?.route ? `<p>${esc(r.routeSnapshot.route.reason)} — قواعد: ${esc((r.routeSnapshot.applied_rules ?? []).join('، '))}</p>` : ''}
<table><thead><tr><th>#</th><th>مرحله</th><th>مرجع</th><th>نوع</th><th>وضعیت</th><th>تصمیم‌گیرنده</th><th>تاریخ</th><th>نظر / شمارهٔ مصوبه</th></tr></thead><tbody>${steps.map((s) => `<tr><td>${s.seq}</td><td>${esc(s.label)}</td><td>${esc(s.roleName)}</td><td>${STEP_KIND_FA[s.kind]}</td><td>${STEP_STATUS_FA[s.status]}</td><td>${esc(s.decidedByName ?? '')}</td><td>${d(s.decidedAt)}</td><td>${esc(s.opinion)} ${esc(s.referenceNo)}</td></tr>`).join('')}</tbody></table>
<h2>اجرا و نتیجه</h2><div class="g"><div><span>مسئول:</span> ${esc(ctx.userName(r.implementationOwnerId))}</div><div><span>مهلت:</span> ${d(r.implementationDue)}</div><div><span>انطباق:</span> ${r.implementedAsApproved == null ? '—' : r.implementedAsApproved ? 'مطابق مصوبه' : 'مغایر'}</div>
<div><span>هزینهٔ واقعی:</span> ${n(r.actualCost)}</div><div><span>تأخیر واقعی:</span> ${n(r.actualDelayDays)} روز</div><div><span>بسته‌شدن:</span> ${d(r.closedAt)}</div></div>
<h2>تاریخچه</h2><table><thead><tr><th>تاریخ</th><th>رویداد</th><th>کاربر</th><th>توضیح</th></tr></thead><tbody>${history.map((h) => `<tr><td>${d(h.createdAt)}</td><td>${esc(ACTION_FA[h.action] ?? h.action)}</td><td>${esc(ctx.userName(h.userId))} ${esc(h.roleLabel)}</td><td>${esc(h.comment)}</td></tr>`).join('')}</tbody></table>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open(); w.document.write(html); w.document.close()
  return true
}
