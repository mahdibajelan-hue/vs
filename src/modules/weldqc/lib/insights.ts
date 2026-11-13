import type { Code } from './api1104'
import type { Pass } from './rules'

/**
 * بینش‌های هوشمند — patterns in the project's own QC records that a person would only find after many weeks of
 * reports. Each insight carries its evidence (counts) and the rule that raised it, so it can be checked, not trusted:
 *
 *  • welder trend: the last 10 radiographed welds of a welder against his earlier ones and the project (early warning
 *    before the monthly report shows it), with the Bayesian chance that his next weld needs repair;
 *  • clock hotspot: defects crowded in one 3-hour sector of the circumference (e.g. 5–7 o'clock = overhead position);
 *  • pass / imperfection pattern: one pass or one imperfection code dominating, with its usual root causes;
 *  • same-joint comparison: welders who shared welds (different quadrants of the same passes) compared on their own
 *    quadrants — fit-up, pipe and weather were the same, so the difference is the welder;
 *  • repairs that do not hold; films whose image quality is poor.
 */

export type Tone = 'warn' | 'info' | 'good'
export interface Insight { id: string; tone: Tone; title: string; body: string; evidence: string; welder?: string; weldIds?: string[] }

export interface IDefect { weldId: string; code: Code | ''; type: string; clock: number | null; pass: Pass | ''; quadrant: number | null; welders: string[]; round: number; verdict: string | null; removed: boolean }
export interface IResult { key: string; at: string; repaired: boolean; weldId: string }
export interface ICrewSeg { weldId: string; welder: string; pass: Pass; quadrant: number }

const n = (x: number) => x.toLocaleString('fa-IR')
const pc = (x: number) => `${n(Math.round(x * 1000) / 10)}٪`

export function welderTrends(results: IResult[], projectRate: number, nameOf: (k: string) => string): Insight[] {
  const by = new Map<string, IResult[]>()
  for (const r of results) { const x = by.get(r.key) ?? []; x.push(r); by.set(r.key, x) }
  const out: Insight[] = []
  for (const [key, rs] of by) {
    const s = [...rs].sort((a, b) => a.at.localeCompare(b.at))
    if (s.length < 8) continue
    const recent = s.slice(-10), prior = s.slice(0, -10)
    const rr = recent.filter((x) => x.repaired).length / recent.length
    const pr = prior.length ? prior.filter((x) => x.repaired).length / prior.length : null
    const next = (s.filter((x) => x.repaired).length + 10 * projectRate) / (s.length + 10)
    if (recent.filter((x) => x.repaired).length >= 3 && rr >= Math.max(2 * projectRate, projectRate + 0.15) && (pr == null || rr > pr + 0.1))
      out.push({ id: `trend-${key}`, tone: 'warn', welder: key, weldIds: recent.filter((x) => x.repaired).map((x) => x.weldId), title: `هشدار زودهنگام: کیفیت کار ${nameOf(key)} افت کرده است`, body: `از ۱۰ سرجوش آخر ${n(recent.filter((x) => x.repaired).length)} مورد نیاز به تعمیر داشت (${pc(rr)})${pr != null ? `، در برابر ${pc(pr)} در سوابق قبلی` : ''} و میانگین پروژه ${pc(projectRate)}. احتمال تعمیر سرجوش بعدی او با سوابقش حدود ${pc(next)} است. بازدید از کار، بررسی خستگی، دستگاه و الکترود، یا آموزش هدفمند پیشنهاد می‌شود.`, evidence: `${n(s.length)} سرجوش رادیوگرافی‌شده` })
    else if (pr != null && prior.length >= 8 && pr - rr >= 0.15 && rr <= projectRate)
      out.push({ id: `trend-${key}`, tone: 'good', welder: key, title: `بهبود محسوس کار ${nameOf(key)}`, body: `نرخ تعمیر ۱۰ سرجوش آخر ${pc(rr)} در برابر ${pc(pr)} قبل است.`, evidence: `${n(s.length)} سرجوش رادیوگرافی‌شده` })
  }
  return out
}

