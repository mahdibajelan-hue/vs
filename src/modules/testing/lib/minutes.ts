import { airTest, holdFigures, leakTest, pvOffset, PSI_PER_BAR, type IgsParams, type MixFigures, type SectionPressures } from './igs'
import type { FormKind, HtForm, HtReading } from '../repo'

/**
 * The test minutes (صورتجلسه‌ها) of one section — what each records, what is computed from it and the verdict, so the
 * screen and the printout read the same numbers. Pure.
 */
export const FORM_ORDER: FormKind[] = ['permit', 'gauge', 'air', 'strength', 'leak', 'drying']
export const FORM_FA: Record<FormKind, string> = {
  permit: 'مجوز شروع آزمون (یکپارچگی خط و گردهٔ خاکی)', gauge: 'ارسال صفحهٔ اندازه', air: 'آزمایش عدم وجود هوا',
  strength: 'آزمایش مقاومت', leak: 'آزمایش عدم نشتی', drying: 'تخلیه و خشک‌کردن (پیگ خشک‌کن)',
}
export const PERMIT_ITEMS = ['جوشکاری', 'رادیوگرافی و تعمیرات', 'عایقکاری سرجوش‌ها و آزمون هالیدی', 'لوله‌گذاری', 'خاکریزی', 'تکمیل ارتفاع گردهٔ خاکی روی مسیر']

export type FormData = Record<string, unknown>
const num = (v: unknown): number | null => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))
const bool = (v: unknown) => v === true

export interface Ctx { igs: IgsParams; mix: MixFigures; pr: SectionPressures; odIn: number; readings: HtReading[] }
export interface Computed { rows: [string, string][]; result: HtForm['result']; why: string }
const f = (v: number, d = 2) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const psi = (r: HtReading) => r.pressureBar * PSI_PER_BAR

/** readings of a phase, oldest first, preferring the test head when it was read there */
export function phaseReadings(rs: HtReading[], phase: string) {
  const all = rs.filter((r) => r.phase === phase).sort((a, b) => a.at.localeCompare(b.at))
  const head = all.filter((r) => r.location === 'head')
  return head.length >= 2 ? head : all
}

