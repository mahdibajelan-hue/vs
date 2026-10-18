import { create } from 'zustand'

/** One-shot request to open the quantitative-analysis tab of the Risk module on a given master project (set by the Scheduling module, consumed by RiskApp). */
interface QuantNav { pendingMasterId: string | null; request: (masterProjectId: string) => void; clear: () => void }
export const useQuantNavStore = create<QuantNav>()((set) => ({ pendingMasterId: null, request: (id) => set({ pendingMasterId: id }), clear: () => set({ pendingMasterId: null }) }))
