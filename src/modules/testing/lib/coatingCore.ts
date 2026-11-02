/**
 * Coating inspection by the project's coating procedure (IGS, chapter «پوشش»): the holiday-test voltage of the mainline
 * coating (Table 1) and of the field-joint systems (Table 4), the field-joint thickness (Table 3), adhesion (Tables 5–6),
 * surface preparation and ambient conditions, and the electrical (current-density) test of the buried coating after the
 * hydrotest (Tables 7–8, forms 6-1-6 and 6-2). Pure.
 */

// ── holiday-test voltage: kV = perMm × t + plus, capped ─────────────────────
export interface HolidayRule { perMm: number; plus: number; maxKv: number | null }
export const holidayKv = (r: HolidayRule, tMm: number) => { const v = r.perMm * tMm + r.plus; return r.maxKv != null ? Math.min(r.maxKv, v) : v }

/** the mainline (factory) coatings — Table 1, and their current-density family for Table 8 */
export type MainCoating = '3lpe' | 'fbe' | 'mod_bitumen' | 'bitumen' | 'coal_tar' | 'cold_tape' | 'epoxy_pu'
export const MAIN_COATINGS: Record<MainCoating, { label: string; holiday: HolidayRule | null; maxIsUa: number; maxDrainOffV: number; maxDrainOnV: number }> = {
  '3lpe': { label: 'پلی‌اتیلن سه‌لایه (3LPE)', holiday: { perMm: 5, plus: 5, maxKv: 25 }, maxIsUa: 3, maxDrainOffV: -1.1, maxDrainOnV: -1.2 },
  fbe: { label: 'اپوکسی پودری (FBE)', holiday: { perMm: 5, plus: 0, maxKv: 20 }, maxIsUa: 10, maxDrainOffV: -1.1, maxDrainOnV: -1.5 },
  mod_bitumen: { label: 'قیر پایهٔ نفتی اصلاح‌شده', holiday: { perMm: 5, plus: 0, maxKv: 20 }, maxIsUa: 15, maxDrainOffV: -1.2, maxDrainOnV: -1.5 },
  bitumen: { label: 'قیر پایهٔ نفتی', holiday: { perMm: 4, plus: 0, maxKv: 25 }, maxIsUa: 40, maxDrainOffV: -1.2, maxDrainOnV: -2.1 },
  coal_tar: { label: 'قطران ذغال‌سنگی', holiday: null, maxIsUa: 40, maxDrainOffV: -1.2, maxDrainOnV: -2.1 },
  cold_tape: { label: 'نوار پلاستیکی سرد', holiday: null, maxIsUa: 20, maxDrainOffV: -1.2, maxDrainOnV: -1.5 },
  epoxy_pu: { label: 'اپوکسی / پلی‌یورتان مایع', holiday: null, maxIsUa: 10, maxDrainOffV: -1.1, maxDrainOnV: -1.5 },
}

