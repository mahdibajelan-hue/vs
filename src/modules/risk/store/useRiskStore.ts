import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { useAuthStore } from '../../../store/useAuthStore'
import type { RmProject, RmProjectPhase, RmProjectStatus, RmRisk, RmRiskAction, RmRiskAssessment, RmRiskHistoryEntry, RmStrategyDetails, RmUserRole } from '../types'
import {
  RM_CATEGORY_LABEL_FA,
  RM_ESCALATION_LEVEL_LABEL_FA,
  RM_ESCALATION_STATUS_LABEL_FA,
  RM_PROJECT_PHASE_LABEL_FA,
  RM_RESPONSE_STRATEGY_LABEL_FA,
  RM_RISK_STATUS_LABEL_FA,
  RM_RISK_TYPE_LABEL_FA,
  RM_ACTION_STATUS_LABEL_FA,
} from '../types'
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

const RISK_FIELD_LABEL_FA: Partial<Record<keyof RmRisk, string>> = {
  title: 'عنوان',
  description: 'توضیحات',
  category: 'دسته‌بندی',
  riskType: 'نوع',
  ownerId: 'مالک ریسک',
  identifiedDate: 'تاریخ شناسایی',
  status: 'وضعیت',
  responseStrategy: 'استراتژی پاسخ',
  strategyDetails: 'جزئیات استراتژی پاسخ',
  projectPhase: 'فاز پروژه',
  timeToImpactDays: 'زمان تا وقوع (روز)',
  escalationLevel: 'سطح ارجاع',
  escalatedTo: 'ارجاع به',
  escalationReason: 'دلیل ارجاع',
  escalationDate: 'تاریخ ارجاع',
  requiredDecision: 'تصمیم موردنیاز',
  escalationDecision: 'تصمیم نهایی',
  escalationDecisionDate: 'تاریخ تصمیم',
  escalationStatus: 'وضعیت ارجاع',
}

const RISK_FIELD_ENUM_LABEL_FA: Partial<Record<keyof RmRisk, Record<string, string>>> = {
  category: RM_CATEGORY_LABEL_FA,
  riskType: RM_RISK_TYPE_LABEL_FA,
  status: RM_RISK_STATUS_LABEL_FA,
  responseStrategy: RM_RESPONSE_STRATEGY_LABEL_FA,
  projectPhase: RM_PROJECT_PHASE_LABEL_FA,
  escalationLevel: RM_ESCALATION_LEVEL_LABEL_FA,
  escalationStatus: RM_ESCALATION_STATUS_LABEL_FA,
}

