import { create } from 'zustand'
import type { Joint, JointFinalStatus, JointStatusField, Pipe, Route } from '../types'
import { DEMO_PIPE, DEMO_PROJECT_CREATED_AT, generateDemoJoints, generateDemoRoute } from '../lib/demoData'
import { generateJointsForRoute } from '../lib/jointGeneration'
import { deriveFinalStatus } from '../lib/progressEngine'

/**
 * MVP state — in-memory only (per spec: start with local/mock data, wire to PostgreSQL/PostGIS
 * once the backend exists).
 */
interface PdtState {
  projectName: string
  englishTag: string
  projectCreatedAt: string
  route: Route
  pipe: Pipe
  joints: Joint[]
  importing: boolean
  importError: string
  selectedJointId: string | null
  /** ISO timestamp for Timeline scrubbing, or null to show live/current state. */
  scrubDate: string | null
  statusFilter: JointFinalStatus | 'all'

  setRoute: (route: Route) => void
  setImporting: (v: boolean) => void
  setImportError: (msg: string) => void
  selectJoint: (id: string | null) => void
  updateJointField: (jointId: string, field: JointStatusField | 'notes', value: string) => void
  setScrubDate: (iso: string | null) => void
  setStatusFilter: (f: JointFinalStatus | 'all') => void
}

const initialDemoRoute = generateDemoRoute()

export const usePdtStore = create<PdtState>()((set, get) => ({
  projectName: 'IGAT-XX Demo Pipeline',
  englishTag: 'Pipeline Digital Twin',
  projectCreatedAt: DEMO_PROJECT_CREATED_AT,
  route: initialDemoRoute,
  pipe: DEMO_PIPE,
  joints: generateDemoJoints(initialDemoRoute),
  importing: false,
  importError: '',
  selectedJointId: null,
  scrubDate: null,
  statusFilter: 'all',

  setRoute: (route) =>
    set({
      route,
      importError: '',
      // A newly imported route replaces the working project — joints regenerate at the standard
      // stock-length interval, all `not_started` (no fabricated progress for a route nobody has
      // surveyed construction status on yet), and the working date range restarts from now.
      joints: route.source === 'demo' ? generateDemoJoints(route) : generateJointsForRoute(route),
      projectCreatedAt: route.source === 'demo' ? DEMO_PROJECT_CREATED_AT : new Date().toISOString(),
      selectedJointId: null,
      scrubDate: null,
    }),
  setImporting: (v) => set({ importing: v }),
  setImportError: (msg) => set({ importError: msg }),
  selectJoint: (id) => set({ selectedJointId: id }),

  updateJointField: (jointId, field, value) =>
    set(() => {
      const joints = get().joints.map((j) => {
        if (j.id !== jointId) return j
        const fromValue = field === 'notes' ? j.notes : String(j[field])
        if (fromValue === value) return j
        const updated: Joint = { ...j, history: [...j.history, { id: `${jointId}-${field}-${Date.now()}`, at: new Date().toISOString(), field, fromValue, toValue: value }] }
        switch (field) {
          case 'notes':
            updated.notes = value
            break
          case 'weldingStatus':
            updated.weldingStatus = value as Joint['weldingStatus']
            break
          case 'ndtStatus':
            updated.ndtStatus = value as Joint['ndtStatus']
            break
          case 'coatingStatus':
            updated.coatingStatus = value as Joint['coatingStatus']
            break
          case 'loweringStatus':
            updated.loweringStatus = value as Joint['loweringStatus']
            break
          case 'backfillStatus':
            updated.backfillStatus = value as Joint['backfillStatus']
            break
        }
        updated.finalStatus = deriveFinalStatus(updated)
        return updated
      })
      return { joints }
    }),

  setScrubDate: (iso) => set({ scrubDate: iso }),
  setStatusFilter: (f) => set({ statusFilter: f }),
}))
