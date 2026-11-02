import {
  airTest, airTestHfw, airTestSaw, gaugePlateOf, holdDrift, holdFigures, leakTest, leakTestSmall, pvOffset, PSI_PER_BAR, stabilizationDaysOf, waterCheck, WATER_LIMITS,
  type IgsParams, type MixFigures, type SectionPressures,
} from './igs'
import type { FormKind, HtForm, HtReading } from '../repo'

/**
 * The test minutes of one section, after the forms of appendix 5 of IGS-C-PL-100(3): what each records, what is computed
 * from it and the verdict, so the screen and the printout read the same numbers. Pure.
 *   permit   → مجوز شروع + آنالیز آب مصرفی
 *   gauge    → فرم ۵-۲ صورتجلسهٔ ارسال صفحهٔ اندازه
 *   air      → فرم ۵-۵ جدول ثبت ارقام آزمایش عدم وجود هوا (HFW) / جدول P–V (DSAW)
 *   strength → فرم ۵-۴ گزارش آزمایش مقاومت (جدول افزایش فشار و جدول ۴ ساعته) / سیکل‌های روش سیکلی
 *   leak     → فرم ۵-۳ جدول ثبت ارقام و فرم ۵-۶ صورتجلسهٔ آزمایش نشتی
 *   drying   → فرم ۵-۷ صورتجلسهٔ تخلیه و خشک‌کنی
 */
export const FORM_ORDER: FormKind[] = ['permit', 'gauge', 'air', 'strength', 'leak', 'drying']
export const FORM_FA: Record<FormKind, string> = {
  permit: 'مجوز شروع آزمون و آب مصرفی', gauge: 'صورتجلسهٔ ارسال صفحهٔ اندازه (فرم ۵-۲)', air: 'آزمایش عدم وجود هوا (فرم ۵-۵)',
  strength: 'گزارش آزمایش مقاومت (فرم ۵-۴)', leak: 'آزمایش نشتی (فرم‌های ۵-۳ و ۵-۶)', drying: 'صورتجلسهٔ تخلیه و خشک‌کنی خط (فرم ۵-۷)',
}
export const FORM_SHORT: Record<FormKind, string> = { permit: 'مجوز شروع', gauge: 'صفحهٔ اندازه', air: 'عدم وجود هوا', strength: 'مقاومت', leak: 'نشتی', drying: 'تخلیه و خشک‌کنی' }
export const PERMIT_ITEMS = ['جوشکاری', 'رادیوگرافی و تعمیرات', 'عایقکاری سرجوش‌ها و آزمون هالیدی', 'لوله‌گذاری', 'خاکریزی', 'تکمیل ارتفاع گردهٔ خاکی روی مسیر']

export type FormData = Record<string, unknown>
export const num = (v: unknown): number | null => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))
const bool = (v: unknown) => v === true

/** the table rows a form keeps (strength rise / hold, leak log, P–V of the DSAW air test) */
export interface RiseRow { at: string; psi: string; meter: string; vol: string; note?: string }
export interface LeakRow { at: string; psi: string; amb: string; t1?: string; t2?: string; t3?: string; t4?: string; t5?: string; t6?: string; note?: string }
export const LEAK_T = ['t1', 't2', 't3', 't4', 't5', 't6'] as const
export interface PvRow { p: string; v: string }
export const rowsOf = <T,>(d: FormData, k: string): T[] => (Array.isArray(d[k]) ? (d[k] as T[]) : [])
/** the mean of the ground / pipe temperatures entered on a leak-log row (Tm) */
export const tmOf = (r: LeakRow) => { const t = LEAK_T.map((k) => num(r[k])).filter((x): x is number => x != null); return t.length ? t.reduce((s, x) => s + x, 0) / t.length : null }
/** cumulative injected volume of the rise table */
export function riseCumulative(rows: RiseRow[]) {
  let c = 0
  return rows.map((r) => { const v = num(r.vol); if (v != null) c += v; return { ...r, cum: c, p: num(r.psi) } })
}

