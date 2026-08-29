import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import {
  changeRequestFromRow, changeRequestToInsertRow, documentFromRow, historyFromRow, stageReviewFromRow,
} from '../lib/changeData'
import { NEXT_STATUS_AFTER_STAGE, REVIEW_STAGE_LABEL_FA } from '../types'
import type {
  ChangeDocument, ChangePriority, ChangeRequest, ChangeStatus, DocumentCategory,
  ImpactLevel, ReviewStage, StageReview, StageReviewDecision, StageReviewDetails,
} from '../types'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

async function logHistory(changeRequestId: string, userId: string | null, roleLabel: string, action: string, comment = '') {
  await supabase.from('chg_history').insert({
    change_request_id: changeRequestId, user_id: userId, role_label: roleLabel, action, comment,
  })
}

const TERMINAL_STAGE_DECISIONS = new Set<StageReviewDecision>(['approved', 'approved_with_conditions'])

interface ChangeState {
  currentProjectId: string | null
  requests: ChangeRequest[]
  loadingList: boolean

  currentRequestId: string | null
  reviews: StageReview[]
  documents: ChangeDocument[]
  history: ChangeHistoryEntryLocal[]
  loadingBundle: boolean
  saving: boolean

  fetchForProject: (masterProjectId: string) => Promise<void>
  fetchBundle: (changeRequestId: string) => Promise<void>

  createDraft: (masterProjectId: string, data: {
    title: string; description: string; reasonForChange: string; priority: ChangePriority
    currency: string; originalContractAmount: number; proposedChangeAmount: number
    originalDurationDays: number; proposedScheduleImpactDays: number
    newRisksCount: number; scopeImpactLevel: ImpactLevel
  }, userId: string | null) => Promise<string | null>

  submitDraft: (request: ChangeRequest, userId: string | null) => Promise<void>

  saveStageReview: (
    request: ChangeRequest, stage: ReviewStage, decision: StageReviewDecision, comment: string,
    details: StageReviewDetails, userId: string | null, roleLabel: string,
  ) => Promise<void>

  addDocument: (changeRequestId: string, data: { category: DocumentCategory; documentNumber: string; revision: string; fileName: string; fileUrl: string }, userId: string | null) => Promise<void>
}

interface ChangeHistoryEntryLocal {
  id: string
  changeRequestId: string
  userId: string | null
  roleLabel: string
  action: string
  comment: string
  createdAt: string
}

export const useChangeStore = create<ChangeState>()((set, get) => ({
  currentProjectId: null,
  requests: [],
  loadingList: false,

  currentRequestId: null,
  reviews: [],
  documents: [],
  history: [],
  loadingBundle: false,
  saving: false,

  fetchForProject: async (masterProjectId) => {
    set({ currentProjectId: masterProjectId, loadingList: true })
    const { data, error } = await supabase
      .from('chg_change_requests').select('*').eq('master_project_id', masterProjectId).order('created_at', { ascending: false })
    if (reportError('بارگذاری درخواست‌های تغییر', error)) {
      set({ loadingList: false })
      return
    }
    if (get().currentProjectId !== masterProjectId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set({ requests: ((data ?? []) as any[]).map(changeRequestFromRow), loadingList: false })
  },

  fetchBundle: async (changeRequestId) => {
    set({ currentRequestId: changeRequestId, loadingBundle: true })
    const [rv, dc, hs] = await Promise.all([
      supabase.from('chg_stage_reviews').select('*').eq('change_request_id', changeRequestId),
      supabase.from('chg_documents').select('*').eq('change_request_id', changeRequestId).order('uploaded_at', { ascending: false }),
      supabase.from('chg_history').select('*').eq('change_request_id', changeRequestId).order('created_at', { ascending: true }),
    ])
    if (get().currentRequestId !== changeRequestId) return
    set({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reviews: ((rv.data ?? []) as any[]).map(stageReviewFromRow),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      documents: ((dc.data ?? []) as any[]).map(documentFromRow),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      history: ((hs.data ?? []) as any[]).map(historyFromRow),
      loadingBundle: false,
    })
  },

  createDraft: async (masterProjectId, data, userId) => {
    set({ saving: true })
    const row = changeRequestToInsertRow(masterProjectId, { ...data, status: 'draft' })
    const { data: inserted, error } = await supabase.from('chg_change_requests').insert(row).select('id, cr_number').single()
    set({ saving: false })
    if (reportError('ایجاد درخواست تغییر', error) || !inserted) return null
    await logHistory(inserted.id, userId, 'پیمانکار', `پیش‌نویس درخواست تغییر ${inserted.cr_number} ایجاد شد`)
    await get().fetchForProject(masterProjectId)
    return inserted.id as string
  },

  submitDraft: async (request, userId) => {
    set({ saving: true })
    const { error } = await supabase.from('chg_change_requests').update({
      status: 'engineering_review', submitted_by: userId, submitted_at: new Date().toISOString(),
    }).eq('id', request.id)
    set({ saving: false })
    if (reportError('ثبت درخواست تغییر', error)) return
    await logHistory(request.id, userId, 'پیمانکار', `درخواست تغییر ${request.crNumber} ثبت و برای بررسی مهندسی ارسال شد`)
    await Promise.all([get().fetchForProject(request.masterProjectId), get().fetchBundle(request.id)])
  },

  saveStageReview: async (request, stage, decision, comment, details, userId, roleLabel) => {
    set({ saving: true })
    const now = new Date().toISOString()
    const { error } = await supabase.from('chg_stage_reviews').upsert({
      change_request_id: request.id,
      stage,
      decision,
      comment,
      details,
      decided_by: userId,
      decided_at: now,
    }, { onConflict: 'change_request_id,stage' })
    if (reportError('ثبت تصمیم بررسی', error)) {
      set({ saving: false })
      return
    }

    let nextStatus: ChangeStatus = request.status
    const patch: Record<string, unknown> = {}
    if (decision === 'rejected') {
      nextStatus = 'rejected'
    } else if (decision === 'request_revision' || decision === 'returned') {
      nextStatus = 'draft'
    } else if (TERMINAL_STAGE_DECISIONS.has(decision)) {
      nextStatus = NEXT_STATUS_AFTER_STAGE[stage]
      if (stage === 'ccb') {
        patch.approved_change_amount = details.finalApprovedAmount ?? request.proposedChangeAmount
        patch.approved_schedule_impact_days = details.finalApprovedScheduleImpactDays ?? request.proposedScheduleImpactDays
      }
    }
    patch.status = nextStatus

    const { error: statusError } = await supabase.from('chg_change_requests').update(patch).eq('id', request.id)
    set({ saving: false })
    if (reportError('به‌روزرسانی وضعیت درخواست', statusError)) return

    const actionLabel = `${REVIEW_STAGE_LABEL_FA[stage]} — تصمیم: ${decision}`
    await logHistory(request.id, userId, roleLabel, actionLabel, comment)
    await Promise.all([get().fetchForProject(request.masterProjectId), get().fetchBundle(request.id)])
  },

  addDocument: async (changeRequestId, data, userId) => {
    set({ saving: true })
    const { error } = await supabase.from('chg_documents').insert({
      change_request_id: changeRequestId,
      category: data.category,
      document_number: data.documentNumber,
      revision: data.revision,
      file_name: data.fileName,
      file_url: data.fileUrl,
      uploaded_by: userId,
    })
    set({ saving: false })
    if (reportError('افزودن مستند', error)) return
    await get().fetchBundle(changeRequestId)
  },
}))
