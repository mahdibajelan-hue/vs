import type { Material } from '../../types'
import type { Position } from './model'

export interface WeldSet { id: string; masterProjectId: string; title: string; jointSize: string; thickness: string; process: string; /** work quantities — entered in the balance (or later taken from execution), NOT in the basis table */ jointCount: number; pipeLengthM: number; notes: string }
/** What the per-unit quantity is counted against: each joint (electrodes, film…) or each metre of pipe (coating, wrap…). */
export type WeldBasis = 'joint' | 'meter'
export const WELD_BASIS_LABEL_FA: Record<WeldBasis, string> = { joint: 'هر سرجوش', meter: 'هر متر طول' }
export interface WeldLine { id: string; setId: string; materialId: string; qtyPerJoint: number; basis?: WeldBasis; notes: string }

/** Number of basis units a set provides for a line: joints for a joint line, metres of pipe for a metre line. */
export const unitsFor = (set: Pick<WeldSet, 'jointCount' | 'pipeLengthM'>, line: Pick<WeldLine, 'basis'>): number => ((line.basis ?? 'joint') === 'meter' ? set.pipeLengthM : set.jointCount)

export interface SetLineTotal { line: WeldLine; total: number }
export interface MaterialNeed {
  materialId: string; need: number
  /** per set: joints × per-joint quantity */
  parts: { setId: string; title: string; units: number; basis: WeldBasis; perUnit: number; qty: number }[]
  ordered: number; received: number; onHand: number; issued: number
  /** need not covered by any order / by what already arrived / what is still to be supplied after use */
  orderGap: number; supplyGap: number
  status: 'ok' | 'inbound' | 'short' | 'no_order'
}

/** What a set needs in total: every line's per-unit quantity times the set's work quantity (joints or metres, by the line's basis). */
export const setTotals = (set: WeldSet, lines: WeldLine[]): SetLineTotal[] => lines.filter((l) => l.setId === set.id).map((line) => ({ line, total: line.qtyPerJoint * unitsFor(set, line) }))

/**
 * Project-wide requirement of every consumable from all weld sets, compared with the real supply:
 * ordered (order lines), received, on hand and already issued. The requirement counts only the work still to be done: need − issued is what supply must still cover.
 */
export function weldNeeds(sets: WeldSet[], lines: WeldLine[], positions: Map<string, Position>): MaterialNeed[] {
  const byMat = new Map<string, MaterialNeed>()
  const title = new Map(sets.map((s) => [s.id, s]))
  for (const l of lines) {
    const s = title.get(l.setId); if (!s) continue
    const n = byMat.get(l.materialId) ?? { materialId: l.materialId, need: 0, parts: [], ordered: 0, received: 0, onHand: 0, issued: 0, orderGap: 0, supplyGap: 0, status: 'ok' as const }
    const units = unitsFor(s, l), qty = l.qtyPerJoint * units
    n.need += qty; n.parts.push({ setId: s.id, title: s.title, units, basis: l.basis ?? 'joint', perUnit: l.qtyPerJoint, qty })
    byMat.set(l.materialId, n)
  }
  for (const n of byMat.values()) {
    const p = positions.get(n.materialId)
    n.ordered = p?.ordered ?? 0; n.received = p?.received ?? 0; n.onHand = p?.onHand ?? 0; n.issued = p?.netConsumed ?? 0
    n.orderGap = Math.max(0, n.need - n.ordered)
    n.supplyGap = Math.max(0, n.need - n.issued - n.onHand)
    n.status = n.ordered <= 0 && n.need > 0 ? 'no_order' : n.orderGap > 1e-9 ? 'short' : n.supplyGap > 1e-9 ? 'inbound' : 'ok'
  }
  return [...byMat.values()].sort((a, b) => b.orderGap - a.orderGap)
}

export const NEED_STATUS_LABEL_FA: Record<MaterialNeed['status'], string> = { ok: 'تأمین‌شده', inbound: 'سفارش‌شده، در انتظار رسیدن', short: 'سفارش کمتر از نیاز', no_order: 'بدون سفارش' }

/** Consumables first: electrodes, film, coating, gas and the like — the groups a weld table normally draws from. */
export const isConsumableMaterial = (m: Material, consumableGroupIds: Set<string>): boolean => !!m.groupId && consumableGroupIds.has(m.groupId)
