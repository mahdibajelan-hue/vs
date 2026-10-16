import type { ReportLine } from '../types'

/** Field staff report by ACTION (welding, radiography, trench excavation …) with the action's own fields — no price-book row needed. Later the statement maps every action to the nearest price-book item(s) with a factor; `resolveLines` does that conversion without touching what was entered. */
export interface ActionField { key: string; label: string; kind: 'text' | 'num' | 'select'; options?: string[] }
export interface WorkAction { id?: string; key: string; title: string; unit: string; group: string; fields: ActionField[]; sort: number; active: boolean }
export interface ActionRule { id: string; actionKey: string; activityId: string; factor: number; whenField: string; whenValue: string; note: string }

const sel = (key: string, label: string, options: string[]): ActionField => ({ key, label, kind: 'select', options })
const num = (key: string, label: string): ActionField => ({ key, label, kind: 'num' })
const txt = (key: string, label: string): ActionField => ({ key, label, kind: 'text' })
/** A starting list for a pipeline project — editable by the project; nothing in the system depends on these keys. */
export const DEFAULT_ACTIONS: Omit<WorkAction, 'id'>[] = [
  { key: 'stringing', title: 'ریسه و حمل لوله', unit: 'm', group: 'خط لوله', fields: [num('joints', 'تعداد شاخه')], sort: 10, active: true },
  { key: 'bending', title: 'خمکاری', unit: 'عدد', group: 'خط لوله', fields: [txt('pipeNos', 'شمارهٔ لوله‌ها')], sort: 20, active: true },
  { key: 'trench', title: 'حفاری کانال', unit: 'm', group: 'عملیات خاکی', fields: [sel('soil', 'نوع زمین', ['خاکی', 'سنگی', 'آبرفتی', 'باتلاقی']), num('depthM', 'عمق (m)'), num('widthM', 'عرض (m)')], sort: 30, active: true },
  { key: 'fitup', title: 'فیت‌آپ', unit: 'سرجوش', group: 'جوش', fields: [txt('weldNos', 'شمارهٔ سرجوش‌ها')], sort: 40, active: true },
  { key: 'welding', title: 'جوشکاری', unit: 'سرجوش', group: 'جوش', fields: [sel('pass', 'مرحله', ['ریشه/هات‌پاس', 'پرکننده', 'کپ', 'کامل']), txt('weldNos', 'شمارهٔ سرجوش‌ها')], sort: 50, active: true },
  { key: 'repair', title: 'تعمیر جوش', unit: 'سرجوش', group: 'جوش', fields: [txt('weldNos', 'شمارهٔ سرجوش‌ها')], sort: 60, active: true },
  { key: 'rt', title: 'رادیوگرافی', unit: 'سرجوش', group: 'جوش', fields: [txt('weldNos', 'شمارهٔ سرجوش‌ها')], sort: 70, active: true },
  { key: 'fjc', title: 'پوشش سرجوش', unit: 'سرجوش', group: 'پوشش', fields: [txt('weldNos', 'شمارهٔ سرجوش‌ها')], sort: 80, active: true },
  { key: 'lowering', title: 'پایین‌گذاری', unit: 'm', group: 'عملیات خاکی', fields: [], sort: 90, active: true },
  { key: 'backfill', title: 'خاک‌ریزی و پشت‌بند', unit: 'm', group: 'عملیات خاکی', fields: [sel('material', 'مصالح', ['خاک اصلی', 'شن و ماسه', 'خاک نرم'])], sort: 100, active: true },
  { key: 'hydro', title: 'تست هیدرواستاتیک', unit: 'm', group: 'تست و راه‌اندازی', fields: [num('pressure', 'فشار (bar)')], sort: 110, active: true },
]

export const actionOf = (l: Pick<ReportLine, 'detail'>): string => String(l.detail.actionKey ?? '')

/** The best rule for one entered line: a rule whose condition matches the line's field value beats the default rule (no condition). */
export function ruleFor(line: Pick<ReportLine, 'detail'>, rules: ActionRule[]): ActionRule | null {
  const key = actionOf(line); if (!key) return null
  const mine = rules.filter((r) => r.actionKey === key)
  const hit = mine.find((r) => r.whenField && String(line.detail[r.whenField] ?? '').trim() === r.whenValue)
  return hit ?? mine.find((r) => !r.whenField) ?? null
}

export interface Resolved { lines: ReportLine[]; unmapped: { actionKey: string; title: string; unit: string; qty: number; lines: number }[] }
/** Lines entered by action (no price-book activity) become lines of the mapped activity with qty × factor (approved quantity too). Lines with an activity are untouched; unmapped action lines are reported, never guessed. */
export function resolveLines(lines: ReportLine[], rules: ActionRule[]): Resolved {
  const out: ReportLine[] = [], miss = new Map<string, { actionKey: string; title: string; unit: string; qty: number; lines: number }>()
  for (const l of lines) {
    const key = actionOf(l)
    if (l.activityId || !key) { out.push(l); continue }
    const r = ruleFor(l, rules)
    if (!r) {
      const m = miss.get(key) ?? { actionKey: key, title: String(l.detail.actionTitle ?? key), unit: String(l.detail.actionUnit ?? ''), qty: 0, lines: 0 }
      m.qty += l.qty; m.lines += 1; miss.set(key, m); out.push(l); continue
    }
    out.push({ ...l, activityId: r.activityId, qty: l.qty * r.factor, approvedQty: l.approvedQty == null ? null : l.approvedQty * r.factor })
  }
  return { lines: out, unmapped: [...miss.values()] }
}
