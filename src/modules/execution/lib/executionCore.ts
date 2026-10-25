import type { useExecutionStore } from '../store/useExecutionStore'
import type { useEpcStore } from '../store/useEpcStore'
import { overlayDetail } from './weldCentral'
import { resolveLines } from './workActions'
import { physicalProgress, plannedOverall } from './progress'
import { DEFAULT_EX_SETTINGS } from '../types'

type ExState = Pick<ReturnType<typeof useExecutionStore.getState>, 'settingsByProject' | 'activities' | 'baselines' | 'blines' | 'reports' | 'lines'>
type EpcState = Pick<ReturnType<typeof useEpcStore.getState>, 'welds' | 'lineWelds' | 'actionRules' | 'workActions'>

/**
 * One project's execution data and its physical progress — the single computation behind the execution module's own
 * figures (useExecutionModel), the radar and the project list, so they can never disagree. Pure: stores in, numbers out.
 */
export function executionCore(st: ExState, epc: EpcState, projectId: string, today = new Date().toISOString().slice(0, 10)) {
  const pid = projectId
  const settings = st.settingsByProject.get(pid) ?? DEFAULT_EX_SETTINGS
  const activities = st.activities.filter((a) => a.projectId === pid)
  const baselines = st.baselines.filter((b) => b.projectId === pid)
  const baselineIds = new Set(baselines.map((b) => b.id))
  const blines = st.blines.filter((l) => baselineIds.has(l.baselineId))
  const reports = st.reports.filter((r) => r.projectId === pid)
  const repIds = new Set(reports.map((r) => r.id))
  let lines = st.lines.filter((l) => repIds.has(l.reportId))
  // project flag «central weld table»: shared weld facts are read from the weld's central record, so every consumer (forms, papers, counters, rules) sees one value
  if ((settings as unknown as { flags?: { centralWeld?: boolean } }).flags?.centralWeld) {
    const central = new Map(epc.welds.filter((w) => w.projectId === pid).map((w) => [w.id, w.central])), weldOf = new Map(epc.lineWelds.filter((x) => x.projectId === pid).map((x) => [x.lineId, x.weldId])), formOf = new Map(reports.map((r) => [r.id, r.formKey]))
    lines = lines.map((l) => { const c = central.get(weldOf.get(l.id) ?? ''); return c && Object.keys(c).length ? { ...l, detail: overlayDetail(formOf.get(l.reportId) ?? '', l.detail, c) } : l })
  }
  const enteredLines = lines
  // lines entered by ACTION are converted to the mapped price-book activity (qty × factor) for every computation; `enteredLines` keeps what was entered
  const res = resolveLines(lines, epc.actionRules.filter((r) => r.projectId === pid), epc.workActions.filter((a) => a.projectId === pid))
  lines = res.lines
  const base = { activities, baselines, blines, reports, lines }
  const groupWeights = settings.groupWeights
  const employer = ((settings as unknown as { employerStep?: string }).employerStep === 'binding' ? 'binding' : 'off') as 'binding' | 'off'
  const approved = physicalProgress({ ...base, asOf: today, mode: 'approved', groupWeights, employer })
  const registered = physicalProgress({ ...base, asOf: today, mode: 'registered', groupWeights })
  const planned = plannedOverall({ activities, baselines, blines, asOf: today, groupWeights })
  return { pid, settings, today, activities, baselines, blines, reports, repIds, enteredLines, lines, unmappedActions: res.unmapped, base, approved, registered, planned }
}
