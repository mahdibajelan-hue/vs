import type { ReportLine } from '../types'

/** Field staff report by ACTION (welding, radiography, trench excavation …) with the action's own fields — no price-book row needed. Later the statement maps every action to the nearest price-book item(s) with a factor; `resolveLines` does that conversion without touching what was entered. */
export interface ActionField { key: string; label: string; kind: 'text' | 'num' | 'select'; options?: string[] }
export interface WorkAction { id?: string; key: string; title: string; unit: string; group: string; fields: ActionField[]; sort: number; active: boolean; /** false = informational, no price-book row expected */ billable?: boolean }
export interface ActionRule { id: string; actionKey: string; activityId: string; factor: number; whenField: string; whenValue: string; note: string; /** comma-separated numeric fields of the action multiplied into the quantity (e.g. widthM,depthM) */ multFields?: string }

const sel = (key: string, label: string, options: string[]): ActionField => ({ key, label, kind: 'select', options })
const num = (key: string, label: string): ActionField => ({ key, label, kind: 'num' })
const txt = (key: string, label: string): ActionField => ({ key, label, kind: 'text' })
/** A starting list for a pipeline project — editable by the project; nothing in the system depends on these keys. */
export const DEFAULT_ACTIONS: Omit<WorkAction, 'id'>[] = [
  { key: 'stringing', title: 'ریسه و حمل لوله', unit: 'm', group: 'خط لوله', fields: [num('joints', 'تعداد شاخه')], sort: 10, active: true },
  { key: 'bending', title: 'خمکاری', unit: 'عدد', group: 'خط لوله', fields: [txt('pipeNos', 'شمارهٔ لوله‌ها')], sort: 20, active: true, billable: false },
  { key: 'trench', title: 'حفاری کانال', unit: 'm', group: 'عملیات خاکی', fields: [sel('soil', 'نوع زمین', ['خاکی', 'سنگی', 'آبرفتی', 'باتلاقی']), num('depthM', 'عمق (m)'), num('widthM', 'عرض (m)')], sort: 30, active: true },
  { key: 'fitup', title: 'فیت‌آپ', unit: 'سرجوش', group: 'جوش', fields: [txt('weldNos', 'شمارهٔ سرجوش‌ها')], sort: 40, active: true, billable: false },
  { key: 'welding', title: 'جوشکاری', unit: 'سرجوش', group: 'جوش', fields: [sel('wall', 'ضخامت جدار (in)', ['0.625', '0.750', '0.875']), sel('pass', 'مرحله', ['ریشه/هات‌پاس', 'پرکننده', 'کپ', 'کامل']), txt('weldNos', 'شمارهٔ سرجوش‌ها')], sort: 50, active: true },
  { key: 'repair', title: 'تعمیر جوش', unit: 'سرجوش', group: 'جوش', fields: [txt('weldNos', 'شمارهٔ سرجوش‌ها')], sort: 60, active: true, billable: false },
  { key: 'rt', title: 'رادیوگرافی', unit: 'سرجوش', group: 'جوش', fields: [txt('weldNos', 'شمارهٔ سرجوش‌ها')], sort: 70, active: true },
  { key: 'fjc', title: 'پوشش سرجوش', unit: 'سرجوش', group: 'پوشش', fields: [txt('weldNos', 'شمارهٔ سرجوش‌ها')], sort: 80, active: true },
  { key: 'lowering', title: 'پایین‌گذاری', unit: 'm', group: 'عملیات خاکی', fields: [], sort: 90, active: true },
  { key: 'backfill', title: 'خاک‌ریزی و پشت‌بند', unit: 'm', group: 'عملیات خاکی', fields: [sel('material', 'مصالح', ['خاک اصلی', 'شن و ماسه', 'خاک نرم']), num('depthM', 'ارتفاع خاک‌ریز (m)'), num('widthM', 'عرض (m)')], sort: 100, active: true },
  { key: 'hydro', title: 'تست هیدرواستاتیک', unit: 'm', group: 'تست و راه‌اندازی', fields: [num('pressure', 'فشار (bar)')], sort: 110, active: true },
]

