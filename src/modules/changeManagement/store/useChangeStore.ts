import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import { changeRequestFromRow, changeRequestToInsertRow } from '../lib/changeData'
import { computeApprovalTier, percentOfContract, priorApprovedTotal } from '../lib/changeCalc'
import type { ApprovalTier, ChangeRequest, ConsultantDecision, EmployerDecision } from '../types'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

interface ChangeState {
  currentProjectId: string | null
  requests: ChangeRequest[]
  loading: boolean
  saving: boolean

  fetchForProject: (masterProjectId: string) => Promise<void>
  submitChange: (
    masterProjectId: string,
    data: { changeNumber: string; title: string; description: string; justification: string; timeImpactDays: number; costImpactAmount: number },
    contractValue: number,
  ) => Promise<{ ok: boolean; tier: ApprovalTier }>
  consultantReview: (request: ChangeRequest, decision: ConsultantDecision, comment: string, userId: string | null) => Promise<void>
  employerDecide: (
    request: ChangeRequest,
    decision: EmployerDecision,
    comment: string,
    userId: string | null,
    contractValue: number,
  ) => Promise<{ ok: boolean; blockedReason?: string }>
}

export const useChangeStore = create<ChangeState>()((set, get) => ({
  currentProjectId: null,
  requests: [],
  loading: false,
  saving: false,

  fetchForProject: async (masterProjectId) => {
    set({ currentProjectId: masterProjectId, loading: true })
    const { data, error } = await supabase
      .from('chg_change_requests').select('*').eq('master_project_id', masterProjectId).order('submitted_at', { ascending: false })
    if (reportError('بارگذاری درخواست‌های تغییر', error)) {
      set({ loading: false })
      return
    }
    if (get().currentProjectId !== masterProjectId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set({ requests: ((data ?? []) as any[]).map(changeRequestFromRow), loading: false })
  },

  submitChange: async (masterProjectId, data, contractValue) => {
    set({ saving: true })
    const priorTotal = priorApprovedTotal(get().requests)
    const cumulativeIfApproved = percentOfContract(priorTotal + data.costImpactAmount, contractValue)
    const tier = computeApprovalTier(cumulativeIfApproved)

    const row = changeRequestToInsertRow(masterProjectId, { ...data, requiredApprovalTier: tier, status: 'submitted' })
    const { error } = await supabase.from('chg_change_requests').insert(row)
    set({ saving: false })
    if (reportError('ثبت درخواست تغییر', error)) return { ok: false, tier }
    await get().fetchForProject(masterProjectId)
    return { ok: true, tier }
  },

  consultantReview: async (request, decision, comment, userId) => {
    set({ saving: true })
    const { error } = await supabase.from('chg_change_requests').update({
      consultant_decision: decision,
      consultant_comment: comment,
      consultant_reviewed_by: userId,
      consultant_reviewed_at: new Date().toISOString(),
      status: 'pending_employer_decision',
    }).eq('id', request.id)
    set({ saving: false })
    if (reportError('ثبت بررسی مشاور', error)) return
    await get().fetchForProject(request.masterProjectId)
  },

  employerDecide: async (request, decision, comment, userId, contractValue) => {
    // Re-validate live, at the moment of decision — more changes may have been approved since
    // this one was submitted, so the ceiling check must never rely on a stale stored tier.
    const priorTotal = priorApprovedTotal(get().requests, request.id)
    const cumulativeIfApproved = percentOfContract(priorTotal + request.costImpactAmount, contractValue)
    const liveTier = computeApprovalTier(cumulativeIfApproved)
    if (decision === 'approved' && liveTier === 'over_ceiling') {
      return { ok: false, blockedReason: `این تغییر مجموع تغییرات تصویب‌شده پروژه را به ${Math.round(cumulativeIfApproved)}٪ می‌رساند — بیش از سقف مجاز ۲۵٪. تایید امکان‌پذیر نیست.` }
    }

    set({ saving: true })
    const now = new Date().toISOString()
    const { error } = await supabase.from('chg_change_requests').update({
      employer_decision: decision,
      employer_comment: comment,
      decided_by: userId,
      decided_at: now,
      communicated_at: decision === 'approved' ? now : null,
      status: decision === 'approved' ? 'approved' : 'rejected',
      required_approval_tier: liveTier === 'over_ceiling' ? request.requiredApprovalTier : liveTier,
    }).eq('id', request.id)
    set({ saving: false })
    if (reportError('ثبت تصمیم کارفرما', error)) return { ok: false }
    await get().fetchForProject(request.masterProjectId)
    return { ok: true }
  },
}))
