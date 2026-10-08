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

/** The bell's data: computed on the server by my_notifications() from the user's own missions, issues and risks. */
export const useNotificationStore = create<NotificationState>()((set, get) => ({
  items: [],
  loading: false,
  loadedOnce: false,
  refresh: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const { data, error } = await supabase.rpc('my_notifications')
      if (error) throw error
      set({ items: (data as AppNotification[] | null) ?? [], loadedOnce: true })
    } catch {
      // the bell must never break a page: keep what we had
      set({ loadedOnce: true })
    } finally {
      set({ loading: false })
    }
  },
}))
