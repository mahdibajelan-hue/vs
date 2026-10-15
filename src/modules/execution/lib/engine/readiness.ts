export type PrereqKind = 'drawing' | 'material' | 'equipment' | 'permit' | 'land' | 'inspection' | 'manpower' | 'other'
export type PrereqStatus = 'ready' | 'pending' | 'blocked' | 'na'
export interface Prereq { id: string; activityId: string; kind: PrereqKind; title: string; refType: string; refId: string | null; status: PrereqStatus; neededDate: string | null; readyDate: string | null }
export interface EngDoc { id: string; docNo: string; title: string; rev: string; status: 'required' | 'in_preparation' | 'issued' | 'pending_approval' | 'approved' | 'restricted' | 'superseded'; restrictionNote: string; dueDate: string | null }
/** Supply status of a referenced material / package, resolved by the caller from the material module: remaining quantity on site vs required. */
export interface SupplyState { id: string; onSite: number; required: number; stage?: string }

export type Readiness = 'ready' | 'at_risk' | 'blocked' | 'unknown'
export interface ReadinessItem { prereqId: string; kind: PrereqKind; title: string; state: 'ready' | 'pending' | 'blocked'; reason: string; neededDate: string | null }
export interface ActivityReadiness { activityId: string; state: Readiness; items: ReadinessItem[]; blockers: string[]; earliestStart: string | null }

/** Effective state of one prerequisite: a linked engineering document / material overrides the manual status with the real one. */
export function prereqState(p: Prereq, docs: Map<string, EngDoc>, supply: Map<string, SupplyState>, today: string): ReadinessItem {
  const base = { prereqId: p.id, kind: p.kind, title: p.title, neededDate: p.neededDate }
  if (p.status === 'na') return { ...base, state: 'ready', reason: 'در این فعالیت لازم نیست' }
  if (p.refType === 'eng_doc' && p.refId) {
    const d = docs.get(p.refId)
    if (!d) return { ...base, state: 'pending', reason: 'مدرک مرتبط یافت نشد' }
    if (d.status === 'approved') return { ...base, state: 'ready', reason: `مدرک ${d.docNo} (Rev ${d.rev}) تأییدشده` }
    if (d.status === 'restricted') return { ...base, state: 'pending', reason: `مدرک ${d.docNo} با محدودیت اجرایی تأیید شده: ${d.restrictionNote || '—'}` }
    if (d.status === 'superseded') return { ...base, state: 'blocked', reason: `مدرک ${d.docNo} منسوخ شده است` }
    const lateNeed = p.neededDate && p.neededDate <= today
    return { ...base, state: lateNeed ? 'blocked' : 'pending', reason: `مدرک ${d.docNo} در وضعیت «${d.status}»${lateNeed ? ' و موعد نیاز آن رسیده است' : ''}` }
  }
  if ((p.refType === 'material' || p.refType === 'package') && p.refId) {
    const s = supply.get(p.refId)
    if (!s) return { ...base, state: 'pending', reason: 'وضعیت کالا در ماژول تأمین یافت نشد' }
    if (s.required > 0 && s.onSite + 1e-9 >= s.required) return { ...base, state: 'ready', reason: 'کالا به‌مقدار لازم در سایت موجود است' }
    return { ...base, state: s.onSite > 0 ? 'pending' : 'blocked', reason: `موجودی سایت ${s.onSite} از ${s.required} موردنیاز${s.stage ? ` (مرحلهٔ ${s.stage})` : ''}` }
  }
  if (p.status === 'ready') return { ...base, state: 'ready', reason: p.readyDate ? `آماده از ${p.readyDate}` : 'آماده' }
  if (p.status === 'blocked') return { ...base, state: 'blocked', reason: 'مسدود' }
  const late = p.neededDate && p.neededDate < today
  return { ...base, state: 'pending', reason: late ? 'موعد نیاز گذشته و هنوز آماده نیست' : 'در انتظار' }
}

/** Readiness of an activity comes only from its prerequisites — crews and machines present on site do not make an activity ready. */
export function activityReadiness(activityId: string, prereqs: Prereq[], docs: Map<string, EngDoc>, supply: Map<string, SupplyState>, today: string): ActivityReadiness {
  const mine = prereqs.filter((p) => p.activityId === activityId)
  if (!mine.length) return { activityId, state: 'unknown', items: [], blockers: [], earliestStart: null }
  const items = mine.map((p) => prereqState(p, docs, supply, today))
  const blockers = items.filter((i) => i.state === 'blocked').map((i) => `${i.title} (${i.reason})`)
  const pending = items.filter((i) => i.state === 'pending')
  const state: Readiness = blockers.length ? 'blocked' : pending.length ? 'at_risk' : 'ready'
  const dates = pending.map((i) => i.neededDate).filter((d): d is string => !!d).sort()
  return { activityId, state, items, blockers, earliestStart: state === 'ready' ? today : dates.length ? dates[dates.length - 1] : null }
}
