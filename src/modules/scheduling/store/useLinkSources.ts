import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useEpcStore } from '../../execution/store/useEpcStore'
import { useEpcModel } from '../../execution/lib/useEpcModel'
import { useExecutionModel } from '../../execution/lib/useExecutionModel'
import { useMaterialControlStore } from '../../material/store/useMaterialControlStore'
import { emptySources, type DocInfo, type ExecInfo, type IssueInfo, type LinkSources, type PackageInfo, type RiskInfo } from '../lib/integration'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const OPEN_ISSUE = new Set(['open', 'in_progress', 'pending_approval'])

/** Risks and issues of the project, read with two light queries through the confirmed project mappings (their own project ids differ from the master project id). */
export function useRiskIssueSources(projectId: string) {
  const [state, setState] = useState<{ risks: RiskInfo[]; issues: IssueInfo[]; loaded: boolean }>({ risks: [], issues: [], loaded: false })
  useEffect(() => {
    let live = true
    void (async () => {
      const m = await supabase.from('rasta_project_mappings').select('source_module, source_project_id').eq('master_project_id', projectId).eq('status', 'confirmed').in('source_module', ['risk', 'issues'])
      const rows = (m.data ?? []) as unknown as Row[]
      const rp = rows.filter((r) => r.source_module === 'risk').map((r) => r.source_project_id), ip = rows.filter((r) => r.source_module === 'issues').map((r) => r.source_project_id)
      const [r, i] = await Promise.all([
        rp.length ? supabase.from('rm_risks').select('id, code, title, status').in('project_id', rp).order('created_at') : Promise.resolve({ data: [] as Row[] }),
        ip.length ? supabase.from('im_issues').select('id, title, status').in('project_id', ip).order('created_at') : Promise.resolve({ data: [] as Row[] }),
      ])
      if (!live) return
      setState({
        risks: ((r.data ?? []) as unknown as Row[]).map((x): RiskInfo => ({ id: x.id, code: x.code ?? '', title: x.title ?? '', open: x.status !== 'closed' })),
        issues: ((i.data ?? []) as unknown as Row[]).map((x): IssueInfo => ({ id: x.id, title: x.title ?? '', open: OPEN_ISSUE.has(x.status) })),
        loaded: true,
      })
    })()
    return () => { live = false }
  }, [projectId])
  return state
}

/**
 * Everything the schedule reads from the other modules, as plain facts (see integration.ts): execution progress (approved / reported / rejected quantity), engineering documents with their
 * status and dates, supply packages with delivery status, and the project's risks and issues. Nothing is copied into the scheduling tables — links only hold ids.
 */
export function useLinkSources(projectId: string): { sources: LinkSources; ready: boolean } {
  const ex = useExecutionModel(projectId)
  const epcM = useEpcModel(projectId)
  const engDocs = useEpcStore((s) => s.engDocs)
  const csLoaded = useMaterialControlStore((s) => s.loaded)
  const fetchControl = useMaterialControlStore((s) => s.fetchAll)
  const packages = useMaterialControlStore((s) => s.packages)
  const items = useMaterialControlStore((s) => s.items)
  const stages = useMaterialControlStore((s) => s.stages)
  const ri = useRiskIssueSources(projectId)
  useEffect(() => { if (!csLoaded) void fetchControl() }, [csLoaded, fetchControl])

  const sources = useMemo(() => {
    const s = emptySources()
    const reg = new Map(ex.registered.rows.map((r) => [r.activity.id, r.pct * 100]))
    const rejected = new Map<string, number>()
    for (const l of ex.lines) if (l.activityId && l.status === 'rejected') rejected.set(l.activityId, (rejected.get(l.activityId) ?? 0) + l.qty)
    for (const r of ex.approved.rows) s.exec.set(r.activity.id, { id: r.activity.id, title: r.activity.title, approvedPct: r.pct * 100, reportedPct: reg.get(r.activity.id) ?? r.pct * 100, rejectedQty: rejected.get(r.activity.id) ?? 0 } satisfies ExecInfo)
    for (const d of engDocs.filter((x) => x.projectId === projectId)) s.docs.set(d.id, { id: d.id, docNo: d.docNo, title: d.title, status: d.status, plannedApproved: d.plannedApproved, actualApproved: d.actualApproved, expectedApproval: epcM.docFc.get(d.id)?.expectedApproval ?? null, critical: d.critical } satisfies DocInfo)
    const itemsOf = new Map<string, typeof items>()
    for (const it of items) itemsOf.set(it.packageId, [...(itemsOf.get(it.packageId) ?? []), it])
    const stagesOf = new Map<string, typeof stages>()
    for (const st of stages) stagesOf.set(st.itemId, [...(stagesOf.get(st.itemId) ?? []), st])
    for (const p of packages.filter((x) => x.masterProjectId === projectId && x.status !== 'cancelled')) {
      const its = itemsOf.get(p.id) ?? []
      const receipt = its.flatMap((it) => (stagesOf.get(it.id) ?? []).filter((st) => st.stageKey === 'site_receipt' && st.applicable))
      const done = receipt.filter((st) => st.status === 'approved').length
      const delivery: PackageInfo['delivery'] = receipt.length === 0 ? (p.status === 'closed' ? 'delivered' : 'pending') : done === receipt.length ? 'delivered' : done > 0 ? 'partial' : 'pending'
      const open = receipt.filter((st) => st.status !== 'approved').map((st) => st.plannedDate).filter((x): x is string => !!x).sort()
      const planned = its.map((it) => it.plannedDelivery).filter((x): x is string => !!x).sort().pop() ?? p.plannedEnd
      s.packages.set(p.id, { id: p.id, code: p.code, title: p.title, status: p.status, delivery, expectedDelivery: open.length ? open[open.length - 1] : null, plannedDelivery: planned } satisfies PackageInfo)
    }
    for (const r of ri.risks) s.risks.set(r.id, r)
    for (const i of ri.issues) s.issues.set(i.id, i)
    return s
  }, [ex.approved, ex.registered, ex.lines, engDocs, epcM.docFc, packages, items, stages, ri.risks, ri.issues, projectId])
  return { sources, ready: csLoaded && ri.loaded }
}
