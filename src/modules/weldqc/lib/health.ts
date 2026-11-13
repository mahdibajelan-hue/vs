import type { Code } from './api1104'

/**
 * Joint Health Index (شاخص سلامت سرجوش) — how much confidence a weld earns, 0–100, built only from recorded facts and
 * shown with every deduction so it can be defended line by line:
 *
 *   weld (70 %)                                              coating (30 %)
 *   ─ repair rounds: −20 first, −15 second                    ─ coating rejected / failed test: −30
 *   ─ crack ever found (even repaired): −10                   ─ each coating repair: −15
 *   ─ indications left in the accepted film: up to −10        ─ holidays found: −10 · adhesion failed: −20
 *     (each uses part of its acceptance margin)               ─ applicator's failure rate above the project's: up to −10
 *   ─ VT rejected: −5 each                                    ─ no random test passed on this joint: no deduction
 *   ─ welders' repair rate above the project's: up to −10
 *     (Bayesian-smoothed, so one weld does not condemn a welder)
 *   ─ a welder without a valid qualification on the weld date: −10
 *
 * A weld never radiographed or still open is «provisional»; a cut-out weld scores 0 (it left the line). A weld that
 * passed first time, with a clean film, an average-or-better crew and an accepted coating scores 100.
 */

export const W = { repair1: 20, repair2: 15, crack: 10, residualMax: 10, vt: 5, welderMax: 10, qual: 10, coatFail: 30, coatRepair: 15, holiday: 10, adhesion: 20, applicatorMax: 10, weldShare: 0.7 }

export interface Item { label: string; points: number; why: string }
export interface Health {
  score: number | null
  grade: 'excellent' | 'good' | 'fair' | 'poor' | 'na'
  provisional: boolean
  weld: { score: number | null; items: Item[] }
  coating: { score: number | null; items: Item[] }
  notes: string[]
}
export const GRADE_FA: Record<Health['grade'], string> = { excellent: 'عالی', good: 'خوب', fair: 'قابل قبول با پایش', poor: 'ضعیف', na: 'نامعلوم' }
export const GRADE_COLOR: Record<Health['grade'], string> = { excellent: '#22c55e', good: '#84cc16', fair: '#f59e0b', poor: '#ef4444', na: '#64748b' }
export const gradeOf = (s: number | null): Health['grade'] => (s == null ? 'na' : s >= 90 ? 'excellent' : s >= 75 ? 'good' : s >= 60 ? 'fair' : 'poor')

