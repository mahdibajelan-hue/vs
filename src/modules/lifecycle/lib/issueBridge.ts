import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'

/**
 * Bridges the Control Tower to Issue Management without either module importing the other's
 * store (they're separate lazy-loaded bundles) — just direct Supabase reads/RPC calls, mirroring
 * the resolution pattern Reporting's dataAdapter.ts already uses for rasta_project_mappings.
 */

export interface IssuesMappingStatus {
  mapped: boolean
  imProjectId: string | null
}

export async function resolveIssuesMappingStatus(masterProjectId: string): Promise<IssuesMappingStatus> {
  const { data } = await supabase
    .from('rasta_project_mappings')
    .select('source_project_id')
    .eq('master_project_id', masterProjectId)
    .eq('source_module', 'issues')
    .eq('status', 'confirmed')
    .maybeSingle()
  return { mapped: !!data, imProjectId: data?.source_project_id ?? null }
}

export async function convertActionToIssue(actionId: string, pursuerId: string | null, deadlineDays: number): Promise<string> {
  const { data, error } = await supabase.rpc('rasta_convert_action_to_issue', {
    p_action_id: actionId,
    p_pursuer_id: pursuerId,
    p_deadline_days: deadlineDays,
  })
  if (error || !data) {
    throw new Error(friendlyErrorMessage(error ?? { message: 'خطای نامشخص' }))
  }
  return data as string
}
