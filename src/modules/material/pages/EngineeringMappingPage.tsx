import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, GitBranch, Tag } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useMaterialStore } from '../store/useMaterialStore'
import { fmtQty, fmtValue, fmtWeight } from '../components/MaterialKpiTile'
import { MATERIAL_ACCENT } from '../MaterialApp'
import { COMMODITY_TYPE_LABEL_FA, type Material } from '../types'

const UNSPECIFIED = '(نامشخص)'

interface GroupNode {
  key: string
  label: string
  materials: Material[]
  children: GroupNode[]
}

function groupBy(materials: Material[], levels: (keyof Material)[]): GroupNode[] {
  if (levels.length === 0) return []
  const [field, ...rest] = levels
  const buckets = new Map<string, Material[]>()
  for (const m of materials) {
    const raw = String(m[field] ?? '').trim()
    const key = raw || UNSPECIFIED
    const list = buckets.get(key) ?? []
    list.push(m)
    buckets.set(key, list)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a === UNSPECIFIED ? 1 : b === UNSPECIFIED ? -1 : a.localeCompare(b)))
    .map(([key, list]) => ({ key, label: key, materials: list, children: rest.length > 0 ? groupBy(list, rest) : [] }))
}

/**
 * Engineering / P&ID mapping — the drill-down path Facility -> Area -> System -> P&ID -> Tag ->
 * Material required by spec, built by grouping mtl_materials' own facility/area/system/pid/tag
 * columns rather than a separate master-data hierarchy table (see schema.sql section 20 note).
 */
export function EngineeringMappingPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const materials = useMaterialStore((s) => s.materials).filter((m) => m.masterProjectId === masterProjectId)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const tree = useMemo(() => groupBy(materials, ['facility', 'area', 'systemName', 'pidNumber']), [materials])

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  if (!project) return <div className="flex h-40 items-center justify-center text-xs text-muted">پروژه یافت نشد</div>

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-xs text-muted">نقشه‌برداری مهندسی — درون‌روی از فسیلیتی تا Tag</p>
        <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
      </div>

      {tree.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">هنوز کالایی با مشخصات مهندسی برای این پروژه ثبت نشده است.</div>
      ) : (
        <div className="glass-panel rounded-2xl p-2">
          {tree.map((facilityNode) => (
            <GroupRow key={facilityNode.key} node={facilityNode} depth={0} path={facilityNode.key} expanded={expanded} onToggle={toggle} />
          ))}
        </div>
      )}
    </div>
  )
}

function GroupRow({ node, depth, path, expanded, onToggle }: { node: GroupNode; depth: number; path: string; expanded: Set<string>; onToggle: (path: string) => void }) {
  const isOpen = expanded.has(path)
  const totalWeight = node.materials.reduce((sum, m) => sum + m.totalWeightKg, 0)
  const totalValue = node.materials.reduce((sum, m) => sum + m.totalValue, 0)
  const currency = node.materials[0]?.currency

  return (
    <div>
      <button
        onClick={() => onToggle(path)}
        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-right hover:bg-white/[0.03]"
        style={{ paddingRight: `${depth * 18 + 10}px` }}
      >
        {node.children.length > 0 ? isOpen ? <ChevronDown size={13} className="shrink-0 text-muted" /> : <ChevronLeft size={13} className="shrink-0 text-muted" /> : <span className="w-[13px] shrink-0" />}
        <GitBranch size={12} style={{ color: MATERIAL_ACCENT }} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs font-bold">{node.label}</span>
        <span className="num shrink-0 text-[10.5px] text-muted">{node.materials.length} قلم</span>
        <span className="num hidden shrink-0 text-[10.5px] text-secondary sm:inline">{fmtWeight(totalWeight)}</span>
        <span className="num hidden shrink-0 text-[10.5px] text-secondary md:inline">{fmtValue(totalValue, currency)}</span>
      </button>

      {isOpen && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <GroupRow key={child.key} node={child} depth={depth + 1} path={`${path}/${child.key}`} expanded={expanded} onToggle={onToggle} />
          ))}
        </div>
      )}

      {isOpen && node.children.length === 0 && (
        <div className="space-y-1 pb-2 pr-6" style={{ paddingRight: `${depth * 18 + 34}px` }}>
          {node.materials.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">
              <Tag size={11} className="shrink-0 text-muted" />
              <span className="num text-[11px]" dir="ltr">
                {m.tagNumber || '—'}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-secondary">{m.description || m.materialCode}</span>
              <span className="text-[10px] text-muted">{COMMODITY_TYPE_LABEL_FA[m.commodityType]}</span>
              <span className="num shrink-0 text-[11px] font-bold">{fmtQty(m.mtoQuantity, m.unit)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
