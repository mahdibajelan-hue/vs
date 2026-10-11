import { useMemo } from 'react'
import { useMaterialStore } from '../../store/useMaterialStore'
import { useMaterialControlStore, type LinkTarget } from '../../store/useMaterialControlStore'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { buildPositions, type MatData, type Position } from './model'
import { detectDiscrepancies, expectedArrival, type Detected } from './discrepancies'
import { frontsAtRisk, prioritize, type FrontRisk, type Priority } from './priority'
import { itemProgress, progressBy, progressCurve, rollup, type ProgressGroupRow, type Rollup } from './progress'
import { suggestRaises, type RaiseSuggestion } from './riskSuggest'
import { leadTimeExposure, needAging, orderDeadlines, stationGroupHeat, supplyFunnel, type AgingBucket, type FunnelStage, type Heat, type LeadRow, type OrderDeadline } from './insights'
import type { ItemStage, Material, MtlDiscrepancy, MtlGroup, MtlLink, MtlPackage, PackageItem } from '../../types'

const OPEN_ISSUE = new Set(['open', 'in_progress', 'pending_approval'])
export const isOpenTarget = (t: LinkTarget | undefined): boolean => !!t && (t.kind === 'issue' ? OPEN_ISSUE.has(t.status) : t.status !== 'closed')

export interface MaterialModel {
  projectId: string | null
  materials: Material[]
  data: MatData
  positions: Map<string, Position>
  detected: Detected[]
  priorities: Priority[]
  priorityById: Map<string, Priority>
  fronts: FrontRisk[]
  suggestions: RaiseSuggestion[]
  groups: MtlGroup[]
  groupById: Map<string, MtlGroup>
  packages: MtlPackage[]
  items: PackageItem[]
  stages: ItemStage[]
  progress: Rollup
  byPackage: ProgressGroupRow[]
  byStation: ProgressGroupRow[]
  byGroup: ProgressGroupRow[]
  curve: { date: string; planned: number; actual: number }[]
  discrepancies: MtlDiscrepancy[]
  linksByMaterial: Map<string, MtlLink[]>
  openLinkCount: Map<string, number>
  funnel: FunnelStage[]
  aging: AgingBucket[]
  deadlines: OrderDeadline[]
  heat: Heat
  leadExposure: LeadRow[]
  today: string
  hasDemo: boolean
}

/** One place that turns the two stores into everything the pages show for a project. Pure functions do the work; this only selects and memoises. */
export function useMaterialModel(projectId: string | null): MaterialModel {
  const ms = useMaterialStore()
  const cs = useMaterialControlStore()
  const projects = useMasterDataStore((s) => s.projects)
  return useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const materials = ms.materials.filter((m) => m.masterProjectId === projectId)
    const mIds = new Set(materials.map((m) => m.id))
    const pos = ms.purchaseOrders.filter((p) => p.masterProjectId === projectId)
    const poIds = new Set(pos.map((p) => p.id))
    const poLines = ms.poLines.filter((l) => poIds.has(l.poId))
    const lineIds = new Set(poLines.map((l) => l.id))
    const receipts = new Set(ms.warehouseReceipts.filter((r) => r.masterProjectId === projectId).map((r) => r.id))
    const packages = cs.packages.filter((p) => p.masterProjectId === projectId)
    const pkgIds = new Set(packages.map((p) => p.id))
    const items = cs.items.filter((i) => pkgIds.has(i.packageId))
    const itemIds = new Set(items.map((i) => i.id))
    const stages = cs.stages.filter((s) => itemIds.has(s.itemId))
    const data: MatData = {
      materials, purchaseOrders: pos, poLines, manufacturing: ms.manufacturing.filter((m) => lineIds.has(m.poLineId)),
      shipmentLines: ms.shipmentLines.filter((l) => mIds.has(l.materialId)), warehouseLines: ms.warehouseLines.filter((l) => receipts.has(l.receiptId)),
      allocations: ms.allocations.filter((a) => a.masterProjectId === projectId), txns: cs.txns.filter((t) => t.masterProjectId === projectId), packages, packageItems: items,
    }
    const positions = buildPositions(data)
    const detected = detectDiscrepancies({ materials, positions, poLines, purchaseOrders: pos, settings: cs.settings, today })
    const linksByMaterial = new Map<string, MtlLink[]>()
    for (const l of cs.links) if (l.masterProjectId === projectId && l.sourceType === 'material' && l.sourceId) linksByMaterial.set(l.sourceId, [...(linksByMaterial.get(l.sourceId) ?? []), l])
    const openLinkCount = new Map([...linksByMaterial].map(([id, ls]) => [id, ls.filter((l) => isOpenTarget(cs.linkTargets.get(l.targetId))).length]))
    const arrival = new Map(materials.map((m) => { const p = positions.get(m.id)!; return [m.id, expectedArrival(m, poLines, pos, p.received, p.ordered)] as const }))
    const priorities = prioritize({ materials, positions, settings: cs.settings, today, arrival, openLinks: openLinkCount })
    const progressRows = items.map((i) => itemProgress(i, stages, today, materials.find((m) => m.id === i.materialId)?.fxRate ?? 1))
    const groupTitle = (id: string | null) => cs.groups.find((g) => g.id === id)?.title ?? 'بدون گروه'
    const base = { items, stages, packages: packages, materials, asOf: today, groupTitle }
    const dates = [...stages.map((s) => s.plannedDate), ...stages.map((s) => s.approvedAt?.slice(0, 10) ?? null)].filter((d): d is string => !!d).sort()
    const curve = dates.length ? progressCurve({ items, stages, materials, from: dates[0], to: dates.at(-1)! > today ? dates.at(-1)! : today, stepDays: 30 }) : []
    return {
      projectId, materials, data, positions, detected, priorities, priorityById: new Map(priorities.map((p) => [p.materialId, p])), fronts: frontsAtRisk(materials, priorities),
      suggestions: suggestRaises({ materials, positions, groups: cs.groups, detected, priorities, settings: cs.settings, today }), groups: cs.groups, groupById: new Map(cs.groups.map((g) => [g.id, g])),
      packages, items, stages, progress: rollup(progressRows), byPackage: progressBy({ ...base, by: 'package' }), byStation: progressBy({ ...base, by: 'station' }), byGroup: progressBy({ ...base, by: 'group' }), curve,
      discrepancies: cs.discrepancies.filter((d) => d.masterProjectId === projectId), linksByMaterial, openLinkCount, today,
      funnel: supplyFunnel(materials, positions), aging: needAging(materials, positions, today), deadlines: orderDeadlines(materials, positions, today, cs.settings.delayBufferDays), heat: stationGroupHeat(materials, positions, cs.groups), leadExposure: leadTimeExposure(materials, positions, today),
      hasDemo: materials.some((m) => m.isDemo),
    }
  }, [ms.materials, ms.purchaseOrders, ms.poLines, ms.manufacturing, ms.shipmentLines, ms.warehouseLines, ms.warehouseReceipts, ms.allocations, cs.txns, cs.packages, cs.items, cs.stages, cs.groups, cs.settings, cs.links, cs.linkTargets, cs.discrepancies, projectId, projects])
}
