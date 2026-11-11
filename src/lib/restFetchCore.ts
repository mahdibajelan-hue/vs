/**
 * A fetch wrapper for the Supabase REST endpoint (PostgREST), installed once on the shared client.
 *
 * 1. Complete reads. PostgREST answers at most `PAGE` rows per request. A plain read is sent in a stable order (the
 *    query's own order plus `id`, or the table's `keys`, as a tie-break); one that comes back exactly full is continued
 *    page by page, so no module ever computes a figure from the first 1000 rows of a bigger table.
 * 2. One request per question. Identical reads in flight at the same moment share one network request.
 * 3. A short memory. A read repeated within `ttlMs` (going back to a page) is answered from memory. Any write to the
 *    database (POST/PATCH/PUT/DELETE — including RPC calls, which may write) empties that memory first, so data a
 *    person just changed is always read fresh. Calls named `harmless` (read-only functions) do not.
 *
 * 4. Instant repeat visits (optional `persist`). A read marked with the `x-rasta-keep: <store>` header (a module
 *    store's own load, see lib/keepReads; the header never leaves the browser) is also kept in the browser. The next time the same question is asked with nothing in memory, the kept answer is returned at once and
 *    the network read runs behind it; if its answer differs, `onRevalidated(table)` tells the app to read again (which
 *    then comes from memory) with the table and the store that asked. Kept answers are keyed by the signed-in user (never by the token), and any write makes
 *    every answer kept before it unusable at once (`clearedAt`) while the store itself is emptied.
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

/** marks a read whose answer may be kept in the browser; its value names the store that reads it again */
export const KEEP_HEADER = 'x-rasta-keep'
function withoutHeader(init: RequestInit | undefined, name: string): RequestInit | undefined {
  if (!init?.headers) return init
  const h = new Headers(init.headers as HeadersInit)
  h.delete(name)
  return { ...init, headers: h }
}

const toResponse = (s: Stored) => new Response(s.body, { status: s.status, statusText: s.statusText, headers: s.headers })

export type StoredAnswer = Stored
/** a browser-side store of answers (IndexedDB in the app, a Map in tests) */
export interface AnswerStore { get(key: string): Promise<Stored | undefined>; set(key: string, value: Stored): void; clear(): void }

/** the signed-in user of a request, from its bearer token's `sub` (the token itself changes every hour) */
export function userOfAuth(auth: string | null): string {
  const tok = (auth ?? '').replace(/^Bearer /i, '')
  const part = tok.split('.')[1]
  if (!part) return 'anon'
  try {
    const json = typeof atob === 'function' ? atob(part.replace(/-/g, '+').replace(/_/g, '/')) : Buffer.from(part, 'base64').toString('utf8')
    return (JSON.parse(json) as { sub?: string }).sub ?? 'anon'
  } catch { return 'anon' }
}

