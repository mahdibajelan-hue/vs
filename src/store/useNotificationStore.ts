import { create } from 'zustand'
import { supabase } from '../lib/supabaseClient'
import type { ModuleKey } from './useModuleStore'

/** One thing that needs the signed-in user: a record waiting for their action, or a system message. */
export interface AppNotification {
  id: string
  source: string
  module: ModuleKey
  /** 'action' = waiting for you; 'warn' = overdue or escalated; 'info' = FYI. */
  severity: 'action' | 'warn' | 'info'
  title: string
  body: string
  recordId?: string
  at: string
}

interface NotificationState {
  items: AppNotification[]
  loading: boolean
  loadedOnce: boolean
  refresh: () => Promise<void>
}

/** The bell's data: computed on the server by my_notifications() (the user's own missions, issues, risks) and my_finance_notifications() (guarantees, certificates, claims, retention; RLS + finance permission apply). */
export const useNotificationStore = create<NotificationState>()((set, get) => ({
  items: [],
  loading: false,
  loadedOnce: false,
  refresh: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const [main, fin] = await Promise.all([supabase.rpc('my_notifications'), supabase.rpc('my_finance_notifications')])
      if (main.error && fin.error) throw main.error
      const rank = { warn: 0, action: 1, info: 2 } as const
      const items = [...((main.data as AppNotification[] | null) ?? []), ...((fin.data as AppNotification[] | null) ?? [])].sort((a, b) => rank[a.severity] - rank[b.severity])
      set({ items, loadedOnce: true })
    } catch {
      // the bell must never break a page: keep what we had
      set({ loadedOnce: true })
    } finally {
      set({ loading: false })
    }
  },
}))