// ── field-joint systems — Tables 3, 4, 5, 6 ─────────────────────────────────
export type Cleanliness = 'Sa3' | 'Sa2.5' | 'St3'
export type JointSystem = 'hss80' | 'hss60' | 'hss_mastic' | 'mod_bitumen_tape' | 'tape3ply' | 'bitumen_tape' | 'butyl_tape' | 'fbe' | 'epoxy' | 'pu' | 'petrolatum'
export interface PeelReq { k: string; label: string; min: number }
export interface JointSpec {
  label: string; group: 'sleeve' | 'tape' | 'liquid' | 'fbe' | 'petrolatum'
  /** least thickness, mm (for tapes: the inner layer the holiday test is made on) and its description */
  minMm: number; thickness: string
  holiday: HolidayRule; holidayNote?: string
  peel: PeelReq[]; pullOffMpa: number | null
  cleanliness: Cleanliness; dustMax: number
}
const tapePeel = (steel: number, lap: number): PeelReq[] => [{ k: 'steel', label: 'به فولاد آستر‌خورده', min: steel }, { k: 'lap', label: 'در هم‌پوشانی', min: lap }, { k: 'backing', label: 'لایهٔ پشتی', min: 0.5 }]
export const JOINT_SYSTEMS: Record<JointSystem, JointSpec> = {
  hss80: { label: 'نوار جمع‌شوندهٔ حرارتی — چسب Hot melt (۸۰ °C)', group: 'sleeve', minMm: 2.9, thickness: '۲٫۹ mm', holiday: { perMm: 5, plus: 5, maxKv: 25 }, peel: [{ k: 'steel', label: 'به فولاد', min: 4 }], pullOffMpa: null, cleanliness: 'Sa2.5', dustMax: 2 },
  hss60: { label: 'نوار جمع‌شوندهٔ حرارتی — چسب Hot melt (۶۰ °C)', group: 'sleeve', minMm: 2.9, thickness: '۲٫۹ mm', holiday: { perMm: 5, plus: 5, maxKv: 25 }, peel: [{ k: 'steel', label: 'به فولاد', min: 4 }], pullOffMpa: null, cleanliness: 'Sa2.5', dustMax: 2 },
  hss_mastic: { label: 'نوار جمع‌شوندهٔ حرارتی — چسب ماستیک', group: 'sleeve', minMm: 2.5, thickness: '۲٫۵ mm', holiday: { perMm: 5, plus: 5, maxKv: 25 }, peel: [{ k: 'steel', label: 'به فولاد', min: 1.5 }], pullOffMpa: null, cleanliness: 'Sa2.5', dustMax: 2 },
  mod_bitumen_tape: { label: 'نوار قیری اصلاح‌شده', group: 'tape', minMm: 4, thickness: '۴٫۰ mm', holiday: { perMm: 5, plus: 0, maxKv: 20 }, peel: [{ k: 'steel', label: 'به فولاد', min: 7 }], pullOffMpa: null, cleanliness: 'Sa2.5', dustMax: 2 },
  tape3ply: { label: 'نوار سه‌لایه + نوار رویی', group: 'tape', minMm: 0.75, thickness: '(۰٫۸ ± ۰٫۰۵) + ۰٫۵ mm', holiday: { perMm: 5, plus: 5, maxKv: 15 }, holidayNote: 'پس از نوار داخلی و پیش از نوار رویی', peel: [{ k: 'steel', label: 'به فولاد آستر‌خورده', min: 1.2 }, { k: 'lap', label: 'نوار به نوار', min: 2.4 }, { k: 'backing', label: 'لایهٔ پشتی', min: 0.5 }], pullOffMpa: null, cleanliness: 'Sa2.5', dustMax: 2 },
  bitumen_tape: { label: 'نوار قیری دولایه + نوار رویی', group: 'tape', minMm: 1, thickness: '۱٫۰ + ۰٫۵ mm', holiday: { perMm: 5, plus: 5, maxKv: 15 }, holidayNote: 'پس از نوار داخلی و پیش از نوار رویی', peel: tapePeel(3, 2.5), pullOffMpa: null, cleanliness: 'Sa2.5', dustMax: 2 },
  butyl_tape: { label: 'نوار سرد بوتیلی + نوار رویی', group: 'tape', minMm: 0.89, thickness: '۰٫۸۹ + ۰٫۵ mm', holiday: { perMm: 5, plus: 5, maxKv: 15 }, holidayNote: 'پس از نوار داخلی و پیش از نوار رویی', peel: tapePeel(3, 1), pullOffMpa: null, cleanliness: 'Sa2.5', dustMax: 2 },
  fbe: { label: 'اپوکسی پودری (FBE)', group: 'fbe', minMm: 0.7, thickness: '۸۰۰ ± ۱۰۰ µm', holiday: { perMm: 5, plus: 0, maxKv: null }, peel: [], pullOffMpa: 10, cleanliness: 'Sa3', dustMax: 1 },
  epoxy: { label: 'اپوکسی مایع', group: 'liquid', minMm: 0.5, thickness: '۵۰۰ µm (دمای ≤ ۶۰ °C) — ۱۰۰۰ µm (دمای بالاتر، شرایط سخت یا قطر بیش از ۳۶″)', holiday: { perMm: 6, plus: 0, maxKv: 25 }, peel: [], pullOffMpa: 10, cleanliness: 'Sa2.5', dustMax: 2 },
  pu: { label: 'پلی‌یورتان مایع', group: 'liquid', minMm: 1, thickness: '۱۰۰۰ µm — ۱۵۰۰ µm (دمای بیش از ۶۰ °C، سرجوش یا قطر ۳۰″ و بیشتر)', holiday: { perMm: 5, plus: 0, maxKv: 25 }, peel: [], pullOffMpa: 10, cleanliness: 'Sa2.5', dustMax: 2 },
  petrolatum: { label: 'نوار پترولاتوم', group: 'petrolatum', minMm: 0.9, thickness: 'میانگین ۱٫۱ mm (± ۰٫۲)', holiday: { perMm: 5, plus: 5, maxKv: 15 }, peel: [{ k: 'steel', label: 'به فولاد', min: 0.5 }], pullOffMpa: null, cleanliness: 'Sa2.5', dustMax: 2 },
}
/** the least thickness of a liquid system depends on the service (Table 3) */
export function jointMinMm(s: JointSystem, x: { odIn: number; heavy?: boolean }) {
  if (s === 'epoxy') return x.heavy || x.odIn > 36 ? 1 : 0.5
  if (s === 'pu') return x.heavy || x.odIn >= 30 ? 1.5 : 1
  return JOINT_SYSTEMS[s].minMm
}
export const PROFILE_UM: Record<Cleanliness, [number, number]> = { Sa3: [60, 100], 'Sa2.5': [50, 100], St3: [25, 50] }
const CLEAN_RANK: Record<Cleanliness, number> = { Sa3: 3, 'Sa2.5': 2, St3: 1 }