export interface HealthIn {
  radiographed: boolean
  closed: boolean
  finalStatus: 'accept' | 'cut_out' | null
  repairs: number
  crackEver: boolean
  /** indications of the final accepted round with the single-length limit that applied to each */
  residual: { code: Code; lengthMm: number; limitMm: number }[]
  vtRejects: number
  /** the weld's welders: smoothed repair rate (0–1) and qualification on the weld date */
  welders: { key: string; rate: number | null; qual: 'valid' | 'expired' | 'none' }[]
  projectRate: number
  coating: null | { failed: boolean; repairs: number; holidays: boolean; adhesionFail: boolean; applicatorRate: number | null; projectCoatRate: number; randomPassed: boolean }
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const r1 = (x: number) => Math.round(x * 10) / 10
const pc = (x: number) => `${(Math.round(x * 1000) / 10).toLocaleString('fa-IR')}٪`

export function jointHealth(x: HealthIn): Health {
  const notes: string[] = []
  const weldItems: Item[] = []
  let weld: number | null = 100
  if (x.closed && x.finalStatus === 'cut_out') return { score: 0, grade: 'poor', provisional: false, weld: { score: 0, items: [{ label: 'برش', points: -100, why: 'سرجوش برش خورد و از خط خارج شد؛ سرجوش جایگزین پروندهٔ خودش را دارد.' }] }, coating: { score: null, items: [] }, notes }
  if (!x.radiographed) { notes.push('هنوز رادیوگرافی و ارزیابی نشده؛ امتیاز موقت است.') }
  if (x.repairs >= 1) weldItems.push({ label: 'تعمیر اول', points: -W.repair1, why: 'اولین رادیوگرافی «نیاز به تعمیر» بود.' })
  if (x.repairs >= 2) weldItems.push({ label: 'تعمیر دوم', points: -W.repair2, why: 'یک تعمیر کافی نبود و تعمیر دوم لازم شد.' })
  if (x.crackEver) weldItems.push({ label: 'سابقهٔ ترک', points: -W.crack, why: 'در یکی از راندها ترک گزارش شده است؛ حتی پس از تعمیر، ریسک باقی‌ماندهٔ تنش وجود دارد.' })
  if (x.residual.length) {
    const used = x.residual.reduce((s, d) => s + (d.limitMm > 0 ? d.lengthMm / d.limitMm : 0), 0)
    const p = r1(clamp(used * 5, 0, W.residualMax))
    if (p > 0) weldItems.push({ label: 'نشانه‌های پذیرفته‌شده', points: -p, why: `${x.residual.length.toLocaleString('fa-IR')} نشانهٔ قابل قبول در فیلم نهایی مانده که ${pc(used)} از حد مجاز تکی را مصرف کرده‌اند.` })
  }
  if (x.vtRejects) weldItems.push({ label: 'رد در بازرسی چشمی', points: -W.vt * x.vtRejects, why: `${x.vtRejects.toLocaleString('fa-IR')} بار VT رد شده است.` })
  const rated = x.welders.filter((w) => w.rate != null)
  if (rated.length) {
    const avg = rated.reduce((s, w) => s + (w.rate as number), 0) / rated.length
    const excess = avg - x.projectRate
    if (excess > 0) { const p = r1(clamp(excess * 50, 0, W.welderMax)); if (p >= 0.5) weldItems.push({ label: 'سابقهٔ جوشکاران', points: -p, why: `میانگین نرخ تعمیر جوشکاران این سرجوش ${pc(avg)} و بالاتر از میانگین پروژه (${pc(x.projectRate)}) است.` }) }
  }
  const unq = x.welders.filter((w) => w.qual === 'expired')
  if (unq.length) weldItems.push({ label: 'صلاحیت جوشکار', points: -W.qual, why: `گواهی صلاحیت ${unq.map((w) => w.key).join('، ')} در تاریخ جوشکاری معتبر نبود.` })
  if (x.welders.some((w) => w.qual === 'none')) notes.push('برای برخی جوشکاران گواهی صلاحیتی در فهرست جوشکاران ثبت نشده است.')
  if (!x.welders.length) notes.push('جوشکاران این سرجوش در گزارش جوشکاری ثبت نشده‌اند.')
  weld = clamp(100 + weldItems.reduce((s, i) => s + i.points, 0), 0, 100)

  const coatItems: Item[] = []
  let coat: number | null = null
  if (x.coating) {
    const c = x.coating
    if (c.failed) coatItems.push({ label: 'پوشش رد شده', points: -W.coatFail, why: 'بازرسی پوشش سرجوش یا آزمون آن مردود شده است.' })
    if (c.repairs) coatItems.push({ label: 'تعمیر پوشش', points: -W.coatRepair * c.repairs, why: `${c.repairs.toLocaleString('fa-IR')} بار پوشش تعمیر شده است.` })
    if (c.holidays) coatItems.push({ label: 'منفذ (Holiday)', points: -W.holiday, why: 'در آزمون منفذیابی منفذ دیده شده است.' })
    if (c.adhesionFail) coatItems.push({ label: 'چسبندگی', points: -W.adhesion, why: 'آزمون چسبندگی (Peel) مردود شده است.' })
    if (c.applicatorRate != null && c.applicatorRate > c.projectCoatRate) { const p = r1(clamp((c.applicatorRate - c.projectCoatRate) * 50, 0, W.applicatorMax)); if (p >= 0.5) coatItems.push({ label: 'سابقهٔ پوشش‌کار', points: -p, why: `نرخ رد کار پوشش‌کار ${pc(c.applicatorRate)} و بالاتر از میانگین پروژه (${pc(c.projectCoatRate)}) است.` }) }
    if (c.randomPassed) notes.push('آزمون تصادفی پوشش این سرجوش قبول شده است.')
    coat = clamp(100 + coatItems.reduce((s, i) => s + i.points, 0), 0, 100)
  } else notes.push('اطلاعات پوشش سرجوش هنوز ثبت نشده؛ امتیاز فقط از جوش است.')

  const score = Math.round(coat == null ? weld : W.weldShare * weld + (1 - W.weldShare) * coat)
  return { score, grade: gradeOf(score), provisional: !x.radiographed || !x.closed, weld: { score: Math.round(weld), items: weldItems }, coating: { score: coat == null ? null : Math.round(coat), items: coatItems }, notes }
}

/** a rate smoothed toward the project's, so a person with few welds is not judged on one result (k = prior weight) */
export const smoothed = (bad: number, n: number, prior: number, k = 10) => (bad + k * prior) / (n + k)

/**
 * Welder quality score (0–100) for the performance card:
 *   first-pass yield (smoothed toward the project's) − 2 × cut-out % − 0.5 × severe indications per 100 welds
 * severe = cracks, burn-through, root penetration / fusion faults (C, BT, IP, IF, HB).
 */
export function welderScore(a: { evaluated: number; firstOk: number; cutOuts: number; severe: number; projectFpy: number }): number | null {
  if (!a.evaluated) return null
  const fpy = (a.firstOk + 5 * a.projectFpy) / (a.evaluated + 5)
  const s = 100 * fpy - 2 * (100 * a.cutOuts / a.evaluated) - 0.5 * (100 * a.severe / a.evaluated)
  return Math.round(clamp(s, 0, 100))
}