function formatFieldValue<T extends Record<string, unknown>>(enumMap: Partial<Record<keyof T, Record<string, string>>>, key: keyof T, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  const labels = enumMap[key]
  if (labels && typeof value === 'string' && labels[value]) return labels[value]
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Field-level audit trail (spec §35) — one rm_risk_history row per changed field, human-readable in the existing comment log. */
function buildRiskFieldChangeRows(riskId: string, userId: string | null, before: RmRisk, after: Partial<RmRisk>) {
  const rows: Record<string, unknown>[] = []
  for (const key of Object.keys(after) as (keyof RmRisk)[]) {
    const label = RISK_FIELD_LABEL_FA[key]
    if (!label) continue
    const prev = before[key]
    const next = after[key]
    const changed = key === 'strategyDetails' ? JSON.stringify(prev ?? {}) !== JSON.stringify(next ?? {}) : prev !== next
    if (!changed) continue
    rows.push({
      risk_id: riskId,
      user_id: userId,
      activity: 'field_changed',
      previous_value: prev ?? null,
      new_value: next ?? null,
      comment: `${label}: «${formatFieldValue(RISK_FIELD_ENUM_LABEL_FA, key, prev)}» → «${formatFieldValue(RISK_FIELD_ENUM_LABEL_FA, key, next)}»`,
    })
  }
  return rows
}

const ACTION_FIELD_LABEL_FA: Partial<Record<keyof RmRiskAction, string>> = {
  description: 'شرح اقدام',
  ownerId: 'مسئول اقدام',
  dueDate: 'سررسید',
  status: 'وضعیت اقدام',
  completionPercentage: 'درصد پیشرفت',
}

const ACTION_FIELD_ENUM_LABEL_FA: Partial<Record<keyof RmRiskAction, Record<string, string>>> = {
  status: RM_ACTION_STATUS_LABEL_FA,
}

function buildActionFieldChangeRows(riskId: string, userId: string | null, before: RmRiskAction, after: Partial<RmRiskAction>) {
  const rows: Record<string, unknown>[] = []
  for (const key of Object.keys(after) as (keyof RmRiskAction)[]) {
    const label = ACTION_FIELD_LABEL_FA[key]
    if (!label) continue
    const prev = before[key]
    const next = after[key]
    if (prev === next) continue
    rows.push({
      risk_id: riskId,
      user_id: userId,
      activity: 'action_field_changed',
      previous_value: prev ?? null,
      new_value: next ?? null,
      comment: `اقدام «${before.description}» — ${label}: «${formatFieldValue(ACTION_FIELD_ENUM_LABEL_FA, key, prev)}» → «${formatFieldValue(ACTION_FIELD_ENUM_LABEL_FA, key, next)}»`,
    })
  }
  return rows
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
      strategyDetails: RmStrategyDetails
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
      reviewDate: string
      currentProbability: number
      currentImpact: number
      residualProbability: number
      residualImpact: number
      trend: RmRiskAssessment['trend']
      reviewerComment: string
      responseStrategy: RmRiskAssessment['responseStrategy']
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
      supabase.from('rm_risk_assessments').select('*').in('risk_id', riskIds).order('review_date').order('created_at'),
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
      strategyDetails: data.strategyDetails,
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
    const before = detail.risks.find((r) => r.id === riskId)
    const row = rmRiskToRow(detail.id, data)
    delete row.project_id
    row.updated_at = new Date().toISOString()
    const { error } = await supabase.from('rm_risks').update(row).eq('id', riskId)
    if (reportError('ویرایش ریسک', error)) return

    let newHistoryEntries: RmRiskHistoryEntry[] = []
    if (before) {
      const changeRows = buildRiskFieldChangeRows(riskId, useAuthStore.getState().profile?.id ?? null, before, data)
      if (changeRows.length > 0) {
        const { data: inserted } = await supabase.from('rm_risk_history').insert(changeRows).select()
        newHistoryEntries = ((inserted ?? []) as RmRiskHistoryRow[]).map(rmHistoryFromRow)
      }
    }

    set((s) =>
      s.projectDetail
        ? {
            projectDetail: {
              ...s.projectDetail,
              risks: s.projectDetail.risks.map((r) => (r.id === riskId ? { ...r, ...data } : r)),
              history: [...newHistoryEntries, ...s.projectDetail.history],
            },
          }
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
        review_date: data.reviewDate,
        current_probability: data.currentProbability,
        current_impact: data.currentImpact,
        residual_probability: data.residualProbability,
        residual_impact: data.residualImpact,
        trend: data.trend,
        reviewer_comment: data.reviewerComment,
        response_strategy: data.responseStrategy,
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
    const detail = get().projectDetail
    const before = detail?.actions.find((a) => a.id === actionId)
    const row = rmActionToRow('', data)
    delete row.risk_id
    row.updated_at = new Date().toISOString()
    const { error } = await supabase.from('rm_risk_actions').update(row).eq('id', actionId)
    if (reportError('ویرایش اقدام', error)) return

    let newHistoryEntries: RmRiskHistoryEntry[] = []
    if (before) {
      const changeRows = buildActionFieldChangeRows(before.riskId, useAuthStore.getState().profile?.id ?? null, before, data)
      if (changeRows.length > 0) {
        const { data: inserted } = await supabase.from('rm_risk_history').insert(changeRows).select()
        newHistoryEntries = ((inserted ?? []) as RmRiskHistoryRow[]).map(rmHistoryFromRow)
      }
    }

    set((s) =>
      s.projectDetail
        ? {
            projectDetail: {
              ...s.projectDetail,
              actions: s.projectDetail.actions.map((a) => (a.id === actionId ? { ...a, ...data } : a)),
              history: [...newHistoryEntries, ...s.projectDetail.history],
            },
          }
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
