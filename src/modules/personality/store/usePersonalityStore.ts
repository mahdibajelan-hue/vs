import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
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
  personalityQuestionFromRow,
  personalityQuestionMixToRowPayload,
  personalityResponseScaleFromRow,
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
  type PersonalityQuestionRow,
  type PersonalityResponseScaleRow,
  type PersonalityTraitRow,
  type PersonalityValidityResultRow,
} from '../lib/personalityData'
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
  PersonalityQuestion,
  PersonalityQuestionMixCell,
  PersonalityResponseScale,
  PersonalityTrait,
  PersonalityValidityResult,
} from '../types'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${error.message}`)
  return true
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

  fetchCatalog: () => Promise<void>
  fetchQuestionBank: () => Promise<void>
  proposeOrCreateQuestion: (input: PersonalityQuestionInput) => Promise<string | null>
  approveQuestion: (id: string) => Promise<void>
  rejectQuestion: (id: string, reason?: string) => Promise<void>

  fetchTemplates: () => Promise<void>
  upsertTemplate: (input: PersonalityAssessmentTemplateInput) => Promise<string | null>

  fetchAssessments: () => Promise<void>
  createAssessment: (assessmentId: string, jobRole: JobRole, frameworkId: string | null, jobProfileId: string | null) => Promise<string | null>
  generateFromMix: (personalityAssessmentId: string, jobRole: JobRole, mix: PersonalityQuestionMixCell[]) => Promise<void>

  fetchDimensionScores: (personalityAssessmentId: string) => Promise<void>
  fetchValidityResult: (personalityAssessmentId: string) => Promise<void>

  fetchAiAnalysis: (personalityAssessmentId: string) => Promise<void>
  generateAiAnalysis: (personalityAssessmentId: string) => Promise<{ error: string | null }>
}

export const usePersonalityStore = create<PersonalityStoreState>((set, get) => ({
  loading: false,

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
      options: input.options ?? [],
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
    const { data, error } = await supabase.from('personality_questions').insert(payload).select('id').single()
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
      .insert({ assessment_id: assessmentId, job_role: jobRole, framework_id: frameworkId, job_profile_id: jobProfileId, status: 'DRAFT' })
      .select('*')
      .single()
    if (reportError('ایجاد ارزیابی شخصیت', error)) return null
    const created = personalityAssessmentFromRow(data as PersonalityAssessmentRow)
    set({ assessments: [created, ...get().assessments] })
    return created.id
  },

  generateFromMix: async (personalityAssessmentId, jobRole, mix) => {
    let bank = get().questionBank.filter((q) => q.active && q.approvalStatus === 'APPROVED' && (q.jobRole == null || q.jobRole === jobRole))
    if (bank.length === 0) {
      const { data, error } = await supabase.from('personality_questions').select('*').eq('approval_status', 'APPROVED').eq('active', true)
      if (reportError('بارگذاری بانک سؤالات شخصیت', error)) return
      bank = ((data ?? []) as PersonalityQuestionRow[]).map(personalityQuestionFromRow).filter((q) => q.jobRole == null || q.jobRole === jobRole)
    }
    // Diversity-aware pick per (type, complexity) cell: shuffles, spreads across dimension/trait so
    // one construct never dominates a cell, and avoids picking near-duplicate question text.
    const usedTexts: string[] = []
    const selected = mix
      .filter((c) => c.count > 0)
      .flatMap((cell) => {
        const pool = bank.filter((q) => q.questionType === cell.questionType && q.complexity === cell.complexity)
        const shuffled = [...pool].sort(() => Math.random() - 0.5)
        const picked: PersonalityQuestion[] = []
        for (const q of shuffled) {
          if (picked.length >= cell.count) break
          const words = new Set(q.questionText.split(/\s+/))
          const tooSimilar = usedTexts.some((t) => {
            const tw = new Set(t.split(/\s+/))
            const overlap = [...words].filter((w) => tw.has(w)).length
            return overlap / Math.max(words.size, tw.size, 1) > 0.7
          })
          if (tooSimilar) continue
          picked.push(q)
          usedTexts.push(q.questionText)
        }
        // If diversity filtering left a cell short, top it up from the remaining pool rather than
        // silently under-filling the assessment.
        if (picked.length < cell.count) {
          for (const q of shuffled) {
            if (picked.length >= cell.count) break
            if (!picked.includes(q)) picked.push(q)
          }
        }
        return picked
      })
    const ids = selected.map((q) => q.id)
    const current = get().assessments.find((a) => a.id === personalityAssessmentId)
    if (!current) return
    set({ assessments: get().assessments.map((a) => (a.id === personalityAssessmentId ? { ...a, selectedQuestionIds: ids, status: 'GENERATED' } : a)) })
    const { error } = await supabase
      .from('personality_assessments')
      .update({ selected_question_ids: ids, status: 'GENERATED' })
      .eq('id', personalityAssessmentId)
    if (reportError('تولید آزمون شخصیت از روی طرح سؤال', error)) {
      set({ assessments: get().assessments.map((a) => (a.id === personalityAssessmentId ? current : a)) })
      return
    }
    if (ids.length > 0) {
      // Best-effort — a failure here only means the "previous usage" preference is slightly stale
      // next time, never a reason to roll back the assessment's actual question selection above.
      await supabase.rpc('personality_increment_question_usage', { p_ids: ids })
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
