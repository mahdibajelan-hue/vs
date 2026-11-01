import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

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

/** the module the remembered state belongs to — set by the module store, read here without importing it (no cycle) */
let currentModule = 'hub'
export const setNavModule = (m: string | null) => { currentModule = m ?? 'hub' }

/**
 * useState that survives a page refresh within the same browser tab. `slot` names the state inside the current module;
 * `valid` rejects a stored value that no longer fits (a removed tab, a project the user can no longer see).
 */
export function useRemembered<T>(slot: string, init: T | (() => T), valid: (v: unknown) => boolean = () => true): [T, Dispatch<SetStateAction<T>>] {
  const [key] = useState(() => `${currentModule}:${slot}`)
  const [v, setV] = useState<T>(() => {
    const raw = navStorage.get(key)
    if (raw != null) { try { const p = JSON.parse(raw) as unknown; if (valid(p)) return p as T } catch { /* bad value: fall back */ } }
    return typeof init === 'function' ? (init as () => T)() : init
  })
  useEffect(() => { navStorage.set(key, v === undefined ? null : JSON.stringify(v)) }, [key, v])
  return [v, setV]
}
