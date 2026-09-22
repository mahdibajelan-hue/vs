import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import { useAuthStore } from '../../../store/useAuthStore'
import type {
  AssessmentStatus,
  AttachmentKind,
  CertificationEntry,
  CompAssessmentTemplate,
  CompAttachment,
  CompetencyAssessment,
  CompJobRoleConfig,
  CompModuleAdmin,
  CompPanelGroup,
  CompPanelist,
  CompPanelistScore,
  CompProfileLite,
  CompQuestionBankItem,
  CompRoleAssignment,
  EducationEntry,
  EmploymentEntry,
  JobRole,
  QuestionDifficulty,
  QuestionMixCell,
  QuestionType,
} from '../types'
import {
  compAssessmentFromRow,
  compAssessmentTemplateFromRow,
  compAttachmentFromRow,
  compJobRoleConfigFromRow,
  compModuleAdminFromRow,
  compPanelGroupFromRow,
  compPanelistFromRow,
  compPanelistScoreFromRow,
  compQuestionBankFromRow,
  compQuestionBankPublicFromRow,
  compRoleAssignmentFromRow,
  profileLiteFromRow,
  type CompAssessmentRow,
  type CompAssessmentTemplateRow,
  type CompAttachmentRow,
  type CompJobRoleConfigRow,
  type CompModuleAdminRow,
  type CompPanelGroupRow,
  type CompPanelistRow,
  type CompPanelistScoreRow,
  type CompQuestionBankPublicRow,
  type CompQuestionBankRow,
  type CompRoleAssignmentRow,
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
  jobRole: JobRole
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
    job_role: profile.jobRole,
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
    educationScore: existing?.educationScore ?? null,
    experienceScore: existing?.experienceScore ?? null,
    pmTrainingScore: existing?.pmTrainingScore ?? null,
    pmCertificationScore: existing?.pmCertificationScore ?? null,
    strengths: existing?.strengths ?? '',
    developmentAreas: existing?.developmentAreas ?? '',
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
      education_score: merged.educationScore,
      experience_score: merged.experienceScore,
      pm_training_score: merged.pmTrainingScore,
      pm_certification_score: merged.pmCertificationScore,
      strengths: merged.strengths,
      development_areas: merged.developmentAreas,
      submitted_at: merged.submittedAt,
      ...row,
    },
    { onConflict: 'assessment_id,panelist_id' },
  )
  if (reportError(errorLabel, error)) return
  set({ panelistScores: [...get().panelistScores.filter((s) => !(s.assessmentId === assessmentId && s.panelistId === uid)), merged] })
}

export interface QuestionBankInput {
  jobRole: JobRole
  category: QuestionType
  subCategory: string
  difficulty: QuestionDifficulty
  questionText: string
  imageUrl: string
  referenceAnswer: string
  keyPoints: string[]
  excellentAnswerIndicators: string[]
  commonMistakes: string[]
  standardReference: string
  evaluatorNoteRequired: boolean
  active: boolean
  /** Relative weight within its category — defaults to 1 in every existing caller/form until the
   * Question Bank UI exposes an explicit control for it. */
  weight: number
}

/** id present = update that existing template (a new version overwrites in place — unlike question
 * bank rows, a template isn't referenced by frozen historical snapshots, so there's no versioning
 * need here); id absent = create a new one. */
export interface AssessmentTemplateInput {
  id?: string
  jobRole: JobRole
  title: string
  durationMinutes: number
  panelSizeDefault: number
  questionMix: QuestionMixCell[]
}

function questionBankToRowPayload(q: QuestionBankInput) {
  return {
    job_role: q.jobRole,
    category: q.category,
    sub_category: q.subCategory,
    difficulty: q.difficulty,
    question_text: q.questionText,
    image_url: q.imageUrl,
    reference_answer: q.referenceAnswer,
    key_points: q.keyPoints,
    excellent_answer_indicators: q.excellentAnswerIndicators,
    common_mistakes: q.commonMistakes,
    standard_reference: q.standardReference,
    evaluator_note_required: q.evaluatorNoteRequired,
    active: q.active,
    weight: q.weight,
  }
}

