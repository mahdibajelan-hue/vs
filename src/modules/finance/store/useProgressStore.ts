import { create } from 'zustand'
import type { MasterProject } from '../../masterdata/types'
import { fetchCostProgressCrossCheck } from '../lib/financeProgress'

/** Physical progress per project (from the schedule module), loaded once per project and kept; null = unknown / not mapped. */
interface State { physical: Map<string, number | null>; pending: Set<string>; load: (projects: MasterProject[]) => void }
export const useProgressStore = create<State>()((set, get) => ({
  physical: new Map(),
  pending: new Set(),
  load: (projects) => {
    for (const p of projects) {
      if (get().physical.has(p.id) || get().pending.has(p.id)) continue
      get().pending.add(p.id)
      fetchCostProgressCrossCheck(p, 0).then((c) => set((s) => ({ physical: new Map(s.physical).set(p.id, c.physicalPercent) }))).catch(() => set((s) => ({ physical: new Map(s.physical).set(p.id, null) })))
    }
  },
}))
