import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import { useAuthStore } from '../../../store/useAuthStore'
import type {
  AssessmentStatus,
  AttachmentKind,
  CertificationEntry,
  CompAttachment,
  CompetencyAssessment,
  CompPanelist,
  CompPanelistScore,
  CompProfileLite,
  EducationEntry,
  EmploymentEntry,
} from '../types'
import {
  compAssessmentFromRow,
  compAttachmentFromRow,
  compPanelistFromRow,
  compPanelistScoreFromRow,
  profileLiteFromRow,
  type CompAssessmentRow,
  type CompAttachmentRow,
  type CompPanelistRow,
  type CompPanelistScoreRow,
  type ProfileLiteRow,
} from '../lib/competencyData'
import { uploadCompDoc } from '../lib/compStorage'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

function currentUserId(): string | null {
  return useAuthStore.getState().profile?.id ?? null
}

export interface CandidateProfileInput {
  candidateName: string
  candidatePosition: string
  candidateNationalId: string
  candidatePhone: string
  candidateEmail: string
  yearsExperienceTotal: number | null
  yearsExperiencePipeline: number | null
  currentEmployer: string
  education: EducationEntry[]
  employmentHistory: EmploymentEntry[]
  certifications: CertificationEntry[]
  notableProjects: string
  interviewDate: string
}

export interface QualificationScoresInput {
  educationScore: number | null
  experienceScore: number | null
  pmTrainingScore: number | null
  pmCertificationScore: number | null
}

function profileToRowPayload(profile: CandidateProfileInput) {
  return {
    candidate_name: profile.candidateName,
    candidate_position: profile.candidatePosition,
    candidate_national_id: profile.candidateNationalId,
    candidate_phone: profile.candidatePhone,
    candidate_email: profile.candidateEmail,
    years_experience_total: profile.yearsExperienceTotal,
    years_experience_pipeline: profile.yearsExperiencePipeline,
    current_employer: profile.currentEmployer,
    education: profile.education,
    employment_history: profile.employmentHistory,
    certifications: profile.certifications,
    notable_projects: profile.notableProjects,
    interview_date: profile.interviewDate,
  }
}

interface CompetencyState {
  assessments: CompetencyAssessment[]
  profiles: CompProfileLite[]
  panelists: CompPanelist[]
  panelistScores: CompPanelistScore[]
  attachments: CompAttachment[]
  loading: boolean

  fetchAll: () => Promise<void>
  fetchProfiles: () => Promise<void>
  createAssessment: (profile: CandidateProfileInput) => Promise<string | null>
  updateProfile: (id: string, profile: CandidateProfileInput) => Promise<void>
  setAnswer: (id: string, questionKey: string, score: number | null, note: string) => Promise<void>
  setCapstone: (id: string, score: number | null, note: string) => Promise<void>
  setQualificationScores: (id: string, scores: QualificationScoresInput) => Promise<void>
  setStatus: (id: string, status: AssessmentStatus) => Promise<void>
  deleteAssessment: (id: string) => Promise<void>
  uploadPhoto: (id: string, file: File) => Promise<void>
  regenerateSelfServiceLink: (id: string) => Promise<void>
  markSelfServiceSent: (id: string) => Promise<void>
  markReviewed: (id: string) => Promise<void>

  fetchPanelists: (assessmentId: string) => Promise<void>
  addPanelist: (assessmentId: string, userId: string, isLead: boolean) => Promise<void>
  removePanelist: (id: string) => Promise<void>

  fetchPanelistScores: (assessmentId: string) => Promise<void>
  setMyPanelistAnswer: (assessmentId: string, questionKey: string, score: number | null, note: string) => Promise<void>
  setMyPanelistCapstone: (assessmentId: string, score: number | null, note: string) => Promise<void>
  submitMyPanelistScore: (assessmentId: string) => Promise<void>

  fetchAttachments: (assessmentId: string) => Promise<void>
  addAttachment: (assessmentId: string, kind: AttachmentKind, file: File) => Promise<void>
  deleteAttachment: (id: string) => Promise<void>
}

