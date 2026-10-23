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
  /** item id → master project id (notification_projects()); items of organization-wide modules have none */
  projectOf: Record<string, string>
  loading: boolean
  loadedOnce: boolean
  refresh: () => Promise<void>
}

/** The bell's data: computed on the server by my_notifications() (the user's own missions, issues, risks) and my_finance_notifications() (guarantees, certificates, claims, retention; RLS + finance permission apply). */
export const useNotificationStore = create<NotificationState>()((set, get) => ({
  items: [],
  projectOf: {},
  loading: false,
  loadedOnce: false,
  refresh: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const [main, fin, land, chg, mat, eng, exe, sv] = await Promise.all([supabase.rpc('my_notifications'), supabase.rpc('my_finance_notifications'), supabase.rpc('my_land_notifications'), supabase.rpc('cm_my_notifications'), supabase.rpc('my_material_notifications'), supabase.rpc('my_engineering_notifications'), supabase.rpc('my_execution_notifications'), supabase.rpc('my_supervision_notifications')])
      if (main.error && fin.error) throw main.error
      const rank = { warn: 0, action: 1, info: 2 } as const
      const items = [...((main.data as AppNotification[] | null) ?? []), ...((fin.data as AppNotification[] | null) ?? []), ...((land.data as AppNotification[] | null) ?? []), ...((chg.data as AppNotification[] | null) ?? []), ...((mat.data as AppNotification[] | null) ?? []), ...((eng.data as AppNotification[] | null) ?? []), ...((exe.data as AppNotification[] | null) ?? []), ...((sv.data as AppNotification[] | null) ?? [])].sort((a, b) => rank[a.severity] - rank[b.severity])
      set({ items, loadedOnce: true })
      // which project each item belongs to — the radar counts only the chosen project's items
      const pr = await supabase.rpc('notification_projects', { p_ids: items.map((n) => n.id) })
      if (!pr.error) set({ projectOf: Object.fromEntries(((pr.data ?? []) as { id: string; master_project_id: string }[]).map((r) => [r.id, r.master_project_id])) })
    } catch {
      // the bell must never break a page: keep what we had
      set({ loadedOnce: true })
    } finally {
      set({ loading: false })
    }
  },
}))
