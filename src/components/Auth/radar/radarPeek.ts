import { create } from 'zustand'
import type { MasterProject } from '../../../modules/masterdata/types'
import { buildRadarData } from './radarLiveData'
import type { RadarData } from './radarTypes'

/**
 * The radar's live picture of each project, kept for the project menu: its row values and hover cards read the same
 * figures the radar shows. The radar page writes what it reads; inside a module the menu asks for it once, quietly.
 * Only live pictures are kept, so the menu never shows the radar's placeholder.
 */
interface PeekState {
  byProject: Record<string, RadarData>
  loading: Record<string, boolean>
  put: (projectId: string, data: RadarData) => void
  ensure: (project: MasterProject) => void
}

export const useRadarPeek = create<PeekState>()((set, get) => ({
  byProject: {},
  loading: {},
  put: (projectId, data) => { if (data.live) set((s) => ({ byProject: { ...s.byProject, [projectId]: data } })) },
  ensure: (p) => {
    const s = get()
    if (s.byProject[p.id] || s.loading[p.id]) return
    set((x) => ({ loading: { ...x.loading, [p.id]: true } }))
    buildRadarData(p.id, p.officialName, p.projectIdCode || p.projectCode)
      .then((d) => get().put(p.id, d))
      .catch(() => { /* the menu simply shows no values */ })
      .finally(() => set((x) => ({ loading: { ...x.loading, [p.id]: false } })))
  },
}))
