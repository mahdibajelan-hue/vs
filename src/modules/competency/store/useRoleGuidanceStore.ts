import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { roleMaturityGuidanceFromRow, type RoleMaturityGuidanceDbRow, type RoleMaturityGuidanceRow } from '../lib/maturityGuidance'

/**
 * comp_role_maturity_guidance (schema.sql Section 57) — the role + band interpretation text of the
 * results page and PDF. Kept in its own tiny store (not useCompetencyStore) because the anonymous
 * public-results page reads it too, and it has nothing else in common with the module store.
 */
interface RoleGuidanceState {
  rows: RoleMaturityGuidanceRow[]
  loaded: boolean
  fetch: () => Promise<void>
}

export const useRoleGuidanceStore = create<RoleGuidanceState>((set, get) => ({
  rows: [],
  loaded: false,
  fetch: async () => {
    if (get().loaded) return
    const { data, error } = await supabase.from('comp_role_maturity_guidance').select('job_role, band, guidance, suggested_positions')
    // Missing table/permission → the family templates in maturityGuidance.ts still apply.
    set({ rows: error ? [] : ((data ?? []) as RoleMaturityGuidanceDbRow[]).map(roleMaturityGuidanceFromRow), loaded: true })
  },
}))
