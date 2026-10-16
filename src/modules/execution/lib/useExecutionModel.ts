import { useMemo } from 'react'
import { useExecutionStore } from '../store/useExecutionStore'
import { useEpcStore } from '../store/useEpcStore'
import { overlayDetail } from './weldCentral'
import { resolveLines } from './workActions'
import { detectGaps } from './completeness'
import { physicalProgress, plannedOverall, progressCurve, effectiveBase } from './progress'
import { DEFAULT_EX_SETTINGS, type Activity } from '../types'

/** One project's execution data with every derived figure — progress, planned progress, curve, detected gaps — computed once from the stored daily reports. */
export function useExecutionModel(projectId: string | null) {
  const st = useExecutionStore()
  const epcWelds = useEpcStore((x) => x.welds), epcLineWelds = useEpcStore((x) => x.lineWelds), epcRules = useEpcStore((x) => x.actionRules)
  return useMemo(() => {
    const pid = projectId ?? ''
    const settings = st.settingsByProject.get(pid) ?? DEFAULT_EX_SETTINGS
    const today = new Date().toISOString().slice(0, 10)
    const activities = st.activities.filter((a) => a.projectId === pid)
    const baselines = st.baselines.filter((b) => b.projectId === pid)
    const baselineIds = new Set(baselines.map((b) => b.id))
    const blines = st.blines.filter((l) => baselineIds.has(l.baselineId))
    const reports = st.reports.filter((r) => r.projectId === pid)
    const repIds = new Set(reports.map((r) => r.id))
    let lines = st.lines.filter((l) => repIds.has(l.reportId))
    // project flag «central weld table»: shared weld facts are read from the weld's central record, so every consumer (forms, papers, counters, rules) sees one value
    if ((settings as unknown as { flags?: { centralWeld?: boolean } }).flags?.centralWeld) {
      const central = new Map(epcWelds.filter((w) => w.projectId === pid).map((w) => [w.id, w.central])), weldOf = new Map(epcLineWelds.filter((x) => x.projectId === pid).map((x) => [x.lineId, x.weldId])), formOf = new Map(reports.map((r) => [r.id, r.formKey]))
      lines = lines.map((l) => { const c = central.get(weldOf.get(l.id) ?? ''); return c && Object.keys(c).length ? { ...l, detail: overlayDetail(formOf.get(l.reportId) ?? '', l.detail, c) } : l })
    }
    const resources = st.resources.filter((r) => repIds.has(r.reportId))
    const stoppages = st.stoppages.filter((r) => repIds.has(r.reportId))
    const history = st.history.filter((h) => repIds.has(h.reportId))
    const gaps = st.gaps.filter((g) => g.projectId === pid)
    const maps = st.maps.filter((m) => m.projectId === pid)
    const actById = new Map(activities.map((a) => [a.id, a]))
    const linesByReport = new Map<string, typeof lines>()
    for (const l of lines) { const x = linesByReport.get(l.reportId); if (x) x.push(l); else linesByReport.set(l.reportId, [l]) }
    // lines entered by ACTION are converted to the mapped price-book activity (qty × factor) for every computation; `linesByReport` keeps what was entered
    const rules = epcRules.filter((r) => r.projectId === pid)
    const res = resolveLines(lines, rules)
    lines = res.lines
    const base = { activities, baselines, blines, reports, lines }
    const groupWeights = settings.groupWeights
    const employer = ((settings as unknown as { employerStep?: string }).employerStep === 'binding' ? 'binding' : 'off') as 'binding' | 'off'
    const approved = physicalProgress({ ...base, asOf: today, mode: 'approved', groupWeights, employer })
    const registered = physicalProgress({ ...base, asOf: today, mode: 'registered', groupWeights })
    const planned = plannedOverall({ activities, baselines, blines, asOf: today, groupWeights })
    const firstDate = reports.filter((r) => r.formKey === 'work').map((r) => r.reportDate).sort()[0] ?? ''
    const start = settings.projectStart || firstDate
    const curve = progressCurve({ ...base, from: start, to: today, settings })
    const detected = detectGaps({ today, settings, reports, lines, resources, activities, baselines, blines })
    const baseOf = (a: Activity, asOf = today) => effectiveBase(a, baselines, blines, asOf).baseQty
    return { projectId: pid, settings, today, activities, baselines, blines, reports, lines, resources, stoppages, history, gaps, maps, actById, linesByReport, unmappedActions: res.unmapped, approved, registered, planned, curve, detected, baseOf, people: st.people }
  }, [st.settingsByProject, st.activities, st.baselines, st.blines, st.reports, st.lines, st.resources, st.stoppages, st.history, st.gaps, st.maps, st.people, epcWelds, epcLineWelds, epcRules, projectId])
}
export type ExecutionModel = ReturnType<typeof useExecutionModel>
