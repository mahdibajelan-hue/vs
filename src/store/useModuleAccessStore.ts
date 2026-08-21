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
  return accessibleModules === null || accessibleModules.has(key)
}
