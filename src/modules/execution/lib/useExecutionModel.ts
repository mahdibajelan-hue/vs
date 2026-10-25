import { useMemo } from 'react'
import { useExecutionStore } from '../store/useExecutionStore'
import { useEpcStore } from '../store/useEpcStore'
import { executionCore } from './executionCore'
import { detectGaps } from './completeness'
import { progressCurve, effectiveBase } from './progress'
import type { Activity } from '../types'

/** One project's execution data with every derived figure — progress, planned progress, curve, detected gaps — computed once from the stored daily reports. */
export function useExecutionModel(projectId: string | null) {
  const st = useExecutionStore()
  const epcWelds = useEpcStore((x) => x.welds), epcLineWelds = useEpcStore((x) => x.lineWelds), epcRules = useEpcStore((x) => x.actionRules), epcActions = useEpcStore((x) => x.workActions)
  return useMemo(() => {
    const core = executionCore(st, { welds: epcWelds, lineWelds: epcLineWelds, actionRules: epcRules, workActions: epcActions }, projectId ?? '')
    const { pid, settings, today, activities, baselines, blines, reports, repIds, base, approved, registered, planned } = core
    let lines = core.enteredLines
    const resources = st.resources.filter((r) => repIds.has(r.reportId))
    const stoppages = st.stoppages.filter((r) => repIds.has(r.reportId))
    const history = st.history.filter((h) => repIds.has(h.reportId))
    const gaps = st.gaps.filter((g) => g.projectId === pid)
    const maps = st.maps.filter((m) => m.projectId === pid)
    const actById = new Map(activities.map((a) => [a.id, a]))
    const linesByReport = new Map<string, typeof lines>()
    for (const l of lines) { const x = linesByReport.get(l.reportId); if (x) x.push(l); else linesByReport.set(l.reportId, [l]) }
    lines = core.lines
    const firstDate = reports.filter((r) => r.formKey === 'work').map((r) => r.reportDate).sort()[0] ?? ''
    const start = settings.projectStart || firstDate
    const curve = progressCurve({ ...base, from: start, to: today, settings })
    const detected = detectGaps({ today, settings, reports, lines, resources, activities, baselines, blines })
    const baseOf = (a: Activity, asOf = today) => effectiveBase(a, baselines, blines, asOf).baseQty
    return { projectId: pid, settings, today, activities, baselines, blines, reports, lines, resources, stoppages, history, gaps, maps, actById, linesByReport, unmappedActions: core.unmappedActions, approved, registered, planned, curve, detected, baseOf, people: st.people }
  }, [st.settingsByProject, st.activities, st.baselines, st.blines, st.reports, st.lines, st.resources, st.stoppages, st.history, st.gaps, st.maps, st.people, epcWelds, epcLineWelds, epcRules, epcActions, projectId])
}
export type ExecutionModel = ReturnType<typeof useExecutionModel>