export interface Check { k: string; label: string; req: string; value: string; ok: boolean | null }
export const verdictOf = (cs: Check[]): 'pass' | 'fail' | 'pending' => (cs.some((c) => c.ok === false) ? 'fail' : cs.every((c) => c.ok !== null) ? 'pass' : 'pending')
const n = (v: unknown): number | null => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))
const f = (v: number, d = 2) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const chk = (k: string, label: string, req: string, v: number | null, ok: (x: number) => boolean, unit = '', d = 2): Check => ({ k, label, req, value: v == null ? '—' : `${f(v, d)}${unit}`, ok: v == null ? null : ok(v) })

/** the field-joint record: what the procedure checks before, during and after coating one weld */
export interface JointInput {
  system: JointSystem; odIn: number; heavy?: boolean; repair?: boolean
  pipeTempC?: unknown; dewC?: unknown; rh?: unknown; delayH?: unknown
  cleanliness?: Cleanliness | ''; profileUm?: unknown; saltUg?: unknown; dust?: unknown
  preheatC?: unknown; induction?: boolean; overlapMm?: unknown
  thickness?: unknown[]; holidayKv?: unknown; holiday?: 'ok' | 'fail' | ''
  peel?: Record<string, unknown>; pullOff?: unknown
}
export function jointChecks(x: JointInput): { checks: Check[]; spec: JointSpec; kvReq: number; minMm: number; result: 'pass' | 'fail' | 'pending' } {
  const spec = JOINT_SYSTEMS[x.system]
  const minMm = jointMinMm(x.system, { odIn: x.odIn, heavy: x.heavy })
  const req: Cleanliness = x.repair ? 'St3' : spec.cleanliness
  const t = n(x.pipeTempC), dew = n(x.dewC), rh = n(x.rh), delay = n(x.delayH)
  const ths = (x.thickness ?? []).map(n).filter((v): v is number => v != null)
  const tMin = ths.length ? Math.min(...ths) : null
  const kvReq = holidayKv(spec.holiday, tMin ?? minMm)
  const kv = n(x.holidayKv)
  const cs: Check[] = [
    chk('pipeT', 'دمای سطح لوله', '> ۵ °C', t, (v) => v > 5, ' °C', 1),
    { k: 'dew', label: 'اختلاف دمای لوله با نقطهٔ شبنم', req: '≥ ۳ °C', value: t != null && dew != null ? `${f(t - dew, 1)} °C` : '—', ok: t != null && dew != null ? t - dew >= 3 - 1e-9 : null },
    chk('rh', 'رطوبت نسبی', '≤ ۸۵٪', rh, (v) => v <= 85, '٪', 0),
    { k: 'delay', label: 'فاصلهٔ آماده‌سازی تا پوشش', req: rh != null && rh >= 70 ? '≤ ۲ ساعت (RH ۷۰ تا ۸۵٪)' : '≤ ۴ ساعت (RH کمتر از ۷۰٪)', value: delay == null ? '—' : `${f(delay, 1)} ساعت`, ok: delay == null ? null : delay <= (rh != null && rh >= 70 ? 2 : 4) + 1e-9 },
    { k: 'clean', label: 'درجهٔ تمیزی سطح', req: req === 'Sa2.5' ? 'Sa 2½' : req, value: x.cleanliness ? (x.cleanliness === 'Sa2.5' ? 'Sa 2½' : x.cleanliness) : '—', ok: x.cleanliness ? CLEAN_RANK[x.cleanliness] >= CLEAN_RANK[req] : null },
    (() => { const [a, b] = PROFILE_UM[x.cleanliness || req]; return chk('profile', 'زبری سطح (پروفیل)', `${f(a, 0)} تا ${f(b, 0)} µm`, n(x.profileUm), (v) => v >= a && v <= b, ' µm', 0) })(),
    chk('salt', 'نمک‌های محلول', '≤ ۲ µg/cm²', n(x.saltUg), (v) => v <= 2, ' µg/cm²', 2),
    chk('dust', 'گرد و غبار (ISO 8502-3)', `کلاس ≤ ${f(spec.dustMax, 0)}`, n(x.dust), (v) => v <= spec.dustMax, '', 0),
    chk('overlap', 'هم‌پوشانی روی پوشش خط', '≥ ۵۰ mm', n(x.overlapMm), (v) => v >= 50, ' mm', 0),
  ]
  if (spec.group === 'sleeve') cs.push(chk('preheat', 'پیش‌گرم', '۴۵ تا ۷۰ °C', n(x.preheatC), (v) => v >= 45 && v <= 70, ' °C', 0))
  if (spec.group === 'fbe' || (spec.group === 'sleeve' && x.odIn >= 24)) cs.push({ k: 'induction', label: 'گرمایش القایی', req: 'الزامی', value: x.induction ? 'انجام شد' : '—', ok: x.induction ? true : null })
  cs.push(chk('thick', 'کمترین ضخامت اندازه‌گیری‌شده', `≥ ${f(minMm, 2)} mm (${spec.thickness})`, tMin, (v) => v >= minMm - 1e-9, ' mm', 2))
  cs.push(chk('kv', 'ولتاژ آزمون هالیدی به‌کاررفته', `≥ ${f(kvReq, 1)} kV${spec.holidayNote ? ` — ${spec.holidayNote}` : ''}`, kv, (v) => v >= kvReq - 0.05, ' kV', 1))
  cs.push({ k: 'holiday', label: 'نتیجهٔ آزمون هالیدی', req: 'بدون جرقه', value: x.holiday === 'ok' ? 'بدون عیب' : x.holiday === 'fail' ? 'عیب دارد' : '—', ok: x.holiday ? x.holiday === 'ok' : null })
  for (const p of spec.peel) cs.push(chk(`peel_${p.k}`, `چسبندگی Peel — ${p.label}`, `≥ ${f(p.min, 1)} N/mm`, n(x.peel?.[p.k]), (v) => v >= p.min - 1e-9, ' N/mm', 2))
  if (spec.pullOffMpa != null) cs.push(chk('pull', 'چسبندگی Pull-off', `≥ ${f(spec.pullOffMpa, 0)} MPa`, n(x.pullOff), (v) => v >= spec.pullOffMpa! - 1e-9, ' MPa', 1))
  return { checks: cs, spec, kvReq, minMm, result: verdictOf(cs) }
}

