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
// tables without an `id` column (from the database catalogue): their primary key keeps a paged read in a stable order;
// an empty list (a view without a key) leaves the read in the order asked
const KEYS: Record<string, string[]> = {
  comp_inservice_raters: ['cycle_id', 'user_id'], comp_inservice_ratings: ['cycle_id', 'rater_id', 'competency_id'],
  comp_job_role_config: ['job_role'], comp_module_admins: ['user_id'], comp_question_designer_scopes: ['user_id', 'section'],
  comp_role_maturity_guidance: ['job_role', 'band'], comp_self_service_retired_tokens: ['token'], ex_line_welds: ['line_id'],
  ex_settings: ['project_id'], ex_weld_dismissals: ['project_id', 'n2'], ex_weld_file: [], ex_weld_suspects: [],
  fin_insight_reviews: ['insight_key'], ht_settings: ['master_project_id'], im_categories: ['key'], im_issue_people: ['issue_id', 'user_id', 'role'],
  im_notif_prefs: ['user_id'], im_notif_rules: ['key'], im_notif_state: ['key'], im_project_members: ['project_id', 'user_id'],
  im_sla_policies: ['severity'], im_task_deps: ['task_id', 'depends_on_task_id'], im_templates: ['key'], im_workflow_stages: ['workflow_key', 'key'],
  im_workflow_transitions: ['workflow_key', 'from_stage', 'to_stage'], la_roles: ['master_project_id', 'user_id'], la_routes: ['master_project_id'],
  la_stages: ['parcel_id', 'stage_key'], ms_roles: ['user_id', 'role'], mtl_pattern_weights: ['pattern_id', 'stage_key'], mtl_stage_defs: ['key'],
  mtl_units: ['code'], pdt_joints: ['master_project_id', 'joint_no'], pdt_settings: ['master_project_id'], personality_module_admins: ['user_id'],
  pf_project_scores: ['master_project_id'], plc_project_lifecycle: ['project_id'], plc_project_strategy: ['project_id'],
  project_members: ['project_id', 'user_id'], pst_contract_cfg: ['contract_id'], radar_epc_snapshots: ['master_project_id'],
  radar_project_visits: ['user_id', 'project_id'], rasta_modules: ['key'], rasta_role_permissions: ['role_id', 'permission_id'],
  rasta_user_module_access: ['user_id', 'module_key'], rasta_user_permission_overrides: ['user_id', 'permission_id'],
  rasta_user_roles: ['user_id', 'role_id'], rm_categories: ['key'], rm_project_members: ['project_id', 'user_id'], rm_risk_state: [],
  sch_contract: ['project_id'], sch_cost_params: ['project_id'], sch_raised: ['project_id', 'alert_key'],
  sg_lifecycle_phase_durations: ['phase_code'], sg_lifecycle_phases: ['code'], sg_projects: ['name'], sp_settings: ['master_project_id'],
  sv_month_signoffs: ['master_project_id', 'month'], sv_punch_tokens: ['token'], sv_settings: ['master_project_id'], tm_projects: ['name'],
  tm_users: ['user_id'], tmp_doc_map: [], user_signatures: ['user_id'],
}
// read-only (STABLE) functions the app calls on every page, and the radar's visit log: they change nothing a page reads
const READ_ONLY_RPC = new Set(['rasta_my_accessible_modules', 'inbox_my_items', 'inbox_my_delays', 'inbox_my_finance', 'inbox_my_project_work', 'inbox_my_stakeholder_work',
  'my_notifications', 'my_finance_notifications', 'my_land_notifications', 'cm_my_notifications', 'my_material_notifications', 'my_engineering_notifications',
  'my_execution_notifications', 'my_supervision_notifications', 'notification_projects', 'fin_land_summary'])
const harmless = (method: string, path: string) => (method === 'POST' && path.startsWith('rpc/') && READ_ONLY_RPC.has(path.slice(4))) || path === 'radar_project_visits'
const writeListeners = new Set<() => void>()
/** called on every database write (before it is sent and once it has answered) */
export function onDatabaseWrite(fn: () => void) { writeListeners.add(fn); return () => { writeListeners.delete(fn) } }
// a module store's own load is also kept in the browser: a repeat visit draws at once, then catches up (lib/liveRefresh)
const restFetch = createRestFetch((input, init) => fetch(input, init), {
  keys: KEYS, harmless, persist: browserAnswers, onWrite: () => writeListeners.forEach((f) => f()),
  onRevalidated: (table, store) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('rasta:revalidated', { detail: { table, store } })) },
})

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder-anon-key', { global: { fetch: restFetch } })
