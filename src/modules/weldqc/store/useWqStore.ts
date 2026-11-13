import { create } from 'zustand'
import * as repo from '../repo'
import { useAuthStore } from '../../../store/useAuthStore'
import { mergeCriteria, type Criteria } from '../lib/rules'

type Caps = Record<'submit' | 'edit' | 'approve' | 'configure', boolean>
interface WqState extends repo.WqData {
  projectId: string | null; loading: boolean; error: string | null; caps: Caps; crit: Criteria
  flash: { tone: 'ok' | 'bad'; text: string } | null
  load: (pid: string, quiet?: boolean) => Promise<void>
  /** runs a write, reloads the project, and reports the outcome in Persian; returns true on success */
  run: (ok: string, fn: () => Promise<unknown>) => Promise<boolean>
  me: () => string
  clearFlash: () => void
}
const EMPTY: repo.WqData = { welds: [], welders: [], joints: [], films: [], marks: [], defects: [], evaluations: [], repairs: [], vts: [], opinions: [], criteria: null }

export const useWqStore = create<WqState>()((set, get) => ({
  ...EMPTY, projectId: null, loading: false, error: null, caps: { submit: false, edit: false, approve: false, configure: false }, crit: mergeCriteria(null), flash: null,
  load: async (pid, quiet) => {
    if (!quiet) set({ loading: true, error: null, ...(get().projectId !== pid ? EMPTY : {}), projectId: pid })
    try {
      const [d, caps] = await Promise.all([repo.loadAll(pid), repo.loadCaps(pid)])
      if (get().projectId !== pid) return
      set({ ...d, caps, crit: mergeCriteria(d.criteria), loading: false, error: null })
    } catch (e) { set({ loading: false, error: repo.explain(e) }) }
  },
  run: async (ok, fn) => {
    try {
      await fn()
      const pid = get().projectId; if (pid) await get().load(pid, true)
      set({ flash: { tone: 'ok', text: ok } }); return true
    } catch (e) { set({ flash: { tone: 'bad', text: repo.explain(e) } }); return false }
  },
  me: () => { const p = useAuthStore.getState().profile; return p?.fullName || p?.email || '' },
  clearFlash: () => set({ flash: null }),
}))
