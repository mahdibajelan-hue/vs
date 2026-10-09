import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../store/useAuthStore'
import type {
  RmAcceptance, RmCategoryDef, RmContingency, RmControl, RmCorporateRisk, RmEvidence, RmKri, RmKriEvent, RmKriReading, RmLink, RmNotifRule, RmPolicy, RmProject, RmRisk, RmRiskAction,
  RmRiskAssessment, RmRiskHistoryEntry, RmSuggestion, RmUserRole,
} from '../types'
import {
  rmAcceptanceFromRow, rmActionFromRow, rmActionToRow, rmAssessmentFromRow, rmCategoryFromRow, rmContingencyFromRow, rmControlFromRow, rmControlToRow, rmCorporateFromRow, rmEvidenceFromRow, rmHistoryFromRow,
  rmKriEventFromRow, rmKriFromRow, rmKriReadingFromRow, rmLinkFromRow, rmNotifRuleFromRow, rmPolicyFromRow, rmProjectFromRow, rmRiskFromRow, rmRiskToRow, rmSuggestionFromRow,
} from '../lib/riskData'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type RmProjectX = RmProject & { masterRefId: string | null; shortCode: string }
export interface Result { ok: boolean; error?: string; id?: string }

/** Database exception names → plain Persian sentences shown next to the field/button that caused them. */
const ERR: Record<string, string> = {
  initial_assessment_is_immutable: 'ارزیابی اولیه (ریسک ذاتی) پس از ثبت قابل‌تغییر نیست؛ برای تغییر وضعیت، «ارزیابی جدید» ثبت کنید.',
  closed_reason_required: 'برای بستن ریسک، دلیل بستن را بنویسید.',
  basis_required_for_score_reduction: 'کاهش امتیاز بدون مبنا پذیرفته نمی‌شود؛ دلیل یا مستند کاهش را بنویسید.',
  basis_required_for_quantitative_method: 'برای روش نیمه‌کمی/کمی، «مبنای ارزیابی» الزامی است.',
  assessments_are_immutable: 'ارزیابی‌های ثبت‌شده قابل‌ویرایش یا حذف نیستند؛ ارزیابی جدید ثبت کنید.',
  blocked_reason_required: 'برای مسدودکردن اقدام، علت انسداد را بنویسید.',
  effect_requires_completed_action: 'اثربخشی فقط برای اقدام «تکمیل‌شده» ثبت می‌شود.',
  effect_note_required: 'برای ثبت نتیجهٔ اثربخشی، یادداشت/شاهد را بنویسید.',
  invalid_kri_thresholds: 'آستانه‌های شاخص با جهت آن سازگار نیست (هشدار باید پیش از بحرانی باشد).',
  rationale_required: 'دلیل درخواست را (دست‌کم ۱۰ نویسه) بنویسید.',
  acceptance_already_requested: 'برای این ریسک درخواست پذیرش در انتظار تصمیم وجود دارد.',
  authority_required: 'این تصمیم در اختیار شما نیست (مرجع مجاز: تأییدکنندهٔ ریسک، مدیر پروژه یا مدیریت ارشد).',
  cannot_decide_own_request: 'درخواست‌کننده نمی‌تواند خودش تصمیم بگیرد.',
  note_required_for_rejection: 'برای رد، دلیل را بنویسید.',
  acceptance_not_pending: 'این درخواست دیگر در انتظار تصمیم نیست.',
  risk_project_not_mapped: 'پروژهٔ این ریسک هنوز به پروژهٔ مرجع نگاشت نشده است.',
  no_issue_mapping: 'پروژهٔ مرجع این ریسک در مدیریت مسائل نگاشت نشده است.',
  no_risk_mapping: 'پروژهٔ مرجع در مدیریت ریسک نگاشت نشده است.',
  not_authorized_for_project: 'دسترسی لازم به این پروژه را ندارید.',
  not_authorized: 'دسترسی لازم را ندارید.',
  external_reference_required: 'شناسهٔ سامانهٔ مبدأ الزامی است.',
  duplicate_key: 'این مورد قبلاً ثبت شده است.',
}
export function friendly(error: { message?: string; code?: string } | null | undefined): string {
  const m = error?.message ?? ''
  const k = Object.keys(ERR).find((x) => m.includes(x))
  if (k) return ERR[k]
  if (error?.code === '23505') return ERR.duplicate_key
  if (error?.code === '42501' || m.includes('row-level security')) return 'دسترسی نوشتن در این بخش را ندارید.'
  return m || 'خطای نامشخص'
}
const fail = (error: any): Result => ({ ok: false, error: friendly(error) })