/** `keys`: primary-key columns of tables that have no `id` column, used as the tie-break of a paged read. */
export function createRestFetch(base: FetchFn, opts: {
  ttlMs?: number; now?: () => number; keys?: Record<string, string[]>
  persist?: AnswerStore; onRevalidated?: (table: string, store: string) => void
  /** calls that change nothing the app reads: read-only (STABLE) functions, and writes to logs no page reads back */
  harmless?: (method: string, path: string) => boolean
  /** told of every database write (after memory is emptied), for other short-lived caches to empty theirs */
  onWrite?: () => void
} = {}) {
  let clearedAt = 0 // answers kept before the last write are never served
  const keysOf = (table: string) => opts.keys?.[table] ?? ['id']
  const ttl = opts.ttlMs ?? 30_000
  const now = opts.now ?? (() => Date.now())
  const memory = new Map<string, Stored>()
  const inflight = new Map<string, Promise<Stored>>()
  let generation = 0 // bumped by every write: a read that started before a write is not remembered

  const isRestRead = (url: URL, method: string) => method === 'GET' && url.pathname.includes('/rest/v1/') && !url.pathname.includes('/rest/v1/rpc/')

  // tables found to have no `id` column (and no `keys` entry): their reads are sent as asked
  const noTie = new Set<string>()
  const stableOrder = (url: URL) => {
    const order = url.searchParams.get('order')
    const table = url.pathname.split('/rest/v1/')[1] ?? ''
    const ordered = new Set((order ?? '').split(',').map((o) => o.split('.')[0]).filter(Boolean))
    const tie = keysOf(table).filter((k) => !ordered.has(k)).map((k) => `${k}.asc`)
    return [order, ...tie].filter(Boolean).join(',')
  }

  async function read(url: URL, init: RequestInit | undefined): Promise<Stored> {
    const table = url.pathname.split('/rest/v1/')[1] ?? ''
    const ranged = url.searchParams.has('limit') || url.searchParams.has('offset') || headerOf(init, 'Range') != null
    const single = (headerOf(init, 'Accept') ?? '').includes('vnd.pgrst.object')
    // a plain read is sent in a stable order from the start, so a full first page can be continued rather than re-read
    const tied = !ranged && !single && !noTie.has(table) && stableOrder(url) !== (url.searchParams.get('order') ?? '')
    let sent = url
    if (tied) { sent = new URL(url.toString()); sent.searchParams.set('order', stableOrder(url)) }
    let res = await base(sent.toString(), init)
    if (tied && res.status === 400) {
      const txt = await res.clone().text()
      if (/42703|does not exist/.test(txt)) { noTie.add(table); sent = url; res = await base(url.toString(), init) }
    }
    const stored: Stored = { status: res.status, statusText: res.statusText, headers: [...res.headers.entries()], body: await res.text(), at: now() }
    if (!res.ok || ranged || single) return stored
    let first: unknown
    try { first = JSON.parse(stored.body) } catch { return stored }
    if (!Array.isArray(first) || first.length < PAGE) return stored
    // a full page: read the rest in pages (continuing after the first page when it was already in a stable order)
    const all = await readAll(url, init, sent === url ? null : first)
    if (!all) return stored // the paged read failed (e.g. a table without `id`): keep the first page rather than break
    const total = all.length
    const headers = stored.headers.filter(([k]) => k.toLowerCase() !== 'content-range' && k.toLowerCase() !== 'content-length')
    headers.push(['content-range', `0-${Math.max(0, total - 1)}/${total}`])
    return { ...stored, headers, body: JSON.stringify(all) }
  }

  async function readAll(url: URL, init: RequestInit | undefined, firstPage: unknown[] | null): Promise<unknown[] | null> {
    const stable = stableOrder(url)
    const rows: unknown[] = firstPage ? [...firstPage] : []
    for (let offset = firstPage ? firstPage.length : 0; ; offset += PAGE) {
      const u = new URL(url.toString())
      if (stable) u.searchParams.set('order', stable)
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

  return async function restFetch(input: RequestInfo | URL, givenInit?: RequestInit): Promise<Response> {
    const keepFor = headerOf(givenInit, KEEP_HEADER)
    const init = keepFor ? withoutHeader(givenInit, KEEP_HEADER) : givenInit
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    let url: URL
    try { url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url) } catch { return base(input, init) }
    // only the database's own calls can change data; auth (token refresh) and storage pass straight through
    if (method !== 'GET' && method !== 'HEAD' && (!url.pathname.includes('/rest/v1/') || opts.harmless?.(method, url.pathname.split('/rest/v1/')[1] ?? ''))) return base(input, init)
    if (method !== 'GET' && method !== 'HEAD') {
      generation++; memory.clear(); inflight.clear(); clearedAt = now(); opts.persist?.clear(); opts.onWrite?.()
      try { return await base(input, init) } finally { generation++; memory.clear(); clearedAt = now(); opts.persist?.clear(); opts.onWrite?.() }
    }
    if (!isRestRead(url, method) || input instanceof Request) return base(input, init)

    const key = [url.toString(), headerOf(init, 'Authorization') ?? '', headerOf(init, 'Accept') ?? '', headerOf(init, 'Prefer') ?? '', headerOf(init, 'Range') ?? '', headerOf(init, 'Accept-Profile') ?? ''].join('\n')
    const table = url.pathname.split('/rest/v1/')[1] ?? ''
    const persistOn = !!opts.persist && !!keepFor && !headerOf(init, 'Range')
    const pkey = persistOn ? [url.toString(), userOfAuth(headerOf(init, 'Authorization')), headerOf(init, 'Accept') ?? '', headerOf(init, 'Prefer') ?? '', headerOf(init, 'Accept-Profile') ?? ''].join('\n') : ''
    const kept = memory.get(key)
    if (kept && now() - kept.at < ttl) return toResponse(kept)
    let p = inflight.get(key)
    if (!p) {
      const gen = generation
      // shared by every caller, so one caller's abort signal must not cancel it for the others
      const shared: RequestInit | undefined = init ? { ...init, signal: undefined } : init
      const mine: Promise<Stored> = read(url, shared).then((s) => {
        const ok = s.status >= 200 && s.status < 300
        if (gen === generation && ok) { memory.set(key, s); if (persistOn) opts.persist!.set(pkey, s) }
        return s
      }).finally(() => { if (inflight.get(key) === mine) inflight.delete(key) })
      p = mine
      inflight.set(key, p)
    }
    if (persistOn) {
      const old = await opts.persist!.get(pkey).catch(() => undefined)
      if (old && old.at > clearedAt && old.status >= 200 && old.status < 300) {
        // answer at once from the browser; the network read behind it tells the app when something changed
        p.then((s) => { if (s.status >= 200 && s.status < 300 && s.body !== old.body) opts.onRevalidated?.(table, keepFor!) }, () => undefined)
        return toResponse(old)
      }
    }
    return toResponse(await p)
  }
}