/** the computed lines and the verdict of one minute */
export function computeForm(kind: FormKind, d: FormData, c: Ctx): Computed {
  const { igs, mix, pr } = c
  if (kind === 'permit') {
    const done = PERMIT_ITEMS.filter((_, i) => bool(d[`c${i}`]))
    const ok = done.length === PERMIT_ITEMS.length
    return { rows: [['موارد تأییدشده', `${f(done.length, 0)} از ${f(PERMIT_ITEMS.length, 0)}`]], result: ok ? 'pass' : 'pending', why: ok ? 'قطعه آمادهٔ انجام آزمایشات هیدرواستاتیک است.' : 'همهٔ موارد اجرایی باید تأیید شوند.' }
  }
  if (kind === 'gauge') {
    const st = d.condition as string | undefined
    return {
      rows: [['قطر صفحه (٪ قطر داخلی ضخیم‌ترین لوله)', `${f(mix.gaugePlateMm, 2)} mm`], ['ضخامت و جنس', `${f(igs.gaugePlateMm, 0)} mm — فولاد`]],
      result: st === 'ok' ? 'pass' : st === 'damaged' ? 'fail' : 'pending',
      why: st === 'ok' ? 'صفحهٔ اندازه سالم دریافت شد و نتیجهٔ آزمون ارسال صفحه قابل قبول است.' : st === 'damaged' ? 'صفحهٔ اندازه آسیب‌دیده دریافت شد؛ محل فرورفتگی یا تغییر شکل باید یافته و رفع شود.' : 'وضعیت صفحهٔ دریافتی ثبت نشده است.',
    }
  }
  if (kind === 'air') {
    const dp = num(d.dpPsi), dv = num(d.dvActual), manual = num(d.dvTheorManual)
    const k = num(d.bulkBar) ?? igs.bulkBar
    if (dp == null) return { rows: [], result: 'pending', why: 'افزایش فشار (ΔP) را وارد کنید.' }
    const a = airTest({ volumeM3: mix.volumeM3, dpPsi: dp, dvActualM3: dv, odIn: c.odIn, tIn: mix.tEqIn }, { ...igs, bulkBar: k })
    const theor = manual ?? a.theorM3
    const ratio = dv != null && theor > 0 ? dv / theor : null
    const pass = ratio == null ? null : ratio <= igs.airRatioMax + 1e-9
    return {
      rows: [
        ['حجم قطعه (V)', `${f(mix.volumeM3, 1)} m³`], ['ضخامت معادل (t)', `${f(mix.tEqIn, 4)}″`], ['مدول حجمی آب (K)', `${f(k, 0)} bar`],
        ['ΔV محاسبه‌ای', `${f(theor, 3)} m³${manual != null ? ' (واردشده)' : ''}`], ['ΔV واقعی', dv == null ? '—' : `${f(dv, 3)} m³`],
        ['نسبت ΔV واقعی ÷ ΔV محاسبه‌ای', ratio == null ? '—' : `${f(ratio, 4)} (حد ${f(igs.airRatioMax, 2)})`],
      ],
      result: pass == null ? 'pending' : pass ? 'pass' : 'fail',
      why: pass == null ? 'حجم آب تزریق‌شده (ΔV واقعی) را وارد کنید.' : pass ? 'نتیجهٔ آزمایش عدم وجود هوا قابل قبول است.' : 'هوای محبوس در خط بیش از حد مجاز است؛ هواگیری و تکرار آزمون لازم است.',
    }
  }
  if (kind === 'strength') {
    const rs = phaseReadings(c.readings, 'strength')
    const h = holdFigures(rs.map((r) => ({ at: r.at, psi: psi(r), tempC: r.tempC })))
    const pv = pvOffset(c.readings.filter((r) => r.phase === 'strength' && r.volumeM3 != null).map((r) => ({ p: psi(r), v: r.volumeM3! })), mix.volumeM3, igs)
    const finalP = num(d.finalPsi) ?? h.last?.psi ?? null
    const holdH = num(d.holdH) ?? h.hours
    const sound = d.noRupture === 'yes'
    const holdOk = holdH >= igs.strengthHoldH - 1e-6
    const pressOk = finalP == null ? null : finalP >= pr.strength.head - 5 // the gauge reads the head; ±5 psi of instrument reading
    const ok = holdOk && pressOk !== false && sound && (pv ? pv.pass : true)
    const fail = (pv != null && !pv.pass) || d.noRupture === 'no'
    return {
      rows: [
        ['فشار لازم در کابین (سر آزمون)', `${f(pr.strength.head, 1)} psi`], ['فشار نقطهٔ پایین / بالا', `${f(pr.strength.low, 1)} / ${f(pr.strength.high, 1)} psi`],
        ['فشار نهایی ثبت‌شده', finalP == null ? '—' : `${f(finalP, 1)} psi`], ['مدت نگهداری', `${f(holdH, 1)} از ${f(igs.strengthHoldH, 0)} ساعت`],
        ['انحراف P–V از خط راست', pv ? `${f(pv.maxOffsetM3, 3)} m³ = ${f(pv.maxOffsetPct, 3)}٪ حجم (حد ${f(igs.pvOffsetPct, 2)}٪)` : 'جدول فشار–حجم ثبت نشده'],
      ],
      result: fail ? 'fail' : ok ? 'pass' : 'pending',
      why: fail ? (d.noRupture === 'no' ? 'پارگی یا نشتی در آزمون مقاومت ثبت شده است.' : 'انحراف نمودار فشار–حجم از خط راست بیش از حد مجاز است (احتمال تسلیم لوله یا نشتی).') : ok ? 'آزمایش مقاومت انجام و نتیجهٔ آن مورد تأیید است.'
        : !holdOk ? `نگهداری فشار باید دست‌کم ${f(igs.strengthHoldH, 0)} ساعت باشد.` : pressOk === false ? 'فشار ثبت‌شده کمتر از فشار لازم در کابین است.' : 'نبود پارگی و نشتی را تأیید کنید.',
    }
  }
  if (kind === 'leak') {
    const rs = phaseReadings(c.readings, 'leak')
    const first = rs[0], last = rs[rs.length - 1]
    const p1 = num(d.p1) ?? (first ? psi(first) : null), p2 = num(d.p2) ?? (last ? psi(last) : null)
    const t1 = num(d.t1) ?? first?.tempC ?? null, t2 = num(d.t2) ?? last?.tempC ?? null
    const stab = holdFigures(phaseReadings(c.readings, 'stabilization').map((r) => ({ at: r.at, psi: psi(r), tempC: r.tempC })))
    const lk = holdFigures(rs.map((r) => ({ at: r.at, psi: psi(r), tempC: r.tempC })))
    const holdH = num(d.holdH) ?? lk.hours
    const rows: [string, string][] = [
      ['فشار آزمون نشتی (نقطهٔ پایین / کابین)', `${f(pr.leak.low, 1)} / ${f(pr.leak.head, 1)} psi`], ['حداقل فشار', `${f(pr.leakMin, 1)} psi`],
      ['دورهٔ یکنواختی', `${f(stab.hours / 24, 1)} از ${f(igs.stabilizationDays, 0)} روز · بیشترین فاصلهٔ ثبت ${f(stab.maxGapH, 1)} ساعت`],
      ['مدت آزمون نشتی', `${f(holdH, 1)} از ${f(igs.leakHoldH, 0)} ساعت`],
    ]
    if (p1 == null || p2 == null || t1 == null || t2 == null) return { rows, result: 'pending', why: 'فشار و دمای شروع و پایان آزمون را وارد کنید.' }
    const r = leakTest({ p1, p2, t1, t2, odIn: c.odIn, tIn: mix.tEqIn }, igs)
    rows.push(['P₁ / P₂', `${f(p1, 1)} / ${f(p2, 1)} psi`], ['ΔT', `${f(r.dT, 3)} °C`], ['ΔP واقعی (افت = P₁ − P₂)', `${f(r.actualLossPsi, 2)} psi`],
      ['ΔP محاسبه‌ای (افت ناشی از تغییر دما)', `${f(r.theorLossPsi, 2)} psi`],
      ['شرط ۱: ΔP واقعی ≤ ΔP محاسبه‌ای', r.cond1 ? 'برقرار' : 'برقرار نیست'],
      ['شرط ۲: ΔP واقعی ≤ ' + f(igs.leakMaxPsi, 1) + ' psi', r.cond2 == null ? `لازم نیست (قطر ≤ ${f(igs.leakBigDiaIn, 0)}″)` : r.cond2 ? 'برقرار' : 'برقرار نیست'])
    const durOk = holdH >= igs.leakHoldH - 1e-6, stabOk = stab.hours >= igs.stabilizationDays * 24 - 1e-6 || bool(d.stabWaived)
    const pass = r.pass && durOk && stabOk
    return {
      rows, result: !r.pass ? 'fail' : pass ? 'pass' : 'pending',
      why: !r.pass ? 'افت فشار با تغییر دما توجیه نمی‌شود؛ نشتی محتمل است و باید ردیابی شود.' : pass ? 'نتیجهٔ آزمایش نشتی قابل قبول است.'
        : !stabOk ? `دورهٔ یکنواختی باید دست‌کم ${f(igs.stabilizationDays, 0)} روز باشد (یا با نظر نمایندهٔ کارفرما کوتاه‌تر ثبت شود).` : `آزمون نشتی باید ${f(igs.leakHoldH, 0)} ساعت ادامه یابد.`,
    }
  }
  // drying
  const water = d.waterAhead as string | undefined, dust = d.dust as string | undefined
  const dew = num(d.dewC), amb = num(d.ambientC)
  const dewOk = dew == null ? null : igs.dewPointMaxC != null ? dew <= igs.dewPointMaxC : amb != null ? dew < amb : null
  const rows: [string, string][] = [['آب جلوی آخرین پیگ', water === 'no' ? 'دیده نشد' : water === 'yes' ? 'دیده شد' : '—'], ['نقطهٔ شبنم / دمای محیط', `${dew == null ? '—' : `${f(dew, 1)} °C`} / ${amb == null ? '—' : `${f(amb, 1)} °C`}`], ['گرد و زنگ در هوای خروجی', dust === 'no' ? 'ندارد' : dust === 'yes' ? 'دارد' : '—']]
  const fail = water === 'yes' || dust === 'yes' || dewOk === false
  const pass = water === 'no' && dust === 'no' && dewOk !== false
  return { rows, result: fail ? 'fail' : pass ? 'pass' : 'pending', why: fail ? 'خشک‌کردن کامل نیست؛ پیگ‌رانی و دمش هوای خشک تکرار شود.' : pass ? 'پس از دریافت توپک جلوی آن آبی دیده نشد و قطعه از نظر رطوبت در حد قابل قبول است.' : 'نتایج دریافت پیگ را ثبت کنید.' }
}
