/**
 * Compressor-station quality control — ASME B31.8 with the project's IGS practice. Pure rules over the station registers
 * (csCore) and the welder register; the server enforces the decisions (migration 051).
 *
 * Every number below is a project rule kept in cs_qc_settings and editable by QC; the defaults are the usual ones:
 *   NDT extent by location class (B31.8 §826.2: 10 / 15 / 40 / 75 %, 100 % in compressor stations),
 *   progressive examination after a reject (2 more welds of the same welder; a reject among them → all of his welds),
 *   welder continuity 6 months (ASME IX QW-322), a welder reject-rate limit, hydrotest ≥ 1.5 × design pressure.
 */
import { qualProblems, registerKey, type Welder, type WelderQual } from './registers'
import type { CsLine, CsTestPack, CsWeld } from './csCore'

export type LocationClass = '1' | '2' | '3' | '4' | 'station'
export const B31_8_EXTENT: Record<LocationClass, number> = { '1': 10, '2': 15, '3': 40, '4': 75, station: 100 }
export const LOCATION_CLASS_FA: Record<LocationClass, string> = { '1': 'کلاس مکانی ۱', '2': 'کلاس مکانی ۲', '3': 'کلاس مکانی ۳', '4': 'کلاس مکانی ۴', station: 'ایستگاه تقویت فشار (۱۰۰٪)' }

export interface QcRules {
  locationClass: LocationClass
  /** examinations added per rejected weld of a welder on a line with partial extent */
  progressivePerReject: number
  progressiveEnabled: boolean
  /** a welder above this reject rate (rejected ÷ examined) is flagged for review / retraining */
  welderRejectLimit: number
  /** ASME IX QW-322: a welder who has not used the process for this many days needs requalification */
  continuityDays: number
  /** hydrotest pressure ÷ highest design pressure of the pack's lines (enforced by the server) */
  testFactor: number
  /** ITP acceptance values (overrides of ITP_CHECKS specs), by check key then spec key */
  itp: Record<string, Record<string, number>>
}
export const DEFAULT_QC_RULES: QcRules = { locationClass: 'station', progressivePerReject: 2, progressiveEnabled: true, welderRejectLimit: 0.05, continuityDays: 183, testFactor: 1.5, itp: {} }
export const withDefaults = (r?: Partial<QcRules> | null): QcRules => ({ ...DEFAULT_QC_RULES, ...(r ?? {}), itp: { ...(r?.itp ?? {}) } })

// ── NDT plan per line ───────────────────────────────────────────────────
export interface LinePlan {
  line: CsLine; extent: number; welded: number; required: number; selected: number; examined: number; accepted: number; rejected: number
  /** welds still to pick so the extent is met (random selection) */
  shortfall: number
  progressiveOwed: number; progressiveDone: number
  /** welders whose progressive examination also failed: all of their welds on the line must be examined */
  escalated: string[]
  /** suggested welds to examine next, most useful first, with why each is picked */
  suggest: string[]
  reasonOf: Record<string, 'random' | 'progressive' | 'extent'>
}
const examinedOf = (w: CsWeld) => w.ndtResult !== 'pending' || w.repairCount > 0
const isSelected = (w: CsWeld) => w.ndtSelected || examinedOf(w)

/**
 * Which welds must be examined. A 100 % line: all welded joints. A partial line: the extent of its welded joints, spread
 * over the welders (each welder's work represented), plus the progressive examinations its rejects call for.
 */
