import { createClient } from '@supabase/supabase-js'
import { createRestFetch } from './restFetchCore'

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
const restFetch = createRestFetch((input, init) => fetch(input, init), { keys: KEYS })

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder-anon-key', { global: { fetch: restFetch } })
