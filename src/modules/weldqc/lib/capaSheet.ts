import type { CapaAction, CapaAttendee, CapaCase } from '../repo'
import type { ActionKind, CapaStatus, CauseCat, Party, Rule, Severity } from './capa'
import { faDate } from './useQc'
import { openPrintDocument } from '../../../lib/printWindow'

export const STATUS_FA: Record<CapaStatus, string> = { open: 'مهار فوری', rca: 'ریشه‌یابی و توافق', agreed: 'اجرای اقدام‌ها', verifying: 'سنجش اثربخشی', closed: 'بسته (اثربخش)', void: 'ابطال‌شده' }
export const STATUS_COLOR: Record<CapaStatus, string> = { open: '#ef4444', rca: '#f97316', agreed: '#0ea5e9', verifying: '#a855f7', closed: '#22c55e', void: '#64748b' }
export const SEV_FA: Record<Severity, string> = { minor: 'جزئی', major: 'عمده', critical: 'بحرانی' }
export const SEV_COLOR: Record<Severity, string> = { minor: '#64748b', major: '#f59e0b', critical: '#ef4444' }
export const RULE_FA: Record<Rule, string> = { manual: 'ثبت دستی', repair_rate: 'نرخ تعمیر پروژه', welder: 'تعمیر تکراری جوشکار', defect_code: 'عیب تکرارشونده', crack: 'ترک', cutout: 'برش', repeat_repair: 'تعمیر ناموفق', ncr: 'NCR با الزام RCA', ncr_repeat: 'تکرار NCR', retake: 'برگشت فیلم', coating: 'مردودی پوشش سرجوش', hydro: 'مردودی هیدروتست' }
export const PARTY_FA: Record<Party, string> = { contractor: 'پیمانکار', qc: 'کنترل کیفیت', supervision: 'دستگاه نظارت', consultant: 'مشاور', employer: 'کارفرما', other: 'سایر' }
export const CAT_FA: Record<CauseCat, string> = { man: 'نیروی انسانی', method: 'روش و دستورالعمل', machine: 'ماشین و تجهیزات', material: 'مواد و مصرفی', measurement: 'بازرسی و اندازه‌گیری', environment: 'محیط و شرایط کار' }
export const CAT_COLOR: Record<CauseCat, string> = { man: '#f43f5e', method: '#0ea5e9', machine: '#f59e0b', material: '#a855f7', measurement: '#14b8a6', environment: '#22c55e' }
export const KIND_FA: Record<ActionKind, string> = { containment: 'مهار فوری', corrective: 'اصلاحی', preventive: 'پیشگیرانه' }
export const KIND_COLOR: Record<ActionKind, string> = { containment: '#ef4444', corrective: '#f97316', preventive: '#22c55e' }
export const faTime = (iso: string | null) => (iso ? `${faDate(iso)} · ${new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}` : '—')

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const para = (v: string) => esc(v).replace(/\n/g, '<br>') || '—'

