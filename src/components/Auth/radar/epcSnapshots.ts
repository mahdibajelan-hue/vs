import { supabase } from '../../../lib/supabaseClient'
import type { EpcProgress } from '../../../modules/epc/epcProgress'

/**
 * The project picker's EPC figure per project (table radar_epc_snapshots), read for every card in one request. Only
 * the picker's own calculation writes it (same weights as the card always used), so a card shows exactly what it did
 * before. A figure older than STALE_MS is recomputed in the background — one project at a time, that project's data
 * only — saved for everyone, and the card updates when it lands.
 */
export const STALE_MS = 30 * 60 * 1000
export interface EpcSnapshot { epc: EpcProgress; at: number }

export async function readEpcSnapshots(ids: string[]): Promise<Map<string, EpcSnapshot>> {
  const out = new Map<string, EpcSnapshot>()
  if (!ids.length) return out
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from('radar_epc_snapshots').select('master_project_id, epc, computed_at').in('master_project_id', ids.slice(i, i + 150))
    if (error) return out // no table yet: the picker falls back to computing
    for (const r of (data ?? []) as { master_project_id: string; epc: EpcProgress; computed_at: string }[]) out.set(r.master_project_id, { epc: r.epc, at: Date.parse(r.computed_at) })
  }
  return out
}

const lastSaved = new Map<string, number>()
/** saves a project's freshly computed figure; at most once a minute per project from this browser */
export function saveEpcSnapshot(projectId: string, epc: EpcProgress) {
  const now = Date.now()
  if (now - (lastSaved.get(projectId) ?? 0) < 60_000) return
  lastSaved.set(projectId, now)
  void supabase.from('radar_epc_snapshots').upsert({ master_project_id: projectId, epc, computed_at: new Date(now).toISOString() }).then(() => undefined, () => undefined)
}
