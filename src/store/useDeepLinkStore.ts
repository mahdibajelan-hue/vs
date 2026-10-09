import { create } from 'zustand'

/**
 * One-shot "open this record" request that crosses a module switch. The module that asks (e.g. a
 * mission finding's «مشاهده در مدیریت Issue») sets it, switches the active module, and the target module
 * consumes it once it has loaded — so no module has to know another module's internal routing.
 */
export interface DeepLink {
  module: 'issues' | 'risk' | 'reporting' | 'missions' | 'change'
  /** The Issue / Risk / Action id — or, for module 'missions', the mission id. */
  recordId: string
  masterProjectId?: string
}

interface DeepLinkState {
  pending: DeepLink | null
  request: (link: DeepLink) => void
  clear: () => void
}

/** A request nobody consumed (target not found, no access…) must not hijack a later, unrelated visit. */
const EXPIRE_MS = 20_000

export const useDeepLinkStore = create<DeepLinkState>()((set, get) => ({
  pending: null,
  request: (link) => {
    set({ pending: link })
    setTimeout(() => {
      if (get().pending === link) set({ pending: null })
    }, EXPIRE_MS)
  },
  clear: () => set({ pending: null }),
}))
