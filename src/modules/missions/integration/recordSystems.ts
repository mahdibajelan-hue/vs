import { supabase } from '../platform'
import type { LinkedStatus, TransferTarget } from '../types'

/**
 * SYSTEMS OF RECORD — the module's connection to Issue Management, Risk Management and the Action store.
 *
 * Single Source of Truth: this module never owns an Issue/Risk/Action. A manager-approved finding is handed
 * over through ONE database function and only the owning record's id is kept on our side; its status is read
 * back live. Nothing here copies lifecycle state.
 *
 *   issue  → im_issues      via rasta_project_mappings (source_module = 'issues')
 *   risk   → rm_risks       via rasta_project_mappings (source_module = 'risk')
 *   action → rasta_actions  (the Reporting module's Decision Center store; source = 'mission_debrief')
 *
 * Both functions are SECURITY DEFINER in schema.sql Section 61 (ms_transfer_finding / ms_linked_status), so
 * the integration is a pair of RPC calls and carries no knowledge of those modules' tables or stores.
 */
export interface TransferResult {
  target: TransferTarget
  id: string
}

export async function transferToSystemOfRecord(findingId: string, target: TransferTarget, params: Record<string, unknown> = {}): Promise<TransferResult> {
  const { data, error } = await supabase.rpc('ms_transfer_finding', { p_finding_id: findingId, p_target: target, p_params: params })
  if (error) throw error
  const r = data as TransferResult
  return { target: r.target, id: r.id }
}

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** Live status of every transferred finding, read from the owning system. Failure degrades to "no live status". */
export async function readLinkedStatus(missionIds: string[]): Promise<LinkedStatus[]> {
  if (!missionIds.length) return []
  const { data, error } = await supabase.rpc('ms_linked_status', { p_mission_ids: missionIds })
  if (error) return []
  return ((data ?? []) as Row[]).map((x) => ({ findingId: x.finding_id, target: x.target, linkedId: x.linked_id, linkedCode: x.linked_code ?? '', linkedStatus: x.linked_status ?? '' }))
}
