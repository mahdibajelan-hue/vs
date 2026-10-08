/** Critical-path method over tasks with FS/SS/FF/SF dependencies and lag (+) / lead (−).
 * Times are integer days from the project start; a task occupies [es, ef) with ef = es + duration. */

export type DepType = 'FS' | 'SS' | 'FF' | 'SF'
export const DEP_TYPES: DepType[] = ['FS', 'SS', 'FF', 'SF']
export const DEP_LABEL_FA: Record<DepType, string> = {
  FS: 'پایان به شروع', SS: 'شروع به شروع', FF: 'پایان به پایان', SF: 'شروع به پایان',
}

export interface CpmTask { id: string; duration: number; /** earliest allowed start (day offset) */ notBefore?: number }
export interface CpmDep { from: string; to: string; type: DepType; lag: number }
export interface CpmResult { es: number; ef: number; ls: number; lf: number; float: number; critical: boolean }
export interface CpmOutput {
  tasks: Map<string, CpmResult>
  finish: number
  /** Non-null when the graph has a cycle; `tasks` is then empty. */
  cycle: string[] | null
}

export function topoOrder(ids: string[], deps: CpmDep[]): { order: string[]; cycle: string[] | null } {
  const idSet = new Set(ids)
  const indeg = new Map(ids.map((i) => [i, 0]))
  const out = new Map<string, string[]>(ids.map((i) => [i, []]))
  for (const d of deps) {
    if (!idSet.has(d.from) || !idSet.has(d.to)) continue
    out.get(d.from)!.push(d.to)
    indeg.set(d.to, (indeg.get(d.to) ?? 0) + 1)
  }
  const queue = ids.filter((i) => indeg.get(i) === 0)
  const order: string[] = []
  while (queue.length) {
    const n = queue.shift()!
    order.push(n)
    for (const m of out.get(n)!) {
      indeg.set(m, indeg.get(m)! - 1)
      if (indeg.get(m) === 0) queue.push(m)
    }
  }
  return order.length === ids.length ? { order, cycle: null } : { order, cycle: ids.filter((i) => !order.includes(i)) }
}

export function runCpm(tasks: CpmTask[], deps: CpmDep[]): CpmOutput {
  const ids = tasks.map((t) => t.id)
  const { order, cycle } = topoOrder(ids, deps)
  if (cycle) return { tasks: new Map(), finish: 0, cycle }
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const valid = deps.filter((d) => byId.has(d.from) && byId.has(d.to))
  const incoming = new Map<string, CpmDep[]>(ids.map((i) => [i, []]))
  const outgoing = new Map<string, CpmDep[]>(ids.map((i) => [i, []]))
  for (const d of valid) { incoming.get(d.to)!.push(d); outgoing.get(d.from)!.push(d) }

  const es = new Map<string, number>()
  for (const id of order) {
    const t = byId.get(id)!
    let start = t.notBefore ?? 0
    for (const d of incoming.get(id)!) {
      const p = byId.get(d.from)!
      const pes = es.get(d.from)!, pef = pes + p.duration
      const lower =
        d.type === 'FS' ? pef + d.lag
        : d.type === 'SS' ? pes + d.lag
        : d.type === 'FF' ? pef + d.lag - t.duration
        : pes + d.lag - t.duration
      start = Math.max(start, lower)
    }
    es.set(id, Math.max(0, start))
  }
  let finish = 0
  for (const t of tasks) finish = Math.max(finish, es.get(t.id)! + t.duration)

  const ls = new Map<string, number>()
  for (const id of [...order].reverse()) {
    const t = byId.get(id)!
    let latest = finish - t.duration
    for (const d of outgoing.get(id)!) {
      const s = byId.get(d.to)!
      const sls = ls.get(d.to)!, slf = sls + s.duration
      const upper =
        d.type === 'FS' ? sls - d.lag - t.duration
        : d.type === 'SS' ? sls - d.lag
        : d.type === 'FF' ? slf - d.lag - t.duration
        : slf - d.lag
      latest = Math.min(latest, upper)
    }
    ls.set(id, latest)
  }

  const result = new Map<string, CpmResult>()
  for (const t of tasks) {
    const e = es.get(t.id)!, l = ls.get(t.id)!
    result.set(t.id, { es: e, ef: e + t.duration, ls: l, lf: l + t.duration, float: l - e, critical: l - e <= 0 })
  }
  return { tasks: result, finish, cycle: null }
}

/** ISO date + whole days (UTC, no DST drift). */
export function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(iso.slice(0, 10)) + days * 86_400_000).toISOString().slice(0, 10)
}
export function diffDaysIso(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000)
}
