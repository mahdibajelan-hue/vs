import { groupLines, PART_META, STATUS_FA, periodOf } from './lib/stmtCore'
import type { Cfg, Contract, Line, Statement } from './store/usePstStore'
import { fa, jd, rial } from './ui'

const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))

/** the paper statement: header, summary of amounts and deductions, then the lines by group with group subtotals, and signature boxes */
export function printStatement(s: Statement, c: Contract, lines: Line[], cfg: Cfg) {
  const w = window.open('', '_blank', 'width=1100,height=1200')
  if (!w) return
  const p = periodOf(s.periodKey), m = PART_META[s.part]
  const body = groupLines(lines).map((g) => {
    const sum = (k: 'baseAmount' | 'cumAmount' | 'prevAmount') => g.lines.reduce((a, l) => a + l[k], 0)
    return `<tr class="g"><td colspan="5">${esc(g.label)}</td><td>${rial(sum('baseAmount'))}</td><td>${rial(sum('cumAmount'))}</td><td>${rial(sum('prevAmount'))}</td><td>${rial(sum('cumAmount') - sum('prevAmount'))}</td></tr>` +
      g.lines.map((l, i) => `<tr><td>${fa(i + 1)}</td><td dir="ltr">${esc(l.code)}</td><td class="t">${esc(l.title)}${l.edited ? ' *' : ''}</td><td>${esc(l.unit)}</td><td>${s.part === 'E' ? `${fa(l.sysCumQty)}٪` : fa(l.sysCumQty, 2)}</td><td>${rial(l.baseAmount)}</td><td>${rial(l.cumAmount)}</td><td>${rial(l.prevAmount)}</td><td><b>${rial(l.cumAmount - l.prevAmount)}</b></td></tr>`).join('')
  }).join('')
  const d = s.deductions
  w.document.write(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>صورت‌وضعیت ${s.part}-${s.no} ${esc(c.no)}</title>
  <style>body{font-family:Vazirmatn,Tahoma,sans-serif;margin:22px;color:#0f172a;font-size:11.5px}h1{font-size:16px;text-align:center;margin:0 0 4px}h2{font-size:12px;text-align:center;margin:0 0 12px;color:#475569;font-weight:600}
  table{width:100%;border-collapse:collapse;margin:6px 0 12px}td,th{border:1px solid #64748b;padding:4px 5px;text-align:center}th{background:#e2e8f0}td.t{text-align:right}tr.g td{background:#f1f5f9;font-weight:800}
  .h td{text-align:right}.sum td:last-child{font-weight:800}.sig{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}.sig div{border:1px solid #64748b;height:70px;padding:6px;font-size:11px}
  .bar{height:8px;background:${m.color}}@media print{tr{page-break-inside:avoid}}</style></head><body>
  <div class="bar"></div>
  <h1>صورت‌وضعیت شمارهٔ ${fa(s.no)} — ${esc(m.long)} (${s.part})</h1>
  <h2>دورهٔ ${esc(p.label)} (${jd(s.from)} تا ${jd(s.to)}) — وضعیت: ${STATUS_FA[s.status]}</h2>
  <table class="h"><tr><td><b>قرارداد:</b> ${esc(c.no)} — ${esc(c.title)}</td><td><b>مبلغ قرارداد با الحاقیه‌ها:</b> ${rial(c.cap)} ریال</td></tr>
  <tr><td><b>مبنای محاسبه:</b> ${esc(m.source)}</td><td><b>سقف این بخش:</b> ${s.cap != null ? rial(s.cap) + ' ریال' : '—'}</td></tr></table>
  <table class="sum"><tr><th>شرح</th><th>نرخ</th><th>مبلغ (ریال)</th></tr>
  <tr><td class="t">تجمعی تا پایان ماه</td><td></td><td>${rial(s.cumAmount)}</td></tr>
  <tr><td class="t">تأییدشدهٔ صورت‌وضعیت قبل</td><td></td><td>− ${rial(s.prevAmount)}</td></tr>
  <tr><td class="t"><b>صورت‌وضعیت این ماه (ناخالص) = تجمعی − قبلی</b></td><td></td><td><b>${rial(s.thisAmount)}</b></td></tr>
  <tr><td class="t">کسر استهلاک پیش‌پرداخت</td><td>${fa(cfg.advRecoveryPct, 2)}٪</td><td>${rial(d.advance)}</td></tr>
  <tr><td class="t">کسر حسن انجام کار</td><td>${fa(cfg.retPct, 2)}٪</td><td>${rial(d.retention)}</td></tr>
  <tr><td class="t">کسر مالیات</td><td>${fa(cfg.taxPct, 2)}٪</td><td>${rial(d.tax)}</td></tr>
  <tr><td class="t">کسر بیمه</td><td>${fa(cfg.insPct, 2)}٪</td><td>${rial(d.insurance)}</td></tr>
  <tr><td class="t"><b>خالص قابل پرداخت</b></td><td></td><td><b>${rial(s.payable)}</b></td></tr></table>
  <table><tr><th>ردیف</th><th>کد</th><th>شرح</th><th>واحد</th><th>${s.part === 'E' ? 'پیشرفت' : 'مقدار تجمعی'}</th><th>مبلغ پیمان</th><th>تجمعی تا پایان ماه</th><th>تأییدشدهٔ قبل</th><th>این ماه</th></tr>${body}</table>
  <small>* ردیف‌های ستاره‌دار در بررسی اصلاح شده‌اند.</small>
  <div class="sig"><div>تهیه‌کننده (پیمانکار)</div><div>بررسی‌کننده (مشاور)</div><div>تأییدکننده (کارفرما)</div><div>امور مالی</div></div>
  <script>window.onload=()=>window.print()</script></body></html>`)
  w.document.close()
}