async function fetchAll(table: string, build?: (q: any) => any, page = 1000): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += page) {
    let q = supabase.from(table).select('*')
    if (build) q = build(q)
    const { data, error } = await q.range(from, from + page - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < page) break
  }
  return out
}

export interface RiskDraft {
  title: string; description: string; category: string; subcategory: string | null; riskType: 'threat' | 'opportunity'; cause: string; riskEvent: string; consequence: string
  ownerId: string | null; monitorId: string | null; approverId: string | null; responseOwnerId: string | null
  identifiedDate: string; projectPhase: RmRisk['projectPhase']; discipline: string; timeToImpactDays: number | null
  probability: number; impact: number; impactDims: RmRisk['impactDims']; impactTimeDays: number | null; impactCost: number | null; impactObjectives: string
  responseStrategy: RmRisk['responseStrategy']; strategyDetails: RmRisk['strategyDetails']; assumptions: string; assessmentBasis: string
  kmFrom: number | null; kmTo: number | null; routeSegment: string; station: string; workFront: string; contractor: string; workPackage: string; execStage: string
  reviewIntervalDays: number | null; tags: string[]; firstAction?: string
}

interface State {
  loading: boolean
  loaded: boolean
  error: string | null
  scopeProjectId: string
  projects: RmProjectX[]
  categories: RmCategoryDef[]
  policies: RmPolicy[]
  notifRules: RmNotifRule[]
  risks: RmRisk[]
  assessments: RmRiskAssessment[]
  actions: RmRiskAction[]
  controls: RmControl[]
  contingency: RmContingency[]
  kris: RmKri[]
  kriReadings: RmKriReading[]
  kriEvents: RmKriEvent[]
  links: RmLink[]
  acceptances: RmAcceptance[]
  corporate: RmCorporateRisk[]
  suggestions: RmSuggestion[]
  evidenceByRisk: Record<string, RmEvidence[]>
  historyByRisk: Record<string, RmRiskHistoryEntry[]>
  myRoles: Record<string, RmUserRole>

  fetchAll: () => Promise<void>
  setScope: (id: string) => void
  loadRiskExtras: (riskId: string) => Promise<void>
  syncProjects: () => Promise<void>

  addRisk: (projectId: string, d: RiskDraft) => Promise<Result>
  updateRisk: (id: string, patch: Partial<RmRisk>) => Promise<Result>
  closeRisk: (id: string, reason: string) => Promise<Result>
  reopenRisk: (id: string) => Promise<Result>
  deleteRisk: (id: string) => Promise<Result>
  bulkAdd: (projectId: string, rows: RiskDraft[]) => Promise<{ created: number; failed: { row: number; error: string }[] }>

  addAssessment: (riskId: string, d: { reviewDate: string; currentProbability: number; currentImpact: number; residualProbability: number; residualImpact: number; trend: RmRiskAssessment['trend']; reviewerComment: string; basis: string; method: RmRiskAssessment['method']; impactDims: RmRiskAssessment['impactDims']; probabilityPct: number | null; exposureCost: number | null; kind: RmRiskAssessment['kind']; relatedActionIds: string[]; responseStrategy: RmRisk['responseStrategy'] }) => Promise<Result>
  approveAssessment: (id: string) => Promise<Result>

  addAction: (riskId: string, d: Partial<RmRiskAction> & { description: string }) => Promise<Result>
  updateAction: (id: string, d: Partial<RmRiskAction>) => Promise<Result>
  deleteAction: (id: string) => Promise<Result>

  addControl: (riskId: string, d: Partial<RmControl> & { name: string }) => Promise<Result>
  updateControl: (id: string, d: Partial<RmControl>) => Promise<Result>
  deleteControl: (id: string) => Promise<Result>
  addContingency: (riskId: string, d: { triggerCondition: string; plan: string; ownerId: string | null; budget: number | null }) => Promise<Result>
  updateContingency: (id: string, d: Partial<{ status: RmContingency['status']; plan: string; triggerCondition: string; ownerId: string | null; budget: number | null }>) => Promise<Result>
  deleteContingency: (id: string) => Promise<Result>

