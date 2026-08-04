import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  isSetup: boolean
  username: string | null
  passwordHash: string | null
  isAuthed: boolean
  setup: (username: string, password: string) => Promise<void>
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>
  resetAccount: () => void
}

async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isSetup: false,
      username: null,
      passwordHash: null,
      isAuthed: false,

      setup: async (username, password) => {
        const passwordHash = await hashText(password)
        set({ isSetup: true, username, passwordHash, isAuthed: true })
      },

      login: async (username, password) => {
        const { username: storedUser, passwordHash } = get()
        const inputHash = await hashText(password)
        if (username === storedUser && inputHash === passwordHash) {
          set({ isAuthed: true })
          return true
        }
        return false
      },

      logout: () => set({ isAuthed: false }),

      changePassword: async (oldPassword, newPassword) => {
        const { passwordHash } = get()
        const oldHash = await hashText(oldPassword)
        if (oldHash !== passwordHash) return false
        set({ passwordHash: await hashText(newPassword) })
        return true
      },

      resetAccount: () => set({ isSetup: false, username: null, passwordHash: null, isAuthed: false }),
    }),
    {
      name: 'piping-iso-tracker-auth',
      partialize: (s) => ({ isSetup: s.isSetup, username: s.username, passwordHash: s.passwordHash }),
    },
  ),
)
