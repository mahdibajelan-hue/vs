import { addDaysIso, diffDaysIso } from './cpm'

/** Master-plan tree: weights among siblings sum to 100; non-leaf progress is always bottom-up. */

export interface PlanNode {
  id: string; parentId: string | null; name: string
  weight: number; manualPct: number
  start: string | null; finish: string | null
}

export function childrenOf(nodes: PlanNode[], id: string | null): PlanNode[] {
  return nodes.filter((n) => n.parentId === id)
}

/** Progress of every node: leaves use manualPct, others the weight-averaged child progress. */
export function rollupProgress(nodes: PlanNode[]): Map<string, number> {
  const kids = new Map<string | null, PlanNode[]>()
  for (const n of nodes) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n])
  const out = new Map<string, number>()
  const visit = (n: PlanNode, seen: Set<string>): number => {
    if (out.has(n.id)) return out.get(n.id)!
    const ch = kids.get(n.id) ?? []
    let v: number
    if (ch.length === 0 || seen.has(n.id)) v = n.manualPct
    else {
      seen.add(n.id)
      const tw = ch.reduce((s, c) => s + c.weight, 0)
      v = tw === 0 ? ch.reduce((s, c) => s + visit(c, seen), 0) / ch.length
        : ch.reduce((s, c) => s + visit(c, seen) * c.weight, 0) / tw
    }
    out.set(n.id, Math.round(v * 10) / 10)
    return out.get(n.id)!
  }
  for (const n of nodes) visit(n, new Set())
  return out
}

export interface WeightIssue { parentId: string | null; sum: number }
/** Sibling groups whose weights do not total exactly 100. */
export function validateWeights(nodes: PlanNode[]): WeightIssue[] {
  const groups = new Map<string | null, number>()
  for (const n of nodes) groups.set(n.parentId, (groups.get(n.parentId) ?? 0) + n.weight)
  return [...groups].filter(([, sum]) => Math.abs(sum - 100) > 0.01).map(([parentId, sum]) => ({ parentId, sum }))
}

/** Rescale each sibling group so weights total 100 (equal split when all are zero). Sum is exact. */
export function autoFitWeights(nodes: PlanNode[]): PlanNode[] {
  const byParent = new Map<string | null, PlanNode[]>()
  for (const n of nodes) byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n])
  const next = new Map<string, number>()
  for (const group of byParent.values()) {
    const tw = group.reduce((s, n) => s + n.weight, 0)
    let used = 0
    group.forEach((n, i) => {
      const w = i === group.length - 1 ? Math.round((100 - used) * 100) / 100
        : Math.round((tw === 0 ? 100 / group.length : (n.weight / tw) * 100) * 100) / 100
      used += w
      next.set(n.id, w)
    })
  }
  return nodes.map((n) => ({ ...n, weight: next.get(n.id) ?? n.weight }))
}

export interface CoverageIssue { parentId: string; gap: 'before' | 'after' | 'outside'; days: number }
/** Children should exactly span the parent window; reports where they leave a gap or overflow. */
export function coverageIssues(nodes: PlanNode[]): CoverageIssue[] {
  const issues: CoverageIssue[] = []
  for (const p of nodes) {
    if (!p.start || !p.finish) continue
    const ch = childrenOf(nodes, p.id).filter((c) => c.start && c.finish)
    if (ch.length === 0) continue
    const cs = ch.reduce((m, c) => (c.start! < m ? c.start! : m), ch[0].start!)
    const cf = ch.reduce((m, c) => (c.finish! > m ? c.finish! : m), ch[0].finish!)
    if (cs < p.start || cf > p.finish) issues.push({ parentId: p.id, gap: 'outside', days: Math.max(diffDaysIso(cs, p.start), diffDaysIso(p.finish, cf), 0) })
    if (cs > p.start) issues.push({ parentId: p.id, gap: 'before', days: diffDaysIso(p.start, cs) })
    if (cf < p.finish) issues.push({ parentId: p.id, gap: 'after', days: diffDaysIso(cf, p.finish) })
  }
  return issues
}

