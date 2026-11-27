import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { explainExecutionError } from '../lib/errors'
import type { FixInput, ReportFix } from '../lib/reviewFixes'
import { useExecutionStore } from './useExecutionStore'
import { useEpcStore } from './useEpcStore'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const fixRow = (r: Row): ReportFix => ({ id: r.id, reportId: r.report_id, path: r.path, label: r.label ?? '', was: r.was, value: r.value, note: r.note ?? '', fixedBy: r.fixed_by, fixedByName: r.fixed_by_name ?? '', fixedAt: r.fixed_at })

export interface Amendment { id: string; reportId: string; no: number; reason: string; status: 'open' | 'done' | 'cancelled'; openedByName: string; openedAt: string; closedAt: string | null; closedNote: string }
const amRow = (r: Row): Amendment => ({ id: r.id, reportId: r.report_id, no: r.no, reason: r.reason ?? '', status: r.status, openedByName: r.opened_by_name ?? '', openedAt: r.opened_at, closedAt: r.closed_at, closedNote: r.closed_note ?? '' })

interface State {
  byReport: Map<string, ReportFix[]>
  amends: Map<string, Amendment[]>
  loadAmends: (reportId: string) => Promise<void>
  /** the head of the supervision opens an amendment of a report approved for good (067) */
  openAmend: (reportId: string, reason: string) => Promise<string | null>
  cancelAmend: (reportId: string, note: string) => Promise<string | null>
  load: (reportId: string) => Promise<void>
  /** writes the supervision's corrections; returns the explained error (null when saved) */
  save: (reportId: string, items: FixInput[]) => Promise<string | null>
}

/** the supervision's corrections of sent reports (065), read per report when it is reviewed or printed */
export const useFixStore = create<State>((set, get) => ({
  byReport: new Map(),
  amends: new Map(),
  loadAmends: async (reportId) => {
    const { data, error } = await supabase.from('ex_report_amendments').select('id,report_id,no,reason,status,opened_by_name,opened_at,closed_at,closed_note').eq('report_id', reportId).order('no')
    if (error) return
    const m = new Map(get().amends); m.set(reportId, ((data ?? []) as Row[]).map(amRow)); set({ amends: m })
  },
  openAmend: async (reportId, reason) => {
    const { error } = await supabase.rpc('ex_report_amend_open', { p_report: reportId, p_reason: reason })
    if (error) { const msg = explainExecutionError(error); useSystemStore.getState().setStorageError(`خطا در ثبت اصلاحیه: ${msg}`); return msg }
    await Promise.all([get().loadAmends(reportId), get().load(reportId), useExecutionStore.getState().reloadReports([reportId]), useEpcStore.getState().loadSignatures(reportId)])
    return null
  },
  cancelAmend: async (reportId, note) => {
    const { error } = await supabase.rpc('ex_report_amend_cancel', { p_report: reportId, p_note: note })
    if (error) { const msg = explainExecutionError(error); useSystemStore.getState().setStorageError(`خطا در لغو اصلاحیه: ${msg}`); return msg }
    await Promise.all([get().loadAmends(reportId), get().load(reportId), useExecutionStore.getState().reloadReports([reportId]), useEpcStore.getState().loadSignatures(reportId)])
    return null
  },
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

const NO_AM: Amendment[] = []
/** the amendments of one report (read on first use) */
export function useAmendments(reportId: string): Amendment[] {
  const list = useFixStore((s) => s.amends.get(reportId))
  if (list === undefined) queueMicrotask(() => { if (!useFixStore.getState().amends.has(reportId)) { const m = new Map(useFixStore.getState().amends); m.set(reportId, NO_AM); useFixStore.setState({ amends: m }); void useFixStore.getState().loadAmends(reportId) } })
  return list ?? NO_AM
}
