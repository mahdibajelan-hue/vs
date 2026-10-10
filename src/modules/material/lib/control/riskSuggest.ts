import type { Material, MtlGroup, MtlSettings } from '../../types'
import type { Detected } from './discrepancies'
import type { Position } from './model'
import { faNum } from './fmt'
import type { Priority } from './priority'

export interface RaiseSuggestion {
  key: string
  target: 'risk' | 'issue'
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  sources: { type: 'material' | 'package' | 'discrepancy' | 'project' | 'risk'; id: string }[]
  extra: Record<string, unknown>
}

const day = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)
const lines = (ms: Material[]) => ms.slice(0, 12).map((m) => `• ${m.materialCode || m.lineNo || ''} ${m.description}${m.usageLocation ? ` — ${m.usageLocation}` : ''}`).join('\n') + (ms.length > 12 ? `\n… و ${faNum(ms.length - 12, 0)} قلم دیگر` : '')

/**
 * Turns what the model sees into proposed risks (something that may happen) and issues (something that already happened). Items with the same cause are put together,
 * so a single cause gives a single proposal that every affected item is attached to. Nothing is created from here — a person sends each proposal.
 */
export function suggestRaises(a: { materials: Material[]; positions: Map<string, Position>; groups: MtlGroup[]; detected: Detected[]; priorities: Priority[]; settings: MtlSettings; today: string }): RaiseSuggestion[] {
  const byId = new Map(a.materials.map((m) => [m.id, m]))
  const grpTitle = new Map(a.groups.map((g) => [g.id, g.title]))
  const out: RaiseSuggestion[] = []
  const bucket = (kind: string) => a.detected.filter((d) => d.kind === kind).map((d) => byId.get(d.materialId)).filter((m): m is Material => !!m)

  // risks: long-lead items that are not ordered yet — one per material group
  const longLead = a.materials.filter((m) => { const p = a.positions.get(m.id); return p && p.requiredQty > 0 && p.ordered === 0 && (m.leadTimeDays ?? 0) >= a.settings.longLeadDays })
  const byGroup = new Map<string, Material[]>()
  for (const m of longLead) { const k = m.groupId ?? '—'; byGroup.set(k, [...(byGroup.get(k) ?? []), m]) }
  for (const [g, ms] of byGroup) out.push({ key: `risk:longlead:${g}`, target: 'risk', title: `ریسک تأخیر تأمین اقلام با زمان تأمین طولانی — ${grpTitle.get(g) ?? 'بدون گروه'}`, description: `زمان تأمین این اقلام بیش از ${faNum(a.settings.longLeadDays, 0)} روز است و هنوز سفارش ندارند:\n${lines(ms)}`, severity: ms.some((m) => m.criticality === 'A') ? 'high' : 'medium', sources: ms.map((m) => ({ type: 'material' as const, id: m.id })), extra: { category: 'proc_longlead', days_to_impact: Math.min(...ms.map((m) => (m.needDate ? day(m.needDate, a.today) : 999))) } })

  // risks: anticipated delay, mismatch between contract and design, items outside the contract
  const delay = bucket('delay_risk')
  if (delay.length) out.push({ key: 'risk:delay', target: 'risk', title: 'ریسک تأخیر تأمین نسبت به تاریخ نیاز اجرایی', description: `برای اقلام زیر، تحویل برنامه‌ای با حاشیهٔ ایمنی دیرتر از تاریخ نیاز است:\n${lines(delay)}`, severity: delay.some((m) => m.criticality === 'A') ? 'high' : 'medium', sources: delay.map((m) => ({ type: 'material' as const, id: m.id })), extra: { category: 'proc_supplier', station: delay[0].facility, front: delay[0].front } })
  const outside = bucket('not_in_contract')
  if (outside.length) out.push({ key: 'risk:not_in_contract', target: 'risk', title: 'ریسک هزینه و تأمین اقلام خارج از MTO پیمان', description: `اقلام طراحی تفصیلی که در MTO پیمان نیستند (تصمیم دربارهٔ مسئولیت و نحوهٔ تأمین با کارفرما و مشاور):\n${lines(outside)}`, severity: 'medium', sources: outside.map((m) => ({ type: 'material' as const, id: m.id })), extra: { category: 'cost' } })
  const qty = bucket('qty_diff').filter((m) => (m.detailQty ?? 0) > (m.contractQty ?? 0))
  if (qty.length) out.push({ key: 'risk:qty_diff', target: 'risk', title: 'ریسک کسری به‌دلیل اختلاف MTO پیمان و طراحی تفصیلی', description: `مقدار طراحی تفصیلی از پیمان بیشتر است:\n${lines(qty)}`, severity: 'medium', sources: qty.map((m) => ({ type: 'material' as const, id: m.id })), extra: { category: 'procurement' } })

  // issues: something that has actually happened
  const lateOrder = a.detected.filter((d) => d.kind === 'no_order' && d.dueDate && d.dueDate < a.today).map((d) => byId.get(d.materialId)).filter((m): m is Material => !!m)
  if (lateOrder.length) out.push({ key: 'issue:late_order', target: 'issue', title: 'اقلام ضروری پس از مهلت سفارش‌گذاری هنوز سفارش ندارند', description: `مهلت سفارش‌گذاری (تاریخ نیاز منهای زمان تأمین و حاشیه) گذشته است:\n${lines(lateOrder)}`, severity: lateOrder.some((m) => m.criticality === 'A') ? 'critical' : 'high', sources: lateOrder.map((m) => ({ type: 'material' as const, id: m.id })), extra: { station: lateOrder[0].facility, impact_days: 30 } })
  const stopping = a.priorities.filter((p) => p.stopRisk && (p.slackDays ?? 1) <= 0 && (a.positions.get(p.materialId)?.uncoveredGap ?? 0) > 0).map((p) => byId.get(p.materialId)).filter((m): m is Material => !!m)
  if (stopping.length) out.push({ key: 'issue:front_shortage', target: 'issue', title: 'کسری متریال مؤثر بر جبهه اجرایی', description: `کسری زیر با توجه به تاریخ نیاز و زمان لازم برای تأمین، اجرا را متوقف می‌کند:\n${lines(stopping)}`, severity: 'critical', sources: stopping.map((m) => ({ type: 'material' as const, id: m.id })), extra: { station: stopping[0].facility, impact_days: Math.max(...stopping.map((m) => Math.abs(m.needDate ? Math.min(0, day(m.needDate, a.today)) : 0)), 7) } })
  const rej = a.materials.filter((m) => (a.positions.get(m.id)?.rejected ?? 0) > 0)
  if (rej.length) out.push({ key: 'issue:rejected', target: 'issue', title: 'کالای مردود در بازرسی ورودی نیازمند تعیین تکلیف', description: `اقلام مردود یا آسیب‌دیده:\n${lines(rej)}`, severity: 'high', sources: rej.map((m) => ({ type: 'material' as const, id: m.id })), extra: { station: rej[0].facility } })
  return out
}
