import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { explainExecutionError } from '../lib/errors'
import type { FixInput, ReportFix } from '../lib/reviewFixes'
import { useExecutionStore } from './useExecutionStore'
import { useEpcStore } from './useEpcStore'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const fixRow = (r: Row): ReportFix => ({ id: r.id, reportId: r.report_id, path: r.path, label: r.label ?? '', was: r.was, value: r.value, note: r.note ?? '', fixedBy: r.fixed_by, fixedByName: r.fixed_by_name ?? '', fixedAt: r.fixed_at })

interface State {
  byReport: Map<string, ReportFix[]>
  load: (reportId: string) => Promise<void>
  /** writes the supervision's corrections; returns the explained error (null when saved) */
  save: (reportId: string, items: FixInput[]) => Promise<string | null>
}

/** the supervision's corrections of sent reports (065), read per report when it is reviewed or printed */
export const useFixStore = create<State>((set, get) => ({
  byReport: new Map(),
  load: async (reportId) => {
    const { data, error } = await supabase.from('ex_report_fixes').select('*').eq('report_id', reportId).order('fixed_at')
    if (error) return // table not there yet (before 065) or no access: the paper simply shows no corrections
    const m = new Map(get().byReport); m.set(reportId, ((data ?? []) as Row[]).map(fixRow)); set({ byReport: m })
  },
  save: async (reportId, items) => {
    if (!items.length) return null
    const { error } = await supabase.rpc('ex_report_fix', { p_report: reportId, p_items: items.map((x) => ({ path: x.path, value: x.value ?? null, label: x.label, note: x.note ?? '' })) })
    if (error) { const msg = explainExecutionError(error); useSystemStore.getState().setStorageError(`خطا در ثبت اصلاحات نظارت: ${msg}`); return msg }
    await Promise.all([get().load(reportId), useExecutionStore.getState().reloadReports([reportId]), useEpcStore.getState().loadSignatures(reportId)])
    return null
  },
}))

const NONE: ReportFix[] = []
/** the corrections of one report (read on first use) */
export function useReportFixes(reportId: string): ReportFix[] {
  const list = useFixStore((s) => s.byReport.get(reportId))
  if (list === undefined) queueMicrotask(() => { if (!useFixStore.getState().byReport.has(reportId)) { const m = new Map(useFixStore.getState().byReport); m.set(reportId, NONE); useFixStore.setState({ byReport: m }); void useFixStore.getState().load(reportId) } })
  return list ?? NONE
}
