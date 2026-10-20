import { create } from 'zustand'
import type { MasterProject } from '../../masterdata/types'
import { fetchPipePulseProjectMappings, fetchPipePulseProjects, summarizeProjectProgress } from '../../../lib/pipepulseRollup'

/** Physical progress per project (from the schedule module), loaded once per project and kept; null = unknown / not mapped. */
interface State { physical: Map<string, number | null>; pending: Set<string>; load: (projects: MasterProject[]) => void }
export const useProgressStore = create<State>()((set, get) => ({
  physical: new Map(),
  pending: new Set(),
  load: (projects) => {
    const todo = projects.filter((p) => !get().physical.has(p.id) && !get().pending.has(p.id))
    if (!todo.length) return
    for (const p of todo) get().pending.add(p.id)
    // one mapping read and one batched detail read for every project asked for, instead of four requests per project
    void (async () => {
      const result = new Map<string, number | null>()
      try {
        const mappings = await fetchPipePulseProjectMappings()
        const ids = [...new Set(todo.map((p) => mappings.get(p.id)).filter((x): x is string => !!x))]
        const details = await fetchPipePulseProjects(ids)
        for (const p of todo) {
          const pid = mappings.get(p.id) ?? null
          if (!pid) { result.set(p.id, null); continue }
          const s = summarizeProjectProgress(p, pid, details.get(pid) ?? null)
          result.set(p.id, s.configuredCount === 0 ? null : s.actualPercent)
        }
      } catch { for (const p of todo) result.set(p.id, null) }
      set((s) => ({ physical: new Map([...s.physical, ...result]) }))
    })()
  },
}))