interface CompetencyState {
  assessments: CompetencyAssessment[]
  profiles: CompProfileLite[]
  panelists: CompPanelist[]
  panelistScores: CompPanelistScore[]
  panelGroups: CompPanelGroup[]
  moduleAdmins: CompModuleAdmin[]
  assessmentDesigners: CompRoleAssignment[]
  reportViewers: CompRoleAssignment[]
  attachments: CompAttachment[]
  questionBank: CompQuestionBankItem[]
  /** Safe, non-sensitive projection of the bank (no reference answers/key points) — read via
   * comp_question_bank_public(), which any authenticated user may call regardless of panelist
   * status or assessment completion. Used only for bucketing already-recorded scores into
   * categories on the dashboard/reports pages; never for showing evaluator-only material. */
  questionBankPublic: CompQuestionBankItem[]
  jobRoleConfigs: CompJobRoleConfig[]
  loadingQuestionBank: boolean
  loading: boolean

  fetchAll: () => Promise<void>
  fetchProfiles: () => Promise<void>
  createAssessment: (profile: CandidateProfileInput) => Promise<string | null>
  updateProfile: (id: string, profile: CandidateProfileInput) => Promise<void>
  setAnswer: (id: string, questionKey: string, score: number | null, note: string, candidateAnswer?: string) => Promise<void>
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
  /** How many panelists this assessment's panel is meant to have — per-assessment, no longer a fixed 3. */
  setPanelSize: (assessmentId: string, size: number) => Promise<void>

  fetchPanelGroups: () => Promise<void>
  createPanelGroup: (name: string, jobRole: JobRole | null, memberUserIds: string[], leadUserId: string | null) => Promise<void>
  deletePanelGroup: (id: string) => Promise<void>
  /** Adds every member of a saved panel group as panelists on this assessment in one call — skips
   * anyone already on the panel rather than erroring on the unique (assessment_id, user_id)
   * constraint, and never pushes the panel past its configured panelSize. */
  applyPanelGroup: (assessmentId: string, groupId: string) => Promise<void>

  fetchModuleAdmins: () => Promise<void>
  addModuleAdmin: (userId: string) => Promise<void>
  removeModuleAdmin: (userId: string) => Promise<void>

  /** ASSESSMENT_DESIGNER / REPORT_VIEWER — module-scoped RBAC roles (spec section 11), backed by
   * the shared rasta_user_roles framework via the comp_grant_role/comp_revoke_role/
   * comp_list_role_assignments RPCs (see schema.sql) so a module-only admin can manage them without
   * needing the sitewide admin flag. */
  fetchAssessmentDesigners: () => Promise<void>
  addAssessmentDesigner: (userId: string) => Promise<void>
  removeAssessmentDesigner: (userId: string) => Promise<void>
  fetchReportViewers: () => Promise<void>
  addReportViewer: (userId: string) => Promise<void>
  removeReportViewer: (userId: string) => Promise<void>

  fetchPanelistScores: (assessmentId: string) => Promise<void>
  setMyPanelistAnswer: (assessmentId: string, questionKey: string, score: number | null, note: string, candidateAnswer?: string) => Promise<void>
  setMyPanelistCapstone: (assessmentId: string, score: number | null, note: string) => Promise<void>
  setMyPanelistQualificationScores: (assessmentId: string, scores: QualificationScoresInput) => Promise<void>
  setMyPanelistStrengths: (assessmentId: string, strengths: string, developmentAreas: string) => Promise<void>
  submitMyPanelistScore: (assessmentId: string) => Promise<void>

  fetchAttachments: (assessmentId: string) => Promise<void>
  addAttachment: (assessmentId: string, kind: AttachmentKind, file: File) => Promise<void>
  deleteAttachment: (id: string) => Promise<void>

  fetchQuestionBank: () => Promise<void>
  /** Fetches the safe, non-sensitive projection via comp_question_bank_public() — see
   * questionBankPublic above. Used by the dashboard/reports pages instead of fetchQuestionBank. */
  fetchQuestionBankPublic: () => Promise<void>
  createQuestion: (input: QuestionBankInput) => Promise<void>
  /** Never mutates the existing row — inserts a new version (same question_group_id, version + 1,
   * chained via superseded_by on the old row) so any assessment snapshot already pointing at the
   * old row keeps resolving to the exact wording/reference-answer that was actually used (spec
   * section 13). */
  updateQuestion: (id: string, input: QuestionBankInput) => Promise<void>
  setQuestionActive: (id: string, active: boolean) => Promise<void>
  deleteQuestion: (id: string) => Promise<void>

