import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Backlink { code: string; name: string; plannedStart: string | null; plannedFinish: string | null; pct: number | null; needDate: string | null; needKind: string }
type Targets = Map<string, Backlink[]>
const cache = new Map<string, { at: number; p: Promise<Targets> }>()

/** Which schedule activities point at which execution activity / engineering document (read-only, from sch_links + the current version). Cached for a minute per project. */
function load(projectId: string): Promise<Targets> {
  const hit = cache.get(projectId)
  if (hit && Date.now() - hit.at < 60000) return hit.p
  const p = (async (): Promise<Targets> => {
    const out: Targets = new Map()
    const { data: links } = await supabase.from('sch_links').select('activity_uid, target_type, target_id, need_kind, need_date').eq('project_id', projectId).in('target_type', ['exec_activity', 'eng_doc'])
    const ls = (links ?? []) as unknown as Row[]
    if (!ls.length) return out
    const { data: vs } = await supabase.from('sch_versions').select('id, is_current, created_at').eq('project_id', projectId).neq('status', 'draft').order('created_at', { ascending: false })
    const v = ((vs ?? []) as unknown as Row[]).find((x) => x.is_current) ?? (vs ?? [])[0]
    if (!v) return out
    const uids = [...new Set(ls.map((l) => l.activity_uid as string))]
    const acts: Row[] = []
    for (let i = 0; i < uids.length; i += 150) {
      const { data } = await supabase.from('sch_activities').select('uid, code, name, planned_start, planned_finish, pct_complete, actual_finish').eq('version_id', v.id).in('uid', uids.slice(i, i + 150))
      acts.push(...((data ?? []) as unknown as Row[]))
    }
    const byUid = new Map(acts.map((a) => [a.uid, a]))
    for (const l of ls) {
      const a = byUid.get(l.activity_uid); if (!a) continue
      const k = `${l.target_type}:${l.target_id}`
      out.set(k, [...(out.get(k) ?? []), { code: a.code, name: a.name ?? '', plannedStart: a.planned_start, plannedFinish: a.planned_finish, pct: a.actual_finish ? 100 : a.pct_complete == null ? null : Number(a.pct_complete), needDate: l.need_date, needKind: l.need_kind }])
    }
    return out
  })()
  cache.set(projectId, { at: Date.now(), p })
  return p
}

export function useScheduleBacklinks(projectId: string, kind: 'exec_activity' | 'eng_doc', id: string): Backlink[] {
  const [rows, setRows] = useState<Backlink[]>([])
  useEffect(() => {
    let alive = true
    void load(projectId).then((m) => { if (alive) setRows(m.get(`${kind}:${id}`) ?? []) }).catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [projectId, kind, id])
  return rows
}
