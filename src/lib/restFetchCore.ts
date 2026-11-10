/**
 * A fetch wrapper for the Supabase REST endpoint (PostgREST), installed once on the shared client.
 *
 * 1. Complete reads. PostgREST answers at most `PAGE` rows per request. A plain read that comes back exactly full is
 *    re-read page by page in a stable order (the query's own order plus `id` as a tie-break), so no module ever
 *    computes a figure from the first 1000 rows of a bigger table.
 * 2. One request per question. Identical reads in flight at the same moment share one network request.
 * 3. A short memory. A read repeated within `ttlMs` (going back to a page) is answered from memory. Any write
 *    (POST/PATCH/PUT/DELETE — including RPC calls, which may write) empties that memory first, so data a person just
 *    changed is always read fresh.
 *
 * Only GETs to /rest/v1/<table> are touched; auth, storage, functions and RPC reads pass straight through.
 */

export const PAGE = 1000

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
interface Stored { status: number; statusText: string; headers: [string, string][]; body: string; at: number }

const headerOf = (init: RequestInit | undefined, name: string): string | null => {
  const h = init?.headers
  if (!h) return null
  if (h instanceof Headers) return h.get(name)
  if (Array.isArray(h)) { const f = h.find(([k]) => k.toLowerCase() === name.toLowerCase()); return f ? f[1] : null }
  const rec = h as Record<string, string>
  for (const k of Object.keys(rec)) if (k.toLowerCase() === name.toLowerCase()) return rec[k]
  return null
}

const toResponse = (s: Stored) => new Response(s.body, { status: s.status, statusText: s.statusText, headers: s.headers })

/** `keys`: primary-key columns of tables that have no `id` column, used as the tie-break of a paged read. */
export function createRestFetch(base: FetchFn, opts: { ttlMs?: number; now?: () => number; keys?: Record<string, string[]> } = {}) {
  const keysOf = (table: string) => opts.keys?.[table] ?? ['id']
  const ttl = opts.ttlMs ?? 30_000
  const now = opts.now ?? (() => Date.now())
  const memory = new Map<string, Stored>()
  const inflight = new Map<string, Promise<Stored>>()
  let generation = 0 // bumped by every write: a read that started before a write is not remembered

  const isRestRead = (url: URL, method: string) => method === 'GET' && url.pathname.includes('/rest/v1/') && !url.pathname.includes('/rest/v1/rpc/')

  async function read(url: URL, init: RequestInit | undefined): Promise<Stored> {
    const res = await base(url.toString(), init)
    const stored: Stored = { status: res.status, statusText: res.statusText, headers: [...res.headers.entries()], body: await res.text(), at: now() }
    if (!res.ok) return stored
    // a full page from a read that did not ask for a range: read the whole table in pages
    const ranged = url.searchParams.has('limit') || url.searchParams.has('offset') || headerOf(init, 'Range') != null
    const single = (headerOf(init, 'Accept') ?? '').includes('vnd.pgrst.object')
    if (ranged || single) return stored
    let first: unknown
    try { first = JSON.parse(stored.body) } catch { return stored }
    if (!Array.isArray(first) || first.length < PAGE) return stored
    const all = await readAll(url, init)
    if (!all) return stored // the paged read failed (e.g. a table without `id`): keep the first page rather than break
    const total = all.length
    const headers = stored.headers.filter(([k]) => k.toLowerCase() !== 'content-range' && k.toLowerCase() !== 'content-length')
    headers.push(['content-range', `0-${Math.max(0, total - 1)}/${total}`])
    return { ...stored, headers, body: JSON.stringify(all) }
  }

  async function readAll(url: URL, init: RequestInit | undefined): Promise<unknown[] | null> {
    const order = url.searchParams.get('order')
    const table = url.pathname.split('/rest/v1/')[1] ?? ''
    const ordered = new Set((order ?? '').split(',').map((o) => o.split('.')[0]).filter(Boolean))
    const tie = keysOf(table).filter((k) => !ordered.has(k)).map((k) => `${k}.asc`)
    const stable = [order, ...tie].filter(Boolean).join(',')
    const rows: unknown[] = []
    for (let offset = 0; ; offset += PAGE) {
      const u = new URL(url.toString())
      u.searchParams.set('order', stable)
      u.searchParams.set('offset', String(offset))
      u.searchParams.set('limit', String(PAGE))
      const res = await base(u.toString(), init)
      if (!res.ok) return null
      const page = await res.json().catch(() => null)
      if (!Array.isArray(page)) return null
      rows.push(...page)
      if (page.length < PAGE) return rows
    }
  }

  return async function restFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    let url: URL
    try { url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url) } catch { return base(input, init) }
    if (method !== 'GET' && method !== 'HEAD') {
      generation++; memory.clear(); inflight.clear()
      try { return await base(input, init) } finally { generation++; memory.clear() }
    }
    if (!isRestRead(url, method) || input instanceof Request) return base(input, init)

    const key = [url.toString(), headerOf(init, 'Authorization') ?? '', headerOf(init, 'Accept') ?? '', headerOf(init, 'Prefer') ?? '', headerOf(init, 'Range') ?? '', headerOf(init, 'Accept-Profile') ?? ''].join('\n')
    const kept = memory.get(key)
    if (kept && now() - kept.at < ttl) return toResponse(kept)
    let p = inflight.get(key)
    if (!p) {
      const gen = generation
      // shared by every caller, so one caller's abort signal must not cancel it for the others
      const shared: RequestInit | undefined = init ? { ...init, signal: undefined } : init
      const mine: Promise<Stored> = read(url, shared).then((s) => { if (gen === generation && s.status >= 200 && s.status < 300) memory.set(key, s); return s })
        .finally(() => { if (inflight.get(key) === mine) inflight.delete(key) })
      p = mine
      inflight.set(key, p)
    }
    return toResponse(await p)
  }
}