export function ndtPlan(lines: CsLine[], welds: CsWeld[], rules: QcRules): LinePlan[] {
  return lines.filter((l) => !l.archived).map((line) => {
    const ws = welds.filter((w) => w.lineId === line.id && !w.archived)
    const welded = ws.filter((w) => w.weldDate)
    const extent = Math.min(100, Math.max(0, line.ndtPct))
    const full = extent >= 100
    const sel = welded.filter(isSelected)
    const examined = welded.filter(examinedOf)
    const rejected = welded.filter((w) => w.ndtResult === 'reject' || w.repairCount > 0)
    // progressive: per welder, rejects among his NON-progressive welds call for perReject more; a reject among the
    // progressive ones escalates him to 100 % on this line
    let owed = 0, done = 0
    const escalated: string[] = []
    const suggest: string[] = []
    const reasonOf: Record<string, 'random' | 'progressive' | 'extent'> = {}
    if (!full && rules.progressiveEnabled) {
      const byWelder = new Map<string, CsWeld[]>()
      for (const w of welded) { const k = w.welder || '—'; const a = byWelder.get(k) ?? []; a.push(w); byWelder.set(k, a) }
      for (const [k, list] of byWelder) {
        const prog = list.filter((w) => w.ndtReason === 'progressive')
        const base = list.filter((w) => w.ndtReason !== 'progressive')
        const rej = base.filter((w) => w.ndtResult === 'reject' || w.repairCount > 0).length
        const progRej = prog.filter((w) => w.ndtResult === 'reject' || w.repairCount > 0).length
        const need = rej * rules.progressivePerReject
        owed += need; done += Math.min(need, prog.length)
        if (progRej > 0) { escalated.push(k); for (const w of list) if (!isSelected(w)) { suggest.push(w.id); reasonOf[w.id] = 'progressive' } }
        else if (prog.length < need) {
          const pick = list.filter((w) => !isSelected(w)).sort((a, b) => (b.weldDate ?? '').localeCompare(a.weldDate ?? '')).slice(0, need - prog.length)
          for (const w of pick) { suggest.push(w.id); reasonOf[w.id] = 'progressive' }
        }
      }
    }
    const required = full ? welded.length : Math.ceil((welded.length * extent) / 100)
    const randomSel = sel.filter((w) => w.ndtReason !== 'progressive').length
    const shortfall = full ? welded.filter((w) => !examinedOf(w)).length : Math.max(0, required - randomSel)
    if (full) for (const w of welded.filter((x) => !examinedOf(x))) { suggest.push(w.id); reasonOf[w.id] = 'extent' }
    else if (shortfall > 0) {
      // round-robin over welders so each welder's work is represented, newest welds first
      const pool = new Map<string, CsWeld[]>()
      for (const w of welded.filter((x) => !isSelected(x) && !suggest.includes(x.id)).sort((a, b) => (b.weldDate ?? '').localeCompare(a.weldDate ?? ''))) {
        const k = w.welder || '—'; const a = pool.get(k) ?? []; a.push(w); pool.set(k, a)
      }
      const queues = [...pool.values()]
      let left = shortfall
      while (left > 0 && queues.some((q) => q.length)) for (const q of queues) { const w = q.shift(); if (w && left > 0) { suggest.push(w.id); reasonOf[w.id] = 'random'; left-- } }
    }
    return { line, extent, welded: welded.length, required, selected: sel.length, examined: examined.length, accepted: welded.filter((w) => w.ndtResult === 'accept').length, rejected: rejected.length, shortfall, progressiveOwed: owed, progressiveDone: done, escalated, suggest: [...new Set(suggest)], reasonOf }
  })
}