export interface Ctx { igs: IgsParams; mix: MixFigures; pr: SectionPressures; odIn: number; readings: HtReading[] }
export interface Computed { rows: [string, string][]; result: HtForm['result']; why: string; extend?: boolean }
const f = (v: number, d = 2) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const psi = (r: HtReading) => r.pressureBar * PSI_PER_BAR
const okFa = (b: boolean | null) => (b == null ? '—' : b ? 'برقرار' : 'برقرار نیست')

/** readings of a phase, oldest first, preferring the test head when it was read there */
export function phaseReadings(rs: HtReading[], phase: string) {
  const all = rs.filter((r) => r.phase === phase).sort((a, b) => a.at.localeCompare(b.at))
  const head = all.filter((r) => r.location === 'head')
  return head.length >= 2 ? head : all
}
/** the leak log: the form's table, or the leak readings when none was typed */
export function leakLog(d: FormData, readings: HtReading[]): LeakRow[] {
  const typed = rowsOf<LeakRow>(d, 'log').filter((r) => r.at && num(r.psi) != null)
  if (typed.length) return [...typed].sort((a, b) => a.at.localeCompare(b.at))
  return phaseReadings(readings, 'leak').map((r) => ({ at: r.at, psi: String(Math.round(psi(r) * 10) / 10), amb: '', t1: r.tempC != null ? String(r.tempC) : '' }))
}
/** the strength rise table: the form's, or the strength readings with an injected volume */
export function strengthRise(d: FormData, readings: HtReading[]) {
  const typed = rowsOf<RiseRow>(d, 'rise').filter((r) => num(r.psi) != null)
  if (typed.length) return riseCumulative(typed).map((r) => ({ p: r.p!, v: r.cum, at: r.at }))
  return readings.filter((r) => r.phase === 'strength' && r.volumeM3 != null).map((r) => ({ p: psi(r), v: r.volumeM3!, at: r.at }))
}

