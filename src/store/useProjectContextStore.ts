import { create } from 'zustand'

/**
 * Global Project Context (spec section 23-24): the hierarchy slice — portfolio → program →
 * project → phase — a user is currently "in". Lives at the top level (not under
 * modules/masterdata) so any future module can import and read it without reaching into
 * another module's internals.
 *
 * Forward-looking infrastructure only, as of this commit: nothing in Risk Management, Issue
 * Management or PipePulse reads from this store yet — each still drives its own in-module
 * project selection exactly as before. Wiring those modules to default their own project
 * picker from this context (and to push their own selection back into it) is a later,
 * separate change; it wasn't safe to make blind, without a live environment to verify it
 * doesn't disrupt an existing user's current in-module project selection.
 */
interface ProjectContextState {
  portfolioId: string | null
  programId: string | null
  projectId: string | null
  phaseId: string | null

  setPortfolio: (id: string | null) => void
  setProgram: (id: string | null) => void
  setProject: (id: string | null) => void
  setPhase: (id: string | null) => void
  clear: () => void
}

export const useProjectContextStore = create<ProjectContextState>()((set) => ({
  portfolioId: null,
  programId: null,
  projectId: null,
  phaseId: null,

  // Picking a higher level resets everything below it — a chosen portfolio's program/project/
  // phase are no longer necessarily valid once the portfolio itself changes.
  setPortfolio: (id) => set({ portfolioId: id, programId: null, projectId: null, phaseId: null }),
  setProgram: (id) => set({ programId: id, projectId: null, phaseId: null }),
  setProject: (id) => set({ projectId: id, phaseId: null }),
  setPhase: (id) => set({ phaseId: id }),
  clear: () => set({ portfolioId: null, programId: null, projectId: null, phaseId: null }),
}))
