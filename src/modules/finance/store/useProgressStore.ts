import { create } from 'zustand'
import type { MasterProject } from '../../masterdata/types'
import { loadPickerProgress } from '../../../components/Auth/radar/pickerProgress'

/**
 * Physical progress per project — the project's lifecycle progress (Stage-Gate master plan, with the EPC phase from the
 * engineering / material / execution modules), exactly the figure the radar, the lifecycle and the dashboard show.
 * Loaded once per project and kept; null = no progress recorded.
 */
interface State { physical: Map<string, number | null>; planned: Map<string, number | null>; pending: Set<string>; load: (projects: MasterProject[]) => void }
export const useProgressStore = create<State>()((set, get) => ({
  physical: new Map(),
  planned: new Map(),
  pending: new Set(),
  load: (projects) => {
    const todo = projects.filter((p) => !get().physical.has(p.id) && !get().pending.has(p.id))
    if (!todo.length) return
    for (const p of todo) get().pending.add(p.id)
    void (async () => {
      const physical = new Map<string, number | null>(), planned = new Map<string, number | null>()
      try {
        const m = await loadPickerProgress(todo.map((p) => p.id))
        for (const p of todo) { const o = m.get(p.id)?.overall ?? null; physical.set(p.id, o ? o.actual : null); planned.set(p.id, o ? o.planned : null) }
      } catch { for (const p of todo) { physical.set(p.id, null); planned.set(p.id, null) } }
      set((s) => ({ physical: new Map([...s.physical, ...physical]), planned: new Map([...s.planned, ...planned]) }))
    })()
  },
}))