  addKri: (d: Omit<RmKri, 'id' | 'currentValue' | 'lastReadingAt' | 'state' | 'createdAt'>) => Promise<Result>
  updateKri: (id: string, d: Partial<RmKri>) => Promise<Result>
  deleteKri: (id: string) => Promise<Result>
  recordReading: (kriId: string, value: number, note: string, readAt?: string) => Promise<Result>

  addLink: (riskId: string, d: Pick<RmLink, 'targetType' | 'targetId' | 'targetLabel' | 'relation'>) => Promise<Result>
  removeLink: (id: string) => Promise<Result>
  addEvidence: (riskId: string, d: Pick<RmEvidence, 'kind' | 'title' | 'note' | 'url'>) => Promise<Result>
  removeEvidence: (id: string, riskId: string) => Promise<Result>
  addComment: (riskId: string, text: string) => Promise<Result>

  requestAcceptance: (riskId: string, rationale: string, validUntil: string | null) => Promise<Result>
  decideAcceptance: (id: string, approve: boolean, note: string) => Promise<Result>
  createCorporate: (d: { title: string; description: string; category: string | null; ownerId: string | null; correctivePlan: string }) => Promise<Result>
  attachCorporate: (riskId: string, corporateId: string | null) => Promise<Result>
  convertToIssue: (riskId: string, cause: string, days: number, pursuerId: string | null) => Promise<Result>

  scanMissions: (projectId: string) => Promise<{ ok: boolean; queued?: number; auto?: number; error?: string }>
  acceptSuggestion: (id: string) => Promise<Result>
  rejectSuggestion: (id: string) => Promise<Result>

  savePolicy: (p: Partial<RmPolicy> & { projectId: string | null }) => Promise<Result>
  saveCategory: (c: { key: string; labelFa: string; parentKey: string | null; active: boolean; sort?: number }) => Promise<Result>
  saveNotifRule: (key: string, patch: Partial<Pick<RmNotifRule, 'recipients' | 'escalateTo' | 'channels' | 'thresholdHours' | 'dedupeHours' | 'isActive'>>) => Promise<Result>
}

const me = () => useAuthStore.getState().profile?.id ?? null
const upsert = <T extends { id: string }>(list: T[], item: T) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item])

