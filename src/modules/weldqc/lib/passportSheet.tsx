import { renderToStaticMarkup } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'
import type { Defect, Evaluation, Film, Repair, Vt, Wps } from '../repo'
import type { WeldQc } from './useQc'
import { codeOf, fa, faDate, weldLabel } from './useQc'
import { CODE_FA, type Code } from './api1104'
import { crewGrid, PASSES, QUAD_SHORT } from './crew'
import { PASS_FA, VERDICT_FA } from './rules'
import { GRADE_FA } from './health'
import { timeline, type Ends } from './passport'

export const SIGN_ROLES = [['weld_inspector', 'ناظر جوش'], ['coat_inspector', 'ناظر پوشش (عایق)'], ['site_head', 'سرپرست کارگاه'], ['supervision_head', 'سرپرست نظارت']] as const
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const dash = (v: unknown) => (v == null || v === '' ? '—' : esc(v))
export const passportCode = (projectCode: string, w: { sec: string; weld: string }) => `RASTA|WJ|${projectCode}|${w.sec}|${w.weld}`

export interface SheetInput {
  row: WeldQc; projectName: string; projectCode: string; ends: Ends | undefined; wps: Wps | undefined
  films: Film[]; defects: Defect[]; evals: Evaluation[]; repairs: Repair[]; vts: Vt[]; nameOf: (k: string) => string; hydro: string
}

