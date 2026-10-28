/**
 * Request coalescing for per-project loaders (DataLoader pattern).
 *
 * Loaders written for one project (`.eq('project_name', p)`) become N round trips when a portfolio page loads N projects.
 * `batchedRows` collects every call made within the same short window for the same table / column / select / filters,
 * sends ONE `.in(column, [all keys])` query (paged past the 1000-row limit) and hands each caller only its own rows.
 * Nothing is cached after the batch resolves, so a write followed by a reload always sees fresh data.
 */

type Row = Record<string, unknown>
export interface BatchSpec {
  table: string
  column: string
  select?: string
  /** equality filters applied to the whole batch */
  eq?: Record<string, string | number | boolean>
}
export type Fetcher = (spec: Required<Omit<BatchSpec, 'eq'>> & { eq: Record<string, string | number | boolean> }, keys: string[], from: number, to: number) => Promise<{ data: Row[] | null; error: { message: string } | null }>

const PAGE = 1000
const WINDOW_MS = 12
const MAX_KEYS = 150

interface Waiter { keys: string[]; resolve: (rows: Row[]) => void; reject: (e: unknown) => void }
interface Queue { spec: Required<Omit<BatchSpec, 'eq'>> & { eq: Record<string, string | number | boolean> }; keys: Set<string>; waiters: Waiter[]; timer: ReturnType<typeof setTimeout> | null }

export function createBatcher(fetcher: Fetcher, windowMs = WINDOW_MS) {
  const queues = new Map<string, Queue>()

  async function fetchAll(q: Queue, keys: string[]) {
    const rows: Row[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await fetcher(q.spec, keys, from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      rows.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
    return rows
  }

  async function flush(id: string) {
    const q = queues.get(id)
    if (!q) return
    queues.delete(id)
    const keys = [...q.keys]
    try {
      const chunks: string[][] = []
      for (let i = 0; i < keys.length; i += MAX_KEYS) chunks.push(keys.slice(i, i + MAX_KEYS))
      const rows = (await Promise.all(chunks.map((c) => fetchAll(q, c)))).flat()
      const by = new Map<string, Row[]>()
      for (const r of rows) { const k = String(r[q.spec.column]); const l = by.get(k); if (l) l.push(r); else by.set(k, [r]) }
      for (const w of q.waiters) w.resolve(w.keys.flatMap((k) => by.get(k) ?? []))
    } catch (e) {
      for (const w of q.waiters) w.reject(e)
    }
  }

  // rows are untyped database records; callers map them with their module's own row mappers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function batchedRows(spec: BatchSpec, keys: string | string[]): Promise<Record<string, any>[]> {
    const list = (Array.isArray(keys) ? keys : [keys]).filter((k) => k != null && k !== '').map(String)
    if (!list.length) return Promise.resolve([])
    const full = { table: spec.table, column: spec.column, select: spec.select ?? '*', eq: spec.eq ?? {} }
    const id = JSON.stringify([full.table, full.column, full.select, Object.entries(full.eq).sort()])
    let q = queues.get(id)
    if (!q) { q = { spec: full, keys: new Set(), waiters: [], timer: null }; queues.set(id, q) }
    for (const k of list) q.keys.add(k)
    return new Promise<Row[]>((resolve, reject) => {
      q!.waiters.push({ keys: list, resolve, reject })
      if (!q!.timer) q!.timer = setTimeout(() => void flush(id), windowMs)
    })
  }
}

/** rows sorted by a field, ascending (or descending) — batches come back unordered */
export function sortBy<T extends Row>(rows: T[], field: string, desc = false): T[] {
  return [...rows].sort((a, b) => { const x = String(a[field] ?? ''), y = String(b[field] ?? ''); return desc ? y.localeCompare(x) : x.localeCompare(y) })
}

/** One in-flight promise per key for `ttlMs` — for lookup tables (phase definitions …) that every project's loader reads. */
export function createShared(ttlMs = 2000) {
  const m = new Map<string, { at: number; p: Promise<unknown> }>()
  return function shared<T>(key: string, fn: () => PromiseLike<T>): Promise<T> {
    const hit = m.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>
    const p = Promise.resolve(fn())
    m.set(key, { at: Date.now(), p })
    p.catch(() => m.delete(key))
    return p
  }
}
