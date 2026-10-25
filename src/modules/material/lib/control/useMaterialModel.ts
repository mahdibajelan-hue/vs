import { useMemo } from 'react'
import { useMaterialStore } from '../../store/useMaterialStore'
import { useMaterialControlStore, type LinkTarget } from '../../store/useMaterialControlStore'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import type { MatData, Position } from './model'
import { detectDiscrepancies, expectedArrival, type Detected } from './discrepancies'
import { frontsAtRisk, prioritize, type FrontRisk, type Priority } from './priority'
import { progressBy, progressCurve, type ProgressGroupRow, type Rollup } from './progress'
import { materialCore } from './materialCore'
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
    const core = materialCore(ms, cs, projectId)
    const { today, materials, pos, poLines, packages, items, stages, data, positions } = core
    const detected = detectDiscrepancies({ materials, positions, poLines, purchaseOrders: pos, settings: cs.settings, today })
    const linksByMaterial = new Map<string, MtlLink[]>()
    for (const l of cs.links) if (l.masterProjectId === projectId && l.sourceType === 'material' && l.sourceId) linksByMaterial.set(l.sourceId, [...(linksByMaterial.get(l.sourceId) ?? []), l])
    const openLinkCount = new Map([...linksByMaterial].map(([id, ls]) => [id, ls.filter((l) => isOpenTarget(cs.linkTargets.get(l.targetId))).length]))
    const arrival = new Map(materials.map((m) => { const p = positions.get(m.id)!; return [m.id, expectedArrival(m, poLines, pos, p.received, p.ordered)] as const }))
    const priorities = prioritize({ materials, positions, settings: cs.settings, today, arrival, openLinks: openLinkCount })
    const groupTitle = (id: string | null) => cs.groups.find((g) => g.id === id)?.title ?? 'بدون گروه'
    const base = { items, stages, packages: packages, materials, positions, asOf: today, groupTitle }
    const dates = [...stages.map((s) => s.plannedDate), ...stages.map((s) => s.approvedAt?.slice(0, 10) ?? null)].filter((d): d is string => !!d).sort()
    const curve = dates.length ? progressCurve({ items, stages, materials, positions, from: dates[0], to: dates.at(-1)! > today ? dates.at(-1)! : today, stepDays: 30 }) : []
    return {
      projectId, materials, data, positions, detected, priorities, priorityById: new Map(priorities.map((p) => [p.materialId, p])), fronts: frontsAtRisk(materials, priorities),
      suggestions: suggestRaises({ materials, positions, groups: cs.groups, detected, priorities, settings: cs.settings, today }), groups: cs.groups, groupById: new Map(cs.groups.map((g) => [g.id, g])),
      packages, items, stages, progress: core.progress, byPackage: progressBy({ ...base, by: 'package' }), byStation: progressBy({ ...base, by: 'station' }), byGroup: progressBy({ ...base, by: 'group' }), curve,
      discrepancies: cs.discrepancies.filter((d) => d.masterProjectId === projectId), linksByMaterial, openLinkCount, today,
      funnel: supplyFunnel(materials, positions), aging: needAging(materials, positions, today), deadlines: orderDeadlines(materials, positions, today, cs.settings.delayBufferDays), heat: stationGroupHeat(materials, positions, cs.groups), leadExposure: leadTimeExposure(materials, positions, today),
      hasDemo: materials.some((m) => m.isDemo),
    }
  }, [ms.materials, ms.purchaseOrders, ms.poLines, ms.manufacturing, ms.shipmentLines, ms.warehouseLines, ms.warehouseReceipts, ms.allocations, cs.txns, cs.packages, cs.items, cs.stages, cs.groups, cs.settings, cs.links, cs.linkTargets, cs.discrepancies, projectId, projects])
}
