import { supabase, useDeepLinkStore, useModuleStore, useProjectContextStore } from '../platform'
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

const MODULE_FOR_TARGET = { issue: 'issues', risk: 'risk', action: 'reporting' } as const

/**
 * Jump to a transferred record inside the module that owns it. The project context makes Issue/Risk open
 * straight into that project; the deep link tells the module which record to open once it has loaded.
 */
export function openRecord(target: TransferTarget, recordId: string, masterProjectId: string): void {
  useProjectContextStore.getState().setProject(masterProjectId)
  useDeepLinkStore.getState().request({ module: MODULE_FOR_TARGET[target], recordId, masterProjectId })
  useModuleStore.getState().enterModule(MODULE_FOR_TARGET[target])
}

/** Jump from an Issue / Risk / Action screen back to the mission it came from. */
export function openMission(missionId: string): void {
  useDeepLinkStore.getState().request({ module: 'missions', recordId: missionId })
  useModuleStore.getState().enterModule('missions')
}

export interface RecordOrigin {
  recordId: string
  target: TransferTarget
  missionId: string
  missionCode: string
  findingTitle: string
}

// Batches the per-card lookups of a list into one RPC; results (including "not from a mission") are cached.
const originCache = new Map<string, Promise<RecordOrigin | null>>()
let originQueue: { id: string; resolve: (o: RecordOrigin | null) => void }[] = []
let originTimer: ReturnType<typeof setTimeout> | null = null

async function flushOrigins() {
  const batch = originQueue
  originQueue = []
  originTimer = null
  try {
    const { data, error } = await supabase.rpc('ms_record_origin', { p_ids: [...new Set(batch.map((b) => b.id))] })
    if (error) throw error
    const byId = new Map<string, RecordOrigin>()
    for (const r of (data ?? []) as Row[]) {
      byId.set(r.record_id, { recordId: r.record_id, target: r.target, missionId: r.mission_id, missionCode: r.mission_code, findingTitle: r.finding_title ?? '' })
    }
    for (const b of batch) b.resolve(byId.get(b.id) ?? null)
  } catch {
    // Not cached on failure so a later render can retry; the chip simply stays hidden.
    for (const b of batch) {
      originCache.delete(b.id)
      b.resolve(null)
    }
  }
}

/** Which mission finding (if any) this Issue / Risk / Action was transferred from. */
export function loadRecordOrigin(recordId: string): Promise<RecordOrigin | null> {
  const hit = originCache.get(recordId)
  if (hit) return hit
  const p = new Promise<RecordOrigin | null>((resolve) => {
    originQueue.push({ id: recordId, resolve })
    if (!originTimer) originTimer = setTimeout(flushOrigins, 25)
  })
  originCache.set(recordId, p)
  return p
}