// ── welders ─────────────────────────────────────────────────────────────
export interface WelderRow {
  key: string; raw: string; name: string; registered: boolean; active: boolean
  welds: number; inchDia: number; examined: number; rejected: number; rate: number | null; lastWeld: string | null
  /** welds made outside every qualification of the welder (date, diameter, thickness) */
  unqualified: { weldId: string; weldNo: string; reasons: string[] }[]
  continuityGap: boolean; overLimit: boolean
}
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
/** Each welder of the station welds against the register: identity, qualification range, continuity and reject rate. */
export function welderReview(welds: CsWeld[], register: Welder[], quals: WelderQual[], rules: QcRules, today: string): WelderRow[] {
  const reg = new Map(register.map((w) => [w.key, w]))
  const by = new Map<string, CsWeld[]>()
  for (const w of welds) if (!w.archived && w.weldDate && w.welder) { const k = registerKey(w.welder); const a = by.get(k) ?? []; a.push(w); by.set(k, a) }
  return [...by.entries()].map(([key, list]) => {
    const r = reg.get(key)
    const q = r ? quals.filter((x) => x.welderId === r.id) : []
    const unqualified: WelderRow['unqualified'] = []
    for (const w of list) {
      if (!r) continue
      const ctx = { date: w.weldDate!, dia: w.sizeIn, thk: w.thkMm != null ? w.thkMm / 25.4 : null } // the register keeps inches
      const all = q.map((x) => qualProblems(x, ctx))
      if (!q.length) unqualified.push({ weldId: w.id, weldNo: w.weldNo, reasons: ['صلاحیتی ثبت نشده'] })
      else if (!all.some((x) => x.length === 0)) unqualified.push({ weldId: w.id, weldNo: w.weldNo, reasons: [...new Set(all.flat())] })
    }
    const examined = list.reduce((n, w) => n + w.repairCount + (w.ndtResult === 'pending' ? 0 : 1), 0)
    const rejected = list.reduce((n, w) => n + w.repairCount + (w.ndtResult === 'reject' ? 1 : 0), 0)
    const rate = examined ? rejected / examined : null
    const lastWeld = list.map((w) => w.weldDate!).sort().at(-1) ?? null
    return {
      key, raw: r?.raw || list[0].welder, name: r?.fullName ?? '', registered: !!r, active: r?.status === 'active',
      welds: list.length, inchDia: list.reduce((n, w) => n + w.sizeIn, 0), examined, rejected, rate, lastWeld, unqualified,
      continuityGap: !!lastWeld && dayDiff(lastWeld, today) > rules.continuityDays,
      overLimit: rate != null && examined >= 5 && rate > rules.welderRejectLimit,
    }
  }).sort((a, b) => Number(b.overLimit) - Number(a.overLimit) || b.unqualified.length - a.unqualified.length || b.inchDia - a.inchDia)
}

// ── hydrotest pressure ──────────────────────────────────────────────────
/** the minimum test pressure of a pack (factor × highest design pressure of its lines); null when no design pressure is known */
export function packTestNeed(pack: Pick<CsTestPack, 'id'>, lines: CsLine[], rules: QcRules): number | null {
  const ps = lines.filter((l) => l.testPackId === pack.id && !l.archived && l.designPressBar != null).map((l) => l.designPressBar!)
  return ps.length ? Math.round(Math.max(...ps) * rules.testFactor * 100) / 100 : null
}

// ── ITP catalogue ───────────────────────────────────────────────────────
export type Discipline = 'civil' | 'painting' | 'electrical' | 'instrument' | 'mechanical' | 'piping'
export const DISCIPLINE_FA: Record<Discipline, string> = { civil: 'سیویل', painting: 'رنگ و پوشش', electrical: 'برق', instrument: 'ابزار دقیق', mechanical: 'مکانیکال', piping: 'پایپینگ' }
export interface ItpField { key: string; label: string; unit?: string; kind: 'num' | 'bool' | 'text'; many?: boolean }
export interface ItpSpec { key: string; label: string; unit?: string; value: number }
export interface ItpCheck {
  key: string; discipline: Discipline; title: string; ref: string; hold: 'H' | 'W' | 'R'
  subject: 'area' | 'line' | 'spool' | 'equipment' | 'pack' | 'other'
  fields: ItpField[]; specs: ItpSpec[]
  /** acceptance from the measured values; null when the values are not enough to decide */
  judge: (v: Record<string, unknown>, s: Record<string, number>) => { ok: boolean | null; why: string[] }
}
const num = (x: unknown): number | null => { if (x == null || x === '') return null; const n = Number(String(x).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٫,]/g, '.')); return Number.isFinite(n) ? n : null }
/** «85, 92 , 110» → [85, 92, 110] */
export const readings = (x: unknown): number[] => String(x ?? '').split(/[\s,،;\/]+/).map(num).filter((n): n is number => n != null)
const yes = (x: unknown) => x === true || x === 'true' || x === 'yes' || x === 'بله'
const fa = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 2 })

