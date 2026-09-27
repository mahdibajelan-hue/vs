import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../store/useAuthStore'
import { useSystemStore } from '../../../store/useSystemStore'
import {
  personalityAiAnalysisFromRow,
  personalityAssessmentFromRow,
  personalityAssessmentTemplateFromRow,
  personalityBehavioralDimensionFromRow,
  personalityDimensionScoreFromRow,
  personalityFacetFromRow,
  personalityFrameworkFromRow,
  personalityJobBehavioralProfileFromRow,
  personalityJobBehavioralRequirementFromRow,
  personalityModuleAdminFromRow,
  personalityProfileLiteFromRow,
  personalityQuestionFromRow,
  personalityQuestionMixToRowPayload,
  personalityQuestionOptionToRow,
  personalityResponseScaleFromRow,
  personalityRoleAssignmentFromRow,
  personalityTraitFromRow,
  personalityValidityResultFromRow,
  type PersonalityAiAnalysisRow,
  type PersonalityAssessmentRow,
  type PersonalityAssessmentTemplateRow,
  type PersonalityBehavioralDimensionRow,
  type PersonalityDimensionScoreRow,
  type PersonalityFacetRow,
  type PersonalityFrameworkRow,
  type PersonalityJobBehavioralProfileRow,
  type PersonalityJobBehavioralRequirementRow,
  type PersonalityModuleAdminRow,
  type PersonalityProfileLiteRow,
  type PersonalityQuestionRow,
  type PersonalityResponseScaleRow,
  type PersonalityRoleAssignmentRow,
  type PersonalityTraitRow,
  type PersonalityValidityResultRow,
} from '../lib/personalityData'
import { selectPersonalityQuestions, type PersonalityCoverageTargets } from '../lib/personalitySelection'
import type {
  JobRole,
  PersonalityAiAnalysis,
  PersonalityAssessment,
  PersonalityAssessmentTemplate,
  PersonalityBehavioralDimension,
  PersonalityDimensionScore,
  PersonalityFacet,
  PersonalityFramework,
  PersonalityJobBehavioralProfile,
  PersonalityJobBehavioralRequirement,
  PersonalityModuleAdmin,
  PersonalityProfileLite,
  PersonalityQuestion,
  PersonalityQuestionMixCell,
  PersonalityResponseScale,
  PersonalityRoleAssignment,
  PersonalityTrait,
  PersonalityValidityResult,
} from '../types'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${error.message}`)
  return true
}

function currentUserId(): string | null {
  return useAuthStore.getState().profile?.id ?? null
}

// Mirrors the personality_questions_insert RLS policy's own OR-conditions exactly, so a proposal
// that this check lets through as "privileged" never gets rejected by the database, and one it
// calls unprivileged always satisfies the policy's PENDING_REVIEW+inactive+own-row branch instead.
function isPrivilegedForQuestions(get: () => Pick<PersonalityStoreState, 'moduleAdmins' | 'assessmentDesigners'>): boolean {
  const profile = useAuthStore.getState().profile
  if (profile?.isAdmin) return true
  const uid = profile?.id
  if (!uid) return false
  return get().moduleAdmins.some((m) => m.userId === uid) || get().assessmentDesigners.some((m) => m.userId === uid)
}

export interface PersonalityQuestionInput {
  id?: string
  frameworkId?: string | null
  traitId?: string | null
  facetId?: string | null
  dimensionId?: string | null
  questionType: PersonalityQuestion['questionType']
  questionText: string
  scenarioContext?: string
  scaleId?: string | null
  options?: PersonalityQuestion['options']
  reverseScored?: boolean
  jobRole?: JobRole | null
  complexity?: PersonalityQuestion['complexity']
  weight?: number
  proposalReason?: string
}

export interface PersonalityAssessmentTemplateInput {
  id?: string
  jobRole: JobRole
  title: string
  frameworkId?: string | null
  jobProfileId?: string | null
  questionMix: PersonalityQuestionMixCell[]
  durationMinutes: number | null
}

interface PersonalityStoreState {
  loading: boolean

  profiles: PersonalityProfileLite[]
  moduleAdmins: PersonalityModuleAdmin[]
  assessmentDesigners: PersonalityRoleAssignment[]
  reportViewers: PersonalityRoleAssignment[]

  frameworks: PersonalityFramework[]
  traits: PersonalityTrait[]
  facets: PersonalityFacet[]
  dimensions: PersonalityBehavioralDimension[]
  jobProfiles: PersonalityJobBehavioralProfile[]
  jobRequirements: PersonalityJobBehavioralRequirement[]
  scales: PersonalityResponseScale[]
  questionBank: PersonalityQuestion[]
  templates: PersonalityAssessmentTemplate[]
  assessments: PersonalityAssessment[]
  dimensionScores: PersonalityDimensionScore[]
  validityResults: PersonalityValidityResult[]
  aiAnalysisByAssessment: Record<string, PersonalityAiAnalysis | undefined>

  fetchProfiles: () => Promise<void>

  fetchModuleAdmins: () => Promise<void>
  addModuleAdmin: (userId: string) => Promise<void>
  removeModuleAdmin: (userId: string) => Promise<void>

  /** PERSONALITY_ASSESSMENT_DESIGNER / PERSONALITY_REPORT_VIEWER — module-scoped RBAC roles, backed
   * by the shared rasta_user_roles framework via the personality_grant_role/personality_revoke_role/
   * personality_list_role_assignments RPCs (see schema.sql) so a module-only admin can manage them
   * without needing the sitewide admin flag. */
  fetchAssessmentDesigners: () => Promise<void>
  addAssessmentDesigner: (userId: string) => Promise<void>
  removeAssessmentDesigner: (userId: string) => Promise<void>
  fetchReportViewers: () => Promise<void>
  addReportViewer: (userId: string) => Promise<void>
  removeReportViewer: (userId: string) => Promise<void>

  fetchCatalog: () => Promise<void>
  fetchQuestionBank: () => Promise<void>
  proposeOrCreateQuestion: (input: PersonalityQuestionInput) => Promise<string | null>
  approveQuestion: (id: string) => Promise<void>
  rejectQuestion: (id: string, reason?: string) => Promise<void>

  fetchTemplates: () => Promise<void>
  upsertTemplate: (input: PersonalityAssessmentTemplateInput) => Promise<string | null>

  fetchAssessments: () => Promise<void>
  createAssessment: (assessmentId: string, jobRole: JobRole, frameworkId: string | null, jobProfileId: string | null) => Promise<string | null>
  /** Picks the test's questions from a mix and saves them through personality_set_test_questions
   * (schema.sql Section 53, M-9). Once the candidate answered or the test was scored the server
   * refuses ('responses_exist') unless `discardExisting` — then the old responses/scores are archived
   * in the audit log and cleared atomically. Always refused when the competency assessment is
   * completed or the test is LOCKED/ARCHIVED. */
  generateFromMix: (
    personalityAssessmentId: string,
    jobRole: JobRole,
    mix: PersonalityQuestionMixCell[],
    discardExisting?: boolean,
  ) => Promise<'ok' | 'responses_exist' | 'error'>

  /** The behavioral dimensions/traits a test for this role must cover: the role's active behavioral
   * profile requirements plus the personality evidence sources of its competency model. */
  loadCoverageTargets: (jobRole: JobRole) => Promise<PersonalityCoverageTargets>

  fetchDimensionScores: (personalityAssessmentId: string) => Promise<void>
  fetchValidityResult: (personalityAssessmentId: string) => Promise<void>
  /** Bulk-loads every assessment's dimension scores + validity result in two queries (mirroring how
   * useCompetencyStore.fetchAll pulls all comp_panelist_scores unfiltered) — used only by
   * PersonalityReportsPage, which needs every assessment's scores at once for aggregate stats
   * rather than the one-assessment-at-a-time fetches above that the results page uses. */
  fetchAllScoresForReports: () => Promise<void>

  fetchAiAnalysis: (personalityAssessmentId: string) => Promise<void>
  generateAiAnalysis: (personalityAssessmentId: string) => Promise<{ error: string | null }>
}

export const usePersonalityStore = create<PersonalityStoreState>((set, get) => ({
  loading: false,

  profiles: [],
  moduleAdmins: [],
  assessmentDesigners: [],
  reportViewers: [],

  frameworks: [],
  traits: [],
  facets: [],
  dimensions: [],
  jobProfiles: [],
  jobRequirements: [],
  scales: [],
  questionBank: [],
  templates: [],
  assessments: [],
  dimensionScores: [],
  validityResults: [],
  aiAnalysisByAssessment: {},

  fetchProfiles: async () => {
    const { data, error } = await supabase.from('profiles').select('id, email, full_name').order('email')
    if (reportError('بارگذاری فهرست کاربران', error)) return
    set({ profiles: ((data ?? []) as PersonalityProfileLiteRow[]).map(personalityProfileLiteFromRow) })
  },

  fetchModuleAdmins: async () => {
    const { data, error } = await supabase.from('personality_module_admins').select('*')
    if (reportError('بارگذاری فهرست ادمین‌های ماژول', error)) return
    set({ moduleAdmins: ((data ?? []) as PersonalityModuleAdminRow[]).map(personalityModuleAdminFromRow) })
  },

  addModuleAdmin: async (userId) => {
    const { error } = await supabase.from('personality_module_admins').insert({ user_id: userId })
    if (reportError('افزودن ادمین ماژول', error)) return
    await get().fetchModuleAdmins()
  },

  removeModuleAdmin: async (userId) => {
    const previous = get().moduleAdmins
    set({ moduleAdmins: previous.filter((m) => m.userId !== userId) })
    const { error } = await supabase.from('personality_module_admins').delete().eq('user_id', userId)
    if (reportError('حذف ادمین ماژول', error)) set({ moduleAdmins: previous })
  },

  fetchAssessmentDesigners: async () => {
    const { data, error } = await supabase.rpc('personality_list_role_assignments', { p_role_name: 'PERSONALITY_ASSESSMENT_DESIGNER' })
    if (reportError('بارگذاری فهرست طراحان آزمون', error)) return
    set({ assessmentDesigners: ((data ?? []) as PersonalityRoleAssignmentRow[]).map(personalityRoleAssignmentFromRow) })
  },

  addAssessmentDesigner: async (userId) => {
    const { error } = await supabase.rpc('personality_grant_role', { p_user_id: userId, p_role_name: 'PERSONALITY_ASSESSMENT_DESIGNER' })
    if (reportError('افزودن طراح آزمون', error)) return
    await get().fetchAssessmentDesigners()
  },

  removeAssessmentDesigner: async (userId) => {
    const previous = get().assessmentDesigners
    set({ assessmentDesigners: previous.filter((m) => m.userId !== userId) })
    const { error } = await supabase.rpc('personality_revoke_role', { p_user_id: userId, p_role_name: 'PERSONALITY_ASSESSMENT_DESIGNER' })
    if (reportError('حذف طراح آزمون', error)) set({ assessmentDesigners: previous })
  },

  fetchReportViewers: async () => {
    const { data, error } = await supabase.rpc('personality_list_role_assignments', { p_role_name: 'PERSONALITY_REPORT_VIEWER' })
    if (reportError('بارگذاری فهرست بینندگان گزارش', error)) return
    set({ reportViewers: ((data ?? []) as PersonalityRoleAssignmentRow[]).map(personalityRoleAssignmentFromRow) })
  },

  addReportViewer: async (userId) => {
    const { error } = await supabase.rpc('personality_grant_role', { p_user_id: userId, p_role_name: 'PERSONALITY_REPORT_VIEWER' })
    if (reportError('افزودن بیننده گزارش', error)) return
    await get().fetchReportViewers()
  },

  removeReportViewer: async (userId) => {
    const previous = get().reportViewers
    set({ reportViewers: previous.filter((m) => m.userId !== userId) })
    const { error } = await supabase.rpc('personality_revoke_role', { p_user_id: userId, p_role_name: 'PERSONALITY_REPORT_VIEWER' })
    if (reportError('حذف بیننده گزارش', error)) set({ reportViewers: previous })
  },

  fetchCatalog: async () => {
    set({ loading: true })
    const [fw, tr, fa, dim, jp, jr, sc] = await Promise.all([
      supabase.from('personality_frameworks').select('*').order('key'),
      supabase.from('personality_traits').select('*').order('display_order'),
      supabase.from('personality_facets').select('*').order('display_order'),
      supabase.from('personality_behavioral_dimensions').select('*').order('key'),
      supabase.from('personality_job_behavioral_profiles').select('*').eq('active', true).order('job_role'),
      supabase.from('personality_job_behavioral_requirements').select('*'),
      supabase.from('personality_response_scales').select('*').order('key'),
    ])
    set({ loading: false })
    if (reportError('بارگذاری چارچوب ارزیابی شخصیت', fw.error)) return
    if (reportError('بارگذاری ویژگی‌ها', tr.error)) return
    if (reportError('بارگذاری زیرمؤلفه‌ها', fa.error)) return
    if (reportError('بارگذاری ابعاد رفتاری', dim.error)) return
    if (reportError('بارگذاری نیم‌رخ‌های شغلی', jp.error)) return
    if (reportError('بارگذاری الزامات نیم‌رخ شغلی', jr.error)) return
    if (reportError('بارگذاری مقیاس‌های پاسخ', sc.error)) return
    set({
      frameworks: ((fw.data ?? []) as PersonalityFrameworkRow[]).map(personalityFrameworkFromRow),
      traits: ((tr.data ?? []) as PersonalityTraitRow[]).map(personalityTraitFromRow),
      facets: ((fa.data ?? []) as PersonalityFacetRow[]).map(personalityFacetFromRow),
      dimensions: ((dim.data ?? []) as PersonalityBehavioralDimensionRow[]).map(personalityBehavioralDimensionFromRow),
      jobProfiles: ((jp.data ?? []) as PersonalityJobBehavioralProfileRow[]).map(personalityJobBehavioralProfileFromRow),
      jobRequirements: ((jr.data ?? []) as PersonalityJobBehavioralRequirementRow[]).map(personalityJobBehavioralRequirementFromRow),
      scales: ((sc.data ?? []) as PersonalityResponseScaleRow[]).map(personalityResponseScaleFromRow),
    })
  },

  fetchQuestionBank: async () => {
    const { data, error } = await supabase.from('personality_questions').select('*').order('created_at', { ascending: false })
    if (reportError('بارگذاری بانک سؤالات شخصیت', error)) return
    set({ questionBank: ((data ?? []) as PersonalityQuestionRow[]).map(personalityQuestionFromRow) })
  },

  proposeOrCreateQuestion: async (input) => {
    const payload = {
      framework_id: input.frameworkId ?? null,
      trait_id: input.traitId ?? null,
      facet_id: input.facetId ?? null,
      dimension_id: input.dimensionId ?? null,
      question_type: input.questionType,
      question_text: input.questionText,
      scenario_context: input.scenarioContext ?? '',
      scale_id: input.scaleId ?? null,
      // Stored snake_case (key/label_fa/dimension_key/score) — the scoring engine and the
      // trg_personality_questions_validate trigger only understand that shape.
      options: (input.options ?? []).map(personalityQuestionOptionToRow),
      reverse_scored: input.reverseScored ?? false,
      job_role: input.jobRole ?? null,
      complexity: input.complexity ?? 'L1',
      weight: input.weight ?? 1,
    }
    if (input.id) {
      const { error } = await supabase.from('personality_questions').update(payload).eq('id', input.id)
      if (reportError('ذخیره سؤال', error)) return null
      await get().fetchQuestionBank()
      return input.id
    }
    // A module admin/assessment designer's own question lands pre-approved and live immediately;
    // anyone else's lands as an inactive PENDING_REVIEW proposal — matches the personality_questions
    // insert RLS policy exactly (see schema.sql), which would otherwise reject either mismatch.
    const privileged = isPrivilegedForQuestions(get)
    const insertPayload = {
      ...payload,
      created_by: currentUserId(),
      approval_status: privileged ? 'APPROVED' : 'PENDING_REVIEW',
      active: privileged,
    }
    const { data, error } = await supabase.from('personality_questions').insert(insertPayload).select('id').single()
    if (reportError('ثبت سؤال', error)) return null
    await get().fetchQuestionBank()
    return (data as { id: string } | null)?.id ?? null
  },

  approveQuestion: async (id) => {
    const { error } = await supabase.from('personality_questions').update({ approval_status: 'APPROVED', active: true }).eq('id', id)
    if (reportError('تأیید سؤال', error)) return
    await get().fetchQuestionBank()
  },

  rejectQuestion: async (id) => {
    const { error } = await supabase.from('personality_questions').update({ approval_status: 'REJECTED', active: false }).eq('id', id)
    if (reportError('رد سؤال', error)) return
    await get().fetchQuestionBank()
  },

  fetchTemplates: async () => {
    const { data, error } = await supabase.from('personality_assessment_templates').select('*').order('job_role')
    if (reportError('بارگذاری طرح‌های آزمون شخصیت', error)) return
    set({ templates: ((data ?? []) as PersonalityAssessmentTemplateRow[]).map(personalityAssessmentTemplateFromRow) })
  },

  upsertTemplate: async (input) => {
    const payload = {
      job_role: input.jobRole,
      title: input.title,
      framework_id: input.frameworkId ?? null,
      job_profile_id: input.jobProfileId ?? null,
      question_mix: personalityQuestionMixToRowPayload(input.questionMix),
      duration_minutes: input.durationMinutes,
    }
    if (input.id) {
      const { error } = await supabase.from('personality_assessment_templates').update(payload).eq('id', input.id)
      if (reportError('ذخیره طرح آزمون', error)) return null
      await get().fetchTemplates()
      return input.id
    }
    const { data, error } = await supabase.from('personality_assessment_templates').insert(payload).select('id').single()
    if (reportError('ثبت طرح آزمون', error)) return null
    await get().fetchTemplates()
    return (data as { id: string } | null)?.id ?? null
  },

  fetchAssessments: async () => {
    const { data, error } = await supabase.from('personality_assessments').select('*').order('created_at', { ascending: false })
    if (reportError('بارگذاری ارزیابی‌های شخصیت', error)) return
    set({ assessments: ((data ?? []) as PersonalityAssessmentRow[]).map(personalityAssessmentFromRow) })
  },

  createAssessment: async (assessmentId, jobRole, frameworkId, jobProfileId) => {
    const { data, error } = await supabase
      .from('personality_assessments')
      // created_by is also forced to the caller server-side (trg_personality_assessments_creator, L-2).
      .insert({ assessment_id: assessmentId, job_role: jobRole, framework_id: frameworkId, job_profile_id: jobProfileId, status: 'DRAFT', created_by: currentUserId() })
      .select('*')
      .single()
    if (reportError('ایجاد ارزیابی شخصیت', error)) return null
    const created = personalityAssessmentFromRow(data as PersonalityAssessmentRow)
    set({ assessments: [created, ...get().assessments] })
    return created.id
  },

  generateFromMix: async (personalityAssessmentId, jobRole, mix, discardExisting = false) => {
    let bank = get().questionBank.filter((q) => q.active && q.approvalStatus === 'APPROVED' && (q.jobRole == null || q.jobRole === jobRole))
    if (bank.length === 0) {
      const { data, error } = await supabase.from('personality_questions').select('*').eq('approval_status', 'APPROVED').eq('active', true)
      if (reportError('بارگذاری بانک سؤالات شخصیت', error)) return 'error'
      bank = ((data ?? []) as PersonalityQuestionRow[]).map(personalityQuestionFromRow).filter((q) => q.jobRole == null || q.jobRole === jobRole)
    }
    // Dimension-aware selection (N-5): every behavioral dimension the job's behavioral profile or its
    // competency model reads gets a minimum number of items, then a few reverse-keyed pairs for the
    // consistency index, then the diversity-aware random fill, plus the validity-scale items (N-3).
    const targets = await get().loadCoverageTargets(jobRole)
    const { ids } = selectPersonalityQuestions(bank, mix, targets)
    // One atomic server call: validates the ids, refuses silently orphaning existing responses
    // unless discardExisting (then archives + clears them), resets the status to GENERATED and bumps
    // usage_count itself.
    const { error } = await supabase.rpc('personality_set_test_questions', {
      p_personality_assessment_id: personalityAssessmentId,
      p_question_ids: ids,
      p_discard_existing: discardExisting,
    })
    if (error) {
      if (/responses_exist/.test(error.message)) return 'responses_exist'
      reportError('تولید آزمون شخصیت از روی طرح سؤال', error)
      return 'error'
    }
    await get().fetchAssessments()
    if (discardExisting) {
      set({
        dimensionScores: get().dimensionScores.filter((s) => s.personalityAssessmentId !== personalityAssessmentId),
        validityResults: get().validityResults.filter((v) => v.personalityAssessmentId !== personalityAssessmentId),
      })
    }
    return 'ok'
  },

  loadCoverageTargets: async (jobRole) => {
    if (get().dimensions.length === 0 || get().jobProfiles.length === 0) await get().fetchCatalog()
    const { dimensions, jobProfiles, jobRequirements, traits } = get()
    const profile = jobProfiles.filter((p) => p.active && p.jobRole === jobRole).sort((a, b) => b.version - a.version)[0]
    const reqs = profile ? jobRequirements.filter((r) => r.profileId === profile.id) : []
    const priority = new Map<string, number>()
    for (const r of reqs) priority.set(r.dimensionId, (r.isCritical ? 1000 : 0) + r.weight)

    // Competency evidence sources for the role — best effort: without them the profile still applies.
    const sjtKeys = new Set<string>()
    const traitIds = new Set<string>()
    const { data: reqRows, error: reqErr } = await supabase.from('comp_job_competency_requirements').select('competency_id').eq('job_role', jobRole)
    const competencyIds = ((reqRows ?? []) as { competency_id: string }[]).map((r) => r.competency_id)
    if (!reqErr && competencyIds.length > 0) {
      const { data: srcRows } = await supabase
        .from('comp_competency_evidence_sources')
        .select('source_type, source_ref, weight')
        .in('competency_id', competencyIds)
        .in('source_type', ['PERSONALITY_DIMENSION', 'PERSONALITY_TRAIT', 'SJT'])
      for (const src of (srcRows ?? []) as { source_type: string; source_ref: string; weight: number }[]) {
        if (src.source_type === 'PERSONALITY_TRAIT') {
          const trait = traits.find((t) => t.key === src.source_ref)
          if (trait) traitIds.add(trait.id)
          continue
        }
        const dim = dimensions.find((d) => d.key === src.source_ref)
        if (!dim) continue
        if (src.source_type === 'SJT') sjtKeys.add(dim.key)
        else priority.set(dim.id, Math.max(priority.get(dim.id) ?? 0, 0) + Number(src.weight ?? 1))
      }
    }
    const ordered = [...priority.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => dimensions.find((d) => d.id === id))
    return {
      dimensions: ordered.filter((d): d is PersonalityBehavioralDimension => d != null).map((d) => ({ id: d.id, key: d.key })),
      sjtDimensionKeys: [...sjtKeys],
      traitIds: [...traitIds],
    }
  },

  fetchDimensionScores: async (personalityAssessmentId) => {
    const { data, error } = await supabase.from('personality_dimension_scores').select('*').eq('personality_assessment_id', personalityAssessmentId)
    if (reportError('بارگذاری امتیازهای ابعاد', error)) return
    const rows = ((data ?? []) as PersonalityDimensionScoreRow[]).map(personalityDimensionScoreFromRow)
    set({ dimensionScores: [...get().dimensionScores.filter((s) => s.personalityAssessmentId !== personalityAssessmentId), ...rows] })
  },

  fetchValidityResult: async (personalityAssessmentId) => {
    const { data, error } = await supabase.from('personality_validity_results').select('*').eq('personality_assessment_id', personalityAssessmentId).maybeSingle()
    if (reportError('بارگذاری نتیجه اعتبارسنجی پاسخ', error)) return
    if (!data) return
    const row = personalityValidityResultFromRow(data as PersonalityValidityResultRow)
    set({ validityResults: [...get().validityResults.filter((v) => v.personalityAssessmentId !== personalityAssessmentId), row] })
  },

  fetchAllScoresForReports: async () => {
    const [dsRes, vrRes] = await Promise.all([
      supabase.from('personality_dimension_scores').select('*'),
      supabase.from('personality_validity_results').select('*'),
    ])
    if (reportError('بارگذاری امتیازهای ابعاد', dsRes.error)) return
    if (reportError('بارگذاری نتایج اعتبارسنجی', vrRes.error)) return
    set({
      dimensionScores: ((dsRes.data ?? []) as PersonalityDimensionScoreRow[]).map(personalityDimensionScoreFromRow),
      validityResults: ((vrRes.data ?? []) as PersonalityValidityResultRow[]).map(personalityValidityResultFromRow),
    })
  },

  fetchAiAnalysis: async (personalityAssessmentId) => {
    const { data, error } = await supabase
      .from('personality_ai_analysis')
      .select('*')
      .eq('personality_assessment_id', personalityAssessmentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (reportError('بارگذاری تحلیل هوشمند', error)) return
    if (!data) return
    set({ aiAnalysisByAssessment: { ...get().aiAnalysisByAssessment, [personalityAssessmentId]: personalityAiAnalysisFromRow(data as PersonalityAiAnalysisRow) } })
  },

  generateAiAnalysis: async (personalityAssessmentId) => {
    const { data, error } = await supabase.functions.invoke('personality-gemini-analysis', { body: { personalityAssessmentId } })
    let functionError = (data as { error?: string } | null)?.error
    if (!functionError && error && typeof (error as { context?: Response }).context?.json === 'function') {
      try {
        const body = await (error as { context: Response }).context.json()
        functionError = body?.error
      } catch {
        // response body wasn't JSON — fall through to the generic message below
      }
    }
    if (error || functionError) {
      const message = functionError || error?.message || 'خطای ناشناخته'
      useSystemStore.getState().setStorageError(`خطا در تحلیل هوشمند شخصیت: ${message}`)
      return { error: message }
    }
    const analysis = (data as { analysis?: PersonalityAiAnalysisRow } | null)?.analysis
    if (analysis) {
      set({ aiAnalysisByAssessment: { ...get().aiAnalysisByAssessment, [personalityAssessmentId]: personalityAiAnalysisFromRow(analysis) } })
    }
    return { error: null }
  },
}))
