import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { getNavModule, urlInit, useUrlBind, type UrlKind } from './urlState'

/**
 * Where the user is (module, project, tab) is kept in the browser tab's sessionStorage, so a page refresh returns to
 * the same screen instead of the home page. A new browser tab or a new visit still starts at the home page.
 */
const PREFIX = 'rasta.nav.'
export const navStorage = {
  get(key: string): string | null { try { return sessionStorage.getItem(PREFIX + key) } catch { return null } },
  set(key: string, v: string | null) { try { if (v == null) sessionStorage.removeItem(PREFIX + key); else sessionStorage.setItem(PREFIX + key, v) } catch { /* storage blocked: the page just won't be restored */ } },
  /** forget every remembered tab of a module (a fresh entry into it opens at its own first page) */
  clearModule(module: string) {
    try { for (const k of Object.keys(sessionStorage)) if (k.startsWith(`${PREFIX}${module}:`)) sessionStorage.removeItem(k) } catch { /* ignore */ }
  },
}

/** the module the remembered state belongs to — set by the module store (kept in urlState, which the address also reads) */
export { setNavModule } from './urlState'

/**
 * useState that survives a page refresh within the same browser tab. `slot` names the state inside the current module;
 * `valid` rejects a stored value that no longer fits (a removed tab, a project the user can no longer see).
 * `url` also puts the value in the address bar (see lib/urlState.ts): the address wins over the remembered value when
 * it names this module, and back / forward set the state again. Only for string (or null) state.
 */
export function useRemembered<T>(slot: string, init: T | (() => T), valid: (v: unknown) => boolean = () => true, url?: UrlKind, fromUrl?: (v: T) => T): [T, Dispatch<SetStateAction<T>>] {
  const [key] = useState(() => `${getNavModule()}:${slot}`)
  const [v, setV] = useState<T>(() => {
    const first = pick()
    return fromUrl ? fromUrl(first) : first
  })
  function pick(): T {
    if (url) { const u = urlInit(url); if (u !== undefined && valid(u)) return u as T }
    const raw = url === 'r' ? null : navStorage.get(key) // an open record comes back only with its address (refresh, back), not on a later visit to the tab
    if (raw != null) { try { const p = JSON.parse(raw) as unknown; if (valid(p)) return p as T } catch { /* bad value: fall back */ } }
    return typeof init === 'function' ? (init as () => T)() : init
  }
  useEffect(() => { if (url !== 'r') navStorage.set(key, v === undefined ? null : JSON.stringify(v)) }, [key, v, url])
  useUrlBind(url ?? null, url && typeof v === 'string' ? v : '', (x) => { if (url && valid(x)) setV(x as T) })
  return [v, setV]
}

/** for a `{ [tab]: subView }` slot: the sub-view the address names goes to the tab the address names */
export function urlSubs<T>(v: T): T {
  const t = urlInit('tab'), sb = urlInit('sub')
  return t && sb ? ({ ...(v as object), [t]: sb } as T) : v
}