/** Linearly rescales a parent's descendants (recursively through each child) into [start, finish]. */
export function autoFitDates(nodes: PlanNode[], parentId: string): PlanNode[] {
  const parent = nodes.find((n) => n.id === parentId)
  if (!parent?.start || !parent.finish) return nodes
  const ch = childrenOf(nodes, parentId).filter((c) => c.start && c.finish)
  if (ch.length === 0) return nodes
  const cs = ch.reduce((m, c) => (c.start! < m ? c.start! : m), ch[0].start!)
  const cf = ch.reduce((m, c) => (c.finish! > m ? c.finish! : m), ch[0].finish!)
  const srcSpan = Math.max(1, diffDaysIso(cs, cf)), dstSpan = Math.max(1, diffDaysIso(parent.start, parent.finish))
  const map = (iso: string) => addDaysIso(parent.start!, Math.round((diffDaysIso(cs, iso) * dstSpan) / srcSpan))
  const ids = new Set(ch.map((c) => c.id))
  let result = nodes.map((n) => (ids.has(n.id) ? { ...n, start: map(n.start!), finish: map(n.finish!) } : n))
  for (const c of ch) result = autoFitDates(result, c.id)
  return result
}

export interface BaselineRow { id: string; start: string | null; finish: string | null }
export interface Baseline { id: string; label: string; createdAt: string; rows: BaselineRow[] }
/** Freezes planned dates; the returned object is deep-frozen so accidental mutation throws in strict mode. */
export function makeBaseline(id: string, label: string, createdAt: string, nodes: PlanNode[]): Baseline {
  const rows = nodes.map((n) => Object.freeze({ id: n.id, start: n.start, finish: n.finish }))
  return Object.freeze({ id, label, createdAt, rows: Object.freeze(rows) as BaselineRow[] }) as Baseline
}
/** Finish deviation in days vs. a baseline (positive = later than baseline). */
export function baselineVariance(nodes: PlanNode[], b: Baseline): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of b.rows) {
    const n = nodes.find((x) => x.id === r.id)
    if (n?.finish && r.finish) out.set(r.id, diffDaysIso(r.finish, n.finish))
  }
  return out
}

export interface TemplateNode { key: string; parentKey: string | null; name: string; weight: number; offsetDays: number; durationDays: number }
/** Convert a dated tree to relative offsets from its earliest start. */
export function toTemplate(nodes: PlanNode[]): TemplateNode[] {
  const dated = nodes.filter((n) => n.start && n.finish)
  if (dated.length === 0) return []
  const origin = dated.reduce((m, n) => (n.start! < m ? n.start! : m), dated[0].start!)
  return dated.map((n) => ({
    key: n.id, parentKey: dated.some((d) => d.id === n.parentId) ? n.parentId : null, name: n.name, weight: n.weight,
    offsetDays: diffDaysIso(origin, n.start!), durationDays: Math.max(1, diffDaysIso(n.start!, n.finish!)),
  }))
}
/** Apply a template at a new start date, generating fresh ids via `newId`. */
export function fromTemplate(t: TemplateNode[], startDate: string, newId: (key: string) => string): PlanNode[] {
  return t.map((n) => ({
    id: newId(n.key), parentId: n.parentKey ? newId(n.parentKey) : null, name: n.name, weight: n.weight, manualPct: 0,
    start: addDaysIso(startDate, n.offsetDays), finish: addDaysIso(startDate, n.offsetDays + n.durationDays),
  }))
}

/** FS/SS/FF/SF-aware schedule check: the dates on the nodes satisfy each dependency. */
export function dependencyViolations(
  nodes: PlanNode[], deps: { from: string; to: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag: number }[],
): { from: string; to: string; shortBy: number }[] {
  const by = new Map(nodes.map((n) => [n.id, n]))
  const bad: { from: string; to: string; shortBy: number }[] = []
  for (const d of deps) {
    const a = by.get(d.from), b = by.get(d.to)
    if (!a?.start || !a.finish || !b?.start || !b.finish) continue
    const need = d.type === 'FS' ? addDaysIso(a.finish, d.lag) : d.type === 'SS' ? addDaysIso(a.start, d.lag)
      : d.type === 'FF' ? addDaysIso(a.finish, d.lag) : addDaysIso(a.start, d.lag)
    const have = d.type === 'FS' || d.type === 'SS' ? b.start : b.finish
    if (have < need) bad.push({ from: d.from, to: d.to, shortBy: diffDaysIso(have, need) })
  }
  return bad
}
