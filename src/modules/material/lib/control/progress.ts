import type { ItemStage, MtlPackage, PackageItem, Material } from '../../types'
import type { Position } from './model'

/** Stages that only count when the real records back them: order lines for the PO / manufacturing / inspection / release / shipping stages, warehouse receipts for the site stages. */
const ORDER_STAGES = new Set(['po_issue', 'manufacturing', 'inspection', 'release', 'shipping'])
const RECEIPT_STAGES = new Set(['site_receipt', 'entry_inspection'])
export function stageBackingLimit(stageKey: string, pos?: Pick<Position, 'ordered' | 'received'>): number | null {
  if (!pos) return null
  return ORDER_STAGES.has(stageKey) ? pos.ordered : RECEIPT_STAGES.has(stageKey) ? pos.received : null
}

/** Value of one package item in the base currency: quantity × unit price × rate. The weight of an item in any total is this value. */
export const itemValue = (i: PackageItem, fx = 1): number => i.qty * i.unitPrice * fx

export interface ItemProgress {
  itemId: string
  value: number
  /** share of the item's value earned by approved stages (0..1) — planned uses planned dates, actual uses approval */
  actual: number
  planned: number
  /** weight of the applicable stages (the share is always measured against this, so N/A stages do not distort it) */
  applicableWeight: number
  naCount: number
}

/**
 * Supply progress of an item: the weights of its stages that count, divided by the weights of the stages that apply.
 * A stage counts only once it is approved, in proportion to the quantity it was approved for (partial deliveries).
 * Stages marked not-applicable drop out of both sides, so the item still reaches 100 %.
 */
export function itemProgress(item: PackageItem, stages: ItemStage[], asOf: string, fx = 1, pos?: Pick<Position, 'ordered' | 'received'>): ItemProgress {
  const mine = stages.filter((s) => s.itemId === item.id)
  const app = mine.filter((s) => s.applicable)
  const total = app.reduce((a, s) => a + s.weight, 0)
  let actual = 0, planned = 0
  for (const s of app) {
    const lim = stageBackingLimit(s.stageKey, pos)
    const frac = item.qty > 0 ? Math.min(1, s.approvedQty / item.qty, lim == null ? 1 : lim / item.qty) : 0
    // approvals dated after the cut-off do not count yet
    if (s.status === 'approved' && (s.approvedAt == null || s.approvedAt.slice(0, 10) <= asOf)) actual += s.weight * frac
    if (s.plannedDate && s.plannedDate <= asOf) planned += s.weight
  }
  return { itemId: item.id, value: itemValue(item, fx), actual: total > 0 ? actual / total : 0, planned: total > 0 ? planned / total : 0, applicableWeight: total, naCount: mine.length - app.length }
}

export interface Rollup { value: number; actual: number; planned: number; deviation: number; orderedValue: number; items: number }

/** Value-weighted roll-up of item progress. Deviation is actual minus planned (negative = behind). */
export function rollup(rows: ItemProgress[], extra?: { orderedValue?: number }): Rollup {
  const value = rows.reduce((a, r) => a + r.value, 0)
  const w = (f: (r: ItemProgress) => number) => (value > 0 ? rows.reduce((a, r) => a + r.value * f(r), 0) / value : 0)
  const actual = w((r) => r.actual), planned = w((r) => r.planned)
  return { value, actual, planned, deviation: actual - planned, orderedValue: extra?.orderedValue ?? 0, items: rows.length }
}

export interface ProgressGroupRow extends Rollup { key: string; label: string }

/** Roll up by any dimension: package, station (facility), material group, project. */
export function progressBy(a: { items: PackageItem[]; stages: ItemStage[]; packages: MtlPackage[]; materials: Material[]; positions?: Map<string, Position>; asOf: string; by: 'package' | 'station' | 'group' | 'project'; groupTitle?: (id: string | null) => string }): ProgressGroupRow[] {
  const pkgById = new Map(a.packages.map((p) => [p.id, p]))
  const matById = new Map(a.materials.map((m) => [m.id, m]))
  const buckets = new Map<string, { label: string; rows: ItemProgress[] }>()
  for (const it of a.items) {
    const pkg = pkgById.get(it.packageId)
    if (!pkg || pkg.status === 'cancelled') continue
    const m = matById.get(it.materialId)
    const [key, label] = a.by === 'package' ? [pkg.id, `${pkg.code} · ${pkg.title}`]
      : a.by === 'station' ? [m?.facility || '—', m?.facility || 'بدون ایستگاه']
      : a.by === 'group' ? [m?.groupId ?? '—', a.groupTitle?.(m?.groupId ?? null) ?? 'بدون گروه'] : ['all', 'کل پروژه']
    const b = buckets.get(key) ?? { label, rows: [] }
    b.rows.push(itemProgress(it, a.stages, a.asOf, m?.fxRate ?? 1, a.positions?.get(it.materialId)))
    buckets.set(key, b)
  }
  return [...buckets.entries()].map(([key, b]) => ({ key, label: b.label, ...rollup(b.rows) })).sort((x, y) => y.value - x.value)
}

/** Planned and actual progress over time (monthly points) for the S-curve. */
export function progressCurve(a: { items: PackageItem[]; stages: ItemStage[]; materials: Material[]; positions?: Map<string, Position>; from: string; to: string; stepDays?: number }): { date: string; planned: number; actual: number }[] {
  const step = (a.stepDays ?? 30) * 86400000
  const matFx = new Map(a.materials.map((m) => [m.id, m.fxRate || 1]))
  const out: { date: string; planned: number; actual: number }[] = []
  for (let t = Date.parse(a.from); t <= Date.parse(a.to) + step - 1; t += step) {
    const d = new Date(Math.min(t, Date.parse(a.to))).toISOString().slice(0, 10)
    const r = rollup(a.items.map((i) => itemProgress(i, a.stages, d, matFx.get(i.materialId) ?? 1, a.positions?.get(i.materialId))))
    out.push({ date: d, planned: r.planned, actual: r.actual })
    if (t >= Date.parse(a.to)) break
  }
  return out
}

/** Pattern check: the weights of the active stages must add up to 100. */
export function weightsSum(weights: Record<string, number>, activeKeys: string[]): number {
  return activeKeys.reduce((a, k) => a + (weights[k] ?? 0), 0)
}
export const weightsValid = (weights: Record<string, number>, activeKeys: string[]): boolean => Math.abs(weightsSum(weights, activeKeys) - 100) < 0.001
