import type { Criticality, Material, MtlSettings } from '../../types'
import type { Position } from './model'
import { faNum } from './fmt'

const CRIT: Record<Criticality, number> = { A: 1, B: 0.6, C: 0.3 }
const day = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)

export interface Priority {
  materialId: string
  score: number
  parts: { criticality: number; urgency: number; gap: number; risk: number }
  daysToNeed: number | null
  /** days left once the time still needed to get it (remaining lead time, or the planned arrival) is taken off */
  slackDays: number | null
  stopRisk: boolean
  reasons: string[]
}

/**
 * A transparent score (0–100) from four parts with weights set in the settings: how critical the item is, how close its need date is compared with the time it still takes,
 * how much of the need is not covered, and how many open risks / issues are tied to it. It orders the work; it does not decide anything.
 */
export function prioritize(a: { materials: Material[]; positions: Map<string, Position>; settings: MtlSettings; today: string; arrival?: Map<string, string | null>; openLinks?: Map<string, number> }): Priority[] {
  const w = a.settings.priority
  const wsum = Math.max(1, w.criticality + w.urgency + w.gap + w.risk)
  const out: Priority[] = []
  for (const m of a.materials) {
    const p = a.positions.get(m.id)
    if (!p || p.requiredQty <= 0) continue
    const daysToNeed = m.needDate ? day(m.needDate, a.today) : null
    const eta = a.arrival?.get(m.id) ?? null
    const remaining = p.siteGap <= 0 ? 0 : eta ? Math.max(0, day(eta, a.today)) + a.settings.delayBufferDays : (m.leadTimeDays ?? 0) + a.settings.delayBufferDays
    const slackDays = daysToNeed == null ? null : daysToNeed - remaining
    const urgency = slackDays == null || p.siteGap <= 0 ? 0 : Math.max(0, Math.min(1, 1 - slackDays / 90))
    const gap = Math.min(1, p.uncoveredGap / p.requiredQty)
    const links = a.openLinks?.get(m.id) ?? 0
    const parts = { criticality: CRIT[m.criticality], urgency, gap, risk: Math.min(1, links / 2) }
    const score = Math.round(((w.criticality * parts.criticality + w.urgency * parts.urgency + w.gap * parts.gap + w.risk * parts.risk) / wsum) * 100)
    const reasons: string[] = []
    if (m.criticality === 'A') reasons.push('کالای بحرانی (A)')
    if (slackDays != null && p.siteGap > 0) reasons.push(slackDays <= 0 ? `تاریخ نیاز ${faNum(Math.abs(slackDays), 0)} روز از زمان لازم تأمین جلوتر است` : `${faNum(slackDays, 0)} روز فرصت مانده`)
    if (p.uncoveredGap > 0) reasons.push('بخشی از نیاز هنوز سفارش یا تأمین نشده')
    if (links > 0) reasons.push(`${faNum(links, 0)} ریسک یا مسئلهٔ مرتبط`)
    out.push({ materialId: m.id, score, parts, daysToNeed, slackDays, stopRisk: p.siteGap > 0 && slackDays != null && slackDays <= 0, reasons })
  }
  return out.sort((x, y) => y.score - x.score)
}

export interface FrontRisk { front: string; items: number; critical: number; worstSlack: number | null; score: number }
/** Fronts (or stations when no front is named) ordered by how many items may stop them. */
export function frontsAtRisk(materials: Material[], priorities: Priority[]): FrontRisk[] {
  const byId = new Map(materials.map((m) => [m.id, m]))
  const f = new Map<string, FrontRisk>()
  for (const pr of priorities) {
    if (!pr.stopRisk) continue
    const m = byId.get(pr.materialId)!
    const key = m.front || m.facility || 'بدون جبهه'
    const r = f.get(key) ?? { front: key, items: 0, critical: 0, worstSlack: null, score: 0 }
    r.items++
    if (m.criticality === 'A') r.critical++
    r.worstSlack = r.worstSlack == null ? pr.slackDays : Math.min(r.worstSlack, pr.slackDays ?? r.worstSlack)
    r.score = Math.max(r.score, pr.score)
    f.set(key, r)
  }
  return [...f.values()].sort((a, b) => b.score - a.score)
}