// ── electrical test of the coating (current density I/S) ───────────────────
export type CpCriterion = 'normal' | 'resistive' | 'srb'
export const CP_CRITERIA: Record<CpCriterion, { label: string; v: number }> = {
  normal: { label: 'معمول: −۰٫۸۵ V', v: -0.85 }, resistive: { label: 'خاک با مقاومت بیش از ۳۰٬۰۰۰ Ω·cm: −۰٫۷۵ V', v: -0.75 }, srb: { label: 'وجود باکتری SRB: −۰٫۹۵ V', v: -0.95 },
}
export interface PotentialRow { km: string; natural: string; on: string; off: string; ac: string; note?: string }
export interface ElecInput {
  coating: MainCoating; criterion?: CpCriterion
  pipes: { dIn: unknown; lengthM: unknown }[]
  currentA?: unknown; polarH?: unknown
  drainOn?: unknown; drainOff?: unknown; farOn?: unknown; farOff?: unknown
  potentials?: PotentialRow[]
}
export function electricalTest(x: ElecInput) {
  const c = MAIN_COATINGS[x.coating]
  const crit = CP_CRITERIA[x.criterion ?? 'normal']
  const areaM2 = x.pipes.reduce((s, p) => { const d = n(p.dIn), l = n(p.lengthM); return s + (d != null && l != null ? Math.PI * d * 0.0254 * l : 0) }, 0)
  const lengthM = x.pipes.reduce((s, p) => s + (n(p.lengthM) ?? 0), 0)
  const I = n(x.currentA)
  const isUa = I != null && areaM2 > 0 ? (I * 1e6) / areaM2 : null
  const pot = (x.potentials ?? []).filter((r) => n(r.off) != null)
  const unprotected = pot.filter((r) => n(r.off)! > crit.v + 1e-9)
  const checks: Check[] = [
    chk('polar', 'زمان پلاریزاسیون', '≥ ۷۲ ساعت', n(x.polarH), (v) => v >= 72, ' ساعت', 0),
    chk('far', 'پتانسیل خاموش دورترین نقطه', `≤ ${f(crit.v, 2)} V`, n(x.farOff), (v) => v <= crit.v + 1e-9, ' V', 3),
    chk('drainOff', 'پتانسیل خاموش نقطهٔ تزریق', `منفی‌تر از ${f(c.maxDrainOffV, 2)} V نباشد`, n(x.drainOff), (v) => v >= c.maxDrainOffV - 1e-9, ' V', 3),
    chk('drainOn', 'پتانسیل روشن نقطهٔ تزریق', `منفی‌تر از ${f(c.maxDrainOnV, 2)} V نباشد`, n(x.drainOn), (v) => v >= c.maxDrainOnV - 1e-9, ' V', 3),
    { k: 'pot', label: 'نقاط اندازه‌گیری با پتانسیل خاموش حفاظتی', req: `همهٔ نقاط ≤ ${f(crit.v, 2)} V`, value: pot.length ? `${f(pot.length - unprotected.length, 0)} از ${f(pot.length, 0)}` : '—', ok: pot.length ? unprotected.length === 0 : null },
    { k: 'is', label: 'دانسیتهٔ جریان I/S', req: `≤ ${f(c.maxIsUa, 0)} µA/m²`, value: isUa == null ? '—' : `${f(isUa, 2)} µA/m² (${f(isUa / 1000, 4)} mA/m²)`, ok: isUa == null ? null : isUa <= c.maxIsUa + 1e-9 },
  ]
  return { areaM2, lengthM, isUa, isMa: isUa == null ? null : isUa / 1000, limitUa: c.maxIsUa, unprotected, checks, result: verdictOf(checks), coating: c, crit }
}