const SECTOR_FA = (start: number) => {
  const mid = (start + 1.5) % 12
  const where = mid >= 4.5 && mid <= 7.5 ? 'وضعیت بالای سر (زیر لوله)' : (mid >= 1.5 && mid <= 4.5) || (mid >= 7.5 && mid <= 10.5) ? 'وضعیت عمودی (کنارهٔ لوله)' : 'وضعیت تخت (بالای لوله)'
  return { range: `ساعت ${n(start)} تا ${n((start + 3) % 12 || 12)}`, where }
}
export function clockHotspot(ds: IDefect[]): Insight[] {
  const live = ds.filter((d) => !d.removed && d.clock != null)
  if (live.length < 6) return []
  const hours = new Array(12).fill(0)
  for (const d of live) hours[Math.floor((d.clock as number) % 12)]++
  let best = 0, start = 0
  for (let h = 0; h < 12; h++) { const c = hours[h] + hours[(h + 1) % 12] + hours[(h + 2) % 12]; if (c > best) { best = c; start = h } }
  const share = best / live.length
  if (share < 0.5) return []
  const s = SECTOR_FA(start)
  const cause = s.where.startsWith('وضعیت بالای سر') ? 'جوشکاری بالای سر (6G / 5G پایین لوله) دشوارترین بخش است: زاویهٔ الکترود، آمپر و سرعت پیشروی در این ناحیه و دسترسی جوشکار (عمق کانال، چادر) را بازبینی کنید.' : s.where.startsWith('وضعیت عمودی') ? 'در وضعیت عمودی، جهت جوشکاری (سربالا / سرپایین)، اتصال پاس‌ها در محل شروع و توقف و حرکت بافت را بررسی کنید.' : 'شروع و پایان پاس‌ها معمولاً در بالای لوله است؛ آماده‌سازی محل شروع و سنگ‌زنی تقاطع پاس‌ها را بررسی کنید.'
  return [{ id: 'clock', tone: 'warn', title: `${pc(share)} عیوب در ${s.range} (${s.where}) است`, body: `انتظار توزیع یکنواخت حدود ۲۵٪ است. ${cause}`, evidence: `${n(best)} از ${n(live.length)} عیب با موقعیت ساعتی` }]
}

const CODE_CAUSE: Partial<Record<Code, string>> = {
  IP: 'گپ ریشهٔ کم، لبهٔ ریشهٔ ضخیم یا آمپر پایین پاس ریشه؛ آماده‌سازی لبه و تنظیم کلمپ را کنترل کنید.',
  IF: 'زاویهٔ نادرست الکترود یا حرارت ورودی کم؛ تمیزکاری لبه‌ها را هم بررسی کنید.', IFD: 'سرد بودن پاس قبلی یا سرعت زیاد (Cold lap)؛ دمای بین‌پاسی را کنترل کنید.',
  ESI: 'تمیزکاری ناکافی بین پاس ریشه و گرم (Wagon track)؛ سنگ‌زنی پاس ریشه را جدی‌تر کنید.', ISI: 'تمیزکاری بین‌پاسی ناکافی.',
  P: 'رطوبت الکترود (کوره‌داری الکترود سلولزی/کم‌هیدروژن)، باد در محل جوشکاری، یا آلودگی لبه‌ها.', CP: 'شروع/توقف در پاس نهایی با قوس بلند؛ تکنیک شروع را آموزش دهید.',
  HB: 'سرعت زیاد یا آمپر بالای پاس ریشه با الکترود سلولزی.', BT: 'آمپر زیاد یا گپ ریشهٔ زیاد.', C: 'خنک شدن سریع، پیش‌گرمایش ناکافی یا حرکت لوله پیش از تکمیل پاس گرم.',
  EU: 'آمپر یا سرعت زیاد در پاس کپ، زاویهٔ نادرست.', IU: 'آمپر زیاد در پاس ریشه.', IPD: 'ناهم‌ترازی لبه‌ها هنگام کلمپ کردن؛ کنترل Hi-Lo پیش از جوشکاری.',
}
const PASS_FA: Record<Pass, string> = { root: 'ریشه', hot: 'گرم', fill: 'پرکننده', cap: 'نهایی' }
export function patternInsights(ds: IDefect[], codeFa: (c: Code) => string): Insight[] {
  const live = ds.filter((d) => !d.removed && (d.verdict === 'repair' || d.verdict === 'cut_out'))
  const out: Insight[] = []
  if (live.length >= 6) {
    const byPass = new Map<string, number>(); for (const d of live) if (d.pass) byPass.set(d.pass, (byPass.get(d.pass) ?? 0) + 1)
    const top = [...byPass].sort((a, b) => b[1] - a[1])[0]
    if (top && top[1] / live.length >= 0.6) out.push({ id: 'pass', tone: 'info', title: `${pc(top[1] / live.length)} عیوب ردشده در پاس ${PASS_FA[top[0] as Pass]} است`, body: top[0] === 'root' ? 'کیفیت پاس ریشه گلوگاه کیفیت پروژه است: آماده‌سازی لبه، گپ، کلمپ داخلی و مهارت جوشکاران ریشه را در اولویت قرار دهید.' : `بیشترین تأثیر بهبود در پاس ${PASS_FA[top[0] as Pass]} است.`, evidence: `${n(top[1])} از ${n(live.length)} عیب ردشده` })
    const byCode = new Map<string, number>(); for (const d of live) if (d.code) byCode.set(d.code, (byCode.get(d.code) ?? 0) + 1)
    const tc = [...byCode].sort((a, b) => b[1] - a[1])[0]
    if (tc && tc[1] / live.length >= 0.35 && CODE_CAUSE[tc[0] as Code]) out.push({ id: 'code', tone: 'info', title: `عیب غالب: ${codeFa(tc[0] as Code)} — ${pc(tc[1] / live.length)} عیوب ردشده`, body: `علت‌های رایج: ${CODE_CAUSE[tc[0] as Code]}`, evidence: `${n(tc[1])} مورد` })
  }
  return out
}

