import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import { useAuthStore } from '../../../store/useAuthStore'
import type {
  AssessmentStatus,
  AttachmentKind,
  CandidateAiAnalysis,
  CertificationEntry,
  CompAiAnalysis,
  CompAssessmentBlueprint,
  CompAssessmentTemplate,
  CompAttachment,
  CompAuditLogEntry,
  CompCompetency,
  CompCompetencyDomain,
  CompCompetencyEvidenceSource,
  CompCompetencyEvidenceDetail,
  CompCompetencyProfile,
  CompDevelopmentAction,
  CompDevelopmentActionSource,
  CompDevelopmentActionStatus,
  CompDevelopmentActionType,
  CompDevelopmentPlan,
  CompDevelopmentPlanSeedResult,
  CompDevelopmentPlanStatus,
  CompDevelopmentPriority,
  CompEvidenceSourceType,
  CompReassessmentComparison,
  CompetencyAssessment,
  CompInterviewRating,
  CompJobCompetencyRequirement,
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
  compAiAnalysisFromRow,
  compCandidateAiAnalysisFromRow,
  compAssessmentBlueprintFromRow,
  compAssessmentFromRow,
  compAssessmentTemplateFromRow,
  compAttachmentFromRow,
  compAuditLogFromRow,
  compCompetencyEvidenceFromRow,
  compCompetencyEvidenceSourceFromRow,
  compCompetencyFromRow,
  compCompetencyScoreFromRow,
  compDevelopmentActionFromRow,
  compDevelopmentPlanFromRow,
  compInterviewRatingFromRow,
  compJobCompetencyRequirementFromRow,
  compJobRoleConfigFromRow,
  compModuleAdminFromRow,
  compPanelGroupFromRow,
  compPanelistFromRow,
  compPanelistScoreFromRow,
  compQuestionBankFromRow,
  compQuestionBankPublicFromRow,
  compRoleAssignmentFromRow,
  profileLiteFromRow,
  type CompAiAnalysisRow,
  type CompCandidateAiAnalysisRow,
  type CompAssessmentBlueprintRow,
  type CompAssessmentRow,
  type CompAssessmentTemplateRow,
  type CompAttachmentRow,
  type CompAuditLogRow,
  type CompCompetencyEvidenceRow,
  type CompCompetencyEvidenceSourceRow,
  type CompCompetencyRow,
  type CompCompetencyScoreRow,
  type CompDevelopmentActionRow,
  type CompDevelopmentPlanRow,
  type CompInterviewRatingRow,
  type CompJobCompetencyRequirementRow,
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
import { pickDiverseQuestions } from '../lib/questionSelection'

// Fire-and-forget audit logging (spec section 31) — never blocks or fails the primary action it
// documents; comp_log_audit is a security-definer RPC any authenticated user may call, so this
// never needs its own error handling beyond "don't let it throw into the caller".
function logAudit(action: string, entityType: string, entityId: string | null, previous: unknown, next: unknown) {
  supabase.rpc('comp_log_audit', { p_action: action, p_entity_type: entityType, p_entity_id: entityId, p_previous: previous, p_new: next }).then()
}

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

function currentUserId(): string | null {
  return useAuthStore.getState().profile?.id ?? null
}

// idx_comp_assessment_blueprints_one_active_default allows one active default per role, so the
// previous default must be demoted before another is promoted. Returns true on failure.
async function clearOtherDefaultBlueprints(jobRole: string, keepId: string | null): Promise<boolean> {
  let query = supabase.from('comp_assessment_blueprints').update({ is_default: false }).eq('job_role', jobRole).eq('is_default', true)
  if (keepId) query = query.neq('id', keepId)
  const { error } = await query
  return reportError('تغییر الگوی پیش‌فرض', error)
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
  durationMinutes: number | null
  autoFinishOnTimeout: boolean
  panelSizeDefault: number
  questionMix: QuestionMixCell[]
}

/** Every field of a comp_job_role_config row an admin can edit through the new "مدل شایستگی و
 * مشاغل" catalog UI, EXCEPT job_role itself — the key is immutable once created (it's a foreign key
 * from comp_assessments/comp_question_bank/comp_job_competency_requirements), so it's only ever an
 * argument to addJobRole, never a field an update can change. */
export interface JobRoleCatalogInput {
  labelFa: string
  description: string
  active: boolean
  sortOrder: number
  allowedQuestionTypes: QuestionType[]
}

export interface CompetencyCatalogInput {
  key: string
  labelFa: string
  description: string
  domain: CompCompetencyDomain
  active: boolean
}

export interface EvidenceSourceInput {
  sourceType: CompEvidenceSourceType
  sourceRef: string
  weight: number
}

export interface AssessmentBlueprintInput {
  jobRole: JobRole
  title: string
  description: string
  isDefault: boolean
  active: boolean
  includesTechnical: boolean
  includesPersonality: boolean
  includesStructuredInterview: boolean
  includesExperience: boolean
  technicalTemplateId: string | null
  personalityTemplateId: string | null
}

/** The optional exam-design flags added in schema.sql Section 50 — an omitted field is sent as null,
 * which comp_set_exam_design treats as "leave unchanged". */
export interface ExamDesignExtras {
  needsStructuredInterview?: boolean
  includesExperience?: boolean
  blueprintId?: string
}

function blueprintToRowPayload(input: AssessmentBlueprintInput) {
  return {
    job_role: input.jobRole,
    title: input.title,
    description: input.description,
    is_default: input.isDefault,
    active: input.active,
    includes_technical: input.includesTechnical,
    includes_personality: input.includesPersonality,
    includes_structured_interview: input.includesStructuredInterview,
    includes_experience: input.includesExperience,
    technical_template_id: input.technicalTemplateId,
    personality_template_id: input.personalityTemplateId,
  }
}

/** Editable fields of a development action — every one optional on update (a partial patch). */
export interface DevelopmentActionInput {
  competencyId: string | null
  actionType: CompDevelopmentActionType
  title: string
  description: string
  currentLevel: number | null
  targetLevel: number | null
  priority: CompDevelopmentPriority
  dueDate: string | null
  status: CompDevelopmentActionStatus
  ownerId: string | null
  progressNote: string
}

export interface DevelopmentPlanInput {
  status: CompDevelopmentPlanStatus
  ownerId: string | null
  summary: string
  targetReviewDate: string | null
}

function developmentActionPatchToRow(patch: Partial<DevelopmentActionInput>) {
  const row: Record<string, unknown> = {}
  if (patch.competencyId !== undefined) row.competency_id = patch.competencyId
  if (patch.actionType !== undefined) row.action_type = patch.actionType
  if (patch.title !== undefined) row.title = patch.title
  if (patch.description !== undefined) row.description = patch.description
  if (patch.currentLevel !== undefined) row.current_level = patch.currentLevel
  if (patch.targetLevel !== undefined) row.target_level = patch.targetLevel
  if (patch.priority !== undefined) row.priority = patch.priority
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate || null
  if (patch.status !== undefined) row.status = patch.status
  if (patch.ownerId !== undefined) row.owner_id = patch.ownerId
  if (patch.progressNote !== undefined) row.progress_note = patch.progressNote
  return row
}

export interface JobCompetencyRequirementInput {
  competencyId: string
  requiredLevel: number
  isCritical: boolean
  weight: number
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
  /** Unified Competency Model catalog (comp_competencies, schema.sql Section 47) — a named
   * competency spanning technical and/or behavioral evidence, independent of any one job role. */
  competencies: CompCompetency[]
  /** Which competencies a given job role requires, and at what level/weight/criticality
   * (comp_job_competency_requirements) — fetched unfiltered (mirrors jobRoleConfigs/
   * assessmentTemplates), the "مدل شایستگی و مشاغل" settings UI filters to the selected role itself. */
  jobCompetencyRequirements: CompJobCompetencyRequirement[]
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
  /** Exam Design Panel decision (comp_set_exam_design RPC) — ASSESSMENT_DESIGNER/module-admin-only;
   * mirrors reopenAssessment's narrow-RPC-then-refresh shape. */
  setExamDesign: (assessmentId: string, needsPersonality: boolean, needsTechnical: boolean, extras?: ExamDesignExtras) => Promise<void>
  /** Copies a blueprint's method toggles onto one candidate and records which blueprint it was —
   * same RPC and permission as setExamDesign. */
  applyBlueprint: (assessmentId: string, blueprint: CompAssessmentBlueprint) => Promise<void>

  /** Assessment Blueprints (comp_assessment_blueprints, schema.sql Section 50) — fetched unfiltered
   * like assessmentTemplates; callers filter to a job role. */
  assessmentBlueprints: CompAssessmentBlueprint[]
  fetchAssessmentBlueprints: () => Promise<void>
  addAssessmentBlueprint: (input: AssessmentBlueprintInput) => Promise<void>
  updateAssessmentBlueprint: (id: string, input: AssessmentBlueprintInput) => Promise<void>

  /** Structured-interview ratings (comp_interview_ratings) for whichever assessments have been
   * fetched — every rater's rows, since RLS lets anyone with access to the assessment read them. */
  interviewRatings: CompInterviewRating[]
  fetchInterviewRatings: (assessmentId: string) => Promise<void>
  /** Upserts the CURRENT user's own rating of one competency (RLS only ever allows writing your own
   * row — unique on assessment + competency + rater). */
  saveInterviewRating: (assessmentId: string, competencyId: string, rating: number, notes: string) => Promise<boolean>

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
  /** Question Proposal Workflow (spec section 12) — any authenticated non-admin can propose a new
   * question; it lands as PENDING_REVIEW + inactive, owned by them (enforced by RLS), and never
   * enters live selection until an admin approves it. */
  proposeQuestion: (input: QuestionBankInput, reason: string) => Promise<boolean>
  approveQuestion: (id: string) => Promise<void>
  rejectQuestion: (id: string) => Promise<void>
  requestQuestionRevision: (id: string) => Promise<void>
  /** Never mutates the existing row — inserts a new version (same question_group_id, version + 1,
   * chained via superseded_by on the old row) so any assessment snapshot already pointing at the
   * old row keeps resolving to the exact wording/reference-answer that was actually used (spec
   * section 13). */
  updateQuestion: (id: string, input: QuestionBankInput) => Promise<void>
  /** Never a hard delete (spec section 13: "Question حذف فیزیکی نشود") — deactivating is the only
   * removal path, since a hard delete could make a question vanish from an assessment's already-
   * frozen snapshot (spec section 9). */
  setQuestionActive: (id: string, active: boolean) => Promise<void>

  fetchJobRoleConfigs: () => Promise<void>
  updateJobRoleConfig: (jobRole: JobRole, allowedQuestionTypes: QuestionType[]) => Promise<void>
  /** Adds a brand-new row to the job-role catalog — the entire point of turning JobRole into
   * runtime-driven data (see types.ts): adding "a future role" is now this one call, never a code
   * change. jobRole is the immutable slug key; validate it client-side before calling (see
   * CompetencySettingsPage's slug check) since RLS has no format constraint of its own. */
  addJobRole: (jobRole: string, input: JobRoleCatalogInput) => Promise<void>
  /** Edits every field of an existing catalog row except the immutable job_role key itself. */
  updateJobRole: (jobRole: JobRole, input: JobRoleCatalogInput) => Promise<void>

  /** Unified Competency Model catalog (comp_competencies) — any authenticated user may read it,
   * module admin or ASSESSMENT_DESIGNER may write (see schema.sql Section 47's RLS). */
  fetchCompetencies: () => Promise<void>
  addCompetency: (input: CompetencyCatalogInput) => Promise<void>
  updateCompetency: (id: string, input: CompetencyCatalogInput) => Promise<void>

  /** Per-job competency requirements (comp_job_competency_requirements) — same read/write RLS as
   * comp_competencies above. */
  fetchJobCompetencyRequirements: () => Promise<void>
  /** Insert-or-update on the (job_role, competency_id) unique constraint — one call handles both
   * "add a new requirement" and "edit an existing one", since the settings UI's add-requirement form
   * and its inline edit are the same shape. */
  upsertJobCompetencyRequirement: (jobRole: JobRole, input: JobCompetencyRequirementInput) => Promise<void>
  removeJobCompetencyRequirement: (id: string) => Promise<void>

  /** Evidence Engine wiring (comp_competency_evidence_sources, schema.sql Section 49) — which
   * assessment outputs feed each competency and with what weight. Same read/write RLS as
   * comp_competencies. */
  evidenceSources: CompCompetencyEvidenceSource[]
  fetchEvidenceSources: () => Promise<void>
  addEvidenceSource: (competencyId: string, input: EvidenceSourceInput) => Promise<void>
  updateEvidenceSourceWeight: (id: string, weight: number) => Promise<void>
  removeEvidenceSource: (id: string) => Promise<void>

  /** Competency Engine output per candidate (comp_competency_scores + comp_competency_evidence),
   * keyed by assessment id. Rows are only ever written server-side by comp_compute_competency_profile. */
  competencyProfileByAssessment: Record<string, CompCompetencyProfile>
  fetchCompetencyProfile: (assessmentId: string) => Promise<void>
  computeCompetencyProfile: (assessmentId: string) => Promise<void>
  /** Candidate → Competency → Evidence → Assessment Item drill-down (comp_get_competency_evidence_detail,
   * schema.sql Section 51) — read on demand when a competency is opened, never cached. */
  fetchCompetencyEvidenceDetail: (assessmentId: string, competencyId: string) => Promise<CompCompetencyEvidenceDetail | null>

  /** Reusable, named question-mix "recipes" per job role — the Assessment Designer wizard's saved
   * output (spec section 6/36). */
  assessmentTemplates: CompAssessmentTemplate[]
  fetchAssessmentTemplates: () => Promise<void>
  upsertAssessmentTemplate: (input: AssessmentTemplateInput) => Promise<string | null>
  deleteAssessmentTemplate: (id: string) => Promise<void>
  /** Generates one assessment's frozen question snapshot from a question-mix grid (replaces the old
   * fixed hardcoded target counts) — written once; re-running it on an assessment that already has
   * a selection is a no-op from the UI (guarded by callers). Also copies the template's target
   * duration/auto-finish choice onto this specific assessment. */
  assignQuestionsFromMix: (
    assessmentId: string,
    jobRole: JobRole,
    mix: QuestionMixCell[],
    durationMinutes: number | null,
    autoFinishOnTimeout: boolean,
  ) => Promise<void>
  /** Start/pause/reset the live, judge-controllable interview timer (comp_set_interview_timer) —
   * any panelist may call this, not just the lead, since whoever is actually running the interview
   * in the room needs control. Elapsed time is always computed server-side from real clock time. */
  setInterviewTimer: (assessmentId: string, action: 'start' | 'pause' | 'reset') => Promise<void>

  /** Admin-only, read via comp_log_audit()-written rows (spec section 31) — never written directly
   * by the client. */
  auditLog: CompAuditLogEntry[]
  fetchAuditLog: () => Promise<void>
  /** The only way out of a locked/completed assessment (spec section 30) — admin-only, clears the
   * assessment status and every panelist's submitted_at so judges can score again. */
  reopenAssessment: (assessmentId: string) => Promise<void>

  /** Gemini AI Analysis (spec section 18-27) — keyed by assessment id, holding the latest generated
   * analysis (if any) for whichever assessments have been fetched. */
  aiAnalysisByAssessment: Record<string, CompAiAnalysis | null>
  aiAnalysisLoading: Record<string, boolean>
  fetchAiAnalysis: (assessmentId: string) => Promise<void>
  /** Calls the comp-gemini-analysis Edge Function, which does all the real work server-side
   * (reading the assessment via the caller's own JWT, calling Gemini, persisting the result) —
   * this just invokes it and refreshes the local cache from what it returns. */
  generateAiAnalysis: (assessmentId: string) => Promise<{ error: string | null }>

  /** Unified Candidate AI Analysis (spec follow-up) — ONE comprehensive analysis (technical +
   * personality + job-fit) per assessment, replacing aiAnalysisByAssessment/personality's own
   * aiAnalysisByAssessment as the module's single AI-generation surface. Keyed by comp_assessments
   * id, same caching/regeneration pattern as the two superseded analyses. */
  candidateAiAnalysisByAssessment: Record<string, CandidateAiAnalysis | null>
  candidateAiAnalysisLoading: Record<string, boolean>
  fetchCandidateAiAnalysis: (assessmentId: string) => Promise<void>
  /** Calls the comp-candidate-ai-analysis Edge Function, which does all the real work server-side
   * (reading whichever of technical/personality data is available via the caller's own JWT, calling
   * Gemini once, persisting the result) — this just invokes it and refreshes the local cache. */
  generateCandidateAiAnalysis: (assessmentId: string) => Promise<{ error: string | null }>

  /** Individual Development Plans (comp_development_plans, schema.sql Section 52) — every plan the
   * viewer can read (RLS-scoped), kept for dashboard badges; actions are fetched per plan. */
  developmentPlans: CompDevelopmentPlan[]
  developmentActionsByPlan: Record<string, CompDevelopmentAction[]>
  fetchDevelopmentPlans: () => Promise<void>
  /** Loads one assessment's open (non-cancelled) plan and its actions. */
  fetchDevelopmentPlan: (assessmentId: string) => Promise<void>
  /** comp_seed_development_plan — creates/reuses the DRAFT plan and adds gap-driven suggestions
   * (idempotent), then refreshes the local copy. */
  seedDevelopmentPlan: (assessmentId: string) => Promise<CompDevelopmentPlanSeedResult | null>
  updateDevelopmentPlan: (planId: string, patch: Partial<DevelopmentPlanInput>) => Promise<void>
  addDevelopmentAction: (planId: string, input: DevelopmentActionInput) => Promise<void>
  updateDevelopmentAction: (actionId: string, patch: Partial<DevelopmentActionInput>) => Promise<void>
  removeDevelopmentAction: (actionId: string) => Promise<void>

  /** comp_create_reassessment — returns the follow-up assessment's id (an existing follow-up is
   * returned as-is) and adds it to the local list. */
  createReassessment: (assessmentId: string) => Promise<string | null>
  /** comp_get_reassessment_comparison — read on demand, never cached; null when the assessment has
   * no predecessor. */
  fetchReassessmentComparison: (assessmentId: string) => Promise<CompReassessmentComparison | null>
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
  competencies: [],
  jobCompetencyRequirements: [],
  evidenceSources: [],
  competencyProfileByAssessment: {},
  assessmentTemplates: [],
  assessmentBlueprints: [],
  interviewRatings: [],
  auditLog: [],
  aiAnalysisByAssessment: {},
  aiAnalysisLoading: {},
  candidateAiAnalysisByAssessment: {},
  candidateAiAnalysisLoading: {},
  developmentPlans: [],
  developmentActionsByPlan: {},
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
      needsPersonalityAssessment: false,
      needsTechnicalAssessment: true,
      needsStructuredInterview: false,
      includesExperience: true,
      blueprintId: null,
      previousAssessmentId: null,
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
      durationMinutes: null,
      autoFinishOnTimeout: false,
      interviewTimerStartedAt: null,
      interviewTimerElapsedSeconds: 0,
      interviewTimerRunning: false,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    }
    // The job role's active default blueprint is applied server-side at INSERT time
    // (comp_assessments_apply_default_blueprint, schema.sql Section 51), so the design flags above
    // are only the column defaults — read back what the trigger actually set.
    const { data: design } = await supabase
      .from('comp_assessments')
      .select('blueprint_id, needs_technical_assessment, needs_personality_assessment, needs_structured_interview, includes_experience')
      .eq('id', id)
      .maybeSingle()
    if (design) {
      created.blueprintId = design.blueprint_id ?? null
      created.needsTechnicalAssessment = design.needs_technical_assessment
      created.needsPersonalityAssessment = design.needs_personality_assessment
      created.needsStructuredInterview = design.needs_structured_interview
      created.includesExperience = design.includes_experience
    }
    set({ assessments: [created, ...get().assessments] })
    logAudit('ASSESSMENT_CREATED', 'comp_assessments', id, null, { candidateName: profile.candidateName, jobRole: profile.jobRole })
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
    const previousStatus = get().assessments.find((a) => a.id === id)?.status ?? null
    const { error } = await supabase.from('comp_assessments').update({ status }).eq('id', id)
    if (reportError('بروزرسانی وضعیت ارزیابی', error)) return
    set({ assessments: get().assessments.map((a) => (a.id === id ? { ...a, status } : a)) })
    if (status === 'completed') logAudit('ASSESSMENT_FINALIZED', 'comp_assessments', id, { status: previousStatus }, { status })
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
    logAudit('JUDGE_ASSIGNED', 'comp_panelists', assessmentId, null, { userId, isLead })
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

  setExamDesign: async (assessmentId, needsPersonality, needsTechnical, extras) => {
    const previous = get().assessments
    set({
      assessments: previous.map((a) =>
        a.id === assessmentId
          ? {
              ...a,
              needsPersonalityAssessment: needsPersonality,
              needsTechnicalAssessment: needsTechnical,
              needsStructuredInterview: extras?.needsStructuredInterview ?? a.needsStructuredInterview,
              includesExperience: extras?.includesExperience ?? a.includesExperience,
              blueprintId: extras?.blueprintId ?? a.blueprintId,
            }
          : a,
      ),
    })
    const { error } = await supabase.rpc('comp_set_exam_design', {
      p_assessment_id: assessmentId,
      p_needs_personality: needsPersonality,
      p_needs_technical: needsTechnical,
      p_needs_structured_interview: extras?.needsStructuredInterview ?? null,
      p_includes_experience: extras?.includesExperience ?? null,
      p_blueprint_id: extras?.blueprintId ?? null,
    })
    if (reportError('ثبت طرح آزمون', error)) set({ assessments: previous })
  },

  applyBlueprint: async (assessmentId, blueprint) => {
    await get().setExamDesign(assessmentId, blueprint.includesPersonality, blueprint.includesTechnical, {
      needsStructuredInterview: blueprint.includesStructuredInterview,
      includesExperience: blueprint.includesExperience,
      blueprintId: blueprint.id,
    })
  },

  fetchAssessmentBlueprints: async () => {
    const { data, error } = await supabase.from('comp_assessment_blueprints').select('*').order('job_role').order('created_at')
    if (reportError('بارگذاری الگوهای ارزیابی', error)) return
    set({ assessmentBlueprints: ((data ?? []) as CompAssessmentBlueprintRow[]).map(compAssessmentBlueprintFromRow) })
  },

  // Refetches after every write rather than merging locally: version is bumped server-side (see
  // comp_assessment_blueprints_bump_version), so a local merge would show a stale version.
  addAssessmentBlueprint: async (input) => {
    if (input.isDefault && input.active && (await clearOtherDefaultBlueprints(input.jobRole, null))) return
    const { error } = await supabase.from('comp_assessment_blueprints').insert({ id: crypto.randomUUID(), ...blueprintToRowPayload(input) })
    if (reportError('ثبت الگوی ارزیابی', error)) return
    await get().fetchAssessmentBlueprints()
  },

  updateAssessmentBlueprint: async (id, input) => {
    if (input.isDefault && input.active && (await clearOtherDefaultBlueprints(input.jobRole, id))) return
    const { error } = await supabase.from('comp_assessment_blueprints').update(blueprintToRowPayload(input)).eq('id', id)
    if (reportError('ذخیره الگوی ارزیابی', error)) return
    await get().fetchAssessmentBlueprints()
  },

  fetchInterviewRatings: async (assessmentId) => {
    const { data, error } = await supabase.from('comp_interview_ratings').select('*').eq('assessment_id', assessmentId)
    if (reportError('بارگذاری امتیازهای مصاحبه ساختاریافته', error)) return
    set({
      interviewRatings: [
        ...get().interviewRatings.filter((r) => r.assessmentId !== assessmentId),
        ...((data ?? []) as CompInterviewRatingRow[]).map(compInterviewRatingFromRow),
      ],
    })
  },

  saveInterviewRating: async (assessmentId, competencyId, rating, notes) => {
    const uid = currentUserId()
    if (!uid) return false
    const existing = get().interviewRatings.find((r) => r.assessmentId === assessmentId && r.competencyId === competencyId && r.raterId === uid)
    const id = existing?.id ?? crypto.randomUUID()
    const { error } = await supabase
      .from('comp_interview_ratings')
      .upsert({ id, assessment_id: assessmentId, competency_id: competencyId, rater_id: uid, rating, notes }, { onConflict: 'assessment_id,competency_id,rater_id' })
    if (reportError('ثبت امتیاز مصاحبه ساختاریافته', error)) return false
    const now = new Date().toISOString()
    const merged: CompInterviewRating = {
      id,
      assessmentId,
      competencyId,
      raterId: uid,
      rating,
      notes,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    set({
      interviewRatings: [
        ...get().interviewRatings.filter((r) => !(r.assessmentId === assessmentId && r.competencyId === competencyId && r.raterId === uid)),
        merged,
      ],
    })
    return true
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
    logAudit('SCORE_SUBMITTED', 'comp_panelist_scores', assessmentId, null, { submittedAt: now })
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
      usageCount: 0,
      proposalReason: '',
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    }
    set({ questionBank: [created, ...get().questionBank] })
    logAudit('QUESTION_CREATED', 'comp_question_bank', id, null, { jobRole: input.jobRole, category: input.category, questionText: input.questionText })
  },

  proposeQuestion: async (input, reason) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const uid = currentUserId()
    const { error } = await supabase.from('comp_question_bank').insert({
      id,
      question_group_id: id,
      version: 1,
      ...questionBankToRowPayload(input),
      // Forced AFTER the spread, overriding whatever `input.active` says — a proposer can never
      // self-approve or self-activate a question (enforced again, independently, by RLS's own
      // insert check, which would reject this row outright if these two didn't match).
      approval_status: 'PENDING_REVIEW',
      active: false,
      proposal_reason: reason,
    })
    if (reportError('ثبت پیشنهاد سؤال', error)) return false
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
      active: false,
      weight: input.weight,
      approvalStatus: 'PENDING_REVIEW',
      questionGroupId: id,
      version: 1,
      supersededBy: null,
      usageCount: 0,
      proposalReason: reason,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    }
    set({ questionBank: [created, ...get().questionBank] })
    logAudit('QUESTION_PROPOSED', 'comp_question_bank', id, null, { jobRole: input.jobRole, questionText: input.questionText, reason })
    return true
  },

  approveQuestion: async (id) => {
    const previous = get().questionBank
    set({ questionBank: previous.map((q) => (q.id === id ? { ...q, approvalStatus: 'APPROVED', active: true } : q)) })
    const { error } = await supabase.from('comp_question_bank').update({ approval_status: 'APPROVED', active: true }).eq('id', id)
    if (reportError('تأیید سؤال پیشنهادی', error)) {
      set({ questionBank: previous })
      return
    }
    logAudit('QUESTION_APPROVED', 'comp_question_bank', id, { approvalStatus: 'PENDING_REVIEW' }, { approvalStatus: 'APPROVED' })
  },

  rejectQuestion: async (id) => {
    const previous = get().questionBank
    set({ questionBank: previous.map((q) => (q.id === id ? { ...q, approvalStatus: 'REJECTED' } : q)) })
    const { error } = await supabase.from('comp_question_bank').update({ approval_status: 'REJECTED' }).eq('id', id)
    if (reportError('رد سؤال پیشنهادی', error)) {
      set({ questionBank: previous })
      return
    }
    logAudit('QUESTION_REJECTED', 'comp_question_bank', id, null, { approvalStatus: 'REJECTED' })
  },

  requestQuestionRevision: async (id) => {
    const previous = get().questionBank
    set({ questionBank: previous.map((q) => (q.id === id ? { ...q, approvalStatus: 'NEEDS_REVISION' } : q)) })
    const { error } = await supabase.from('comp_question_bank').update({ approval_status: 'NEEDS_REVISION' }).eq('id', id)
    if (reportError('درخواست اصلاح سؤال پیشنهادی', error)) set({ questionBank: previous })
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
      usageCount: 0,
      proposalReason: '',
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    }
    set({
      questionBank: [created, ...previous.map((q) => (q.id === id ? { ...q, supersededBy: newId, active: false, updatedAt: now } : q))],
    })
    logAudit('QUESTION_EDITED', 'comp_question_bank', id, { version: old.version }, { newQuestionId: newId, version: old.version + 1 })
  },

  setQuestionActive: async (id, active) => {
    const previous = get().questionBank
    set({ questionBank: previous.map((q) => (q.id === id ? { ...q, active } : q)) })
    const { error } = await supabase.from('comp_question_bank').update({ active }).eq('id', id)
    if (reportError('تغییر وضعیت فعال‌بودن سؤال', error)) set({ questionBank: previous })
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

  addJobRole: async (jobRole, input) => {
    const now = new Date().toISOString()
    const uid = currentUserId()
    const { error } = await supabase.from('comp_job_role_config').insert({
      job_role: jobRole,
      label_fa: input.labelFa,
      description: input.description,
      active: input.active,
      sort_order: input.sortOrder,
      allowed_question_types: input.allowedQuestionTypes,
      updated_by: uid,
    })
    if (reportError('ثبت شغل جدید', error)) return
    const created: CompJobRoleConfig = {
      jobRole,
      labelFa: input.labelFa,
      description: input.description,
      active: input.active,
      sortOrder: input.sortOrder,
      allowedQuestionTypes: input.allowedQuestionTypes,
      updatedBy: uid,
      updatedAt: now,
      createdAt: now,
    }
    set({ jobRoleConfigs: [...get().jobRoleConfigs, created] })
    logAudit('JOB_ROLE_CREATED', 'comp_job_role_config', jobRole, null, { jobRole, labelFa: input.labelFa })
  },

  updateJobRole: async (jobRole, input) => {
    const previous = get().jobRoleConfigs
    const now = new Date().toISOString()
    set({
      jobRoleConfigs: previous.map((c) =>
        c.jobRole === jobRole
          ? { ...c, labelFa: input.labelFa, description: input.description, active: input.active, sortOrder: input.sortOrder, allowedQuestionTypes: input.allowedQuestionTypes, updatedAt: now }
          : c,
      ),
    })
    const { error } = await supabase
      .from('comp_job_role_config')
      .update({
        label_fa: input.labelFa,
        description: input.description,
        active: input.active,
        sort_order: input.sortOrder,
        allowed_question_types: input.allowedQuestionTypes,
      })
      .eq('job_role', jobRole)
    if (reportError('ذخیره تغییرات شغل', error)) set({ jobRoleConfigs: previous })
  },

  fetchCompetencies: async () => {
    const { data, error } = await supabase.from('comp_competencies').select('*').order('label_fa')
    if (reportError('بارگذاری کاتالوگ شایستگی‌ها', error)) return
    set({ competencies: ((data ?? []) as CompCompetencyRow[]).map(compCompetencyFromRow) })
  },

  // Proficiency levels aren't yet editable from the UI (this phase is catalog/model only) and the
  // database fills them from its own default — refetching rather than guessing that default locally
  // keeps the local row from ever lying about what's actually stored (same reasoning as
  // createPanelGroup's own refetch-after-insert below).
  addCompetency: async (input) => {
    const { error } = await supabase.from('comp_competencies').insert({
      id: crypto.randomUUID(),
      key: input.key,
      label_fa: input.labelFa,
      description: input.description,
      domain: input.domain,
      active: input.active,
    })
    if (reportError('ثبت شایستگی جدید', error)) return
    await get().fetchCompetencies()
  },

  updateCompetency: async (id, input) => {
    const previous = get().competencies
    const now = new Date().toISOString()
    set({
      competencies: previous.map((c) =>
        c.id === id ? { ...c, key: input.key, labelFa: input.labelFa, description: input.description, domain: input.domain, active: input.active, updatedAt: now } : c,
      ),
    })
    const { error } = await supabase
      .from('comp_competencies')
      .update({ key: input.key, label_fa: input.labelFa, description: input.description, domain: input.domain, active: input.active })
      .eq('id', id)
    if (reportError('ذخیره تغییرات شایستگی', error)) set({ competencies: previous })
  },

  fetchJobCompetencyRequirements: async () => {
    const { data, error } = await supabase.from('comp_job_competency_requirements').select('*')
    if (reportError('بارگذاری الزامات شایستگی مشاغل', error)) return
    set({ jobCompetencyRequirements: ((data ?? []) as CompJobCompetencyRequirementRow[]).map(compJobCompetencyRequirementFromRow) })
  },

  upsertJobCompetencyRequirement: async (jobRole, input) => {
    const uid = currentUserId()
    const now = new Date().toISOString()
    const existing = get().jobCompetencyRequirements.find((r) => r.jobRole === jobRole && r.competencyId === input.competencyId)
    const id = existing?.id ?? crypto.randomUUID()
    const { error } = await supabase.from('comp_job_competency_requirements').upsert(
      {
        id,
        job_role: jobRole,
        competency_id: input.competencyId,
        required_level: input.requiredLevel,
        is_critical: input.isCritical,
        weight: input.weight,
      },
      { onConflict: 'job_role,competency_id' },
    )
    if (reportError('ثبت الزام شایستگی', error)) return
    const merged: CompJobCompetencyRequirement = {
      id,
      jobRole,
      competencyId: input.competencyId,
      requiredLevel: input.requiredLevel,
      isCritical: input.isCritical,
      weight: input.weight,
      createdBy: existing?.createdBy ?? uid,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      updatedBy: uid,
    }
    set({
      jobCompetencyRequirements: [...get().jobCompetencyRequirements.filter((r) => !(r.jobRole === jobRole && r.competencyId === input.competencyId)), merged],
    })
  },

  removeJobCompetencyRequirement: async (id) => {
    const previous = get().jobCompetencyRequirements
    set({ jobCompetencyRequirements: previous.filter((r) => r.id !== id) })
    const { error } = await supabase.from('comp_job_competency_requirements').delete().eq('id', id)
    if (reportError('حذف الزام شایستگی', error)) set({ jobCompetencyRequirements: previous })
  },

  fetchEvidenceSources: async () => {
    const { data, error } = await supabase.from('comp_competency_evidence_sources').select('*')
    if (reportError('بارگذاری منابع شواهد شایستگی', error)) return
    set({ evidenceSources: ((data ?? []) as CompCompetencyEvidenceSourceRow[]).map(compCompetencyEvidenceSourceFromRow) })
  },

  addEvidenceSource: async (competencyId, input) => {
    const { data, error } = await supabase
      .from('comp_competency_evidence_sources')
      .insert({ competency_id: competencyId, source_type: input.sourceType, source_ref: input.sourceRef, weight: input.weight })
      .select('*')
      .single()
    if (reportError('افزودن منبع شواهد', error) || !data) return
    set({ evidenceSources: [...get().evidenceSources, compCompetencyEvidenceSourceFromRow(data as CompCompetencyEvidenceSourceRow)] })
  },

  updateEvidenceSourceWeight: async (id, weight) => {
    const previous = get().evidenceSources
    set({ evidenceSources: previous.map((s) => (s.id === id ? { ...s, weight, updatedAt: new Date().toISOString() } : s)) })
    const { error } = await supabase.from('comp_competency_evidence_sources').update({ weight }).eq('id', id)
    if (reportError('ذخیره وزن منبع شواهد', error)) set({ evidenceSources: previous })
  },

  removeEvidenceSource: async (id) => {
    const previous = get().evidenceSources
    set({ evidenceSources: previous.filter((s) => s.id !== id) })
    const { error } = await supabase.from('comp_competency_evidence_sources').delete().eq('id', id)
    if (reportError('حذف منبع شواهد', error)) set({ evidenceSources: previous })
  },

  fetchCompetencyProfile: async (assessmentId) => {
    const [scoresRes, evidenceRes] = await Promise.all([
      supabase.from('comp_competency_scores').select('*').eq('assessment_id', assessmentId),
      supabase.from('comp_competency_evidence').select('*').eq('assessment_id', assessmentId),
    ])
    if (reportError('بارگذاری پروفایل شایستگی', scoresRes.error ?? evidenceRes.error)) return
    set({
      competencyProfileByAssessment: {
        ...get().competencyProfileByAssessment,
        [assessmentId]: {
          scores: ((scoresRes.data ?? []) as CompCompetencyScoreRow[]).map(compCompetencyScoreFromRow),
          evidence: ((evidenceRes.data ?? []) as CompCompetencyEvidenceRow[]).map(compCompetencyEvidenceFromRow),
        },
      },
    })
  },

  computeCompetencyProfile: async (assessmentId) => {
    const { error } = await supabase.rpc('comp_compute_competency_profile', { p_assessment_id: assessmentId })
    if (reportError('محاسبه پروفایل شایستگی', error)) return
    await get().fetchCompetencyProfile(assessmentId)
  },

  fetchCompetencyEvidenceDetail: async (assessmentId, competencyId) => {
    const { data, error } = await supabase.rpc('comp_get_competency_evidence_detail', {
      p_assessment_id: assessmentId,
      p_competency_id: competencyId,
    })
    if (reportError('بارگذاری شواهد شایستگی', error)) return null
    return (data ?? null) as CompCompetencyEvidenceDetail | null
  },

  // Generates one assessment's frozen question snapshot from an Assessment Designer question-mix
  // grid (spec section 6-9): for every {category, difficulty, count} cell, picks `count` random
  // active+approved bank rows of exactly that type/difficulty (or every one available if the bank
  // has fewer than requested — the designer's own availability-check step is what should have
  // caught that beforehand). Replaces the old fixed hardcoded target counts entirely.
  assignQuestionsFromMix: async (assessmentId, jobRole, mix, durationMinutes, autoFinishOnTimeout) => {
    let bank = get().questionBank.filter((q) => q.jobRole === jobRole && q.active && q.approvalStatus === 'APPROVED')
    if (bank.length === 0) {
      const { data, error } = await supabase
        .from('comp_question_bank')
        .select('*')
        .eq('job_role', jobRole)
        .eq('active', true)
        .eq('approval_status', 'APPROVED')
      if (reportError('بارگذاری بانک سؤالات', error)) return
      bank = ((data ?? []) as CompQuestionBankRow[]).map(compQuestionBankFromRow)
    }
    // Cross-cell running list of already-picked question texts, so the similarity check also
    // catches a near-duplicate landing in two different category/difficulty cells, not just within
    // the same cell.
    const pickedTexts: string[] = []
    const selectedItems = mix
      .filter((cell) => cell.count > 0)
      .flatMap((cell) => {
        const pool = bank.filter((q) => q.category === cell.category && q.difficulty === cell.difficulty)
        const picked = pickDiverseQuestions(pool, cell.count, pickedTexts)
        pickedTexts.push(...picked.map((q) => q.questionText))
        return picked
      })
    const selected = selectedItems.map((q) => q.id)
    const current = get().assessments.find((a) => a.id === assessmentId)
    if (!current) return
    set({
      assessments: get().assessments.map((a) =>
        a.id === assessmentId ? { ...a, selectedQuestionIds: selected, durationMinutes, autoFinishOnTimeout } : a,
      ),
    })
    const { error } = await supabase
      .from('comp_assessments')
      .update({ selected_question_ids: selected, duration_minutes: durationMinutes, auto_finish_on_timeout: autoFinishOnTimeout })
      .eq('id', assessmentId)
    if (reportError('تولید آزمون از روی طرح سؤال', error)) {
      set({ assessments: get().assessments.map((a) => (a.id === assessmentId ? current : a)) })
      return
    }
    if (selected.length > 0) {
      // Best-effort — a failure here only means the "previous usage" preference is slightly stale
      // next time, never a reason to roll back the assessment's actual question selection above.
      await supabase.rpc('comp_increment_question_usage', { p_ids: selected })
    }
    logAudit('QUESTION_GENERATED', 'comp_assessments', assessmentId, null, { jobRole, count: selected.length })
  },

  // comp_set_interview_timer computes elapsed time server-side from real clock time, so the
  // optimistic local update below mirrors that exact math rather than trusting a client clock —
  // any drift self-corrects the next time this assessment is refetched.
  setInterviewTimer: async (assessmentId, action) => {
    const current = get().assessments.find((a) => a.id === assessmentId)
    if (!current) return
    const nowIso = new Date().toISOString()
    let next: CompetencyAssessment = current
    if (action === 'start' && !current.interviewTimerRunning) {
      next = { ...current, interviewTimerRunning: true, interviewTimerStartedAt: nowIso }
    } else if (action === 'pause' && current.interviewTimerRunning && current.interviewTimerStartedAt) {
      const elapsedSinceStart = Math.max(0, Math.floor((Date.now() - new Date(current.interviewTimerStartedAt).getTime()) / 1000))
      next = {
        ...current,
        interviewTimerRunning: false,
        interviewTimerStartedAt: null,
        interviewTimerElapsedSeconds: current.interviewTimerElapsedSeconds + elapsedSinceStart,
      }
    } else if (action === 'reset') {
      next = { ...current, interviewTimerRunning: false, interviewTimerStartedAt: null, interviewTimerElapsedSeconds: 0 }
    }
    set({ assessments: get().assessments.map((a) => (a.id === assessmentId ? next : a)) })
    const { error } = await supabase.rpc('comp_set_interview_timer', { p_assessment_id: assessmentId, p_action: action })
    if (reportError('کنترل تایمر مصاحبه', error)) {
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
          auto_finish_on_timeout: input.autoFinishOnTimeout,
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
      auto_finish_on_timeout: input.autoFinishOnTimeout,
      panel_size_default: input.panelSizeDefault,
      question_mix: input.questionMix,
    })
    if (reportError('ثبت طرح آزمون', error)) return null
    const created: CompAssessmentTemplate = {
      id,
      jobRole: input.jobRole,
      title: input.title,
      durationMinutes: input.durationMinutes,
      autoFinishOnTimeout: input.autoFinishOnTimeout,
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

  fetchAuditLog: async () => {
    const { data, error } = await supabase.from('comp_audit_log').select('*').order('created_at', { ascending: false }).limit(200)
    if (reportError('بارگذاری گزارش رویدادها', error)) return
    set({ auditLog: ((data ?? []) as CompAuditLogRow[]).map(compAuditLogFromRow) })
  },

  reopenAssessment: async (assessmentId) => {
    const { error } = await supabase.rpc('comp_reopen_assessment', { p_assessment_id: assessmentId })
    if (reportError('بازگشایی ارزیابی', error)) return
    // fetchAll() re-pulls both comp_assessments and comp_panelist_scores in one go, so the
    // now-cleared status and submitted_at flags show up everywhere without a second round trip.
    await get().fetchAll()
  },

  fetchAiAnalysis: async (assessmentId) => {
    const { data, error } = await supabase
      .from('comp_ai_analysis')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (reportError('بارگذاری تحلیل هوشمند', error)) return
    set({
      aiAnalysisByAssessment: { ...get().aiAnalysisByAssessment, [assessmentId]: data ? compAiAnalysisFromRow(data as CompAiAnalysisRow) : null },
    })
  },

  generateAiAnalysis: async (assessmentId) => {
    set({ aiAnalysisLoading: { ...get().aiAnalysisLoading, [assessmentId]: true } })
    const { data, error } = await supabase.functions.invoke('comp-gemini-analysis', { body: { assessmentId } })
    set({ aiAnalysisLoading: { ...get().aiAnalysisLoading, [assessmentId]: false } })
    let functionError = (data as { error?: string } | null)?.error
    // On a non-2xx response, supabase-js sets `data` to null and puts the raw Response on
    // `error.context` instead of surfacing the function's own JSON error body — without reading it
    // ourselves here, every failure looks like the same useless "non-2xx status code" message.
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
      useSystemStore.getState().setStorageError(`خطا در تحلیل هوشمند: ${message}`)
      return { error: message }
    }
    const analysis = (data as { analysis?: CompAiAnalysisRow } | null)?.analysis
    if (analysis) {
      set({ aiAnalysisByAssessment: { ...get().aiAnalysisByAssessment, [assessmentId]: compAiAnalysisFromRow(analysis) } })
    }
    return { error: null }
  },

  fetchCandidateAiAnalysis: async (assessmentId) => {
    const { data, error } = await supabase
      .from('comp_candidate_ai_analysis')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (reportError('بارگذاری تحلیل جامع هوشمند', error)) return
    set({
      candidateAiAnalysisByAssessment: {
        ...get().candidateAiAnalysisByAssessment,
        [assessmentId]: data ? compCandidateAiAnalysisFromRow(data as CompCandidateAiAnalysisRow) : null,
      },
    })
  },

  generateCandidateAiAnalysis: async (assessmentId) => {
    set({ candidateAiAnalysisLoading: { ...get().candidateAiAnalysisLoading, [assessmentId]: true } })
    const { data, error } = await supabase.functions.invoke('comp-candidate-ai-analysis', { body: { assessmentId } })
    set({ candidateAiAnalysisLoading: { ...get().candidateAiAnalysisLoading, [assessmentId]: false } })
    let functionError = (data as { error?: string } | null)?.error
    // On a non-2xx response, supabase-js sets `data` to null and puts the raw Response on
    // `error.context` instead of surfacing the function's own JSON error body — without reading it
    // ourselves here, every failure looks like the same useless "non-2xx status code" message.
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
      useSystemStore.getState().setStorageError(`خطا در تحلیل جامع هوشمند: ${message}`)
      return { error: message }
    }
    const analysis = (data as { analysis?: CompCandidateAiAnalysisRow } | null)?.analysis
    if (analysis) {
      set({ candidateAiAnalysisByAssessment: { ...get().candidateAiAnalysisByAssessment, [assessmentId]: compCandidateAiAnalysisFromRow(analysis) } })
    }
    // The Edge Function recomputes the competency profile before grounding the analysis in it —
    // refresh the local copy so the staleness check compares against the same numbers.
    await get().fetchCompetencyProfile(assessmentId)
    return { error: null }
  },

  fetchDevelopmentPlans: async () => {
    const { data, error } = await supabase.from('comp_development_plans').select('*')
    if (reportError('بارگذاری برنامه‌های توسعه فردی', error)) return
    set({ developmentPlans: ((data ?? []) as CompDevelopmentPlanRow[]).map(compDevelopmentPlanFromRow) })
  },

  fetchDevelopmentPlan: async (assessmentId) => {
    const { data, error } = await supabase
      .from('comp_development_plans')
      .select('*')
      .eq('assessment_id', assessmentId)
      .neq('status', 'CANCELLED')
      .maybeSingle()
    if (reportError('بارگذاری برنامه توسعه فردی', error)) return
    const others = get().developmentPlans.filter((p) => p.assessmentId !== assessmentId || p.status === 'CANCELLED')
    if (!data) {
      set({ developmentPlans: others })
      return
    }
    const plan = compDevelopmentPlanFromRow(data as CompDevelopmentPlanRow)
    const { data: actions, error: actionsError } = await supabase
      .from('comp_development_actions')
      .select('*')
      .eq('plan_id', plan.id)
      .order('sort_order')
      .order('created_at')
    if (reportError('بارگذاری اقدامات توسعه', actionsError)) return
    set({
      developmentPlans: [...others, plan],
      developmentActionsByPlan: {
        ...get().developmentActionsByPlan,
        [plan.id]: ((actions ?? []) as CompDevelopmentActionRow[]).map(compDevelopmentActionFromRow),
      },
    })
  },

  seedDevelopmentPlan: async (assessmentId) => {
    const { data, error } = await supabase.rpc('comp_seed_development_plan', { p_assessment_id: assessmentId })
    if (reportError('تولید برنامه توسعه از روی شکاف‌ها', error)) return null
    await get().fetchDevelopmentPlan(assessmentId)
    return (data ?? null) as CompDevelopmentPlanSeedResult | null
  },

  updateDevelopmentPlan: async (planId, patch) => {
    const previous = get().developmentPlans
    const current = previous.find((p) => p.id === planId)
    if (!current) return
    set({ developmentPlans: previous.map((p) => (p.id === planId ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)) })
    const row: Record<string, unknown> = {}
    if (patch.status !== undefined) row.status = patch.status
    if (patch.ownerId !== undefined) row.owner_id = patch.ownerId
    if (patch.summary !== undefined) row.summary = patch.summary
    if (patch.targetReviewDate !== undefined) row.target_review_date = patch.targetReviewDate || null
    const { error } = await supabase.from('comp_development_plans').update(row).eq('id', planId)
    if (reportError('ذخیره برنامه توسعه فردی', error)) {
      set({ developmentPlans: previous })
      return
    }
    if (patch.status !== undefined && patch.status !== current.status) {
      logAudit('DEVELOPMENT_PLAN_STATUS_CHANGED', 'comp_assessments', current.assessmentId, { planId, status: current.status }, { planId, status: patch.status })
    }
  },

  addDevelopmentAction: async (planId, input) => {
    const existing = get().developmentActionsByPlan[planId] ?? []
    const id = crypto.randomUUID()
    const sortOrder = existing.reduce((max, a) => Math.max(max, a.sortOrder), 0) + 1
    const { error } = await supabase
      .from('comp_development_actions')
      .insert({ id, plan_id: planId, source: 'MANUAL', sort_order: sortOrder, ...developmentActionPatchToRow(input) })
    if (reportError('افزودن اقدام توسعه', error)) return
    const now = new Date().toISOString()
    const created: CompDevelopmentAction = {
      id,
      planId,
      ...input,
      source: 'MANUAL' as CompDevelopmentActionSource,
      sortOrder,
      completedAt: input.status === 'DONE' ? now : null,
      createdAt: now,
      updatedAt: now,
    }
    set({ developmentActionsByPlan: { ...get().developmentActionsByPlan, [planId]: [...existing, created] } })
  },

  updateDevelopmentAction: async (actionId, patch) => {
    const byPlan = get().developmentActionsByPlan
    const planId = Object.keys(byPlan).find((k) => byPlan[k].some((a) => a.id === actionId))
    if (!planId) return
    const previous = byPlan[planId]
    const now = new Date().toISOString()
    set({
      developmentActionsByPlan: {
        ...byPlan,
        [planId]: previous.map((a) => {
          if (a.id !== actionId) return a
          const next = { ...a, ...patch, updatedAt: now }
          // Mirrors comp_development_actions_track_completion so the badge updates immediately.
          if (patch.status !== undefined) next.completedAt = patch.status === 'DONE' ? (a.status === 'DONE' ? a.completedAt : now) : null
          return next
        }),
      },
    })
    const { error } = await supabase.from('comp_development_actions').update(developmentActionPatchToRow(patch)).eq('id', actionId)
    if (reportError('ذخیره اقدام توسعه', error)) {
      set({ developmentActionsByPlan: { ...get().developmentActionsByPlan, [planId]: previous } })
    }
  },

  removeDevelopmentAction: async (actionId) => {
    const byPlan = get().developmentActionsByPlan
    const planId = Object.keys(byPlan).find((k) => byPlan[k].some((a) => a.id === actionId))
    if (!planId) return
    const previous = byPlan[planId]
    set({ developmentActionsByPlan: { ...byPlan, [planId]: previous.filter((a) => a.id !== actionId) } })
    const { error } = await supabase.from('comp_development_actions').delete().eq('id', actionId)
    if (reportError('حذف اقدام توسعه', error)) {
      set({ developmentActionsByPlan: { ...get().developmentActionsByPlan, [planId]: previous } })
    }
  },

  createReassessment: async (assessmentId) => {
    const { data, error } = await supabase.rpc('comp_create_reassessment', { p_assessment_id: assessmentId })
    if (reportError('ایجاد ارزیابی مجدد', error) || !data) return null
    const id = data as string
    if (!get().assessments.some((a) => a.id === id)) {
      const { data: row, error: rowError } = await supabase.from('comp_assessments').select('*').eq('id', id).maybeSingle()
      if (reportError('بارگذاری ارزیابی مجدد', rowError)) return id
      if (row) set({ assessments: [compAssessmentFromRow(row as CompAssessmentRow), ...get().assessments] })
    }
    return id
  },

  fetchReassessmentComparison: async (assessmentId) => {
    const { data, error } = await supabase.rpc('comp_get_reassessment_comparison', { p_assessment_id: assessmentId })
    if (reportError('بارگذاری مقایسه با ارزیابی قبلی', error)) return null
    return (data ?? null) as CompReassessmentComparison | null
  },
}))
