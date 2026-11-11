import { createClient } from '@supabase/supabase-js'
import { createRestFetch } from './restFetchCore'
import { browserAnswers } from './answerStore'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True once real Supabase credentials are configured — lets the app fall back to local-only mode until then. */
export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY تنظیم نشده‌اند — برنامه در حالت محلی (بدون اشتراک‌گذاری) اجرا می‌شود.',
  )
}

// complete reads past the 1000-row page, one request per identical read, and a 30-second memory that any write clears
// tables without an `id` column: their primary key keeps a paged read in a stable order
const KEYS: Record<string, string[]> = {
  pdt_joints: ['master_project_id', 'joint_no'], la_stages: ['parcel_id', 'stage_key'], im_issue_people: ['issue_id', 'user_id', 'role'],
  im_project_members: ['project_id', 'user_id'], project_members: ['project_id', 'user_id'], rm_project_members: ['project_id', 'user_id'],
  la_roles: ['master_project_id', 'user_id'], comp_inservice_ratings: ['cycle_id', 'rater_id', 'competency_id'], comp_inservice_raters: ['cycle_id', 'user_id'],
  im_task_deps: ['task_id', 'depends_on_task_id'], mtl_pattern_weights: ['pattern_id', 'stage_key'], ex_weld_dismissals: ['project_id', 'n2'],
  sv_month_signoffs: ['master_project_id', 'month'], rasta_user_module_access: ['user_id', 'module_key'], rasta_user_roles: ['user_id', 'role_id'],
  rasta_role_permissions: ['role_id', 'permission_id'], rasta_user_permission_overrides: ['user_id', 'permission_id'], radar_project_visits: ['user_id', 'project_id'],
  sch_raised: ['project_id', 'alert_key'], ex_line_welds: ['line_id'],
}
// read-only (STABLE) functions the app calls on every page, and the radar's visit log: they change nothing a page reads
const READ_ONLY_RPC = new Set(['rasta_my_accessible_modules', 'inbox_my_items', 'inbox_my_delays', 'inbox_my_finance', 'inbox_my_project_work', 'inbox_my_stakeholder_work',
  'my_notifications', 'my_finance_notifications', 'my_land_notifications', 'cm_my_notifications', 'my_material_notifications', 'my_engineering_notifications',
  'my_execution_notifications', 'my_supervision_notifications', 'notification_projects', 'fin_land_summary'])
const harmless = (method: string, path: string) => (method === 'POST' && path.startsWith('rpc/') && READ_ONLY_RPC.has(path.slice(4))) || path === 'radar_project_visits'
// a module store's own load is also kept in the browser: a repeat visit draws at once, then catches up (lib/liveRefresh)
const restFetch = createRestFetch((input, init) => fetch(input, init), {
  keys: KEYS, harmless, persist: browserAnswers,
  onRevalidated: (table, store) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('rasta:revalidated', { detail: { table, store } })) },
})

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder-anon-key', { global: { fetch: restFetch } })