/** the computed lines and the verdict of one minute */
export function computeForm(kind: FormKind, d: FormData, c: Ctx): Computed {
  const { igs, mix, pr } = c
  if (kind === 'permit') {
    const done = PERMIT_ITEMS.filter((_, i) => bool(d[`c${i}`]))
    const w = waterCheck(Object.fromEntries(WATER_LIMITS.map((l) => [l.k, num(d[`w_${l.k}`])])))
    const fillT = num(d.fillTempC)
    const coldFill = fillT != null && fillT < igs.minFillTempC && !bool(d.antifreeze)
    const ok = done.length === PERMIT_ITEMS.length && w.ok === true && !coldFill
    const rows: [string, string][] = [['موارد اجرایی تأییدشده', `${f(done.length, 0)} از ${f(PERMIT_ITEMS.length, 0)}`],
      ...w.rows.map((r) => [`${r.label} (${r.min != null ? `${f(r.min)} تا ` : '≤ '}${f(r.max!)}${r.unit ? ' ' + r.unit : ''})`, r.value == null ? '—' : `${f(r.value)} — ${r.ok ? 'مجاز' : 'غیرمجاز'}`] as [string, string]),
      ['دمای آب در آبگیری', fillT == null ? '—' : `${f(fillT, 1)} °C${coldFill ? ' — کمتر از حد مجاز' : ''}`]]
    return { rows, result: w.ok === false || coldFill ? 'fail' : ok ? 'pass' : 'pending',
      why: w.ok === false ? 'کیفیت آب مصرفی خارج از حدود دستورالعمل است؛ منبع آب تغییر کند یا آب تصفیه شود.' : coldFill ? `آبگیری در دمای کمتر از ${f(igs.minFillTempC, 0)} درجه بدون ضدیخ مجاز نیست.`
        : ok ? 'قطعه آمادهٔ انجام آزمایشات هیدرواستاتیک است.' : done.length < PERMIT_ITEMS.length ? 'همهٔ موارد اجرایی باید تأیید شوند.' : 'نتایج آنالیز آب مصرفی را وارد کنید.' }
  }
  if (kind === 'gauge') {
    const st = d.condition as string | undefined
    const plate = gaugePlateOf(c.odIn, igs)
    return {
      rows: [['قطر صفحه (٪ قطر داخلی ضخیم‌ترین لوله)', `${f(mix.gaugePlateMm, 2)} mm`], ['ضخامت و جنس صفحه', `${f(plate.mm, 0)} mm — ${plate.material}`]],
      result: st === 'ok' ? 'pass' : st === 'damaged' ? 'fail' : 'pending',
      why: st === 'ok' ? 'نظر به اینکه صفحهٔ اندازه به‌طور سالم دریافت گردید، سلامت لوله از نظر لهیدگی (Oval, Dent) در قطعهٔ فوق مورد تأیید است.'
        : st === 'damaged' ? 'نظر به اینکه صفحهٔ اندازه به‌طور سالم دریافت نگردید، سلامت لوله از نظر لهیدگی (Oval, Dent) در قطعهٔ فوق مورد تأیید نیست؛ محل عیب یافته و رفع شود.' : 'وضعیت صفحهٔ دریافتی ثبت نشده است.',
    }
  }
  if (kind === 'air') {
    const tC = num(d.waterC) ?? 15
    if (igs.seam === 'HFW') {
      const p1 = num(d.p1), p2 = num(d.p2), m = num(d.m), xo = num(d.x)
      const base: [string, string][] = [['حجم قطعه Vt', `${f(mix.volumeM3, 2)} m³`], ['ضخامت معادل te', `${f(mix.tEqIn, 4)}″`]]
      if (p1 == null || p2 == null || m == null) return { rows: base, result: 'pending', why: 'فشار پیش و پس از برداشت آب (P₁ و P₂) و حجم آب برداشته‌شده (M) را وارد کنید.' }
      const a = airTestHfw({ p1, p2, mM3: m, volumeM3: mix.volumeM3, odIn: c.odIn, teIn: mix.tEqIn, tC, xOverride: xo != null ? xo * 1e-6 : null }, igs)
      return {
        rows: [...base, ['ضریب فشردگی آب X', `${f(a.x * 1e6, 2)} ×۱۰⁻⁶ kg/cm²${xo != null ? ' (واردشده)' : ` (در ${f(tC, 1)} °C)`}`], ['افت فشار واقعی ΔP₁ = P₁ − P₂', `${f(a.dpaPsi, 2)} psi`],
          ['افت فشار محاسبه‌ای ΔP₀', `${f(a.dpthPsi, 2)} psi`], ['نسبت ΔP₁ ÷ ΔP₀', `${f(a.ratioPct, 1)}٪ (حداقل ${f(a.minPct, 0)}٪)`]],
        result: a.pass ? 'pass' : 'fail',
        why: a.pass ? 'آزمایش عدم وجود هوا مورد تأیید است؛ هوای موجود در خط در حد قابل قبول است.' : 'آزمایش عدم وجود هوا مورد تأیید نیست؛ هوای داخل لوله بیش از حد مجاز است و باید با تخلیه و تزریق مجدد آب به حداقل برسد.',
      }
    }
    const pts = rowsOf<PvRow>(d, 'pv').map((r) => ({ p: num(r.p)!, v: num(r.v)! })).filter((r) => r.p != null && r.v != null)
    const r = airTestSaw(pts, { volumeM3: mix.volumeM3, odIn: c.odIn, teIn: mix.tEqIn, tC, staticBar: num(d.staticBar) ?? undefined }, igs)
    if (!r) {
      // the older single-step entry (ΔP and ΔV) still reads
      const dp = num(d.dpPsi), dv = num(d.dvActual)
      if (dp != null && dv != null) {
        const a = airTest({ volumeM3: mix.volumeM3, dpPsi: dp, dvActualM3: dv, odIn: c.odIn, tIn: mix.tEqIn, tC }, igs)
        return { rows: [['ΔV محاسبه‌ای', `${f(a.theorM3, 3)} m³`], ['نسبت', `${f(a.ratio!, 4)} (حد ${f(igs.airRatioMax, 2)})`]], result: a.pass ? 'pass' : 'fail', why: a.pass ? 'نتیجهٔ آزمایش عدم وجود هوا قابل قبول است.' : 'هوای محبوس در خط بیش از حد مجاز است.' }
      }
      return { rows: [['حجم قطعه V', `${f(mix.volumeM3, 2)} m³`]], result: 'pending', why: `جدول فشار–حجم را دست‌کم با سه قرائت (هر ۱ بار تا ${f(igs.airPvMaxBar, 0)} بار) کامل کنید.` }
    }
    return {
      rows: [['حجم قطعه V', `${f(mix.volumeM3, 2)} m³`], ['مدول بالک آب B (دمای متوسط، ۳۵ بار)', `${f(r.bulkBar, 0)} bar`],
        ['شیب واقعی ΔV/ΔP (بخش خطی از ' + f(r.fitFrom, 1) + ' بار)', `${f(r.slope, 4)} m³/bar`], ['شیب نظری', `${f(r.theorSlope, 4)} m³/bar`],
        ['نسبت شیب واقعی به نظری', `${f(r.slopeRatio, 3)} (حداکثر ${f(igs.airRatioMax, 2)}) — ${okFa(r.okSlope)}`],
        ['حجم هوا (تلاقی مماس با فشار استاتیک)', `${f(r.airM3, 3)} m³ = ${f(r.airPct, 3)}٪ حجم خط (حداکثر ${f(igs.airMaxPct, 2)}٪) — ${okFa(r.okAir)}`]],
      result: r.pass ? 'pass' : 'fail',
      why: r.pass ? 'آزمایش عدم وجود هوا مورد تأیید است.' : 'آزمایش مورد قبول نیست؛ باید متوقف، علت مشخص و رفع شود و در صورت لزوم با نظر نمایندهٔ کارفرما خط تخلیه و دوباره پر شود.',
    }
  }
  if (kind === 'strength') {
    const rs = phaseReadings(c.readings, 'strength')
    const h = holdFigures(rs.map((r) => ({ at: r.at, psi: psi(r), tempC: r.tempC })))
    const holdRows = rowsOf<RiseRow>(d, 'hold').filter((r) => r.at && num(r.psi) != null)
    const drift = holdDrift(holdRows.map((r) => ({ at: r.at, psi: num(r.psi)!, adjustM3: num(r.vol) })), igs)
    const finalP = num(d.finalPsi) ?? (holdRows.length ? num(holdRows[holdRows.length - 1].psi) : null) ?? h.last?.psi ?? null
    const sound = d.noRupture === 'yes'
    const pressOk = finalP == null ? null : finalP >= pr.strength.head - 5 // the gauge reads the head; ±5 psi of instrument reading
    const rows: [string, string][] = [['فشار لازم در کابین (سر آزمون)', `${f(pr.strength.head, 1)} psi`], ['فشار نقطهٔ پایین / بالا', `${f(pr.strength.low, 1)} / ${f(pr.strength.high, 1)} psi`],
      ['فشار نهایی ثبت‌شده', finalP == null ? '—' : `${f(finalP, 1)} psi`]]
    if (igs.seam === 'HFW') {
      const cycles = num(d.cycles) ?? 0
      const ok = cycles >= igs.cyclicCycles && bool(d.cycleHoldOk) && sound && pressOk !== false
      rows.push(['سیکل‌های انجام‌شده', `${f(cycles, 0)} از ${f(igs.cyclicCycles, 0)} (هر سیکل ${f(igs.cyclicHoldMin, 0)} دقیقه در TP و کاهش به نصف)`], ['نگهداری هر سیکل', bool(d.cycleHoldOk) ? `دست‌کم ${f(igs.cyclicHoldMin, 0)} دقیقه` : '—'])
      return { rows, result: d.noRupture === 'no' ? 'fail' : ok ? 'pass' : 'pending',
        why: d.noRupture === 'no' ? 'پارگی یا نشتی در آزمون مقاومت ثبت شده است.' : ok ? 'آزمایش مقاومت به روش سیکلی بدون اشکال انجام و مورد قبول است.'
          : cycles < igs.cyclicCycles ? `آزمون باید ${f(igs.cyclicCycles, 0)} سیکل انجام شود.` : pressOk === false ? 'فشار ثبت‌شده کمتر از فشار لازم در کابین است.' : 'نگهداری هر سیکل و نبود پارگی و نشتی را تأیید کنید.' }
    }
    const pv = pvOffset(strengthRise(d, c.readings), mix.volumeM3, igs)
    const holdH = num(d.holdH) ?? (holdRows.length >= 2 ? drift.hours : h.hours)
    const holdOk = holdH >= igs.strengthHoldH - 1e-6
    rows.push(['مدت نگهداری', `${f(holdH, 1)} از ${f(igs.strengthHoldH, 0)} ساعت`],
      ['خط ' + f(igs.pvOffsetPct, 1) + '٪ Offset', pv ? `${f(pv.offsetM3, 3)} m³؛ بیشترین فاصله از خط راست ${f(pv.maxOffsetM3, 3)} m³ — ${pv.crossed ? 'نمودار خط Offset را قطع کرده' : 'قطع نشده'}` : 'جدول فشار–حجم ثبت نشده'],
      ['تغییر شیب نمودار', pv ? `${f(pv.slopeRatio, 2)} برابر (حداکثر ${f(igs.slopeChangeMax, 0)}) — ${okFa(pv.slopeOk)}` : '—'])
    if (holdRows.length) rows.push(['آزمون ۴ ساعته', `بیشترین تغییر ${f(drift.maxDriftPsi, 1)} psi · آب تزریقی ${f(drift.injectedM3, 3)} و تخلیه‌شده ${f(drift.bledM3, 3)} m³${drift.unadjusted ? ` · ${f(drift.unadjusted, 0)} قرائت با تغییر بیش از ${f(igs.holdAdjustBar, 0)} بار بدون جبران` : ''}`])
    const ok = holdOk && pressOk !== false && sound && (pv ? pv.pass : true) && drift.unadjusted === 0
    const fail = (pv != null && !pv.pass) || d.noRupture === 'no'
    return {
      rows, result: fail ? 'fail' : ok ? 'pass' : 'pending',
      why: fail ? (d.noRupture === 'no' ? 'پارگی یا نشتی در آزمون مقاومت ثبت شده است.' : pv!.crossed ? 'نمودار فشار–حجم خط ۰٫۲٪ Offset را قطع کرده است؛ افزایش فشار باید متوقف و علت بررسی شود.' : `شیب نمودار فشار–حجم بیش از ${f(igs.slopeChangeMax, 0)} برابر تغییر کرده است؛ افزایش فشار باید متوقف شود.`)
        : ok ? 'آزمایش مقاومت انجام و نتیجهٔ آن مورد تأیید است.'
        : !holdOk ? `نگهداری فشار باید دست‌کم ${f(igs.strengthHoldH, 0)} ساعت باشد.` : drift.unadjusted ? `تغییر فشار بیش از ${f(igs.holdAdjustBar, 0)} بار باید با تزریق یا تخلیهٔ آب جبران و حجم آن ثبت شود.` : pressOk === false ? 'فشار ثبت‌شده کمتر از فشار لازم در کابین است.' : 'نبود پارگی و نشتی را تأیید کنید.',
    }
  }
  if (kind === 'leak') {
    const log = leakLog(d, c.readings)
    const first = log[0], last = log[log.length - 1]
    const p1 = num(d.p1) ?? (first ? num(first.psi) : null), p2 = num(d.p2) ?? (last ? num(last.psi) : null)
    const t1 = num(d.t1) ?? (first ? tmOf(first) : null), t2 = num(d.t2) ?? (last ? tmOf(last) : null)
    const stabDays = stabilizationDaysOf(c.odIn, igs)
    const stab = holdFigures(phaseReadings(c.readings, 'stabilization').map((r) => ({ at: r.at, psi: psi(r), tempC: r.tempC })))
    const holdH = num(d.holdH) ?? (log.length >= 2 ? (Date.parse(last.at) - Date.parse(first.at)) / 3600000 : 0)
    const ext = num(d.ext) ?? 0
    const rows: [string, string][] = [
      ['فشار آزمون نشتی (نقطهٔ پایین / کابین)', `${f(pr.leak.low, 1)} / ${f(pr.leak.head, 1)} psi`], ['حداقل فشار نقطهٔ بالا', `${f(pr.leakMin, 1)} psi`],
      ['دورهٔ یکنواختی', `${f(stab.hours / 24, 1)} از ${f(stabDays, 0)} روز · بیشترین فاصلهٔ ثبت ${f(stab.maxGapH, 1)} ساعت`],
      ['مدت آزمون نشتی', `${f(holdH, 1)} از ${f(igs.leakHoldH, 0)} ساعت${ext ? ` · ${f(ext, 0)} بار تمدید` : ''}`],
    ]
    if (p1 == null || p2 == null || t1 == null || t2 == null) return { rows, result: 'pending', why: 'جدول ثبت ارقام (فرم ۵-۳) یا فشار و دمای شروع و پایان آزمون را وارد کنید.' }
    rows.push(['T₁ / T₂ (میانگین دمای لوله)', `${f(t1, 3)} / ${f(t2, 3)} °C`], ['P₁ / P₂', `${f(p1, 1)} / ${f(p2, 1)} psi`])
    if (Math.min(t1, t2) < igs.minPipeTempC) rows.push(['هشدار', `دمای خط کمتر از ${f(igs.minPipeTempC, 0)} درجه است (توصیهٔ دستورالعمل)`])
    const durOk = holdH >= igs.leakHoldH - 1e-6, stabOk = stab.hours >= stabDays * 24 - 1e-6 || bool(d.stabWaived)
    // the verdict is made at the end of the test period: until then the test simply continues
    const tail = (good: boolean, extendIn: boolean, badIn: boolean, failWhy: string): Computed => {
      const extend = extendIn && durOk, bad = badIn && durOk
      const pass = good && durOk && stabOk
      return { rows, extend, result: bad ? 'fail' : pass ? 'pass' : 'pending',
        why: bad ? failWhy : extend ? `آزمون باید ${f(igs.leakHoldH, 0)} ساعت دیگر تمدید شود (بند ۲-۱۲) و پس از تمدید دوباره ارزیابی گردد.` : pass ? 'نتیجهٔ آزمایش نشتی قابل قبول است.'
          : !stabOk ? `دورهٔ یکنواختی باید دست‌کم ${f(stabDays, 0)} روز باشد (یا یکنواختی زودتر دما نشان داده و ثبت شود).` : `آزمون نشتی باید ${f(igs.leakHoldH, 0)} ساعت ادامه یابد.` }
    }
    if (c.odIn <= igs.leakBigDiaIn) {
      const F = num(d.F), dFF = num(d.dFF)
      if (F == null || dFF == null) return { rows, result: 'pending', why: 'ضرایب F و ΔF/F را از منحنی پیوست دستورالعمل (بر اساس قطر لوله) وارد کنید.' }
      const mg = num(d.muGamma), xo = num(d.x)
      const r = leakTestSmall({ p1, p2, t1, t2, odIn: c.odIn, teIn: mix.tEqIn, F, dFF, muGamma: mg != null ? mg * 1e-6 : null, xOverride: xo != null ? xo * 1e-6 : null }, igs)
      rows.push(['(μ − γ) اختلاف ضرایب ازدیاد حجم آب و فولاد', `${f(r.muGamma * 1e6, 2)} ×۱۰⁻⁶ /°C${mg != null ? ' (واردشده)' : ''}`], ['ضریب فشردگی آب X', `${f(r.x * 1e6, 2)} ×۱۰⁻⁶ kg/cm²${xo != null ? ' (واردشده)' : ''}`],
        ['ضریب محاسبات K', `${f(r.K, 3)} psi/°C`], ['F / ΔF÷F', `${f(F, 3)} / ${f(dFF, 3)}`], ['افت فشار تئوریک ΔP₀ = K·F·(T₁−T₂)', `${f(r.dpthPsi, 2)} psi`],
        ['دامنهٔ خطا H', `${f(r.H, 2)} psi`], ['ΔP = (P₁ − P₂) − ΔP₀', `${f(r.dpPsi, 2)} psi`], ['نتیجهٔ محاسبه', r.verdict === 'pass' ? 'ΔP ≤ H — قابل قبول' : r.verdict === 'extend' ? 'ΔP > H — تمدید' : 'ΔP ≫ H — مردود'])
      const extendNow = r.verdict === 'extend' && ext < 1
      return tail(r.verdict === 'pass', extendNow, r.verdict === 'fail' || (r.verdict === 'extend' && ext >= 1), 'افت فشار با تغییر دما توجیه نمی‌شود (ΔP ≫ H یا پس از تمدید همچنان بیش از H)؛ آزمایش نشتی مردود است و نشتی باید ردیابی شود.')
    }
    const dov = num(d.delta)
    const r = leakTest({ p1, p2, t1, t2, odIn: c.odIn, tIn: mix.tEqIn, deltaOverride: dov != null ? dov * 1e-6 : null }, igs)
    rows.push(['δ ضریب انبساط حجمی آب', `${f(r.delta * 1e6, 1)} ×۱۰⁻⁶ /°C${dov != null ? ' (واردشده)' : ''}`], ['B مدول بالک آب', `${f(r.bulkBar, 0)} bar`],
      ['ΔT = T₁ − T₂', `${f(r.dT, 3)} °C`], ['ΔP واقعی = P₁ − P₂', `${f(r.actualLossPsi, 2)} psi`], ['ΔP محاسبه‌ای (اثر تغییر دما)', `${f(r.theorLossPsi, 2)} psi`],
      ['شرط ۱: ΔP واقعی ≤ ΔP محاسبه‌ای', okFa(r.cond1)], [`شرط ۲: ΔP واقعی ≤ ${f(igs.leakMaxPsi, 1)} psi`, okFa(r.cond2)])
    return tail(r.pass, !r.pass && ext < 1, !r.pass && ext >= 1, 'شرایط قبولی پس از تمدید ۲۴ ساعته هم برقرار نشد؛ افت فشار با تغییر دما توجیه نمی‌شود و نشتی باید ردیابی شود.')
  }
  // drying
  const water = d.waterAhead as string | undefined, dust = d.dust as string | undefined
  const dew = num(d.dewC), amb = num(d.ambDewC)
  const diff = dew != null && amb != null ? dew - amb : null
  const dewOk = diff == null ? null : diff <= igs.dewPointDiffC + 1e-9
  const rows: [string, string][] = [['آب جلوی آخرین پیگ', water === 'no' ? 'دیده نشد' : water === 'yes' ? 'دیده شد' : '—'],
    ['نقطهٔ شبنم هوای خروجی / هوای محیط', `${dew == null ? '—' : `${f(dew, 1)} °C`} / ${amb == null ? '—' : `${f(amb, 1)} °C`}`],
    ['اختلاف نقطهٔ شبنم', diff == null ? '—' : `${f(diff, 1)} °C (حداکثر ${f(igs.dewPointDiffC, 0)}) — ${okFa(dewOk)}`],
    ['گرد و زنگ در هوای خروجی', dust === 'no' ? 'ندارد' : dust === 'yes' ? 'دارد' : '—']]
  const fail = water === 'yes' || dust === 'yes' || dewOk === false
  const pass = water === 'no' && dust === 'no' && dewOk === true
  return { rows, result: fail ? 'fail' : pass ? 'pass' : 'pending', why: fail ? 'خشک‌کردن کامل نیست؛ پیگ‌رانی با هوای گرم (و در صورت لزوم متانول) تا برقراری شرایط ادامه یابد.' : pass ? 'جلوی آخرین پیگ آبی دیده نشد و نقطهٔ شبنم هوای خروجی در حد مجاز است؛ دو سر قطعه بلافاصله مسدود شود.' : 'نتایج دریافت پیگ و نقطهٔ شبنم هوای خروجی و محیط را ثبت کنید.' }
}
