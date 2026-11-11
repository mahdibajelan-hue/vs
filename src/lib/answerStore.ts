import type { AnswerStore, StoredAnswer } from './restFetchCore'

/**
 * Answers of earlier reads kept in the browser (IndexedDB), so a repeat visit can draw at once while the network
 * read runs behind it (see restFetchCore, `persist`). Anything older than a week is dropped. If IndexedDB is not
 * available (private window, blocked storage) every call quietly does nothing and the app reads from the network.
 */
const DB = 'rasta-answers', STORE = 'answers', MAX_AGE = 7 * 24 * 3600_000

let opening: Promise<IDBDatabase | null> | null = null
function db(): Promise<IDBDatabase | null> {
  if (opening) return opening
  opening = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
  void opening.then((d) => d && prune(d))
  return opening
}

function prune(d: IDBDatabase) {
  try {
    const cutoff = Date.now() - MAX_AGE
    const cur = d.transaction(STORE, 'readwrite').objectStore(STORE).openCursor()
    cur.onsuccess = () => { const c = cur.result; if (!c) return; if (((c.value as StoredAnswer)?.at ?? 0) < cutoff) c.delete(); c.continue() }
  } catch { /* nothing to prune */ }
}

export const browserAnswers: AnswerStore = {
  async get(key) {
    const d = await db()
    if (!d) return undefined
    return new Promise((resolve) => {
      try {
        const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key)
        r.onsuccess = () => { const v = r.result as StoredAnswer | undefined; resolve(v && Date.now() - v.at < MAX_AGE ? v : undefined) }
        r.onerror = () => resolve(undefined)
      } catch { resolve(undefined) }
    })
  },
  set(key, value) {
    void db().then((d) => { try { d?.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key) } catch { /* full or blocked: skip */ } })
  },
  clear() {
    void db().then((d) => { try { d?.transaction(STORE, 'readwrite').objectStore(STORE).clear() } catch { /* ignore */ } })
  },
}