export const useCompetencyStore = create<CompetencyState>()((set, get) => ({
  assessments: [],
  profiles: [],
  panelists: [],
  panelistScores: [],
  attachments: [],
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

  fetchProfiles: async () => {
    const { data, error } = await supabase.from('profiles').select('id, email, full_name').order('email')
    if (reportError('بارگذاری فهرست کاربران', error)) return
    set({ profiles: ((data ?? []) as ProfileLiteRow[]).map(profileLiteFromRow) })
  },

  createAssessment: async (profile) => {
    const { data, error } = await supabase
      .from('comp_assessments')
      .insert({ ...profileToRowPayload(profile), status: 'draft', answers: {} })
      .select('*')
      .single()
    if (reportError('ثبت مشخصات نامزد', error) || !data) return null
    const created = compAssessmentFromRow(data as CompAssessmentRow)
    set({ assessments: [created, ...get().assessments] })
    return created.id
  },

  updateProfile: async (id, profile) => {
    const { data, error } = await supabase.from('comp_assessments').update(profileToRowPayload(profile)).eq('id', id).select('*').single()
    if (reportError('بروزرسانی مشخصات نامزد', error) || !data) return
    const updated = compAssessmentFromRow(data as CompAssessmentRow)
    set({ assessments: get().assessments.map((a) => (a.id === id ? updated : a)) })
  },

  setAnswer: async (id, questionKey, score, note) => {
    const current = get().assessments.find((a) => a.id === id)
    if (!current) return
    const nextAnswers = { ...current.answers, [questionKey]: { score, note } }
    set({ assessments: get().assessments.map((a) => (a.id === id ? { ...a, answers: nextAnswers } : a)) })
    const { error } = await supabase.from('comp_assessments').update({ answers: nextAnswers }).eq('id', id)
    if (reportError('ثبت امتیاز پاسخ', error)) {
      set({ assessments: get().assessments.map((a) => (a.id === id ? current : a)) })
    }
  },

  setCapstone: async (id, score, note) => {
    const current = get().assessments.find((a) => a.id === id)
    if (!current) return
    set({ assessments: get().assessments.map((a) => (a.id === id ? { ...a, capstoneScore: score, capstoneNote: note } : a)) })
    const { error } = await supabase.from('comp_assessments').update({ capstone_score: score, capstone_note: note }).eq('id', id)
    if (reportError('ثبت امتیاز سناریوی پایانی', error)) {
      set({ assessments: get().assessments.map((a) => (a.id === id ? current : a)) })
    }
  },

  setQualificationScores: async (id, scores) => {
    const { data, error } = await supabase
      .from('comp_assessments')
      .update({
        education_score: scores.educationScore,
        experience_score: scores.experienceScore,
        pm_training_score: scores.pmTrainingScore,
        pm_certification_score: scores.pmCertificationScore,
      })
      .eq('id', id)
      .select('*')
      .single()
    if (reportError('ثبت امتیاز شایستگی رزومه‌ای', error) || !data) return
    const updated = compAssessmentFromRow(data as CompAssessmentRow)
    set({ assessments: get().assessments.map((a) => (a.id === id ? updated : a)) })
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

  uploadPhoto: async (id, file) => {
    const { path, error: uploadErr } = await uploadCompDoc(file, id)
    if (uploadErr || !path) {
      reportError('بارگذاری عکس پرسنلی', { message: uploadErr ?? 'خطای نامشخص' })
      return
    }
    const { data, error } = await supabase.from('comp_assessments').update({ photo_url: path }).eq('id', id).select('*').single()
    if (reportError('ثبت عکس پرسنلی', error) || !data) return
    const updated = compAssessmentFromRow(data as CompAssessmentRow)
    set({ assessments: get().assessments.map((a) => (a.id === id ? updated : a)) })
  },

  regenerateSelfServiceLink: async (id) => {
    const { data, error } = await supabase
      .from('comp_assessments')
      .update({ self_service_token: crypto.randomUUID(), self_service_status: 'not_sent' })
      .eq('id', id)
      .select('*')
      .single()
    if (reportError('صدور لینک جدید', error) || !data) return
    const updated = compAssessmentFromRow(data as CompAssessmentRow)
    set({ assessments: get().assessments.map((a) => (a.id === id ? updated : a)) })
  },

  markSelfServiceSent: async (id) => {
    const { data, error } = await supabase.from('comp_assessments').update({ self_service_status: 'pending' }).eq('id', id).select('*').single()
    if (reportError('ثبت وضعیت ارسال لینک', error) || !data) return
    const updated = compAssessmentFromRow(data as CompAssessmentRow)
    set({ assessments: get().assessments.map((a) => (a.id === id ? updated : a)) })
  },

  markReviewed: async (id) => {
    const { data, error } = await supabase
      .from('comp_assessments')
      .update({ self_service_status: 'reviewed', reviewed_by: currentUserId(), reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single()
    if (reportError('ثبت بررسی مدارک', error) || !data) return
    const updated = compAssessmentFromRow(data as CompAssessmentRow)
    set({ assessments: get().assessments.map((a) => (a.id === id ? updated : a)) })
  },

  fetchPanelists: async (assessmentId) => {
    const { data, error } = await supabase.from('comp_panelists').select('*').eq('assessment_id', assessmentId)
    if (reportError('بارگذاری فهرست داوران', error)) return
    const fetched = ((data ?? []) as CompPanelistRow[]).map(compPanelistFromRow)
    set({ panelists: [...get().panelists.filter((p) => p.assessmentId !== assessmentId), ...fetched] })
  },

  addPanelist: async (assessmentId, userId, isLead) => {
    const { data, error } = await supabase.from('comp_panelists').insert({ assessment_id: assessmentId, user_id: userId, is_lead: isLead }).select('*').single()
    if (reportError('افزودن داور', error) || !data) return
    set({ panelists: [...get().panelists, compPanelistFromRow(data as CompPanelistRow)] })
  },

  removePanelist: async (id) => {
    const previous = get().panelists
    set({ panelists: previous.filter((p) => p.id !== id) })
    const { error } = await supabase.from('comp_panelists').delete().eq('id', id)
    if (reportError('حذف داور', error)) set({ panelists: previous })
  },

  fetchPanelistScores: async (assessmentId) => {
    const { data, error } = await supabase.from('comp_panelist_scores').select('*').eq('assessment_id', assessmentId)
    if (reportError('بارگذاری امتیازهای داوران', error)) return
    const fetched = ((data ?? []) as CompPanelistScoreRow[]).map(compPanelistScoreFromRow)
    set({ panelistScores: [...get().panelistScores.filter((s) => s.assessmentId !== assessmentId), ...fetched] })
  },

  setMyPanelistAnswer: async (assessmentId, questionKey, score, note) => {
    const uid = currentUserId()
    if (!uid) return
    const existing = get().panelistScores.find((s) => s.assessmentId === assessmentId && s.panelistId === uid)
    const nextAnswers = { ...(existing?.answers ?? {}), [questionKey]: { score, note } }
    const { data, error } = await supabase
      .from('comp_panelist_scores')
      .upsert({ assessment_id: assessmentId, panelist_id: uid, answers: nextAnswers }, { onConflict: 'assessment_id,panelist_id' })
      .select('*')
      .single()
    if (reportError('ثبت امتیاز داور', error) || !data) return
    const updated = compPanelistScoreFromRow(data as CompPanelistScoreRow)
    set({ panelistScores: [...get().panelistScores.filter((s) => s.id !== updated.id), updated] })
  },

  setMyPanelistCapstone: async (assessmentId, score, note) => {
    const uid = currentUserId()
    if (!uid) return
    const { data, error } = await supabase
      .from('comp_panelist_scores')
      .upsert({ assessment_id: assessmentId, panelist_id: uid, capstone_score: score, capstone_note: note }, { onConflict: 'assessment_id,panelist_id' })
      .select('*')
      .single()
    if (reportError('ثبت امتیاز سناریوی پایانی داور', error) || !data) return
    const updated = compPanelistScoreFromRow(data as CompPanelistScoreRow)
    set({ panelistScores: [...get().panelistScores.filter((s) => s.id !== updated.id), updated] })
  },

  submitMyPanelistScore: async (assessmentId) => {
    const uid = currentUserId()
    if (!uid) return
    const { data, error } = await supabase
      .from('comp_panelist_scores')
      .upsert({ assessment_id: assessmentId, panelist_id: uid, submitted_at: new Date().toISOString() }, { onConflict: 'assessment_id,panelist_id' })
      .select('*')
      .single()
    if (reportError('ثبت نهایی امتیاز داور', error) || !data) return
    const updated = compPanelistScoreFromRow(data as CompPanelistScoreRow)
    set({ panelistScores: [...get().panelistScores.filter((s) => s.id !== updated.id), updated] })
  },

  fetchAttachments: async (assessmentId) => {
    const { data, error } = await supabase.from('comp_attachments').select('*').eq('assessment_id', assessmentId).order('created_at', { ascending: false })
    if (reportError('بارگذاری مدارک', error)) return
    const fetched = ((data ?? []) as CompAttachmentRow[]).map(compAttachmentFromRow)
    set({ attachments: [...get().attachments.filter((a) => a.assessmentId !== assessmentId), ...fetched] })
  },

  addAttachment: async (assessmentId, kind, file) => {
    const { path, error: uploadErr } = await uploadCompDoc(file, assessmentId)
    if (uploadErr || !path) {
      reportError('بارگذاری مدرک', { message: uploadErr ?? 'خطای نامشخص' })
      return
    }
    const { data, error } = await supabase
      .from('comp_attachments')
      .insert({ assessment_id: assessmentId, kind, file_name: file.name, storage_path: path })
      .select('*')
      .single()
    if (reportError('ثبت مدرک', error) || !data) return
    set({ attachments: [compAttachmentFromRow(data as CompAttachmentRow), ...get().attachments] })
  },

  deleteAttachment: async (id) => {
    const previous = get().attachments
    set({ attachments: previous.filter((a) => a.id !== id) })
    const { error } = await supabase.from('comp_attachments').delete().eq('id', id)
    if (reportError('حذف مدرک', error)) set({ attachments: previous })
  },
}))