/** the minutes of the root-cause meeting as one printable A4 sheet, with the signature boxes of everyone present */
export function minutesHtml(c: CapaCase, att: CapaAttendee[], act: CapaAction[], projectName: string): string {
  const people = att.filter((a) => a.round === c.round && a.present), actions = act.filter((a) => a.round === c.round)
  const rows = (k: ActionKind) => actions.filter((a) => a.kind === k).map((a, i) => `<tr><td class="n">${(i + 1).toLocaleString('fa-IR')}</td><td>${esc(a.title)}</td><td>${esc(a.ownerName)}</td><td>${faDate(a.dueDate)}</td><td>${a.status === 'done' ? `انجام شد · ${faDate(a.doneAt)}` : '—'}</td></tr>`).join('')
  const tbl = (k: ActionKind) => (rows(k) ? `<table><thead><tr><th class="n">#</th><th>اقدام ${KIND_FA[k]}</th><th>مسئول</th><th>مهلت</th><th>وضعیت</th></tr></thead><tbody>${rows(k)}</tbody></table>` : `<p class="none">اقدام ${KIND_FA[k]} ثبت نشده است.</p>`)
  const whys = c.whys.filter((w) => w.trim())
  const body = `
<header><div><small>${esc(projectName)}</small><h1>صورتجلسهٔ تحلیل علت ریشه‌ای و اقدام اصلاحی / پیشگیرانه</h1><b>RCA MEETING MINUTES — CAPA</b></div>
<div class="id"><strong dir="ltr">${esc(c.code)}</strong><span>${c.mandatory ? 'الزامی' : 'داوطلبانه'} · ${SEV_FA[c.severity]}${c.round > 1 ? ` · دور ${c.round.toLocaleString('fa-IR')}` : ''}</span><span>${STATUS_FA[c.status]}</span></div></header>
<table class="kv"><tr><th>موضوع</th><td colspan="3">${esc(c.title)}</td></tr>
<tr><th>زمان جلسه</th><td>${faTime(c.meetingAt)}</td><th>محل</th><td>${esc(c.meetingPlace) || '—'}</td></tr>
<tr><th>مسئول پرونده</th><td>${esc(c.ownerName) || '—'}</td><th>منشأ</th><td>${RULE_FA[c.rule] ?? esc(c.rule)}</td></tr></table>
<section><h2>۱. شرح مسئله و شواهد</h2><p>${para(c.problem)}</p>${c.evidence ? `<p class="ev">شواهد: ${esc(c.evidence)}</p>` : ''}</section>
<section><h2>۲. اقدام فوری مهار</h2><p>${para(c.containment)}</p>${tbl('containment').startsWith('<table') ? tbl('containment') : ''}</section>
<section><h2>۳. تحلیل علت</h2>${whys.length ? `<ol class="why">${whys.map((w) => `<li>${esc(w)}</li>`).join('')}</ol>` : ''}
${c.causes.length ? `<table><thead><tr><th>دسته</th><th>علت</th><th class="n">ریشه‌ای</th></tr></thead><tbody>${c.causes.map((k) => `<tr><td>${CAT_FA[k.cat] ?? esc(k.cat)}</td><td>${esc(k.text)}</td><td class="n">${k.root ? '●' : ''}</td></tr>`).join('')}</tbody></table>` : ''}
<p class="root"><b>علت ریشه‌ای توافق‌شده:</b> ${para(c.rootCause)}</p></section>
<section><h2>۴. شرح مذاکرات</h2><p>${para(c.minutes)}</p></section>
<section><h2>۵. اقدام‌های اصلاحی (رفع علت مشکل موجود)</h2>${tbl('corrective')}</section>
<section><h2>۶. اقدام‌های پیشگیرانه (جلوگیری از تکرار)</h2>${tbl('preventive')}</section>
<section><h2>۷. توافق و امضای حاضران</h2><div class="sg">${people.map((p) => `<div><b>${esc(p.name)}</b><span>${PARTY_FA[p.party]}${p.role ? ` · ${esc(p.role)}` : ''}</span><em>${p.signedAt ? `${p.paper ? 'امضای کاغذی ثبت شد' : 'امضای الکترونیکی'} · ${faTime(p.signedAt)}` : ''}</em></div>`).join('')}</div></section>
<footer>صادرشده از سامانهٔ راستا — کنترل کیفیت · ${faDate(new Date().toISOString())}${c.agreedAt ? ` · توافق نهایی در ${faTime(c.agreedAt)}` : ' · پیش‌نویس — هنوز توافق نهایی ثبت نشده است'}</footer>`
  return `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>${esc(c.code)} — RCA minutes</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;800&display=swap">
<style>
@page{size:A4;margin:12mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font:11px/1.8 Vazirmatn,Tahoma,sans-serif;color:#0f172a}
header{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;border:1.5px solid #0f172a;border-radius:8px;padding:10px 14px;margin-bottom:8px}
header small{display:block;color:#475569}h1{margin:2px 0 0;font-size:16px;font-weight:800}header b{font:600 9.5px/1 sans-serif;letter-spacing:.12em;color:#0e7490}
.id{display:grid;gap:2px;text-align:center;min-width:130px}.id strong{font-size:17px;font-weight:800}.id span{font-size:9.5px;color:#475569}
section{margin-top:9px}h2{margin:0 0 4px;font-size:11.5px;font-weight:800;padding:3px 8px;background:#0f172a;color:#fff;border-radius:4px;break-after:avoid}
p{margin:3px 2px}.ev{color:#475569;font-size:10px}.root{padding:5px 8px;border:1px solid #0f172a;border-radius:5px;background:#f1f5f9}
table{width:100%;border-collapse:collapse;margin-top:3px}th,td{border:1px solid #cbd5e1;padding:3px 7px;vertical-align:top;text-align:right}thead th{background:#e2e8f0;font-weight:800;font-size:10px}
.kv th{width:14%;background:#f1f5f9;font-weight:600;color:#475569}.n{width:34px;text-align:center}.none{padding:5px 8px;border:1px dashed #cbd5e1;border-radius:4px;color:#64748b}
.why{margin:2px 18px 4px;padding:0}.why li{margin:1px 0}
.sg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.sg div{border:1px solid #94a3b8;border-radius:6px;padding:6px 8px;min-height:86px;display:grid;align-content:space-between;break-inside:avoid}
.sg b{font-size:11px}.sg span{font-size:9.5px;color:#475569}.sg em{font-style:normal;font-size:8.5px;color:#15803d;border-top:1px dotted #94a3b8;padding-top:2px;min-height:15px}
footer{margin-top:10px;font-size:8.5px;color:#64748b;text-align:center}
</style></head><body>${body}</body></html>`
}
export function openMinutes(c: CapaCase, att: CapaAttendee[], act: CapaAction[], projectName: string) {
  return openPrintDocument(minutesHtml(c, att, act, projectName), { print: true })
}