export const useRiskStore = create<State>()((set, get) => {
  const logHistory = (riskId: string, activity: string, comment = '', value?: unknown) =>
    supabase.from('rm_risk_history').insert({ risk_id: riskId, user_id: me(), activity, new_value: value ?? null, comment })
  const refreshRisk = async (id: string) => {
    const { data } = await supabase.from('rm_risks').select('*').eq('id', id).single()
    if (data) set((s) => ({ risks: upsert(s.risks, rmRiskFromRow(data)) }))
  }
  const touchHistory = (riskId: string) => set((s) => { const h = { ...s.historyByRisk }; delete h[riskId]; return { historyByRisk: h } })

  return {
    loading: false, loaded: false, error: null, scopeProjectId: 'all', projects: [], categories: [], policies: [], notifRules: [], risks: [], assessments: [], actions: [], controls: [], contingency: [],
    kris: [], kriReadings: [], kriEvents: [], links: [], acceptances: [], corporate: [], suggestions: [], evidenceByRisk: {}, historyByRisk: {}, myRoles: {},

    setScope: (id) => set({ scopeProjectId: id }),

    fetchAll: async () => {
      set({ loading: true, error: null })
      try {
        const since = new Date(Date.now() - 180 * 86400000).toISOString()
        const [projects, cats, pols, rules, risks, assess, actions, controls, cont, kris, readings, events, links, acc, corp, sugg, roles] = await Promise.all([
          fetchAll('rm_projects', (q) => q.order('name')), fetchAll('rm_categories', (q) => q.order('sort')), fetchAll('rm_policy'), fetchAll('im_notif_rules', (q) => q.eq('scope', 'risk').order('sort')),
          fetchAll('rm_risks', (q) => q.order('created_at')), fetchAll('rm_risk_assessments', (q) => q.order('review_date').order('created_at')), fetchAll('rm_risk_actions', (q) => q.order('created_at')),
          fetchAll('rm_controls'), fetchAll('rm_contingency_plans'), fetchAll('rm_kris'), fetchAll('rm_kri_readings', (q) => q.gte('read_at', since).order('read_at')), fetchAll('rm_kri_events', (q) => q.order('at', { ascending: false })),
          fetchAll('rm_risk_links'), fetchAll('rm_acceptances', (q) => q.order('requested_at', { ascending: false })), fetchAll('rm_corporate_risks'), fetchAll('rm_suggestions', (q) => q.order('created_at', { ascending: false })),
          supabase.from('rm_project_members').select('project_id, role').eq('user_id', me() ?? '00000000-0000-0000-0000-000000000000'),
        ])
        const myRoles: Record<string, RmUserRole> = {}
        for (const r of (roles.data ?? []) as any[]) myRoles[r.project_id] = r.role
        set({
          projects: projects.map(rmProjectFromRow), categories: cats.map(rmCategoryFromRow), policies: pols.map(rmPolicyFromRow), notifRules: rules.map(rmNotifRuleFromRow),
          risks: risks.map(rmRiskFromRow), assessments: assess.map(rmAssessmentFromRow), actions: actions.map(rmActionFromRow), controls: controls.map(rmControlFromRow), contingency: cont.map(rmContingencyFromRow),
          kris: kris.map(rmKriFromRow), kriReadings: readings.map(rmKriReadingFromRow), kriEvents: events.map(rmKriEventFromRow), links: links.map(rmLinkFromRow), acceptances: acc.map(rmAcceptanceFromRow),
          corporate: corp.map(rmCorporateFromRow), suggestions: sugg.map(rmSuggestionFromRow), myRoles, loading: false, loaded: true,
        })
      } catch (e) { set({ loading: false, error: friendly(e as any) }) }
    },

    syncProjects: async () => {
      if (!useAuthStore.getState().profile?.isAdmin) return
      const { error } = await supabase.rpc('rm_sync_master_projects')
      if (!error) { const rows = await fetchAll('rm_projects', (q) => q.order('name')); set({ projects: rows.map(rmProjectFromRow) }) }
    },

    loadRiskExtras: async (riskId) => {
      const [ev, h] = await Promise.all([supabase.from('rm_risk_evidence').select('*').eq('risk_id', riskId).order('created_at', { ascending: false }), supabase.from('rm_risk_history').select('*').eq('risk_id', riskId).order('created_at', { ascending: false }).limit(300)])
      set((s) => ({ evidenceByRisk: { ...s.evidenceByRisk, [riskId]: ((ev.data ?? []) as any[]).map(rmEvidenceFromRow) }, historyByRisk: { ...s.historyByRisk, [riskId]: ((h.data ?? []) as any[]).map(rmHistoryFromRow) } }))
    },

    addRisk: async (projectId, d) => {
      const row = rmRiskToRow({
        title: d.title.trim(), description: d.description, category: d.category, subcategory: d.subcategory, riskType: d.riskType, cause: d.cause, riskEvent: d.riskEvent, consequence: d.consequence,
        ownerId: d.ownerId, monitorId: d.monitorId, approverId: d.approverId, responseOwnerId: d.responseOwnerId, identifiedDate: d.identifiedDate, projectPhase: d.projectPhase, discipline: d.discipline,
        timeToImpactDays: d.timeToImpactDays, initialProbability: d.probability, initialImpact: d.impact, impactDims: d.impactDims, impactTimeDays: d.impactTimeDays, impactCost: d.impactCost,
        impactObjectives: d.impactObjectives, responseStrategy: d.responseStrategy, strategyDetails: d.strategyDetails, assumptions: d.assumptions, assessmentBasis: d.assessmentBasis, kmFrom: d.kmFrom, kmTo: d.kmTo,
        routeSegment: d.routeSegment, station: d.station, workFront: d.workFront, contractor: d.contractor, workPackage: d.workPackage, execStage: d.execStage, reviewIntervalDays: d.reviewIntervalDays, tags: d.tags,
      })
      const { data, error } = await supabase.from('rm_risks').insert({ ...row, project_id: projectId, created_by: me() }).select().single()
      if (error || !data) return fail(error)
      const risk = rmRiskFromRow(data)
      set((s) => ({ risks: [...s.risks, risk] }))
      await logHistory(risk.id, 'risk_created', `ریسک «${risk.title}» ثبت شد`)
      if (d.firstAction?.trim()) {
        const a = await supabase.from('rm_risk_actions').insert({ risk_id: risk.id, description: d.firstAction.trim(), owner_id: d.responseOwnerId ?? d.ownerId, created_by: me() }).select().single()
        if (a.data) set((s) => ({ actions: [...s.actions, rmActionFromRow(a.data)] }))
      }
      return { ok: true, id: risk.id }
    },

    updateRisk: async (id, patch) => {
      const row = rmRiskToRow(patch)
      if (!Object.keys(row).length) return { ok: true }
      const { data, error } = await supabase.from('rm_risks').update(row).eq('id', id).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ risks: upsert(s.risks, rmRiskFromRow(data)) })); touchHistory(id)
      return { ok: true }
    },

    closeRisk: async (id, reason) => {
      if (reason.trim().length < 3) return { ok: false, error: ERR.closed_reason_required }
      return get().updateRisk(id, { status: 'closed', closedReason: reason.trim() })
    },
    reopenRisk: async (id) => get().updateRisk(id, { status: 'monitoring' }),

    deleteRisk: async (id) => {
      const { error } = await supabase.from('rm_risks').delete().eq('id', id)
      if (error) return fail(error)
      set((s) => ({ risks: s.risks.filter((r) => r.id !== id), assessments: s.assessments.filter((a) => a.riskId !== id), actions: s.actions.filter((a) => a.riskId !== id), controls: s.controls.filter((c) => c.riskId !== id) }))
      return { ok: true }
    },

    bulkAdd: async (projectId, rows) => {
      let created = 0
      const failed: { row: number; error: string }[] = []
      for (let i = 0; i < rows.length; i++) { const r = await get().addRisk(projectId, rows[i]); if (r.ok) created++; else failed.push({ row: i + 1, error: r.error ?? '' }) }
      return { created, failed }
    },

    addAssessment: async (riskId, d) => {
      const { data, error } = await supabase.from('rm_risk_assessments').insert({
        risk_id: riskId, review_date: d.reviewDate, current_probability: d.currentProbability, current_impact: d.currentImpact, residual_probability: d.residualProbability, residual_impact: d.residualImpact,
        trend: d.trend, reviewer_comment: d.reviewerComment, basis: d.basis, method: d.method, impact_dims: d.impactDims, probability_pct: d.probabilityPct, exposure_cost: d.exposureCost, kind: d.kind,
        related_action_ids: d.relatedActionIds, response_strategy: d.responseStrategy, created_by: me(),
      }).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ assessments: [...s.assessments, rmAssessmentFromRow(data)] }))
      // a new review answers a pending review request
      await supabase.from('rm_risks').update({ review_requested_at: null, review_request_reason: '', next_review_date: null }).eq('id', riskId)
      await refreshRisk(riskId); touchHistory(riskId)
      await logHistory(riskId, 'assessment_added', `ارزیابی ${d.reviewDate}: فعلی ${d.currentProbability * d.currentImpact} · باقیمانده ${d.residualProbability * d.residualImpact}`)
      return { ok: true, id: data.id }
    },
    approveAssessment: async (id) => {
      const { data, error } = await supabase.from('rm_risk_assessments').update({ approved_by: me(), approved_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ assessments: upsert(s.assessments, rmAssessmentFromRow(data)) }))
      return { ok: true }
    },

    addAction: async (riskId, d) => {
      const { data, error } = await supabase.from('rm_risk_actions').insert({ ...rmActionToRow(d), risk_id: riskId, created_by: me() }).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ actions: [...s.actions, rmActionFromRow(data)] }))
      return { ok: true, id: data.id }
    },
    updateAction: async (id, d) => {
      const { data, error } = await supabase.from('rm_risk_actions').update(rmActionToRow(d)).eq('id', id).select().single()
      if (error || !data) return fail(error)
      const a = rmActionFromRow(data)
      set((s) => ({ actions: upsert(s.actions, a) })); touchHistory(a.riskId)
      return { ok: true }
    },
    deleteAction: async (id) => {
      const { error } = await supabase.from('rm_risk_actions').delete().eq('id', id)
      if (error) return fail(error)
      set((s) => ({ actions: s.actions.filter((a) => a.id !== id && a.parentActionId !== id) }))
      return { ok: true }
    },

    addControl: async (riskId, d) => {
      const { data, error } = await supabase.from('rm_controls').insert({ ...rmControlToRow(d), risk_id: riskId, created_by: me() }).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ controls: [...s.controls, rmControlFromRow(data)] }))
      return { ok: true, id: data.id }
    },
    updateControl: async (id, d) => {
      const { data, error } = await supabase.from('rm_controls').update(rmControlToRow(d)).eq('id', id).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ controls: upsert(s.controls, rmControlFromRow(data)) }))
      return { ok: true }
    },
    deleteControl: async (id) => {
      const { error } = await supabase.from('rm_controls').delete().eq('id', id)
      if (error) return fail(error)
      set((s) => ({ controls: s.controls.filter((c) => c.id !== id) }))
      return { ok: true }
    },
    addContingency: async (riskId, d) => {
      const { data, error } = await supabase.from('rm_contingency_plans').insert({ risk_id: riskId, trigger_condition: d.triggerCondition, plan: d.plan, owner_id: d.ownerId, budget: d.budget, created_by: me() }).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ contingency: [...s.contingency, rmContingencyFromRow(data)] }))
      return { ok: true }
    },
    updateContingency: async (id, d) => {
      const row: any = {}
      if (d.status !== undefined) { row.status = d.status; if (d.status === 'activated') row.activated_at = new Date().toISOString() }
      if (d.plan !== undefined) row.plan = d.plan
      if (d.triggerCondition !== undefined) row.trigger_condition = d.triggerCondition
      if (d.ownerId !== undefined) row.owner_id = d.ownerId
      if (d.budget !== undefined) row.budget = d.budget
      const { data, error } = await supabase.from('rm_contingency_plans').update(row).eq('id', id).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ contingency: upsert(s.contingency, rmContingencyFromRow(data)) }))
      return { ok: true }
    },
    deleteContingency: async (id) => {
      const { error } = await supabase.from('rm_contingency_plans').delete().eq('id', id)
      if (error) return fail(error)
      set((s) => ({ contingency: s.contingency.filter((c) => c.id !== id) }))
      return { ok: true }
    },

    addKri: async (d) => {
      const { data, error } = await supabase.from('rm_kris').insert({
        project_id: d.projectId, risk_id: d.riskId, name: d.name, definition: d.definition, unit: d.unit, domain: d.domain, direction: d.direction, baseline: d.baseline, warn_threshold: d.warnThreshold,
        critical_threshold: d.criticalThreshold, frequency_days: d.frequencyDays, owner_id: d.ownerId, data_source: d.dataSource, external_system: d.externalSystem, external_key: d.externalKey, active: d.active, created_by: me(),
      }).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ kris: [...s.kris, rmKriFromRow(data)] }))
      return { ok: true, id: data.id }
    },
    updateKri: async (id, d) => {
      const m: Record<string, string> = { name: 'name', definition: 'definition', unit: 'unit', domain: 'domain', direction: 'direction', baseline: 'baseline', warnThreshold: 'warn_threshold', criticalThreshold: 'critical_threshold', frequencyDays: 'frequency_days', ownerId: 'owner_id', dataSource: 'data_source', externalSystem: 'external_system', externalKey: 'external_key', active: 'active', riskId: 'risk_id' }
      const row: any = {}
      for (const k of Object.keys(d)) if (m[k]) row[m[k]] = (d as any)[k]
      const { data, error } = await supabase.from('rm_kris').update(row).eq('id', id).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ kris: upsert(s.kris, rmKriFromRow(data)) }))
      return { ok: true }
    },
    deleteKri: async (id) => {
      const { error } = await supabase.from('rm_kris').delete().eq('id', id)
      if (error) return fail(error)
      set((s) => ({ kris: s.kris.filter((k) => k.id !== id), kriReadings: s.kriReadings.filter((r) => r.kriId !== id) }))
      return { ok: true }
    },
    recordReading: async (kriId, value, note, readAt) => {
      if (!Number.isFinite(value)) return { ok: false, error: 'مقدار عددی معتبر وارد کنید.' }
      const { data, error } = await supabase.from('rm_kri_readings').insert({ kri_id: kriId, value, note, read_at: readAt ?? new Date().toISOString(), source: 'manual', created_by: me() }).select().single()
      if (error || !data) return fail(error)
      const [k, ev] = await Promise.all([supabase.from('rm_kris').select('*').eq('id', kriId).single(), supabase.from('rm_kri_events').select('*').eq('kri_id', kriId).order('at', { ascending: false }).limit(50)])
      set((s) => ({
        kriReadings: [...s.kriReadings, rmKriReadingFromRow(data)], kris: k.data ? upsert(s.kris, rmKriFromRow(k.data)) : s.kris,
        kriEvents: [...(ev.data ?? []).map((x: any) => rmKriEventFromRow(x)), ...s.kriEvents.filter((e) => e.kriId !== kriId)],
      }))
      const kri = get().kris.find((x) => x.id === kriId)
      if (kri?.riskId) { await refreshRisk(kri.riskId); touchHistory(kri.riskId) }
      return { ok: true }
    },

    addLink: async (riskId, d) => {
      const { data, error } = await supabase.from('rm_risk_links').insert({ risk_id: riskId, target_type: d.targetType, target_id: d.targetId, target_label: d.targetLabel, relation: d.relation, created_by: me() }).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ links: [...s.links, rmLinkFromRow(data)] }))
      return { ok: true }
    },
    removeLink: async (id) => {
      const { error } = await supabase.from('rm_risk_links').delete().eq('id', id)
      if (error) return fail(error)
      set((s) => ({ links: s.links.filter((l) => l.id !== id) }))
      return { ok: true }
    },
    addEvidence: async (riskId, d) => {
      const { data, error } = await supabase.from('rm_risk_evidence').insert({ risk_id: riskId, kind: d.kind, title: d.title, note: d.note, url: d.url, created_by: me() }).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ evidenceByRisk: { ...s.evidenceByRisk, [riskId]: [rmEvidenceFromRow(data), ...(s.evidenceByRisk[riskId] ?? [])] } }))
      return { ok: true }
    },
    removeEvidence: async (id, riskId) => {
      const { error } = await supabase.from('rm_risk_evidence').delete().eq('id', id)
      if (error) return fail(error)
      set((s) => ({ evidenceByRisk: { ...s.evidenceByRisk, [riskId]: (s.evidenceByRisk[riskId] ?? []).filter((e) => e.id !== id) } }))
      return { ok: true }
    },
    addComment: async (riskId, text) => {
      if (!text.trim()) return { ok: false, error: 'متن نظر خالی است.' }
      const { error } = await logHistory(riskId, 'comment', text.trim())
      if (error) return fail(error)
      touchHistory(riskId); await get().loadRiskExtras(riskId)
      return { ok: true }
    },

    requestAcceptance: async (riskId, rationale, validUntil) => {
      const { error } = await supabase.rpc('rm_request_acceptance', { p_risk: riskId, p_rationale: rationale, p_valid_until: validUntil })
      if (error) return fail(error)
      const rows = await fetchAll('rm_acceptances', (q) => q.order('requested_at', { ascending: false }))
      set({ acceptances: rows.map(rmAcceptanceFromRow) }); touchHistory(riskId)
      return { ok: true }
    },
    decideAcceptance: async (id, approve, note) => {
      const { data, error } = await supabase.rpc('rm_decide_acceptance', { p_id: id, p_approve: approve, p_note: note })
      if (error) return fail(error)
      const a = rmAcceptanceFromRow(data as any)
      set((s) => ({ acceptances: upsert(s.acceptances, a) }))
      await refreshRisk(a.riskId); touchHistory(a.riskId)
      return { ok: true }
    },
    createCorporate: async (d) => {
      const { data, error } = await supabase.from('rm_corporate_risks').insert({ title: d.title, description: d.description, category: d.category, owner_id: d.ownerId, corrective_plan: d.correctivePlan, created_by: me() }).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ corporate: [...s.corporate, rmCorporateFromRow(data)] }))
      return { ok: true, id: data.id }
    },
    attachCorporate: async (riskId, corporateId) => get().updateRisk(riskId, { corporateRiskId: corporateId }),
    convertToIssue: async (riskId, cause, days, pursuerId) => {
      const { data, error } = await supabase.rpc('im_convert_risk_to_issue', { p_risk: riskId, p_cause: cause, p_pursuer: pursuerId, p_deadline_days: days })
      if (error) return fail(error)
      const { data: links } = await supabase.from('rm_risk_links').select('*').eq('risk_id', riskId)
      set((s) => ({ links: [...s.links.filter((l) => l.riskId !== riskId), ...((links ?? []) as any[]).map(rmLinkFromRow)] }))
      await refreshRisk(riskId); touchHistory(riskId)
      return { ok: true, id: (data as any)?.id }
    },

    scanMissions: async (projectId) => {
      const { data, error } = await supabase.rpc('rm_scan_mission_findings', { p_project: projectId })
      if (error) return { ok: false, error: friendly(error) }
      const rows = await fetchAll('rm_suggestions', (q) => q.order('created_at', { ascending: false }))
      set({ suggestions: rows.map(rmSuggestionFromRow) })
      const r = data as any
      if (r?.auto) await get().fetchAll()
      return { ok: true, queued: r?.queued ?? 0, auto: r?.auto ?? 0 }
    },
    acceptSuggestion: async (id) => {
      const { data, error } = await supabase.rpc('rm_accept_suggestion', { p_id: id })
      if (error) return fail(error)
      await get().fetchAll()
      return { ok: true, id: (data as any)?.id }
    },
    rejectSuggestion: async (id) => {
      const { data, error } = await supabase.from('rm_suggestions').update({ status: 'rejected', decided_by: me(), decided_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ suggestions: upsert(s.suggestions, rmSuggestionFromRow(data)) }))
      return { ok: true }
    },

    savePolicy: async (p) => {
      const row: any = {
        project_id: p.projectId, appetite_max: p.appetiteMax, tolerance_max: p.toleranceMax, escalation_min: p.escalationMin, level_bounds: p.levelBounds, review_days: p.reviewDays,
        stale_assessment_days: p.staleAssessmentDays, scale_labels: p.scaleLabels ?? {}, auto_accept_confidence: p.autoAcceptConfidence ?? null, updated_by: me(), updated_at: new Date().toISOString(),
      }
      const existing = get().policies.find((x) => x.projectId === p.projectId)
      const q = existing ? supabase.from('rm_policy').update(row).eq('id', existing.id) : supabase.from('rm_policy').insert(row)
      const { data, error } = await q.select().single()
      if (error || !data) return fail(error)
      set((s) => ({ policies: upsert(s.policies, rmPolicyFromRow(data)) }))
      return { ok: true }
    },
    saveCategory: async (c) => {
      const { data, error } = await supabase.from('rm_categories').upsert({ key: c.key, label_fa: c.labelFa, parent_key: c.parentKey, active: c.active, sort: c.sort ?? 500 }).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ categories: [...s.categories.filter((x) => x.key !== c.key), rmCategoryFromRow(data)].sort((a, b) => a.sort - b.sort) }))
      return { ok: true }
    },
    saveNotifRule: async (key, patch) => {
      const row: any = {}
      if (patch.recipients) row.recipients = patch.recipients
      if (patch.escalateTo) row.escalate_to = patch.escalateTo
      if (patch.channels) row.channels = patch.channels
      if (patch.thresholdHours !== undefined) row.threshold_hours = patch.thresholdHours
      if (patch.dedupeHours !== undefined) row.dedupe_hours = patch.dedupeHours
      if (patch.isActive !== undefined) row.is_active = patch.isActive
      const { data, error } = await supabase.from('im_notif_rules').update(row).eq('key', key).select().single()
      if (error || !data) return fail(error)
      set((s) => ({ notifRules: s.notifRules.map((r) => (r.key === key ? rmNotifRuleFromRow(data) : r)) }))
      return { ok: true }
    },
  }
})
