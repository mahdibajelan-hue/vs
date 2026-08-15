import { create } from 'zustand'
import type { Route } from '../types'
import { generateDemoRoute } from '../lib/demoData'

/**
 * MVP state — in-memory only (per spec: start with local/mock data, wire to PostgreSQL/PostGIS
 * once the backend exists). Only Route lives here for now; Joint/Pipe/etc. join once the phases
 * that build them (5+) land.
 */
interface PdtState {
  projectName: string
  englishTag: string
  route: Route
  importing: boolean
  importError: string
  setRoute: (route: Route) => void
  setImporting: (v: boolean) => void
  setImportError: (msg: string) => void
}

export const usePdtStore = create<PdtState>()((set) => ({
  projectName: 'IGAT-XX Demo Pipeline',
  englishTag: 'Pipeline Digital Twin',
  route: generateDemoRoute(),
  importing: false,
  importError: '',
  setRoute: (route) => set({ route, importError: '' }),
  setImporting: (v) => set({ importing: v }),
  setImportError: (msg) => set({ importError: msg }),
}))
