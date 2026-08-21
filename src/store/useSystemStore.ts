import { create } from 'zustand'

/** Ephemeral, non-persisted system-level state (storage warnings, etc.) — deliberately kept out of useStore. */
interface SystemState {
  storageError: string | null
  setStorageError: (message: string | null) => void
}

export const useSystemStore = create<SystemState>((set) => ({
  storageError: null,
  setStorageError: (message) => set({ storageError: message }),
}))