export const ITP_CHECKS: ItpCheck[] = [
  // civil
  { key: 'civ_pour', discipline: 'civil', title: 'بتن‌ریزی — اسلامپ، دما و نمونه‌گیری', ref: 'مشخصات فنی پروژه / ACI 301', hold: 'H', subject: 'area',
    fields: [{ key: 'slump', label: 'اسلامپ', unit: 'mm', kind: 'num' }, { key: 'temp', label: 'دمای بتن', unit: '°C', kind: 'num' }, { key: 'cubes', label: 'تعداد نمونه', kind: 'num' }, { key: 'rebarOk', label: 'آرماتوربندی و قالب پیش از بتن تأیید شد', kind: 'bool' }],
    specs: [{ key: 'slumpMin', label: 'حداقل اسلامپ', unit: 'mm', value: 75 }, { key: 'slumpMax', label: 'حداکثر اسلامپ', unit: 'mm', value: 125 }, { key: 'tempMax', label: 'حداکثر دمای بتن', unit: '°C', value: 32 }, { key: 'cubesMin', label: 'حداقل نمونه', value: 3 }],
    judge: (v, s) => { const why: string[] = []; const sl = num(v.slump), t = num(v.temp), c = num(v.cubes); if (sl == null || t == null || c == null) return { ok: null, why: ['مقادیر کامل نیست'] }
      if (sl < s.slumpMin || sl > s.slumpMax) why.push(`اسلامپ ${fa(sl)} خارج از ${fa(s.slumpMin)}–${fa(s.slumpMax)}`); if (t > s.tempMax) why.push(`دمای بتن ${fa(t)} بیش از ${fa(s.tempMax)}`); if (c < s.cubesMin) why.push('نمونهٔ کافی گرفته نشده'); if (!yes(v.rebarOk)) why.push('تأیید آرماتور و قالب ثبت نشده')
      return { ok: why.length === 0, why } } },
  { key: 'civ_strength', discipline: 'civil', title: 'مقاومت فشاری نمونه‌ها (۷ و ۲۸ روزه)', ref: 'ACI 318 §26.12', hold: 'W', subject: 'area',
    fields: [{ key: 'age', label: 'سن نمونه', unit: 'روز', kind: 'num' }, { key: 'results', label: 'نتایج نمونه‌ها', unit: 'MPa', kind: 'text', many: true }],
    specs: [{ key: 'fc', label: 'مقاومت مشخصه (fc′)', unit: 'MPa', value: 30 }, { key: 'early', label: 'نسبت لازم در ۷ روز', value: 0.65 }],
    judge: (v, s) => { const r = readings(v.results), age = num(v.age); if (!r.length || age == null) return { ok: null, why: ['مقادیر کامل نیست'] }
      const avg = r.reduce((a, b) => a + b, 0) / r.length, why: string[] = []
      if (age >= 28) { if (avg < s.fc) why.push(`میانگین ${fa(avg)} کمتر از fc′ = ${fa(s.fc)}`); if (Math.min(...r) < s.fc - 3.5) why.push(`یک نمونه کمتر از fc′ − ۳٫۵ MPa`) }
      else if (avg < s.fc * s.early) why.push(`میانگین ${age} روزه ${fa(avg)} کمتر از ${fa(s.fc * s.early)}`)
      return { ok: why.length === 0, why } } },
  { key: 'civ_compaction', discipline: 'civil', title: 'تراکم خاکریز و بستر', ref: 'مشخصات فنی پروژه', hold: 'W', subject: 'area',
    fields: [{ key: 'results', label: 'درصد تراکم نقاط', unit: '٪', kind: 'text', many: true }], specs: [{ key: 'min', label: 'حداقل تراکم', unit: '٪', value: 95 }],
    judge: (v, s) => { const r = readings(v.results); if (!r.length) return { ok: null, why: ['نتیجه‌ای ثبت نشده'] }; const low = r.filter((x) => x < s.min); return { ok: !low.length, why: low.length ? [`${fa(low.length)} نقطه کمتر از ${fa(s.min)}٪`] : [] } } },
  // painting
  { key: 'pnt_surface', discipline: 'painting', title: 'آماده‌سازی سطح (سندبلاست)', ref: 'ISO 8501-1 / ISO 8503', hold: 'H', subject: 'spool',
    fields: [{ key: 'grade', label: 'درجهٔ تمیزی (مثلاً Sa 2.5)', kind: 'text' }, { key: 'profile', label: 'زبری سطح', unit: 'µm', kind: 'text', many: true }, { key: 'rh', label: 'رطوبت نسبی', unit: '٪', kind: 'num' }, { key: 'dewOk', label: 'دمای سطح ≥ نقطهٔ شبنم + ۳°C', kind: 'bool' }],
    specs: [{ key: 'saMin', label: 'حداقل درجهٔ Sa', value: 2.5 }, { key: 'profMin', label: 'حداقل زبری', unit: 'µm', value: 50 }, { key: 'profMax', label: 'حداکثر زبری', unit: 'µm', value: 75 }, { key: 'rhMax', label: 'حداکثر رطوبت', unit: '٪', value: 85 }],
    judge: (v, s) => { const g = num(String(v.grade ?? '').replace(/sa/i, '').trim()), p = readings(v.profile), rh = num(v.rh); if (g == null || !p.length || rh == null) return { ok: null, why: ['مقادیر کامل نیست'] }
      const why: string[] = []; if (g < s.saMin) why.push(`درجهٔ تمیزی Sa ${fa(g)} کمتر از Sa ${fa(s.saMin)}`); if (p.some((x) => x < s.profMin || x > s.profMax)) why.push(`زبری خارج از ${fa(s.profMin)}–${fa(s.profMax)} µm`); if (rh > s.rhMax) why.push(`رطوبت ${fa(rh)}٪ بیش از ${fa(s.rhMax)}٪`); if (!yes(v.dewOk)) why.push('شرط نقطهٔ شبنم تأیید نشده')
      return { ok: why.length === 0, why } } },
  { key: 'pnt_dft', discipline: 'painting', title: 'ضخامت فیلم خشک (DFT) هر لایه', ref: 'SSPC-PA 2 / ISO 19840', hold: 'W', subject: 'spool',
    fields: [{ key: 'coat', label: 'لایه (پرایمر، میانی، رویه)', kind: 'text' }, { key: 'readings', label: 'قرائت‌ها', unit: 'µm', kind: 'text', many: true }],
    specs: [{ key: 'min', label: 'حداقل DFT لایه', unit: 'µm', value: 75 }, { key: 'max', label: 'حداکثر DFT لایه', unit: 'µm', value: 150 }, { key: 'spot', label: 'حداقل هر قرائت (نسبت به حداقل)', value: 0.8 }],
    judge: (v, s) => { const r = readings(v.readings); if (r.length < 3) return { ok: null, why: ['دست‌کم ۳ قرائت لازم است'] }
      const avg = r.reduce((a, b) => a + b, 0) / r.length, why: string[] = []
      if (avg < s.min) why.push(`میانگین ${fa(avg)} کمتر از ${fa(s.min)} µm`); if (avg > s.max) why.push(`میانگین ${fa(avg)} بیش از ${fa(s.max)} µm`); if (Math.min(...r) < s.min * s.spot) why.push(`قرائت ${fa(Math.min(...r))} کمتر از ${fa(s.min * s.spot)} µm`)
      return { ok: why.length === 0, why } } },
  { key: 'pnt_adhesion', discipline: 'painting', title: 'چسبندگی (Pull-off)', ref: 'ISO 4624 / ASTM D4541', hold: 'W', subject: 'spool',
    fields: [{ key: 'results', label: 'نتایج', unit: 'MPa', kind: 'text', many: true }], specs: [{ key: 'min', label: 'حداقل چسبندگی', unit: 'MPa', value: 5 }],
    judge: (v, s) => { const r = readings(v.results); if (!r.length) return { ok: null, why: ['نتیجه‌ای ثبت نشده'] }; const low = r.filter((x) => x < s.min); return { ok: !low.length, why: low.length ? [`${fa(low.length)} نتیجه کمتر از ${fa(s.min)} MPa`] : [] } } },
  // electrical
  { key: 'ele_ir', discipline: 'electrical', title: 'مقاومت عایقی کابل (Megger)', ref: 'IEC 60364-6 / مشخصات پروژه', hold: 'W', subject: 'other',
    fields: [{ key: 'cable', label: 'شمارهٔ کابل', kind: 'text' }, { key: 'voltage', label: 'ولتاژ آزمون', unit: 'V', kind: 'num' }, { key: 'results', label: 'نتایج فاز به فاز / زمین', unit: 'MΩ', kind: 'text', many: true }],
    specs: [{ key: 'min', label: 'حداقل مقاومت عایقی', unit: 'MΩ', value: 100 }],
    judge: (v, s) => { const r = readings(v.results); if (!r.length) return { ok: null, why: ['نتیجه‌ای ثبت نشده'] }; const low = r.filter((x) => x < s.min); return { ok: !low.length, why: low.length ? [`${fa(low.length)} قرائت کمتر از ${fa(s.min)} MΩ`] : [] } } },
  { key: 'ele_earth', discipline: 'electrical', title: 'مقاومت سیستم زمین (ارت)', ref: 'IEEE 80 / مشخصات پروژه', hold: 'W', subject: 'area',
    fields: [{ key: 'result', label: 'مقاومت اندازه‌گیری‌شده', unit: 'Ω', kind: 'num' }], specs: [{ key: 'max', label: 'حداکثر مقاومت زمین', unit: 'Ω', value: 1 }],
    judge: (v, s) => { const r = num(v.result); if (r == null) return { ok: null, why: ['نتیجه‌ای ثبت نشده'] }; return { ok: r <= s.max, why: r <= s.max ? [] : [`${fa(r)} Ω بیش از ${fa(s.max)} Ω`] } } },
  // instrument
  { key: 'ins_cal', discipline: 'instrument', title: 'کالیبراسیون ابزار', ref: 'مشخصات سازنده / IGS', hold: 'W', subject: 'other',
    fields: [{ key: 'tag', label: 'تگ ابزار', kind: 'text' }, { key: 'errors', label: 'خطا در نقاط آزمون', unit: '٪ دامنه', kind: 'text', many: true }], specs: [{ key: 'tol', label: 'حداکثر خطای مجاز', unit: '٪ دامنه', value: 0.5 }],
    judge: (v, s) => { const r = readings(v.errors); if (!r.length) return { ok: null, why: ['نتیجه‌ای ثبت نشده'] }; const bad = r.filter((x) => Math.abs(x) > s.tol); return { ok: !bad.length, why: bad.length ? [`${fa(bad.length)} نقطه با خطای بیش از ${fa(s.tol)}٪`] : [] } } },
  { key: 'ins_loop', discipline: 'instrument', title: 'لوپ چک', ref: 'مشخصات پروژه', hold: 'W', subject: 'other',
    fields: [{ key: 'loop', label: 'شمارهٔ لوپ', kind: 'text' }, { key: 'pass', label: 'سیگنال از میدان تا کنترل تأیید شد', kind: 'bool' }], specs: [],
    judge: (v) => (v.pass == null ? { ok: null, why: ['نتیجه‌ای ثبت نشده'] } : { ok: yes(v.pass), why: yes(v.pass) ? [] : ['لوپ تأیید نشد'] }) },
  // mechanical
  { key: 'mec_level', discipline: 'mechanical', title: 'تراز تجهیز روی فونداسیون', ref: 'دستورالعمل سازنده / API 686', hold: 'H', subject: 'equipment',
    fields: [{ key: 'results', label: 'انحراف تراز', unit: 'mm/m', kind: 'text', many: true }], specs: [{ key: 'max', label: 'حداکثر انحراف', unit: 'mm/m', value: 0.05 }],
    judge: (v, s) => { const r = readings(v.results); if (!r.length) return { ok: null, why: ['نتیجه‌ای ثبت نشده'] }; const bad = r.filter((x) => Math.abs(x) > s.max); return { ok: !bad.length, why: bad.length ? [`انحراف بیش از ${fa(s.max)} mm/m`] : [] } } },
  { key: 'mec_align', discipline: 'mechanical', title: 'هم‌محوری کوپلینگ (الاینمنت)', ref: 'دستورالعمل سازنده / API 686', hold: 'H', subject: 'equipment',
    fields: [{ key: 'offset', label: 'انحراف شعاعی (Offset)', unit: 'mm', kind: 'num' }, { key: 'angular', label: 'انحراف زاویه‌ای', unit: 'mm/100mm', kind: 'num' }],
    specs: [{ key: 'offMax', label: 'حداکثر Offset', unit: 'mm', value: 0.05 }, { key: 'angMax', label: 'حداکثر زاویه‌ای', unit: 'mm/100mm', value: 0.05 }],
    judge: (v, s) => { const o = num(v.offset), a = num(v.angular); if (o == null || a == null) return { ok: null, why: ['مقادیر کامل نیست'] }; const why: string[] = []; if (Math.abs(o) > s.offMax) why.push(`Offset ${fa(o)} بیش از ${fa(s.offMax)}`); if (Math.abs(a) > s.angMax) why.push(`زاویه‌ای ${fa(a)} بیش از ${fa(s.angMax)}`); return { ok: why.length === 0, why } } },
  // piping
  { key: 'pip_fitup', discipline: 'piping', title: 'فیت‌آپ (درز، Hi-Lo، تمیزی)', ref: 'ASME B31.8 / WPS', hold: 'W', subject: 'spool',
    fields: [{ key: 'gap', label: 'درز ریشه', unit: 'mm', kind: 'num' }, { key: 'hilo', label: 'Hi-Lo', unit: 'mm', kind: 'num' }, { key: 'clean', label: 'تمیزی و پخ مطابق WPS', kind: 'bool' }],
    specs: [{ key: 'gapMin', label: 'حداقل درز', unit: 'mm', value: 1.6 }, { key: 'gapMax', label: 'حداکثر درز', unit: 'mm', value: 3.2 }, { key: 'hiloMax', label: 'حداکثر Hi-Lo', unit: 'mm', value: 1.6 }],
    judge: (v, s) => { const g = num(v.gap), h = num(v.hilo); if (g == null || h == null) return { ok: null, why: ['مقادیر کامل نیست'] }; const why: string[] = []; if (g < s.gapMin || g > s.gapMax) why.push(`درز ${fa(g)} خارج از ${fa(s.gapMin)}–${fa(s.gapMax)}`); if (h > s.hiloMax) why.push(`Hi-Lo ${fa(h)} بیش از ${fa(s.hiloMax)}`); if (!yes(v.clean)) why.push('تمیزی و پخ تأیید نشده'); return { ok: why.length === 0, why } } },
  { key: 'pip_reinstate', discipline: 'piping', title: 'بازگردانی پس از تست (Reinstatement)', ref: 'IGS / مشخصات پروژه', hold: 'W', subject: 'pack',
    fields: [{ key: 'blinds', label: 'همهٔ بلایندهای آزمون برداشته شد', kind: 'bool' }, { key: 'gaskets', label: 'گسکت‌های دائم نصب شد', kind: 'bool' }, { key: 'drained', label: 'تخلیه و خشک‌کاری انجام شد', kind: 'bool' }], specs: [],
    judge: (v) => { if (v.blinds == null || v.gaskets == null || v.drained == null) return { ok: null, why: ['همهٔ موارد ثبت نشده'] }; const why = [['blinds', 'بلایند'], ['gaskets', 'گسکت'], ['drained', 'تخلیه']].filter(([k]) => !yes(v[k])).map(([, f]) => `${f} تأیید نشد`); return { ok: !why.length, why } } },
]
export const itpOf = (k: string) => ITP_CHECKS.find((c) => c.key === k)
/** the check's acceptance values with the project's overrides */
export const specsOf = (c: ItpCheck, rules: QcRules): Record<string, number> => Object.fromEntries(c.specs.map((s) => [s.key, rules.itp[c.key]?.[s.key] ?? s.value]))
export const judgeItp = (c: ItpCheck, values: Record<string, unknown>, rules: QcRules) => c.judge(values, specsOf(c, rules))