export const ELEC_STEPS = [
  'اطمینان از عدم ارتباط الکتریکی قسمت‌های بدون عایق ابتدا و انتهای قطعهٔ مورد آزمایش با زمین اطراف',
  'اطمینان از عدم ارتباط الکتریکی تأسیسات روزمینی در ایستگاه‌ها با زمین اطراف',
  'اطمینان از سالم بودن و عدم نشت جریان اتصالات عایقی استفاده‌شده در قطعهٔ مورد آزمایش',
  'اندازه‌گیری پتانسیل طبیعی لوله در همهٔ نقاط اندازه‌گیری پتانسیل (طبق جدول پیوست)',
  'اندازه‌گیری ولتاژ القایی AC از نقاط اندازه‌گیری پتانسیل (در صورت تقاطع یا موازی بودن با خطوط انتقال برق فشار قوی)',
  'راه‌اندازی ترانس/رکتیفایر ایستگاه حفاظت کاتدی و تنظیم ولتاژ نقطهٔ تزریق متناسب با نوع پوشش و گذشت زمان لازم برای پلاریزاسیون کامل خط لوله',
  'تنظیم مجدد ولتاژ نقطهٔ تزریق پس از پلاریزاسیون، به‌نحوی که پتانسیل لوله در دورترین نقطه (در هر دو جهت) در لحظهٔ OFF برابر −۰٫۸۵ ولت شود (Instantaneous OFF)',
  'قرار دادن ترانس/رکتیفایر در حالت ON و OFF و اندازه‌گیری ولتاژ لوله نسبت به زمین در همهٔ نقاط اندازه‌گیری، برای اطمینان از وجود ولتاژ حفاظتی (حداقل −۰٫۸۵ ولت در لحظهٔ OFF) و نبود تداخل جریان با تأسیسات و خطوط لولهٔ مجاور',
]
