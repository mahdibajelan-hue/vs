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
  candidateBirthDate: string
  candidateAge: number | null
  hasDisability: boolean
  disabilityNote: string
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
    candidate_birth_date: profile.candidateBirthDate || null,
    candidate_age: profile.candidateAge,
    has_disability: profile.hasDisability,
    disability_note: profile.disabilityNote,
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

/**
 * Shared write path for the current user's own panelist-score row. Every caller previously
 * generated its row id twice — once for the payload, once for the local copy — so the local
 * record's id never matched the row actually written, and the next write would then upsert
 * under a stale id. Generating it once here keeps local state and the database in agreement.
 *
 * The upsert always carries the full row, not just the changed field: a partial upsert that
 * inserts (rather than conflicts) would drop whichever columns it omitted.
 */
async function upsertMyPanelistScore(
  set: (partial: Partial<CompetencyState>) => void,
  get: () => CompetencyState,
  assessmentId: string,
  errorLabel: string,
  patch: (existing: CompPanelistScore | undefined) => { row: Record<string, unknown>; local: Partial<CompPanelistScore> },
): Promise<void> {
  const uid = currentUserId()
  if (!uid) return
  const existing = get().panelistScores.find((s) => s.assessmentId === assessmentId && s.panelistId === uid)
  const { row, local } = patch(existing)
  const now = new Date().toISOString()
  const merged: CompPanelistScore = {
    id: existing?.id ?? crypto.randomUUID(),
    assessmentId,
    panelistId: uid,
    answers: existing?.answers ?? {},
    capstoneScore: existing?.capstoneScore ?? null,
    capstoneNote: existing?.capstoneNote ?? '',
    submittedAt: existing?.submittedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...local,
  }
  const { error } = await supabase.from('comp_panelist_scores').upsert(
    {
      id: merged.id,
      assessment_id: assessmentId,
      panelist_id: uid,
      answers: merged.answers,
      capstone_score: merged.capstoneScore,
      capstone_note: merged.capstoneNote,
      submitted_at: merged.submittedAt,
      ...row,
    },
    { onConflict: 'assessment_id,panelist_id' },
  )
  if (reportError(errorLabel, error)) return
  set({ panelistScores: [...get().panelistScores.filter((s) => !(s.assessmentId === assessmentId && s.panelistId === uid)), merged] })
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
  setApproved: (id: string, approved: boolean) => Promise<void>
  setStrengthsAndDevelopment: (id: string, strengths: string, developmentAreas: string) => Promise<void>
  deleteAssessment: (id: string) => Promise<void>
  uploadPhoto: (id: string, file: File) => Promise<void>
  regenerateSelfServiceLink: (id: string) => Promise<void>
  markSelfServiceSent: (id: string) => Promise<void>
  markReviewed: (id: string) => Promise<void>
  regenerateResultsShareLink: (id: string) => Promise<void>

  fetchPanelists: (assessmentId: string) => Promise<void>
  addPanelist: (assessmentId: string, userId: string, isLead: boolean) => Promise<void>
  removePanelist: (id: string) => Promise<void>
  /** Designates one panelist as the interview-team lead, demoting whoever previously held it for this assessment (at most one lead per assessment — see idx_comp_panelists_one_lead). */
  setPanelistLead: (assessmentId: string, panelistRowId: string) => Promise<void>

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

  // NOTE: every write below deliberately avoids chaining `.select().single()` after
  // insert/update — some Supabase project configurations reject the implicit
  // RETURNING-clause read with a row-level-security error even though the write itself
  // (and a manual follow-up SELECT) succeed. Instead we know every value we just wrote
  // (we sent it, or we generated it client-side), so we build/merge the local object
  // directly — this is also one fewer round trip.
  createAssessment: async (profile) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const uid = currentUserId()
    const { error } = await supabase.from('comp_assessments').insert({ id, ...profileToRowPayload(profile), status: 'draft', answers: {} })
    if (reportError('ثبت مشخصات نامزد', error)) return null
    const created: CompetencyAssessment = {
      id,
      candidateName: profile.candidateName,
      candidatePosition: profile.candidatePosition,
      candidateNationalId: profile.candidateNationalId,
      candidatePhone: profile.candidatePhone,
      candidateEmail: profile.candidateEmail,
      candidateBirthDate: profile.candidateBirthDate,
      candidateAge: profile.candidateAge,
      hasDisability: profile.hasDisability,
      disabilityNote: profile.disabilityNote,
      photoUrl: '',
      yearsExperienceTotal: profile.yearsExperienceTotal,
      yearsExperiencePipeline: profile.yearsExperiencePipeline,
      currentEmployer: profile.currentEmployer,
      education: profile.education,
      employmentHistory: profile.employmentHistory,
      certifications: profile.certifications,
      notableProjects: profile.notableProjects,
      interviewDate: profile.interviewDate,
      status: 'draft',
      answers: {},
      capstoneScore: null,
      capstoneNote: '',
      educationScore: null,
      experienceScore: null,
      pmTrainingScore: null,
      pmCertificationScore: null,
      selfServiceToken: crypto.randomUUID(),
      selfServiceStatus: 'not_sent',
      resultsShareToken: crypto.randomUUID(),
      reviewedBy: null,
      reviewedAt: null,
      isApproved: false,
      strengths: '',
      developmentAreas: '',
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    }
    set({ assessments: [created, ...get().assessments] })
    return created.id
  },

  updateProfile: async (id, profile) => {
    const current = get().assessments.find((a) => a.id === id)
    if (!current) return
    const { error } = await supabase.from('comp_assessments').update(profileToRowPayload(profile)).eq('id', id)
    if (reportError('بروزرسانی مشخصات نامزد', error)) return
    set({
      assessments: get().assessments.map((a) =>
        a.id === id
          ? {
              ...a,
              candidateName: profile.candidateName,
              candidatePosition: profile.candidatePosition,
              candidateNationalId: profile.candidateNationalId,
              candidatePhone: profile.candidatePhone,
              candidateEmail: profile.candidateEmail,
              candidateBirthDate: profile.candidateBirthDate,
              candidateAge: profile.candidateAge,
              hasDisability: profile.hasDisability,
              disabilityNote: profile.disabilityNote,
              yearsExperienceTotal: profile.yearsExperienceTotal,
              yearsExperiencePipeline: profile.yearsExperiencePipeline,
              currentEmployer: profile.currentEmployer,
              education: profile.education,
              employmentHistory: profile.employmentHistory,
              certifications: profile.certifications,
              notableProjects: profile.notableProjects,
              interviewDate: profile.interviewDate,
              updatedAt: new Date().toISOString(),
            }
          : a,
      ),
    })
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
    const { error } = await supabase
      .from('comp_assessments')
      .update({
        education_score: scores.educationScore,
        experience_score: scores.experienceScore,
        pm_training_score: scores.pmTrainingScore,
        pm_certification_score: scores.pmCertificationScore,
      })
      .eq('id', id)
    if (reportError('ثبت امتیاز شایستگی رزومه‌ای', error)) return
    set({
      assessments: get().assessments.map((a) =>
        a.id === id
          ? {
              ...a,
              educationScore: scores.educationScore,
              experienceScore: scores.experienceScore,
              pmTrainingScore: scores.pmTrainingScore,
              pmCertificationScore: scores.pmCertificationScore,
            }
          : a,
      ),
    })
  },

  setStatus: async (id, status) => {
    const { error } = await supabase.from('comp_assessments').update({ status }).eq('id', id)
    if (reportError('بروزرسانی وضعیت ارزیابی', error)) return
    set({ assessments: get().assessments.map((a) => (a.id === id ? { ...a, status } : a)) })
  },

  setApproved: async (id, approved) => {
    const { error } = await supabase.from('comp_assessments').update({ is_approved: approved }).eq('id', id)
    if (reportError('ثبت تایید صلاحیت', error)) return
    set({ assessments: get().assessments.map((a) => (a.id === id ? { ...a, isApproved: approved } : a)) })
  },

  setStrengthsAndDevelopment: async (id, strengths, developmentAreas) => {
    const { error } = await supabase.from('comp_assessments').update({ strengths, development_areas: developmentAreas }).eq('id', id)
    if (reportError('ثبت جمع‌بندی نقاط قوت و بهبود', error)) return
    set({ assessments: get().assessments.map((a) => (a.id === id ? { ...a, strengths, developmentAreas } : a)) })
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
    const { error } = await supabase.from('comp_assessments').update({ photo_url: path }).eq('id', id)
    if (reportError('ثبت عکس پرسنلی', error)) return
    set({ assessments: get().assessments.map((a) => (a.id === id ? { ...a, photoUrl: path } : a)) })
  },

  regenerateSelfServiceLink: async (id) => {
    const token = crypto.randomUUID()
    const { error } = await supabase.from('comp_assessments').update({ self_service_token: token, self_service_status: 'not_sent' }).eq('id', id)
    if (reportError('صدور لینک جدید', error)) return
    set({ assessments: get().assessments.map((a) => (a.id === id ? { ...a, selfServiceToken: token, selfServiceStatus: 'not_sent' } : a)) })
  },

  markSelfServiceSent: async (id) => {
    const { error } = await supabase.from('comp_assessments').update({ self_service_status: 'pending' }).eq('id', id)
    if (reportError('ثبت وضعیت ارسال لینک', error)) return
    set({ assessments: get().assessments.map((a) => (a.id === id ? { ...a, selfServiceStatus: 'pending' } : a)) })
  },

  markReviewed: async (id) => {
    const uid = currentUserId()
    const now = new Date().toISOString()
    const { error } = await supabase.from('comp_assessments').update({ self_service_status: 'reviewed', reviewed_by: uid, reviewed_at: now }).eq('id', id)
    if (reportError('ثبت بررسی مدارک', error)) return
    set({ assessments: get().assessments.map((a) => (a.id === id ? { ...a, selfServiceStatus: 'reviewed', reviewedBy: uid, reviewedAt: now } : a)) })
  },

  regenerateResultsShareLink: async (id) => {
    const token = crypto.randomUUID()
    const { error } = await supabase.from('comp_assessments').update({ results_share_token: token }).eq('id', id)
    if (reportError('صدور لینک عمومی جدید', error)) return
    set({ assessments: get().assessments.map((a) => (a.id === id ? { ...a, resultsShareToken: token } : a)) })
  },

  fetchPanelists: async (assessmentId) => {
    const { data, error } = await supabase.from('comp_panelists').select('*').eq('assessment_id', assessmentId)
    if (reportError('بارگذاری فهرست داوران', error)) return
    const fetched = ((data ?? []) as CompPanelistRow[]).map(compPanelistFromRow)
    set({ panelists: [...get().panelists.filter((p) => p.assessmentId !== assessmentId), ...fetched] })
  },

  addPanelist: async (assessmentId, userId, isLead) => {
    if (isLead) {
      // Clear any existing lead first — idx_comp_panelists_one_lead allows only one per assessment.
      const { error: clearError } = await supabase.from('comp_panelists').update({ is_lead: false }).eq('assessment_id', assessmentId).eq('is_lead', true)
      if (reportError('افزودن داور', clearError)) return
    }
    const id = crypto.randomUUID()
    const uid = currentUserId()
    const { error } = await supabase.from('comp_panelists').insert({ id, assessment_id: assessmentId, user_id: userId, is_lead: isLead })
    if (reportError('افزودن داور', error)) return
    const created: CompPanelist = { id, assessmentId, userId, isLead, addedBy: uid, createdAt: new Date().toISOString() }
    set({
      panelists: [...get().panelists.map((p) => (isLead && p.assessmentId === assessmentId ? { ...p, isLead: false } : p)), created],
    })
  },

  removePanelist: async (id) => {
    const previous = get().panelists
    set({ panelists: previous.filter((p) => p.id !== id) })
    const { error } = await supabase.from('comp_panelists').delete().eq('id', id)
    if (reportError('حذف داور', error)) set({ panelists: previous })
  },

  setPanelistLead: async (assessmentId, panelistRowId) => {
    const previous = get().panelists
    // Clear the previous lead first, then set the new one — idx_comp_panelists_one_lead only
    // allows one is_lead=true row per assessment, so setting the new lead before clearing the old
    // one would violate it.
    const { error: clearError } = await supabase.from('comp_panelists').update({ is_lead: false }).eq('assessment_id', assessmentId).eq('is_lead', true)
    if (reportError('تغییر مسئول تیم', clearError)) return
    const { error: setError } = await supabase.from('comp_panelists').update({ is_lead: true }).eq('id', panelistRowId)
    if (reportError('تغییر مسئول تیم', setError)) {
      set({ panelists: previous })
      return
    }
    set({
      panelists: get().panelists.map((p) => (p.assessmentId === assessmentId ? { ...p, isLead: p.id === panelistRowId } : p)),
    })
  },

  fetchPanelistScores: async (assessmentId) => {
    const { data, error } = await supabase.from('comp_panelist_scores').select('*').eq('assessment_id', assessmentId)
    if (reportError('بارگذاری امتیازهای داوران', error)) return
    const fetched = ((data ?? []) as CompPanelistScoreRow[]).map(compPanelistScoreFromRow)
    set({ panelistScores: [...get().panelistScores.filter((s) => s.assessmentId !== assessmentId), ...fetched] })
  },

  setMyPanelistAnswer: async (assessmentId, questionKey, score, note) => {
    const nextAnswers = (existing: CompPanelistScore | undefined) => ({ ...(existing?.answers ?? {}), [questionKey]: { score, note } })
    await upsertMyPanelistScore(set, get, assessmentId, 'ثبت امتیاز داور', (existing) => ({
      row: { answers: nextAnswers(existing) },
      local: { answers: nextAnswers(existing) },
    }))
  },

  setMyPanelistCapstone: async (assessmentId, score, note) => {
    await upsertMyPanelistScore(set, get, assessmentId, 'ثبت امتیاز سناریوی پایانی داور', () => ({
      row: { capstone_score: score, capstone_note: note },
      local: { capstoneScore: score, capstoneNote: note },
    }))
  },

  submitMyPanelistScore: async (assessmentId) => {
    const now = new Date().toISOString()
    await upsertMyPanelistScore(set, get, assessmentId, 'ثبت نهایی امتیاز داور', () => ({
      row: { submitted_at: now },
      local: { submittedAt: now },
    }))
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
    const id = crypto.randomUUID()
    const uid = currentUserId()
    const { error } = await supabase.from('comp_attachments').insert({ id, assessment_id: assessmentId, kind, file_name: file.name, storage_path: path })
    if (reportError('ثبت مدرک', error)) return
    const created: CompAttachment = {
      id,
      assessmentId,
      kind,
      fileName: file.name,
      storagePath: path,
      uploadedBy: uid,
      uploadedByCandidate: false,
      createdAt: new Date().toISOString(),
    }
    set({ attachments: [created, ...get().attachments] })
  },

  deleteAttachment: async (id) => {
    const previous = get().attachments
    set({ attachments: previous.filter((a) => a.id !== id) })
    const { error } = await supabase.from('comp_attachments').delete().eq('id', id)
    if (reportError('حذف مدرک', error)) set({ attachments: previous })
  },
}))