/** The weld passport as one printable A4 document (HTML): identity, procedure, welders, inspections, indications, repairs, coating, dates and sign-offs, with the weld's QR code. */
export function passportHtml(x: SheetInput): string {
  const { row: r } = x, w = r.weld, j = r.joint
  const qr = renderToStaticMarkup(<QRCodeSVG value={passportCode(x.projectCode, w)} size={92} level="M" marginSize={0} />)
  const grid = crewGrid(r.crew, w.sides)
  const who = (k: string) => `${esc(k)}${x.nameOf(k) !== k ? ` <small>${esc(x.nameOf(k))}</small>` : ''}`
  const kv = (rows: [string, unknown][]) => `<table class="kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v == null || v === '' ? '—' : v}</td></tr>`).join('')}</table>`
  const tbl = (head: string[], rows: (string | number)[][], empty: string) => (rows.length ? `<table class="t"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((c) => `<tr>${c.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<p class="none">${empty}</p>`)
  const vfa = (v: string | null | undefined) => (v ? VERDICT_FA[v as keyof typeof VERDICT_FA] ?? esc(v) : '—')
  const rounds = [0, 1, 2].filter((k) => x.films.some((f) => f.round === k) || x.evals.some((e) => e.round === k))
  const steps = timeline({ weld: w, vts: x.vts, films: x.films, evals: x.evals, repairs: x.repairs, coatings: r.coatings, closedAt: j?.closedAt ?? null, finalFa: vfa(j?.finalStatus), nameOf: x.nameOf })
  const coat = r.coatings.filter((c) => !c.removed)
  const status = j?.closed ? vfa(j.finalStatus) : 'پرونده باز است'
  const body = `
<header class="top">
  <div class="qr">${qr}<small>${esc(passportCode(x.projectCode, w))}</small></div>
  <div class="ttl"><small>${esc(x.projectName)}</small><h1>شناسنامهٔ سرجوش</h1><b>WELD PASSPORT</b></div>
  <div class="id"><span>مقطع / سرجوش</span><strong dir="ltr">${esc(weldLabel(w))}</strong><em class="${j?.closed ? (j.finalStatus === 'cut_out' ? 'bad' : 'ok') : ''}">${status}</em></div>
</header>
<section><h2>۱. مشخصات سرجوش و لوله</h2><div class="two">
  ${kv([['قطر', w.central.size ? `${esc(w.central.size)}″` : r.odMm ? `${fa(r.odMm / 25.4, 1)}″` : ''], ['ضخامت دیواره', r.thk ? `${fa(r.thk, 2)} mm` : ''], ['طول جوش (π·OD)', r.odMm ? `${fa(Math.PI * r.odMm)} mm` : ''], ['لولهٔ قبل', x.ends?.a ? `<span dir="ltr">${esc(x.ends.a)}</span>${x.ends.aLen != null ? ` · ${fa(x.ends.aLen, 2)} m` : ''}` : ''], ['لولهٔ بعد', (x.ends?.b || w.pipe) ? `<span dir="ltr">${esc(x.ends?.b || w.pipe)}</span>${x.ends?.bLen != null ? ` · ${fa(x.ends.bLen, 2)} m` : ''}` : ''], ['نوع', w.welding?.tieIn ? 'تای‌این' : 'جوش خط']])}
  ${kv([['WPS', x.wps ? `<span dir="ltr">${esc(x.wps.wpsNo)}${x.wps.rev ? ` Rev.${esc(x.wps.rev)}` : ''}</span>` : ''], ['PQR مرتبط', x.wps?.pqrNos ? `<span dir="ltr">${esc(x.wps.pqrNos)}</span>` : ''], ['فرایند و مصرفی', x.wps ? `<span dir="ltr">${esc([x.wps.process, x.wps.filler].filter(Boolean).join(' · '))}</span>` : ''], ['گزارش جوشکاری', w.welding ? `${esc(w.welding.reportNo)} · ${faDate(w.welding.date)}` : ''], ['شاخص سلامت', r.health.score == null ? '' : `${fa(r.health.score)} از ۱۰۰ (${GRADE_FA[r.health.grade]})`], ['آزمون هیدرواستاتیک', esc(x.hydro)]])}
</div></section>
<section><h2>۲. جوشکاران به تفکیک پاس و ربع</h2>
  <table class="t c"><thead><tr><th>پاس</th>${([1, 2, 3, 4] as const).map((q) => `<th>ربع ${QUAD_SHORT[q]}</th>`).join('')}</tr></thead><tbody>${PASSES.map((p) => `<tr><th>${PASS_FA[p]}</th>${([1, 2, 3, 4] as const).map((q) => `<td>${grid[p][q].keys.map(who).join('، ') || '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>
</section>
<section><h2>۳. بازرسی چشمی و رادیوگرافی</h2>
  ${tbl(['مرحله', 'تاریخ', 'فیلم', 'ناظر / مفسر', 'بازرس NDT', 'نتیجه'], [
    ...x.vts.map((v) => [`بازرسی چشمی${v.round ? ` RS${fa(v.round)}` : ''}`, faDate(v.at), '—', esc(v.byName), '—', v.result === 'accept' ? 'قابل قبول' : 'رد']),
    ...(!x.vts.length && w.vtReport ? [['بازرسی چشمی (گزارش جوشکاری)', faDate(w.weldDate || null), '—', '—', '—', w.vtReport === 'rej' ? 'رد' : 'قابل قبول']] : []),
    ...rounds.map((k) => { const e = [...x.evals].reverse().find((v) => v.round === k), fs = x.films.filter((f) => f.round === k); return [k ? `رادیوگرافی پس از تعمیر RS${fa(k)}` : 'رادیوگرافی RT', faDate(fs.map((f) => f.shotAt ?? f.createdAt).sort()[0] ?? null), `${fa(fs.filter((f) => f.quality === 'accepted').length)} تأییدشده از ${fa(fs.length)}`, dash(e?.evaluatedName), e?.signedAt ? `${esc(e.signedName)} · ${faDate(e.signedAt)}` : '—', vfa(e?.overall)] }),
  ], 'بازرسی‌ای ثبت نشده است.')}
</section>
<section><h2>۴. ناپیوستگی‌ها (API 1104)</h2>
  ${tbl(['راند', 'کد و نوع', 'طول (mm)', 'ساعت', 'پاس', 'جوشکار', 'نتیجه'], x.defects.map((d) => { const c = codeOf(d); return [d.round ? `RS${fa(d.round)}` : 'RT', c ? esc(CODE_FA[c as Code]) : esc(d.type), fa(d.lengthMm, 1), d.clock != null ? fa(d.clock, 1) : '—', d.pass ? PASS_FA[d.pass] : '—', d.welders.map(who).join('، ') || '—', vfa(d.verdict)] }), 'ناپیوستگی‌ای ثبت نشده است.')}
</section>
<section><h2>۵. تعمیرات جوش</h2>
  ${tbl(['تعمیر', 'تاریخ', 'ناحیه (ساعت)', 'روش', 'جوشکار تعمیر', 'Repair WPS', 'تأییدکننده'], x.repairs.map((p) => [p.round === 0 ? 'اول' : 'دوم', faDate(p.createdAt), p.clockFrom != null && p.clockTo != null ? `${fa(p.clockFrom, 1)} تا ${fa(p.clockTo, 1)}` : '—', esc(p.method), who(p.performedBy), `<span dir="ltr">${dash(p.repairWps)}</span>`, dash(p.approvedBy)]), 'این سرجوش تعمیر نشده است.')}
</section>
<section><h2>۶. پوشش سرجوش و آزمون‌های آن</h2>
  ${tbl(['عملیات', 'تاریخ', 'پوشش‌کار / بازرس', 'سیستم', 'هالیدی', 'ضخامت (µm)', 'چسبندگی', 'نتیجه'], [
    ...(w.coat.fj ? [[`اجرای پوشش (گزارش ${esc(w.coat.fj.reportNo)})`, faDate(w.coat.fj.date), '—', dash(w.coat.fj.sleeve), '—', w.coat.fj.thkMin != null ? fa(w.coat.fj.thkMin) : '—', '—', w.coat.fj.result === 'rej' ? 'مردود' : 'قبول']] : []),
    ...(w.coat.bond ? [[`آزمون پوشش (گزارش ${esc(w.coat.bond.reportNo)})`, faDate(w.coat.bond.date), '—', '—', `${dash(w.coat.bond.holVolt)}${w.coat.bond.holidays != null ? ` · ${fa(w.coat.bond.holidays)} منفذ` : ''}`, '—', w.coat.bond.adhesionFail ? 'مردود' : 'قبول', w.coat.bond.verdict === 'rej' ? 'مردود' : w.coat.bond.verdict === 'ok' ? 'قبول' : '—']] : []),
    ...coat.map((c) => [c.kind === 'application' ? 'اجرای پوشش' : c.kind === 'repair' ? 'تعمیر پوشش' : `بازرسی پوشش${c.random ? ' (تصادفی)' : ''}`, faDate(c.at), c.kind === 'inspection' ? esc(c.createdName) : who(c.applicatorKey), dash(c.system), c.holidayKv != null ? `${fa(c.holidayKv, 1)} kV${c.holidayCount != null ? ` · ${fa(c.holidayCount)} منفذ` : ''}` : '—', c.dftMinUm != null ? fa(c.dftMinUm) : '—', c.adhesion != null ? fa(c.adhesion, 1) : '—', `${c.result === 'pass' ? 'قبول' : c.result === 'fail' ? 'مردود' : c.result === 'repair' ? 'نیاز به تعمیر' : '—'}${c.defects ? ` — ${esc(c.defects)}` : ''}`]),
  ], 'پوشش این سرجوش ثبت نشده است.')}
</section>
<section><h2>۷. مواعد زمانی عملیات</h2>
  ${tbl(['عملیات', 'تاریخ', 'فاصله از مرحلهٔ قبل', 'انجام‌دهنده / تأییدکننده', 'شرح'], steps.map((s, i) => [esc(s.label), faDate(s.date), i ? `${fa(Math.round((Date.parse(s.date) - Date.parse(steps[i - 1].date)) / 864e5))} روز` : '—', dash(s.by), dash(s.note)]), 'تاریخی ثبت نشده است.')}
</section>
<section class="signs"><h2>۸. تأییدها</h2><div class="sg">${SIGN_ROLES.map(([k, label]) => { const g = j?.signs?.[k]; return `<div><b>${label}</b><span class="nm">${g ? esc(g.name) : ''}</span><small>${g ? `تأیید الکترونیکی · ${faDate(g.at)}` : 'نام، تاریخ و امضا'}</small></div>` }).join('')}</div></section>
<footer>صادرشده از سامانهٔ راستا — ماژول کنترل کیفیت · ${faDate(new Date().toISOString())} · این برگه از داده‌های ثبت‌شدهٔ همان روز ساخته شده است.</footer>`
  return `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>Weld passport ${esc(weldLabel(w))}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;800&display=swap">
<style>
@page{size:A4;margin:11mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font:10.5px/1.65 Vazirmatn,Tahoma,sans-serif;color:#0f172a}
.top{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;border:1.5px solid #0f172a;border-radius:8px;padding:10px 12px}
.qr{display:grid;justify-items:center;gap:3px}.qr small{font:7px monospace;direction:ltr}
.ttl{text-align:center}.ttl small{display:block;font-size:10px;color:#475569}.ttl h1{margin:2px 0 0;font-size:19px;font-weight:800}.ttl b{font:600 10px/1 sans-serif;letter-spacing:.14em;color:#0e7490}
.id{display:grid;gap:2px;text-align:center;min-width:120px}.id span{font-size:9px;color:#475569}.id strong{font-size:17px;font-weight:800}
.id em{font-style:normal;font-weight:800;font-size:10px;padding:2px 8px;border-radius:99px;border:1px solid #94a3b8}.id em.ok{border-color:#15803d;color:#15803d}.id em.bad{border-color:#b91c1c;color:#b91c1c}
section{margin-top:9px;break-inside:avoid}h2{margin:0 0 4px;font-size:11.5px;font-weight:800;padding:3px 8px;background:#0f172a;color:#fff;border-radius:4px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
table{width:100%;border-collapse:collapse}.kv th{width:38%;text-align:right;font-weight:600;color:#475569;background:#f1f5f9}
th,td{border:1px solid #cbd5e1;padding:2.5px 6px;vertical-align:top;text-align:right}.t thead th{background:#e2e8f0;font-weight:800;font-size:9.5px}.t.c td,.t.c th{text-align:center}
td small{color:#475569}.none{margin:0;padding:5px 8px;border:1px dashed #cbd5e1;border-radius:4px;color:#64748b}
.sg{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.sg div{border:1px solid #94a3b8;border-radius:6px;padding:6px 8px;min-height:74px;display:grid;align-content:space-between}
.sg b{font-size:10px}.sg .nm{font-weight:800;font-size:11px;min-height:16px}.sg small{color:#64748b;font-size:8.5px;border-top:1px dotted #94a3b8;padding-top:2px}
footer{margin-top:8px;font-size:8.5px;color:#64748b;text-align:center}
</style></head><body>${body}</body></html>`
}

export function openPassport(x: SheetInput) {
  const win = window.open('', '_blank'); if (!win) return false
  win.document.write(passportHtml(x)); win.document.close()
  // printed from here (no inline script in the sheet): once its font is in
  const go = () => { try { win.focus(); win.print() } catch { /* closed */ } }
  void (win.document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(go, 400))
  return true
}