  fetchJobRoleConfigs: () => Promise<void>
  updateJobRoleConfig: (jobRole: JobRole, allowedQuestionTypes: QuestionType[]) => Promise<void>

  /** Reusable, named question-mix "recipes" per job role — the Assessment Designer wizard's saved
   * output (spec section 6/36). */
  assessmentTemplates: CompAssessmentTemplate[]
  fetchAssessmentTemplates: () => Promise<void>
  upsertAssessmentTemplate: (input: AssessmentTemplateInput) => Promise<string | null>
  deleteAssessmentTemplate: (id: string) => Promise<void>
  /** Generates one assessment's frozen question snapshot from a question-mix grid (replaces the old
   * fixed hardcoded target counts) — written once; re-running it on an assessment that already has
   * a selection is a no-op from the UI (guarded by callers). */
  assignQuestionsFromMix: (assessmentId: string, jobRole: JobRole, mix: QuestionMixCell[]) => Promise<void>
}

export const useCompetencyStore = create<CompetencyState>()((set, get) => ({
  assessments: [],
  profiles: [],
  panelists: [],
  panelistScores: [],
  panelGroups: [],
  moduleAdmins: [],
  assessmentDesigners: [],
  reportViewers: [],
  attachments: [],
  questionBank: [],
  questionBankPublic: [],
  jobRoleConfigs: [],
  assessmentTemplates: [],
  loadingQuestionBank: false,
  loading: true,

  // Panelist scores are fetched for every assessment here (not just the one currently open) so the
  // "official" score everywhere (dashboard leaderboard, reports, results) can be the panel's
  // average, computed identically regardless of who's looking — see resolveOfficialAnswers.
  fetchAll: async () => {
    set({ loading: true })
    const [assessmentsRes, panelistScoresRes] = await Promise.all([
      supabase.from('comp_assessments').select('*').order('created_at', { ascending: false }),
      supabase.from('comp_panelist_scores').select('*'),
    ])
    if (reportError('بارگذاری ارزیابی‌ها', assessmentsRes.error)) {
      set({ loading: false })
      return
    }
    const panelistScores = reportError('بارگذاری امتیازهای داوران', panelistScoresRes.error)
      ? []
      : ((panelistScoresRes.data ?? []) as CompPanelistScoreRow[]).map(compPanelistScoreFromRow)
    set({
      assessments: ((assessmentsRes.data ?? []) as CompAssessmentRow[]).map(compAssessmentFromRow),
      panelistScores,
      loading: false,
    })
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
      jobRole: profile.jobRole,
      selectedQuestionIds: [],
      panelSize: 3,
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
    // Changing job role after questions were already assigned would leave selectedQuestionIds
    // pointing at the old role's bank rows — clear it so the lead is prompted to re-assign from
    // the newly-chosen role's bank instead of silently scoring against a mismatched question set.
    const roleChanged = profile.jobRole !== current.jobRole
    const payload: Record<string, unknown> = { ...profileToRowPayload(profile) }
    if (roleChanged) payload.selected_question_ids = []
    const { error } = await supabase.from('comp_assessments').update(payload).eq('id', id)
    if (reportError('بروزرسانی مشخصات نامزد', error)) return
    set({
      assessments: get().assessments.map((a) =>
        a.id === id
          ? {
              ...a,
              jobRole: profile.jobRole,
              selectedQuestionIds: roleChanged ? [] : a.selectedQuestionIds,
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

  setAnswer: async (id, questionKey, score, note, candidateAnswer) => {
    const current = get().assessments.find((a) => a.id === id)
    if (!current) return
    const entry = candidateAnswer !== undefined ? { score, note, candidateAnswer } : { score, note }
    const nextAnswers = { ...current.answers, [questionKey]: entry }
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
    // A narrow RPC rather than a direct table update: any authenticated staff member may set a
    // candidate's photo (comp_assessments UPDATE itself stays lead-only, since it also guards the
    // final scores/status) — see comp_set_photo in schema.sql.
    const { error } = await supabase.rpc('comp_set_photo', { p_assessment_id: id, p_photo_url: path })
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

  setPanelSize: async (assessmentId, size) => {
    const previous = get().assessments
    set({ assessments: previous.map((a) => (a.id === assessmentId ? { ...a, panelSize: size } : a)) })
    const { error } = await supabase.from('comp_assessments').update({ panel_size: size }).eq('id', assessmentId)
    if (reportError('تغییر تعداد داوران', error)) set({ assessments: previous })
  },

  fetchPanelGroups: async () => {
    const { data, error } = await supabase.from('comp_panel_groups').select('*, comp_panel_group_members(*)').order('created_at', { ascending: false })
    if (reportError('بارگذاری گروه‌های داوری', error)) return
    set({ panelGroups: ((data ?? []) as CompPanelGroupRow[]).map(compPanelGroupFromRow) })
  },

  createPanelGroup: async (name, jobRole, memberUserIds, leadUserId) => {
    const id = crypto.randomUUID()
    // created_by defaults to auth.uid() at the database — no need to pass it explicitly.
    const { error } = await supabase.from('comp_panel_groups').insert({ id, name, job_role: jobRole })
    if (reportError('ساخت گروه داوری', error)) return
    if (memberUserIds.length > 0) {
      const { error: membersError } = await supabase
        .from('comp_panel_group_members')
        .insert(memberUserIds.map((userId) => ({ id: crypto.randomUUID(), group_id: id, user_id: userId, is_lead: userId === leadUserId })))
      if (reportError('افزودن اعضای گروه داوری', membersError)) return
    }
    await get().fetchPanelGroups()
  },

  deletePanelGroup: async (id) => {
    const previous = get().panelGroups
    set({ panelGroups: previous.filter((g) => g.id !== id) })
    const { error } = await supabase.from('comp_panel_groups').delete().eq('id', id)
    if (reportError('حذف گروه داوری', error)) set({ panelGroups: previous })
  },

  applyPanelGroup: async (assessmentId, groupId) => {
    const group = get().panelGroups.find((g) => g.id === groupId)
    if (!group) return
    const existing = get().panelists.filter((p) => p.assessmentId === assessmentId)
    const assessment = get().assessments.find((a) => a.id === assessmentId)
    const room = (assessment?.panelSize ?? 3) - existing.length
    const toAdd = group.members.filter((m) => !existing.some((p) => p.userId === m.userId)).slice(0, Math.max(0, room))
    for (const member of toAdd) {
      await get().addPanelist(assessmentId, member.userId, member.isLead && !existing.some((p) => p.isLead))
    }
  },

  fetchModuleAdmins: async () => {
    const { data, error } = await supabase.from('comp_module_admins').select('*')
    if (reportError('بارگذاری فهرست ادمین‌های ماژول', error)) return
    set({ moduleAdmins: ((data ?? []) as CompModuleAdminRow[]).map(compModuleAdminFromRow) })
  },

  addModuleAdmin: async (userId) => {
    const { error } = await supabase.from('comp_module_admins').insert({ user_id: userId })
    if (reportError('افزودن ادمین ماژول', error)) return
    await get().fetchModuleAdmins()
  },

  removeModuleAdmin: async (userId) => {
    const previous = get().moduleAdmins
    set({ moduleAdmins: previous.filter((m) => m.userId !== userId) })
    const { error } = await supabase.from('comp_module_admins').delete().eq('user_id', userId)
    if (reportError('حذف ادمین ماژول', error)) set({ moduleAdmins: previous })
  },

  fetchAssessmentDesigners: async () => {
    const { data, error } = await supabase.rpc('comp_list_role_assignments', { p_role_name: 'ASSESSMENT_DESIGNER' })
    if (reportError('بارگذاری فهرست طراحان آزمون', error)) return
    set({ assessmentDesigners: ((data ?? []) as CompRoleAssignmentRow[]).map(compRoleAssignmentFromRow) })
  },

  addAssessmentDesigner: async (userId) => {
    const { error } = await supabase.rpc('comp_grant_role', { p_user_id: userId, p_role_name: 'ASSESSMENT_DESIGNER' })
    if (reportError('افزودن طراح آزمون', error)) return
    await get().fetchAssessmentDesigners()
  },

  removeAssessmentDesigner: async (userId) => {
    const previous = get().assessmentDesigners
    set({ assessmentDesigners: previous.filter((m) => m.userId !== userId) })
    const { error } = await supabase.rpc('comp_revoke_role', { p_user_id: userId, p_role_name: 'ASSESSMENT_DESIGNER' })
    if (reportError('حذف طراح آزمون', error)) set({ assessmentDesigners: previous })
  },

  fetchReportViewers: async () => {
    const { data, error } = await supabase.rpc('comp_list_role_assignments', { p_role_name: 'REPORT_VIEWER' })
    if (reportError('بارگذاری فهرست بینندگان گزارش', error)) return
    set({ reportViewers: ((data ?? []) as CompRoleAssignmentRow[]).map(compRoleAssignmentFromRow) })
  },

  addReportViewer: async (userId) => {
    const { error } = await supabase.rpc('comp_grant_role', { p_user_id: userId, p_role_name: 'REPORT_VIEWER' })
    if (reportError('افزودن بیننده گزارش', error)) return
    await get().fetchReportViewers()
  },

  removeReportViewer: async (userId) => {
    const previous = get().reportViewers
    set({ reportViewers: previous.filter((m) => m.userId !== userId) })
    const { error } = await supabase.rpc('comp_revoke_role', { p_user_id: userId, p_role_name: 'REPORT_VIEWER' })
    if (reportError('حذف بیننده گزارش', error)) set({ reportViewers: previous })
  },

  fetchPanelistScores: async (assessmentId) => {
    const { data, error } = await supabase.from('comp_panelist_scores').select('*').eq('assessment_id', assessmentId)
    if (reportError('بارگذاری امتیازهای داوران', error)) return
    const fetched = ((data ?? []) as CompPanelistScoreRow[]).map(compPanelistScoreFromRow)
    set({ panelistScores: [...get().panelistScores.filter((s) => s.assessmentId !== assessmentId), ...fetched] })
  },

  setMyPanelistAnswer: async (assessmentId, questionKey, score, note, candidateAnswer) => {
    const entry = candidateAnswer !== undefined ? { score, note, candidateAnswer } : { score, note }
    const nextAnswers = (existing: CompPanelistScore | undefined) => ({ ...(existing?.answers ?? {}), [questionKey]: entry })
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

  setMyPanelistQualificationScores: async (assessmentId, scores) => {
    await upsertMyPanelistScore(set, get, assessmentId, 'ثبت کارت امتیاز شایستگی داور', () => ({
      row: {
        education_score: scores.educationScore,
        experience_score: scores.experienceScore,
        pm_training_score: scores.pmTrainingScore,
        pm_certification_score: scores.pmCertificationScore,
      },
      local: {
        educationScore: scores.educationScore,
        experienceScore: scores.experienceScore,
        pmTrainingScore: scores.pmTrainingScore,
        pmCertificationScore: scores.pmCertificationScore,
      },
    }))
  },

  setMyPanelistStrengths: async (assessmentId, strengths, developmentAreas) => {
    await upsertMyPanelistScore(set, get, assessmentId, 'ثبت جمع‌بندی داور', () => ({
      row: { strengths, development_areas: developmentAreas },
      local: { strengths, developmentAreas },
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

  fetchQuestionBank: async () => {
    set({ loadingQuestionBank: true })
    const { data, error } = await supabase.from('comp_question_bank').select('*').order('job_role').order('category').order('created_at')
    if (reportError('بارگذاری بانک سؤالات', error)) {
      set({ loadingQuestionBank: false })
      return
    }
    set({ questionBank: ((data ?? []) as CompQuestionBankRow[]).map(compQuestionBankFromRow), loadingQuestionBank: false })
  },

  fetchQuestionBankPublic: async () => {
    const { data, error } = await supabase.rpc('comp_question_bank_public')
    if (reportError('بارگذاری فهرست دسته‌بندی سؤالات', error)) return
    set({ questionBankPublic: ((data ?? []) as CompQuestionBankPublicRow[]).map(compQuestionBankPublicFromRow) })
  },

  createQuestion: async (input) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const uid = currentUserId()
    const { error } = await supabase
      .from('comp_question_bank')
      .insert({ id, question_group_id: id, version: 1, approval_status: 'APPROVED', ...questionBankToRowPayload(input) })
    if (reportError('ثبت سؤال جدید', error)) return
    const created: CompQuestionBankItem = {
      id,
      jobRole: input.jobRole,
      category: input.category,
      subCategory: input.subCategory,
      difficulty: input.difficulty,
      questionText: input.questionText,
      imageUrl: input.imageUrl,
      referenceAnswer: input.referenceAnswer,
      keyPoints: input.keyPoints,
      excellentAnswerIndicators: input.excellentAnswerIndicators,
      commonMistakes: input.commonMistakes,
      standardReference: input.standardReference,
      scoreMin: 0,
      scoreMax: 5,
      evaluatorNoteRequired: input.evaluatorNoteRequired,
      active: input.active,
      weight: input.weight,
      approvalStatus: 'APPROVED',
      questionGroupId: id,
      version: 1,
      supersededBy: null,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    }
    set({ questionBank: [created, ...get().questionBank] })
  },

  // Editing never mutates the existing row in place — it inserts a brand-new version row (same
  // question_group_id, version + 1) and retires the old one (superseded_by + active=false), so any
  // assessment snapshot already pointing at the old row's id keeps resolving to the exact
  // wording/reference-answer that was actually used at the time (spec section 13).
  updateQuestion: async (id, input) => {
    const previous = get().questionBank
    const old = previous.find((q) => q.id === id)
    if (!old) return
    const newId = crypto.randomUUID()
    const now = new Date().toISOString()
    const uid = currentUserId()
    const { error: insertError } = await supabase.from('comp_question_bank').insert({
      id: newId,
      question_group_id: old.questionGroupId,
      version: old.version + 1,
      approval_status: 'APPROVED',
      ...questionBankToRowPayload(input),
    })
    if (reportError('ثبت نسخه جدید سؤال', insertError)) return
    const { error: retireError } = await supabase.from('comp_question_bank').update({ superseded_by: newId, active: false }).eq('id', id)
    reportError('غیرفعال‌کردن نسخه قبلی سؤال', retireError)
    const created: CompQuestionBankItem = {
      id: newId,
      jobRole: input.jobRole,
      category: input.category,
      subCategory: input.subCategory,
      difficulty: input.difficulty,
      questionText: input.questionText,
      imageUrl: input.imageUrl,
      referenceAnswer: input.referenceAnswer,
      keyPoints: input.keyPoints,
      excellentAnswerIndicators: input.excellentAnswerIndicators,
      commonMistakes: input.commonMistakes,
      standardReference: input.standardReference,
      scoreMin: old.scoreMin,
      scoreMax: old.scoreMax,
      evaluatorNoteRequired: input.evaluatorNoteRequired,
      active: input.active,
      weight: input.weight,
      approvalStatus: 'APPROVED',
      questionGroupId: old.questionGroupId,
      version: old.version + 1,
      supersededBy: null,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    }
    set({
      questionBank: [created, ...previous.map((q) => (q.id === id ? { ...q, supersededBy: newId, active: false, updatedAt: now } : q))],
    })
  },

  setQuestionActive: async (id, active) => {
    const previous = get().questionBank
    set({ questionBank: previous.map((q) => (q.id === id ? { ...q, active } : q)) })
    const { error } = await supabase.from('comp_question_bank').update({ active }).eq('id', id)
    if (reportError('تغییر وضعیت فعال‌بودن سؤال', error)) set({ questionBank: previous })
  },

  deleteQuestion: async (id) => {
    const previous = get().questionBank
    set({ questionBank: previous.filter((q) => q.id !== id) })
    const { error } = await supabase.from('comp_question_bank').delete().eq('id', id)
    if (reportError('حذف سؤال', error)) set({ questionBank: previous })
  },

  fetchJobRoleConfigs: async () => {
    const { data, error } = await supabase.from('comp_job_role_config').select('*')
    if (reportError('بارگذاری تنظیمات مشاغل', error)) return
    set({ jobRoleConfigs: ((data ?? []) as CompJobRoleConfigRow[]).map(compJobRoleConfigFromRow) })
  },

  updateJobRoleConfig: async (jobRole, allowedQuestionTypes) => {
    const previous = get().jobRoleConfigs
    const now = new Date().toISOString()
    set({
      jobRoleConfigs: previous.map((c) => (c.jobRole === jobRole ? { ...c, allowedQuestionTypes, updatedAt: now } : c)),
    })
    const { error } = await supabase
      .from('comp_job_role_config')
      .update({ allowed_question_types: allowedQuestionTypes })
      .eq('job_role', jobRole)
    if (reportError('ذخیره تنظیمات شغل', error)) set({ jobRoleConfigs: previous })
  },

  // Generates one assessment's frozen question snapshot from an Assessment Designer question-mix
  // grid (spec section 6-9): for every {category, difficulty, count} cell, picks `count` random
  // active+approved bank rows of exactly that type/difficulty (or every one available if the bank
  // has fewer than requested — the designer's own availability-check step is what should have
  // caught that beforehand). Replaces the old fixed hardcoded target counts entirely.
  assignQuestionsFromMix: async (assessmentId, jobRole, mix) => {
    let bank = get().questionBank.filter((q) => q.jobRole === jobRole && q.active)
    if (bank.length === 0) {
      const { data, error } = await supabase.from('comp_question_bank').select('*').eq('job_role', jobRole).eq('active', true)
      if (reportError('بارگذاری بانک سؤالات', error)) return
      bank = ((data ?? []) as CompQuestionBankRow[]).map(compQuestionBankFromRow)
    }
    const pickRandom = (pool: CompQuestionBankItem[], n: number) => {
      const shuffled = [...pool].sort(() => Math.random() - 0.5)
      return shuffled.slice(0, n)
    }
    const selected = mix
      .filter((cell) => cell.count > 0)
      .flatMap((cell) => pickRandom(bank.filter((q) => q.category === cell.category && q.difficulty === cell.difficulty), cell.count))
      .map((q) => q.id)
    const current = get().assessments.find((a) => a.id === assessmentId)
    if (!current) return
    set({ assessments: get().assessments.map((a) => (a.id === assessmentId ? { ...a, selectedQuestionIds: selected } : a)) })
    const { error } = await supabase.from('comp_assessments').update({ selected_question_ids: selected }).eq('id', assessmentId)
    if (reportError('تولید آزمون از روی طرح سؤال', error)) {
      set({ assessments: get().assessments.map((a) => (a.id === assessmentId ? current : a)) })
    }
  },

  fetchAssessmentTemplates: async () => {
    const { data, error } = await supabase.from('comp_assessment_templates').select('*').order('job_role').order('title')
    if (reportError('بارگذاری طرح‌های آزمون', error)) return
    set({ assessmentTemplates: ((data ?? []) as CompAssessmentTemplateRow[]).map(compAssessmentTemplateFromRow) })
  },

  upsertAssessmentTemplate: async (input) => {
    const uid = currentUserId()
    const now = new Date().toISOString()
    if (input.id) {
      const { error } = await supabase
        .from('comp_assessment_templates')
        .update({
          title: input.title,
          duration_minutes: input.durationMinutes,
          panel_size_default: input.panelSizeDefault,
          question_mix: input.questionMix,
        })
        .eq('id', input.id)
      if (reportError('ذخیره طرح آزمون', error)) return null
      const updated: CompAssessmentTemplate = { ...input, id: input.id, createdBy: uid, createdAt: now, updatedAt: now }
      set({ assessmentTemplates: get().assessmentTemplates.map((t) => (t.id === input.id ? { ...t, ...updated } : t)) })
      return input.id
    }
    const id = crypto.randomUUID()
    const { error } = await supabase.from('comp_assessment_templates').insert({
      id,
      job_role: input.jobRole,
      title: input.title,
      duration_minutes: input.durationMinutes,
      panel_size_default: input.panelSizeDefault,
      question_mix: input.questionMix,
    })
    if (reportError('ثبت طرح آزمون', error)) return null
    const created: CompAssessmentTemplate = {
      id,
      jobRole: input.jobRole,
      title: input.title,
      durationMinutes: input.durationMinutes,
      panelSizeDefault: input.panelSizeDefault,
      questionMix: input.questionMix,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    }
    set({ assessmentTemplates: [created, ...get().assessmentTemplates] })
    return id
  },

  deleteAssessmentTemplate: async (id) => {
    const previous = get().assessmentTemplates
    set({ assessmentTemplates: previous.filter((t) => t.id !== id) })
    const { error } = await supabase.from('comp_assessment_templates').delete().eq('id', id)
    if (reportError('حذف طرح آزمون', error)) set({ assessmentTemplates: previous })
  },
}))
