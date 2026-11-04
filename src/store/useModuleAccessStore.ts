import { create } from 'zustand'
import { supabase } from '../lib/supabaseClient'
import type { ModuleKey } from './useModuleStore'

interface ModuleAccessState {
  /**
   * null before the first successful fetch — treated as "allow everything" everywhere this is
   * read, so a slow/failed check can never lock a legitimate user out. Once loaded, holds exactly
   * the module keys rasta_my_accessible_modules() returned for the signed-in user.
   */
  accessibleModules: Set<ModuleKey> | null
  loading: boolean
  fetched: boolean
  fetchAccess: () => Promise<void>
  reset: () => void
}

export const useModuleAccessStore = create<ModuleAccessState>()((set) => ({
  accessibleModules: null,
  loading: false,
  fetched: false,

  fetchAccess: async () => {
    set({ loading: true })
    const { data, error } = await supabase.rpc('rasta_my_accessible_modules')
    // a failed re-check keeps the list already loaded (an admin's change shows on the next successful one)
    if ((error || !data) && useModuleAccessStore.getState().accessibleModules) { set({ loading: false }); return }
    if (error || !data) {
      // Fail open — an RPC error must never be the reason a legitimate user can't reach a module.
      set({ accessibleModules: null, loading: false, fetched: true })
      return
    }
    const keys = new Set((data as { module_key: string }[]).map((r) => r.module_key)) as Set<ModuleKey>
    set({ accessibleModules: keys, loading: false, fetched: true })
  },

  reset: () => set({ accessibleModules: null, loading: false, fetched: false }),
}))

/** true unless we've actually loaded a list that excludes this module. */
export function hasModuleAccess(accessibleModules: Set<ModuleKey> | null, key: ModuleKey): boolean {
  // the project dashboard and health centre only read what the project's modules already show — open to everyone who can
  // open the radar; every other module (PSSR, testing, stations, stakeholders and statements included) follows the
  // person's module access, so an account that starts closed sees only what an admin opened
  return key === 'projectdashboard' || key === 'healthcenter' || accessibleModules === null || accessibleModules.has(key)
}

/**
 * An admin can open or close a module while the person has the app open. The list is read at sign-in, so it is read
 * again whenever the app comes back to the foreground (at most every 30 s) and every 5 minutes while it is in view.
 */
if (typeof window !== 'undefined') {
  let last = Date.now()
  const recheck = (force = false) => {
    const s = useModuleAccessStore.getState()
    if (!s.fetched || s.loading || document.visibilityState !== 'visible') return
    if (!force && Date.now() - last < 30_000) return
    last = Date.now()
    void s.fetchAccess()
  }
  document.addEventListener('visibilitychange', () => recheck())
  window.addEventListener('focus', () => recheck())
  window.setInterval(() => recheck(true), 5 * 60_000)
}
