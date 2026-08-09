import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../store/useAuthStore'
import { useSystemStore } from '../../../store/useSystemStore'
import type { Decision, DecisionStatus, RastaAction, RastaActionStatus, ReportPayload, ReportProfile, ReportSnapshot, ReportStatus, ReportType } from '../types'
import {
  decisionFromRow,
  decisionToRow,
  rastaActionFromRow,
  rastaActionToRow,
  reportProfileFromRow,
  reportProfileToRow,
  reportSnapshotFromRow,
} from '../lib/reportingData'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${error.message}`)
  return true
}

interface ReportingState {
  profiles: ReportProfile[]
  profilesLoaded: boolean
  snapshotsByProject: Record<string, ReportSnapshot[]>
  decisionsByProject: Record<string, Decision[]>
  actionsByProject: Record<string, RastaAction[]>
  loadingProject: boolean

  fetchProfiles: () => Promise<void>
  createProfile: (data: { name: string; reportType: ReportType; description: string; widgetIds: string[] }) => Promise<void>
  updateProfile: (id: string, data: Partial<Pick<ReportProfile, 'name' | 'description' | 'widgetIds'>>) => Promise<void>
  deleteProfile: (id: string) => Promise<void>

  fetchProjectData: (masterProjectId: string) => Promise<void>

  createSnapshot: (data: {
    masterProjectId: string
    reportType: ReportType
    profileId: string | null
    periodStart: string | null
    periodEnd: string | null
    payload: ReportPayload
    widgetIds: string[]
  }) => Promise<string | null>
  setSnapshotStatus: (id: string, masterProjectId: string, status: ReportStatus) => Promise<void>

  createDecision: (masterProjectId: string, data: Partial<Decision>) => Promise<void>
  updateDecision: (id: string, masterProjectId: string, data: Partial<Decision>) => Promise<void>
  setDecisionStatus: (id: string, masterProjectId: string, status: DecisionStatus, finalDecision?: string) => Promise<void>
  deleteDecision: (id: string, masterProjectId: string) => Promise<void>

  createAction: (masterProjectId: string, data: Partial<RastaAction>) => Promise<void>
  updateAction: (id: string, masterProjectId: string, data: Partial<RastaAction>) => Promise<void>
  setActionStatus: (id: string, masterProjectId: string, status: RastaActionStatus) => Promise<void>
  deleteAction: (id: string, masterProjectId: string) => Promise<void>
}

export const useReportingStore = create<ReportingState>()((set, get) => ({
  profiles: [],
  profilesLoaded: false,
  snapshotsByProject: {},
  decisionsByProject: {},
  actionsByProject: {},
  loadingProject: false,

  fetchProfiles: async () => {
    const { data, error } = await supabase.from('rasta_report_profiles').select('*').order('created_at')
    if (reportError('بارگذاری پروفایل‌های گزارش', error)) return
    set({ profiles: (data ?? []).map(reportProfileFromRow), profilesLoaded: true })
  },
  createProfile: async (data) => {
    const userId = useAuthStore.getState().profile?.id ?? null
    const { error } = await supabase.from('rasta_report_profiles').insert({ ...reportProfileToRow(data), created_by: userId })
    if (reportError('ایجاد پروفایل گزارش', error)) return
    await get().fetchProfiles()
  },
  updateProfile: async (id, data) => {
    const { error } = await supabase.from('rasta_report_profiles').update(reportProfileToRow(data)).eq('id', id)
    if (reportError('ویرایش پروفایل گزارش', error)) return
    await get().fetchProfiles()
  },
  deleteProfile: async (id) => {
    const { error } = await supabase.from('rasta_report_profiles').delete().eq('id', id)
    if (reportError('حذف پروفایل گزارش', error)) return
    set((s) => ({ profiles: s.profiles.filter((p) => p.id !== id) }))
  },

  fetchProjectData: async (masterProjectId) => {
    set({ loadingProject: true })
    const [{ data: snapshots, error: e1 }, { data: decisions, error: e2 }, { data: actions, error: e3 }] = await Promise.all([
      supabase.from('rasta_report_snapshots').select('*').eq('master_project_id', masterProjectId).order('created_at', { ascending: false }),
      supabase.from('rasta_decisions').select('*').eq('master_project_id', masterProjectId).order('created_at', { ascending: false }),
      supabase.from('rasta_actions').select('*').eq('master_project_id', masterProjectId).order('created_at', { ascending: false }),
    ])
    if (reportError('بارگذاری داده‌های گزارش‌گیری پروژه', e1 ?? e2 ?? e3)) {
      set({ loadingProject: false })
      return
    }
    set((s) => ({
      snapshotsByProject: { ...s.snapshotsByProject, [masterProjectId]: (snapshots ?? []).map(reportSnapshotFromRow) },
      decisionsByProject: { ...s.decisionsByProject, [masterProjectId]: (decisions ?? []).map(decisionFromRow) },
      actionsByProject: { ...s.actionsByProject, [masterProjectId]: (actions ?? []).map(rastaActionFromRow) },
      loadingProject: false,
    }))
  },

  createSnapshot: async (data) => {
    const userId = useAuthStore.getState().profile?.id ?? null
    const { data: row, error } = await supabase
      .from('rasta_report_snapshots')
      .insert({
        master_project_id: data.masterProjectId,
        report_type: data.reportType,
        profile_id: data.profileId,
        period_start: data.periodStart,
        period_end: data.periodEnd,
        payload: data.payload,
        widget_ids: data.widgetIds,
        created_by: userId,
      })
      .select('id')
      .single()
    if (reportError('ایجاد گزارش', error)) return null
    await get().fetchProjectData(data.masterProjectId)
    return (row as { id: string } | null)?.id ?? null
  },
  setSnapshotStatus: async (id, masterProjectId, status) => {
    const userId = useAuthStore.getState().profile?.id ?? null
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { status }
    if (status === 'under_review') {
      patch.reviewed_by = userId
      patch.reviewed_at = now
    } else if (status === 'approved') {
      patch.approved_by = userId
      patch.approved_at = now
    } else if (status === 'issued') {
      patch.issued_at = now
    }
    const { error } = await supabase.from('rasta_report_snapshots').update(patch).eq('id', id)
    if (reportError('تغییر وضعیت گزارش', error)) return
    await get().fetchProjectData(masterProjectId)
  },

  createDecision: async (masterProjectId, data) => {
    const userId = useAuthStore.getState().profile?.id ?? null
    const { error } = await supabase.from('rasta_decisions').insert({ ...decisionToRow(masterProjectId, data), created_by: userId })
    if (reportError('ایجاد تصمیم', error)) return
    await get().fetchProjectData(masterProjectId)
  },
  updateDecision: async (id, masterProjectId, data) => {
    const { error } = await supabase.from('rasta_decisions').update(decisionToRow(masterProjectId, data)).eq('id', id)
    if (reportError('ویرایش تصمیم', error)) return
    await get().fetchProjectData(masterProjectId)
  },
  setDecisionStatus: async (id, masterProjectId, status, finalDecision) => {
    const patch: Record<string, unknown> = { status }
    if (status === 'approved' || status === 'rejected' || status === 'deferred') {
      patch.decided_at = new Date().toISOString()
      if (finalDecision !== undefined) patch.final_decision = finalDecision
    }
    const { error } = await supabase.from('rasta_decisions').update(patch).eq('id', id)
    if (reportError('ثبت نتیجه تصمیم', error)) return
    await get().fetchProjectData(masterProjectId)
  },
  deleteDecision: async (id, masterProjectId) => {
    const { error } = await supabase.from('rasta_decisions').delete().eq('id', id)
    if (reportError('حذف تصمیم', error)) return
    set((s) => ({ decisionsByProject: { ...s.decisionsByProject, [masterProjectId]: (s.decisionsByProject[masterProjectId] ?? []).filter((d) => d.id !== id) } }))
  },

  createAction: async (masterProjectId, data) => {
    const userId = useAuthStore.getState().profile?.id ?? null
    const { error } = await supabase.from('rasta_actions').insert({ ...rastaActionToRow(masterProjectId, data), created_by: userId })
    if (reportError('ایجاد اقدام', error)) return
    await get().fetchProjectData(masterProjectId)
  },
  updateAction: async (id, masterProjectId, data) => {
    const { error } = await supabase.from('rasta_actions').update(rastaActionToRow(masterProjectId, data)).eq('id', id)
    if (reportError('ویرایش اقدام', error)) return
    await get().fetchProjectData(masterProjectId)
  },
  setActionStatus: async (id, masterProjectId, status) => {
    const { error } = await supabase.from('rasta_actions').update({ status }).eq('id', id)
    if (reportError('تغییر وضعیت اقدام', error)) return
    await get().fetchProjectData(masterProjectId)
  },
  deleteAction: async (id, masterProjectId) => {
    const { error } = await supabase.from('rasta_actions').delete().eq('id', id)
    if (reportError('حذف اقدام', error)) return
    set((s) => ({ actionsByProject: { ...s.actionsByProject, [masterProjectId]: (s.actionsByProject[masterProjectId] ?? []).filter((a) => a.id !== id) } }))
  },
}))
