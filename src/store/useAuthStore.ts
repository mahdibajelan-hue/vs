import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserRole } from '../types'
import { makeId } from '../lib/id'

export interface Account {
  id: string
  username: string
  fullName: string
  role: UserRole
  passwordHash: string
}

interface AuthState {
  accounts: Account[]
  currentUserId: string | null
  isAuthed: boolean

  currentUser: () => Account | null

  setupFirstAccount: (data: { username: string; password: string; fullName: string; role: UserRole }) => Promise<void>
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void

  addAccount: (data: { username: string; password: string; fullName: string; role: UserRole }) => Promise<{ ok: boolean; error?: string }>
  removeAccount: (id: string) => void
  changePassword: (accountId: string, oldPassword: string, newPassword: string) => Promise<boolean>
  /** Owner-only admin reset — no old-password check, gated entirely by UI permission. */
  adminResetPassword: (accountId: string, newPassword: string) => Promise<void>
}

async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accounts: [],
      currentUserId: null,
      isAuthed: false,

      currentUser: () => {
        const { accounts, currentUserId } = get()
        return accounts.find((a) => a.id === currentUserId) ?? null
      },

      setupFirstAccount: async ({ username, password, fullName, role }) => {
        const account: Account = {
          id: makeId('user'),
          username,
          fullName,
          role,
          passwordHash: await hashText(password),
        }
        set({ accounts: [account], currentUserId: account.id, isAuthed: true })
      },

      login: async (username, password) => {
        const { accounts } = get()
        const account = accounts.find((a) => a.username === username)
        if (!account) return false
        const inputHash = await hashText(password)
        if (inputHash !== account.passwordHash) return false
        set({ currentUserId: account.id, isAuthed: true })
        return true
      },

      logout: () => set({ isAuthed: false, currentUserId: null }),

      addAccount: async ({ username, password, fullName, role }) => {
        const { accounts } = get()
        if (accounts.some((a) => a.username === username)) {
          return { ok: false, error: 'این نام کاربری قبلاً استفاده شده است' }
        }
        const account: Account = {
          id: makeId('user'),
          username,
          fullName,
          role,
          passwordHash: await hashText(password),
        }
        set({ accounts: [...accounts, account] })
        return { ok: true }
      },

      removeAccount: (id) => {
        set((s) => ({
          accounts: s.accounts.filter((a) => a.id !== id),
          currentUserId: s.currentUserId === id ? null : s.currentUserId,
          isAuthed: s.currentUserId === id ? false : s.isAuthed,
        }))
      },

      changePassword: async (accountId, oldPassword, newPassword) => {
        const { accounts } = get()
        const account = accounts.find((a) => a.id === accountId)
        if (!account) return false
        const oldHash = await hashText(oldPassword)
        if (oldHash !== account.passwordHash) return false
        const newHash = await hashText(newPassword)
        set({ accounts: accounts.map((a) => (a.id === accountId ? { ...a, passwordHash: newHash } : a)) })
        return true
      },

      adminResetPassword: async (accountId, newPassword) => {
        const newHash = await hashText(newPassword)
        set((s) => ({ accounts: s.accounts.map((a) => (a.id === accountId ? { ...a, passwordHash: newHash } : a)) }))
      },
    }),
    {
      name: 'piping-iso-tracker-auth',
      version: 2,
      partialize: (s) => ({ accounts: s.accounts, currentUserId: s.currentUserId }),
      migrate: (persisted) => {
        const legacy = persisted as {
          isSetup?: boolean
          username?: string
          passwordHash?: string
          accounts?: Account[]
          currentUserId?: string | null
        }
        if (legacy?.accounts) return legacy as unknown as AuthState
        if (legacy?.isSetup && legacy.username && legacy.passwordHash) {
          const account: Account = {
            id: makeId('user'),
            username: legacy.username,
            fullName: legacy.username,
            role: 'contractor',
            passwordHash: legacy.passwordHash,
          }
          return { accounts: [account], currentUserId: null, isAuthed: false } as unknown as AuthState
        }
        return { accounts: [], currentUserId: null, isAuthed: false } as unknown as AuthState
      },
    },
  ),
)