/** welders compared with the co-welders of the same welds, each on his own pass × quadrant */
export function sameJoint(segs: ICrewSeg[], ds: IDefect[], nameOf: (k: string) => string): Insight[] {
  const bad = new Set(ds.filter((d) => !d.removed && d.round === 0 && (d.verdict === 'repair' || d.verdict === 'cut_out') && d.pass && d.quadrant).map((d) => `${d.weldId}|${d.pass}|${d.quadrant}`))
  const shared = new Map<string, Set<string>>() // weld|pass → welders
  for (const s of segs) { const k = `${s.weldId}|${s.pass}`; const x = shared.get(k) ?? new Set(); x.add(s.welder); shared.set(k, x) }
  const me = new Map<string, { segs: number; bad: number; peerSegs: number; peerBad: number }>()
  for (const s of segs) {
    if ((shared.get(`${s.weldId}|${s.pass}`)?.size ?? 0) < 2) continue
    const m = me.get(s.welder) ?? { segs: 0, bad: 0, peerSegs: 0, peerBad: 0 }
    m.segs++; if (bad.has(`${s.weldId}|${s.pass}|${s.quadrant}`)) m.bad++
    for (const p of segs) if (p.weldId === s.weldId && p.pass === s.pass && p.welder !== s.welder) { m.peerSegs++; if (bad.has(`${p.weldId}|${p.pass}|${p.quadrant}`)) m.peerBad++ }
    me.set(s.welder, m)
  }
  const out: Insight[] = []
  for (const [k, m] of me) {
    if (m.segs < 4 || m.bad < 2) continue
    const mine = m.bad / m.segs, peers = m.peerSegs ? m.peerBad / m.peerSegs : 0
    if (mine >= 2 * peers + 0.1) out.push({ id: `pair-${k}`, tone: 'warn', welder: k, title: `مقایسهٔ هم‌سرجوش: ${nameOf(k)} در ربع خودش عیب بیشتری دارد`, body: `در سرجوش‌هایی که با جوشکاران دیگر مشترک کار کرده، ${pc(mine)} ربع‌های او عیب ردشده داشته در برابر ${pc(peers)} ربع‌های هم‌کارانش در همان سرجوش‌ها و همان پاس. شرایط لوله، کلمپ و هوا برای همه یکسان بوده؛ تفاوت به مهارت یا تکنیک او برمی‌گردد.`, evidence: `${n(m.segs)} ربع جوشکاری‌شده در ${n(new Set(segs.filter((s) => s.welder === k).map((s) => s.weldId)).size)} سرجوش مشترک` })
  }
  return out
}

export function repairHold(repairs: { performedBy: string; ok: boolean | null }[], nameOf: (k: string) => string): Insight[] {
  const by = new Map<string, { n: number; fail: number }>()
  for (const r of repairs) { if (r.ok == null) continue; const x = by.get(r.performedBy) ?? { n: 0, fail: 0 }; x.n++; if (!r.ok) x.fail++; by.set(r.performedBy, x) }
  return [...by].filter(([, x]) => x.fail >= 2 && x.fail / x.n >= 0.4).map(([k, x]) => ({ id: `rep-${k}`, tone: 'warn' as const, welder: k, title: `تعمیرهای ${nameOf(k)} دوام ندارد`, body: `${n(x.fail)} از ${n(x.n)} تعمیر او در رادیوگرافی بعدی دوباره رد شده است. تعمیر را به جوشکار دیگری بسپارید یا روش تعمیر (Repair WPS، سنگ‌زنی کامل تا فلز سالم) را بازبینی کنید.`, evidence: `${n(x.n)} تعمیر با نتیجهٔ مشخص` }))
}

export function filmQuality(films: { quality: string; metrics: { verdict?: string } }[]): Insight[] {
  const poor = films.filter((f) => f.metrics?.verdict === 'poor' && f.quality === 'pending').length
  return poor ? [{ id: 'films', tone: 'info', title: `${n(poor)} فیلم با کیفیت تصویر پایین منتظر بررسی است`, body: 'تحلیل خودکار تصویر برای این فیلم‌ها کنتراست یا وضوح پایین تشخیص داده است؛ پیش از تفسیر، کیفیت (دانسیته و IQI) را بررسی و در صورت نیاز ریتیک یا ریشوت ثبت کنید.', evidence: 'شاخص‌های کنتراست، دامنهٔ دینامیک و وضوح لبه' }] : []
}
