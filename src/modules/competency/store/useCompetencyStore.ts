import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import type { AssessmentStatus, CompetencyAssessment } from '../types'
import { compAssessmentFromRow, type CompAssessmentRow } from '../lib/competencyData'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

export interface CandidateProfileInput {
  candidateName: string
  candidatePosition: string
  yearsExperienceTotal: number | null
  yearsExperiencePipeline: number | null
  currentEmployer: string
  education: string
  certifications: string
  notableProjects: string
  interviewDate: string
}

interface CompetencyState {
  assessments: CompetencyAssessment[]
  loading: boolean

  fetchAll: () => Promise<void>
  createAssessment: (profile: CandidateProfileInput) => Promise<string | null>
  updateProfile: (id: string, profile: CandidateProfileInput) => Promise<void>
  setAnswer: (id: string, questionKey: string, score: number | null, note: string) => Promise<void>
  setStatus: (id: string, status: AssessmentStatus) => Promise<void>
  deleteAssessment: (id: string) => Promise<void>
}

export const useCompetencyStore = create<CompetencyState>()((set, get) => ({
  assessments: [],
  loading: true,

  fetchAll: async () => {
    set({ loading: true })
    const { data, error } = await supabase.from('comp_assessments').select('*').order('created_at', { ascending: false })
    if (reportError('بارگذاری ارزیابی‌ها', error)) {
      set({ loading: false })
      return
    }
    set({ assessments: ((data ?? []) as CompAssessmentRow[]).map(compAssessmentFromRow), loading: false })
  },

  createAssessment: async (profile) => {
    const { data, error } = await supabase
      .from('comp_assessments')
      .insert({
        candidate_name: profile.candidateName,
        candidate_position: profile.candidatePosition,
        years_experience_total: profile.yearsExperienceTotal,
        years_experience_pipeline: profile.yearsExperiencePipeline,
        current_employer: profile.currentEmployer,
        education: profile.education,
        certifications: profile.certifications,
        notable_projects: profile.notableProjects,
        interview_date: profile.interviewDate,
        status: 'draft',
        answers: {},
      })
      .select('*')
      .single()
    if (reportError('ثبت مشخصات نامزد', error) || !data) return null
    const created = compAssessmentFromRow(data as CompAssessmentRow)
    set({ assessments: [created, ...get().assessments] })
    return created.id
  },

  updateProfile: async (id, profile) => {
    const { data, error } = await supabase
      .from('comp_assessments')
      .update({
        candidate_name: profile.candidateName,
        candidate_position: profile.candidatePosition,
        years_experience_total: profile.yearsExperienceTotal,
        years_experience_pipeline: profile.yearsExperiencePipeline,
        current_employer: profile.currentEmployer,
        education: profile.education,
        certifications: profile.certifications,
        notable_projects: profile.notableProjects,
        interview_date: profile.interviewDate,
      })
      .eq('id', id)
      .select('*')
      .single()
    if (reportError('بروزرسانی مشخصات نامزد', error) || !data) return
    const updated = compAssessmentFromRow(data as CompAssessmentRow)
    set({ assessments: get().assessments.map((a) => (a.id === id ? updated : a)) })
  },

  setAnswer: async (id, questionKey, score, note) => {
    const current = get().assessments.find((a) => a.id === id)
    if (!current) return
    const nextAnswers = { ...current.answers, [questionKey]: { score, note } }
    // Optimistic local update so scoring feels instant during a live interview; reconciled below.
    set({ assessments: get().assessments.map((a) => (a.id === id ? { ...a, answers: nextAnswers } : a)) })
    const { error } = await supabase.from('comp_assessments').update({ answers: nextAnswers }).eq('id', id)
    if (reportError('ثبت امتیاز پاسخ', error)) {
      set({ assessments: get().assessments.map((a) => (a.id === id ? current : a)) })
    }
  },

  setStatus: async (id, status) => {
    const { data, error } = await supabase.from('comp_assessments').update({ status }).eq('id', id).select('*').single()
    if (reportError('بروزرسانی وضعیت ارزیابی', error) || !data) return
    const updated = compAssessmentFromRow(data as CompAssessmentRow)
    set({ assessments: get().assessments.map((a) => (a.id === id ? updated : a)) })
  },

  deleteAssessment: async (id) => {
    const previous = get().assessments
    set({ assessments: previous.filter((a) => a.id !== id) })
    const { error } = await supabase.from('comp_assessments').delete().eq('id', id)
    if (reportError('حذف ارزیابی', error)) set({ assessments: previous })
  },
}))