/** A starting list for a station / plant project (CGS, compressor, pressure-reducing station) — civil, mechanical, piping, electrical,
 *  instrumentation, pre-commissioning and commissioning. Each action asks only the fields of its own work; editable per project. */
export const STATION_ACTIONS: Omit<WorkAction, 'id'>[] = [
  { key: 'st_excavation', title: 'خاکبرداری و پی‌کنی', unit: 'm3', group: 'سیویل', fields: [txt('area', 'محدوده / سازه'), sel('soil', 'نوع زمین', ['خاکی', 'سنگی', 'آبرفتی'])], sort: 210, active: true },
  { key: 'st_concrete', title: 'بتن‌ریزی', unit: 'm3', group: 'سیویل', fields: [txt('structure', 'سازه (فونداسیون، اسکید، دیوار)'), sel('grade', 'رده بتن', ['C20', 'C25', 'C30', 'C35']), txt('pourNo', 'شمارهٔ بتن‌ریزی')], sort: 220, active: true },
  { key: 'st_rebar', title: 'آرماتوربندی', unit: 'kg', group: 'سیویل', fields: [txt('structure', 'سازه')], sort: 230, active: true },
  { key: 'st_building', title: 'ساختمان و ابنیه', unit: 'm2', group: 'سیویل', fields: [txt('building', 'ساختمان'), txt('item', 'بخش کار')], sort: 240, active: true },
  { key: 'st_steel', title: 'نصب اسکلت فلزی و سازه', unit: 'kg', group: 'مکانیکال', fields: [txt('structure', 'سازه / پایپ‌رک')], sort: 310, active: true },
  { key: 'st_equipment', title: 'نصب تجهیزات (اسکید، فیلتر، هیتر، رگولاتور)', unit: 'عدد', group: 'مکانیکال', fields: [txt('tag', 'شمارهٔ تجهیز (Tag)'), sel('stage', 'مرحله', ['استقرار', 'تراز و گروت', 'اتصال نهایی'])], sort: 320, active: true },
  { key: 'st_spool', title: 'ساخت اسپول', unit: 'inch-dia', group: 'پایپینگ', fields: [txt('line', 'شمارهٔ خط'), txt('spool', 'شمارهٔ اسپول'), num('size', 'قطر (in)')], sort: 410, active: true },
  { key: 'st_pipe_erect', title: 'نصب لوله و اسپول', unit: 'inch-dia', group: 'پایپینگ', fields: [txt('line', 'شمارهٔ خط'), num('size', 'قطر (in)')], sort: 420, active: true },
  { key: 'st_weld', title: 'جوشکاری پایپینگ', unit: 'inch-dia', group: 'پایپینگ', fields: [txt('line', 'شمارهٔ خط'), txt('weldNos', 'شمارهٔ سرجوش‌ها'), num('size', 'قطر (in)')], sort: 430, active: true },
  { key: 'st_support', title: 'نصب ساپورت', unit: 'عدد', group: 'پایپینگ', fields: [txt('line', 'شمارهٔ خط')], sort: 440, active: true },
  { key: 'st_cable_tray', title: 'نصب سینی کابل و کاندوئیت', unit: 'm', group: 'برق', fields: [txt('route', 'مسیر')], sort: 510, active: true },
  { key: 'st_cable', title: 'کابل‌کشی برق', unit: 'm', group: 'برق', fields: [txt('cableNo', 'شمارهٔ کابل'), txt('size', 'سطح مقطع')], sort: 520, active: true },
  { key: 'st_termination', title: 'سرسیم‌بندی و اتصالات', unit: 'عدد', group: 'برق', fields: [txt('panel', 'تابلو / تجهیز')], sort: 530, active: true },
  { key: 'st_earthing', title: 'سیستم زمین و حفاظت کاتدی ایستگاه', unit: 'm', group: 'برق', fields: [txt('area', 'محدوده')], sort: 540, active: true },
  { key: 'st_instrument', title: 'نصب ابزار دقیق', unit: 'عدد', group: 'ابزار دقیق', fields: [txt('tag', 'شمارهٔ ابزار (Tag)'), sel('type', 'نوع', ['فشار', 'دما', 'جریان', 'سطح', 'شیر کنترلی', 'آشکارساز گاز'])], sort: 610, active: true },
  { key: 'st_tubing', title: 'تیوبینگ ابزار دقیق', unit: 'm', group: 'ابزار دقیق', fields: [txt('tag', 'ابزار مربوط')], sort: 620, active: true },
  { key: 'st_loop', title: 'آزمون حلقه (Loop Check)', unit: 'حلقه', group: 'ابزار دقیق', fields: [txt('loop', 'شمارهٔ حلقه'), sel('result', 'نتیجه', ['قبول', 'رد'])], sort: 630, active: true },
  { key: 'st_hydro', title: 'تست فشار پایپینگ ایستگاه', unit: 'test package', group: 'پیش‌راه‌اندازی', fields: [txt('pack', 'شمارهٔ بستهٔ تست'), num('pressure', 'فشار (bar)'), sel('result', 'نتیجه', ['قبول', 'رد'])], sort: 710, active: true },
  { key: 'st_flush', title: 'شست‌وشو و خشک‌کردن (Flushing / Drying)', unit: 'test package', group: 'پیش‌راه‌اندازی', fields: [txt('pack', 'شمارهٔ بسته')], sort: 720, active: true },
  { key: 'st_punch', title: 'رفع پانچ', unit: 'مورد', group: 'پیش‌راه‌اندازی', fields: [sel('cat', 'دسته', ['A', 'B', 'C']), txt('system', 'سیستم')], sort: 730, active: true, billable: false },
  { key: 'st_commission', title: 'راه‌اندازی و گازدار کردن', unit: 'سیستم', group: 'راه‌اندازی', fields: [txt('system', 'سیستم'), sel('step', 'مرحله', ['آماده‌سازی', 'گازدار کردن', 'آزمون عملکرد'])], sort: 810, active: true },
]

