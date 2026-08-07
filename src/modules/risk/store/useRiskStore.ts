import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { useAuthStore } from '../../../store/useAuthStore'
import type { RmProject, RmProjectPhase, RmProjectStatus, RmRisk, RmRiskAction, RmRiskAssessment, RmRiskHistoryEntry, RmUserRole } from '../types'
import {
  rmActionFromRow,
  rmActionToRow,
  rmAssessmentFromRow,
  rmHistoryFromRow,
  rmProjectFromRow,
  rmRiskFromRow,
  rmRiskToRow,
  type RmProjectRow,
  type RmRiskActionRow,
  type RmRiskAssessmentRow,
  type RmRiskHistoryRow,
  type RmRiskRow,
} from '../lib/riskData'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${error.message}`)
  return true
}

export interface RmProjectDetail extends RmProject {
  risks: RmRisk[]
  assessments: RmRiskAssessment[]
  actions: RmRiskAction[]
  history: RmRiskHistoryEntry[]
}

interface RiskStoreState {
  projects: RmProject[]
  currentProjectId: string | null
  projectDetail: RmProjectDetail | null
  loadingProjects: boolean
  loadingDetail: boolean

  fetchProjects: () => Promise<void>
  createProject: (data: { name: string; client: string; role: RmUserRole; startDate?: string | null; finishDate?: string | null }) => Promise<string>
  selectProject: (id: string) => Promise<void>
  updateProjectStatus: (projectId: string, status: RmProjectStatus) => Promise<void>

  addRisk: (
    projectId: string,
    data: {
      title: string
      description: string
      category: RmRisk['category']
      riskType: RmRisk['riskType']
      ownerId: string | null
      probability: number
      impact: number
      responseStrategy: RmRisk['responseStrategy']
      projectPhase: RmProjectPhase | null
      timeToImpactDays: number | null
      mitigationAction: string
    },
  ) => Promise<void>
  updateRisk: (riskId: string, data: Partial<RmRisk>) => Promise<void>
  deleteRisk: (riskId: string) => Promise<void>

  addAssessment: (
    riskId: string,
    data: {
      currentProbability: number
      currentImpact: number
      residualProbability: number
      residualImpact: number
      trend: RmRiskAssessment['trend']
      reviewerComment: string
    },
  ) => Promise<void>

  addAction: (riskId: string, data: { description: string; ownerId: string | null; dueDate: string | null }) => Promise<void>
  updateAction: (actionId: string, data: Partial<RmRiskAction>) => Promise<void>
  deleteAction: (actionId: string) => Promise<void>

  addComment: (riskId: string, comment: string) => Promise<void>
}

async function fetchProjectDetail(id: string): Promise<RmProjectDetail | null> {
  const { data: projectRow } = await supabase.from('rm_projects').select('*').eq('id', id).single()
  if (!projectRow) return null
  const { data: riskRows } = await supabase.from('rm_risks').select('*').eq('project_id', id).order('created_at')
  const risks = ((riskRows ?? []) as RmRiskRow[]).map(rmRiskFromRow)
  const riskIds = risks.map((r) => r.id)

  let assessments: RmRiskAssessment[] = []
  let actions: RmRiskAction[] = []
  let history: RmRiskHistoryEntry[] = []
  if (riskIds.length > 0) {
    const [{ data: aRows }, { data: acRows }, { data: hRows }] = await Promise.all([
      supabase.from('rm_risk_assessments').select('*').in('risk_id', riskIds).order('review_date'),
      supabase.from('rm_risk_actions').select('*').in('risk_id', riskIds).order('created_at'),
      supabase.from('rm_risk_history').select('*').in('risk_id', riskIds).order('created_at', { ascending: false }),
    ])
    assessments = ((aRows ?? []) as RmRiskAssessmentRow[]).map(rmAssessmentFromRow)
    actions = ((acRows ?? []) as RmRiskActionRow[]).map(rmActionFromRow)
    history = ((hRows ?? []) as RmRiskHistoryRow[]).map(rmHistoryFromRow)
  }

  return { ...rmProjectFromRow(projectRow as RmProjectRow), risks, assessments, actions, history }
}

export const useRiskStore = create<RiskStoreState>()((set, get) => ({
  projects: [],
  currentProjectId: null,
  projectDetail: null,
  loadingProjects: true,
  loadingDetail: false,

  fetchProjects: async () => {
    set({ loadingProjects: true })
    const { data, error } = await supabase.from('rm_projects').select('*').order('created_at', { ascending: false })
    if (reportError('بارگذاری پروژه‌ها', error)) {
      set({ loadingProjects: false })
      return
    }
    set({ projects: ((data ?? []) as RmProjectRow[]).map(rmProjectFromRow), loadingProjects: false })
  },

  createProject: async ({ name, client, role, startDate, finishDate }) => {
    const { data, error } = await supabase.rpc('create_rm_project_with_manager', {
      p_name: name,
      p_role: role,
      p_client: client,
      p_start_date: startDate ?? null,
      p_finish_date: finishDate ?? null,
    })
    if (error || !data) {
      reportError('ایجاد پروژه', error ?? { message: 'خطای نامشخص' })
      throw new Error(error?.message ?? 'خطا در ایجاد پروژه')
    }
    await get().fetchProjects()
    await get().selectProject(data.id)
    return data.id as string
  },

  selectProject: async (id) => {
    set({ currentProjectId: id, projectDetail: null, loadingDetail: true })
    const detail = await fetchProjectDetail(id)
    set((s) => (s.currentProjectId === id ? { projectDetail: detail, loadingDetail: false } : { loadingDetail: false }))
  },

  updateProjectStatus: async (projectId, status) => {
    const { error } = await supabase.from('rm_projects').update({ status }).eq('id', projectId)
    if (reportError('تغییر وضعیت پروژه', error)) return
    set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, status } } : {}))
    set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? { ...p, status } : p)) }))
  },

  addRisk: async (projectId, data) => {
    const row = rmRiskToRow(projectId, {
      title: data.title,
      description: data.description,
      category: data.category,
      riskType: data.riskType,
      ownerId: data.ownerId,
      responseStrategy: data.responseStrategy,
      projectPhase: data.projectPhase,
      timeToImpactDays: data.timeToImpactDays,
      initialProbability: data.probability,
      initialImpact: data.impact,
    })
    const { data: inserted, error } = await supabase.from('rm_risks').insert(row).select().single()
    if (reportError('ثبت ریسک', error) || !inserted) return
    const newRisk = rmRiskFromRow(inserted as RmRiskRow)

    // The mitigation action entered on the registration form becomes the risk's first action.
    let newAction: RmRiskAction | null = null
    if (data.mitigationAction.trim()) {
      const { data: actionRow } = await supabase
        .from('rm_risk_actions')
        .insert(rmActionToRow(newRisk.id, { description: data.mitigationAction.trim(), ownerId: data.ownerId, status: 'not_started', completionPercentage: 0 }))
        .select()
        .single()
      if (actionRow) newAction = rmActionFromRow(actionRow as RmRiskActionRow)
    }

    await supabase.from('rm_risk_history').insert({
      risk_id: newRisk.id,
      user_id: useAuthStore.getState().profile?.id ?? null,
      activity: 'risk_created',
      comment: `ریسک «${newRisk.title}» ثبت شد`,
    })

    set((s) =>
      s.projectDetail?.id === projectId
        ? {
            projectDetail: {
              ...s.projectDetail,
              risks: [...s.projectDetail.risks, newRisk],
              actions: newAction ? [...s.projectDetail.actions, newAction] : s.projectDetail.actions,
            },
          }
        : {},
    )
  },

  updateRisk: async (riskId, data) => {
    const detail = get().projectDetail
    if (!detail) return
    const row = rmRiskToRow(detail.id, data)
    delete row.project_id
    row.updated_at = new Date().toISOString()
    const { error } = await supabase.from('rm_risks').update(row).eq('id', riskId)
    if (reportError('ویرایش ریسک', error)) return
    set((s) =>
      s.projectDetail
        ? { projectDetail: { ...s.projectDetail, risks: s.projectDetail.risks.map((r) => (r.id === riskId ? { ...r, ...data } : r)) } }
        : {},
    )
  },

  deleteRisk: async (riskId) => {
    const { error } = await supabase.from('rm_risks').delete().eq('id', riskId)
    if (reportError('حذف ریسک', error)) return
    set((s) =>
      s.projectDetail
        ? {
            projectDetail: {
              ...s.projectDetail,
              risks: s.projectDetail.risks.filter((r) => r.id !== riskId),
              assessments: s.projectDetail.assessments.filter((a) => a.riskId !== riskId),
              actions: s.projectDetail.actions.filter((a) => a.riskId !== riskId),
              history: s.projectDetail.history.filter((h) => h.riskId !== riskId),
            },
          }
        : {},
    )
  },

  addAssessment: async (riskId, data) => {
    const { data: inserted, error } = await supabase
      .from('rm_risk_assessments')
      .insert({
        risk_id: riskId,
        current_probability: data.currentProbability,
        current_impact: data.currentImpact,
        residual_probability: data.residualProbability,
        residual_impact: data.residualImpact,
        trend: data.trend,
        reviewer_comment: data.reviewerComment,
        created_by: useAuthStore.getState().profile?.id ?? null,
      })
      .select()
      .single()
    if (reportError('ثبت بازبینی ریسک', error) || !inserted) return
    const newAssessment = rmAssessmentFromRow(inserted as RmRiskAssessmentRow)

    await supabase.from('rm_risk_history').insert({
      risk_id: riskId,
      user_id: useAuthStore.getState().profile?.id ?? null,
      activity: 'assessment_added',
      comment: `بازبینی جدید ثبت شد — امتیاز فعلی ${newAssessment.currentScore}، روند: ${data.trend}`,
    })

    set((s) => (s.projectDetail ? { projectDetail: { ...s.projectDetail, assessments: [...s.projectDetail.assessments, newAssessment] } } : {}))
  },

  addAction: async (riskId, data) => {
    const { data: inserted, error } = await supabase
      .from('rm_risk_actions')
      .insert(rmActionToRow(riskId, { description: data.description, ownerId: data.ownerId, dueDate: data.dueDate, status: 'not_started', completionPercentage: 0 }))
      .select()
      .single()
    if (reportError('ثبت اقدام', error) || !inserted) return
    const newAction = rmActionFromRow(inserted as RmRiskActionRow)
    set((s) => (s.projectDetail ? { projectDetail: { ...s.projectDetail, actions: [...s.projectDetail.actions, newAction] } } : {}))
  },

  updateAction: async (actionId, data) => {
    const row = rmActionToRow('', data)
    delete row.risk_id
    row.updated_at = new Date().toISOString()
    const { error } = await supabase.from('rm_risk_actions').update(row).eq('id', actionId)
    if (reportError('ویرایش اقدام', error)) return
    set((s) =>
      s.projectDetail
        ? { projectDetail: { ...s.projectDetail, actions: s.projectDetail.actions.map((a) => (a.id === actionId ? { ...a, ...data } : a)) } }
        : {},
    )
  },

  deleteAction: async (actionId) => {
    const { error } = await supabase.from('rm_risk_actions').delete().eq('id', actionId)
    if (reportError('حذف اقدام', error)) return
    set((s) => (s.projectDetail ? { projectDetail: { ...s.projectDetail, actions: s.projectDetail.actions.filter((a) => a.id !== actionId) } } : {}))
  },

  addComment: async (riskId, comment) => {
    const { data: inserted, error } = await supabase
      .from('rm_risk_history')
      .insert({ risk_id: riskId, user_id: useAuthStore.getState().profile?.id ?? null, activity: 'comment', comment })
      .select()
      .single()
    if (reportError('ثبت نظر', error) || !inserted) return
    const entry = rmHistoryFromRow(inserted as RmRiskHistoryRow)
    set((s) => (s.projectDetail ? { projectDetail: { ...s.projectDetail, history: [entry, ...s.projectDetail.history] } } : {}))
  },
}))
