import { create } from 'zustand'

/** one headline of the news bar above a module */
export interface Head { id: string; text: string; sub: string; tone: 'bad' | 'warn' | 'info'; open: () => void }

/**
 * Headlines a module adds to its own news bar while it is open (e.g. quality control's overdue CAPA cases). The module
 * publishes them here, so the bar — which is part of every page — does not have to load that module's data and code.
 */
export const useTickerFeed = create<{ feeds: Record<string, { projectId: string; heads: Head[] }>; publish: (module: string, projectId: string, heads: Head[]) => void }>()((set) => ({
  feeds: {},
  publish: (module, projectId, heads) => set((s) => ({ feeds: { ...s.feeds, [module]: { projectId, heads } } })),
}))