export const actionOf = (l: Pick<ReportLine, 'detail'>): string => String(l.detail.actionKey ?? '')

/**
 * A rule's field may be one of the action's own fields, or «central.<attr>»: the weld's fact in the central weld table
 * (size, thickness, length, bend angle, pipe) for a line that names a weld — so a rule can depend on the diameter even
 * when the person entering the work did not type it.
 */
export type CentralOf = (line: Pick<ReportLine, 'id' | 'detail'>) => Partial<Record<string, string>> | undefined
export const CENTRAL_PREFIX = 'central.'
export function fieldValue(line: Pick<ReportLine, 'id' | 'detail'>, field: string, centralOf?: CentralOf): unknown {
  return field.startsWith(CENTRAL_PREFIX) ? centralOf?.(line)?.[field.slice(CENTRAL_PREFIX.length)] : line.detail[field]
}
const toNum = (v: unknown): number | null => { const s = String(v ?? '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٫,]/g, '.').replace(/["″in]/gi, '').trim(); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null }
/**
 * Does a value meet a rule's condition? Text conditions match exactly; numeric ones also accept «>=40», «<12», «24-36»
 * (inclusive range) and treat 48 and 48.0 as equal — price lists are often split by diameter or thickness classes.
 */
export function conditionMet(value: unknown, cond: string): boolean {
  const c = cond.trim(), raw = String(value ?? '').trim()
  if (!c) return false
  if (raw === c) return true
  const v = toNum(value); if (v == null) return false
  const m = c.match(/^(>=|<=|>|<|=)\s*(.+)$/)
  if (m) { const n = toNum(m[2]); if (n == null) return false; return m[1] === '>=' ? v >= n : m[1] === '<=' ? v <= n : m[1] === '>' ? v > n : m[1] === '<' ? v < n : v === n }
  const r = c.match(/^(.+?)\s*(?:-|–|تا)\s*(.+)$/)
  if (r) { const a = toNum(r[1]), b = toNum(r[2]); if (a != null && b != null) return v >= Math.min(a, b) && v <= Math.max(a, b) }
  const n = toNum(c); return n != null && n === v
}

/** The best rule for one entered line: a rule whose condition matches the line (own field or central weld fact) beats the default rule (no condition). */
export function ruleFor(line: Pick<ReportLine, 'id' | 'detail'>, rules: ActionRule[], centralOf?: CentralOf): ActionRule | null {
  const key = actionOf(line); if (!key) return null
  const mine = rules.filter((r) => r.actionKey === key)
  const hit = mine.find((r) => r.whenField && conditionMet(fieldValue(line, r.whenField, centralOf), r.whenValue))
  return hit ?? mine.find((r) => !r.whenField) ?? null
}

export interface Resolved { lines: ReportLine[]; unmapped: { actionKey: string; title: string; unit: string; qty: number; lines: number; reason?: string }[] }
const mults = (r: ActionRule) => (r.multFields ?? '').split(',').map((x) => x.trim()).filter(Boolean)
/** Lines entered by action (no price-book activity) become lines of the mapped activity with qty × factor × the rule's multiplier fields (approved quantity too). Lines with an activity are untouched; informational (non-billable) actions are left alone; unmapped or incomplete action lines are reported, never guessed. */
export function resolveLines(lines: ReportLine[], rules: ActionRule[], actions: Pick<WorkAction, 'key' | 'billable'>[] = [], centralOf?: CentralOf): Resolved {
  const out: ReportLine[] = [], miss = new Map<string, { actionKey: string; title: string; unit: string; qty: number; lines: number; reason?: string }>()
  const info = new Set(actions.filter((a) => a.billable === false).map((a) => a.key))
  const note = (l: ReportLine, key: string, reason?: string) => { const k = reason ? `${key}|${reason}` : key, m = miss.get(k) ?? { actionKey: key, title: String(l.detail.actionTitle ?? key), unit: String(l.detail.actionUnit ?? ''), qty: 0, lines: 0, ...(reason ? { reason } : {}) }; m.qty += l.qty; m.lines += 1; miss.set(k, m) }
  for (const l of lines) {
    const key = actionOf(l)
    if (l.activityId || !key || info.has(key)) { out.push(l); continue }
    const r = ruleFor(l, rules, centralOf)
    if (!r) { note(l, key); out.push(l); continue }
    let k = r.factor
    const val = (f: string) => toNum(fieldValue(l, f, centralOf)) ?? 0
    const bad = mults(r).find((f) => !(val(f) > 0))
    if (bad) { note(l, key, bad.startsWith(CENTRAL_PREFIX) ? `«${bad.slice(CENTRAL_PREFIX.length)}» این سرجوش در جدول مرکزی جوش ثبت نشده` : `فیلد «${bad}» پر نشده`); out.push(l); continue }
    for (const f of mults(r)) k *= val(f)
    out.push({ ...l, activityId: r.activityId, qty: l.qty * k, approvedQty: l.approvedQty == null ? null : l.approvedQty * k, employerQty: l.employerQty == null ? null : l.employerQty * k })
  }
  return { lines: out, unmapped: [...miss.values()] }
}

const PIPELINE_KEYS = new Set(DEFAULT_ACTIONS.map((a) => a.key)), STATION_KEYS = new Set(STATION_ACTIONS.map((a) => a.key))
/** The actions offered in a scope: the other scope's default set is hidden; a project's own actions show in both. */
export const actionInScope = (key: string, scope: 'pipeline' | 'station' | 'all') =>
  scope === 'all' || (scope === 'station' ? !PIPELINE_KEYS.has(key) : !STATION_KEYS.has(key))
