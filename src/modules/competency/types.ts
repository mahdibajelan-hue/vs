export type CompetencyDomainKey =
  | 'governance'
  | 'planning'
  | 'cost'
  | 'hse'
  | 'quality'
  | 'changeRisk'
  | 'stakeholder'
  | 'execution'
  // The 4 category "buckets" used to score every non-project-manager job role's DB-backed
  // question bank (see roleCompetencyModel.ts) — added to this same union (rather than a
  // parallel type) so DomainScore/computeOverallPercent/domainFlags/tierColor/
  // CompetencyRadarChart all work unmodified for both the fixed PM rubric and the dynamic
  // role question banks.
  | 'roleGeneral'
  | 'roleTechnical'
  | 'roleScenario'
  | 'roleExperience'
  // Zero-weight, display-only Competency Fingerprint dimensions (spec section 14/15) — computed
  // straight from HSE/BEHAVIORAL/JUDGMENT question scores and shown alongside the 4 weighted
  // buckets above, but never fed into computeOverallPercent/recommendationForRole so the tested
  // scoring math never changes (see computeExtendedFingerprint in roleCompetencyModel.ts).
  | 'roleHse'
  | 'roleBehavioral'
  | 'roleJudgment'

export interface CompetencyDomain {
  key: CompetencyDomainKey
  title: string
  shortTitle: string
  /** Percentage weight in the overall weighted score; the 8 domain weights sum to 100. */
  weight: number
  description: string
  /** Shown to interviewers as scoring guidance — what marks an excellent answer in this domain. */
  excellentAnswerHint: string
}

export interface CompetencyQuestion {
  key: string
  domain: CompetencyDomainKey
  text: string
}

export interface CompetencyAnswer {
  score: number | null
  note: string
  /** The candidate's own recorded answer — written down by the evaluator before the reference
   * answer is revealed (see RoleQuestionScoreCard). Optional and unused by the fixed
   * project-manager rubric flow, which never shows/hides a reference answer. */
  candidateAnswer?: string
}

export type CompetencyAnswers = Record<string, CompetencyAnswer>

export type AssessmentStatus = 'draft' | 'completed'
export type SelfServiceStatus = 'not_sent' | 'pending' | 'submitted' | 'reviewed'

/**
 * Every job whose competency is assessed. Was a fixed 12-literal union until the Enterprise
 * Competency Assessment Engine work (schema.sql Section 47) turned comp_job_role_config into the
 * real, admin-configurable job-role catalog it always should have been — the column was already
 * loose `text` everywhere (comp_assessments, comp_question_bank, personality_*) with no DB-level
 * CHECK constraint, so the fixed union only ever existed here, in the frontend. Now a plain string
 * alias: this deliberately keeps every existing function signature, `Record<JobRole, X>` usage and
 * prop type unchanged (a `string` is valid wherever a specific literal union was accepted), while
 * the actual catalog — which labels exist, their order, which are active — lives entirely in
 * useCompetencyStore's `jobRoleConfigs` (see jobRoleLabel/sortedJobRoles in lib/competencyData.ts).
 * Adding a new role is now a single INSERT into comp_job_role_config, never a code change.
 * 'project_manager' remains the one hardcoded VALUE (not type) the app still special-cases — the
 * original, fixed in-code rubric (competencyModel.ts) that must never be affected by the DB-backed
 * question bank — but that is an ordinary string comparison (see usesLegacyPmRubric) needing no
 * change here.
 */
export type JobRole = string

/** Question type per spec — drives which of the 4 scoring buckets (see roleCompetencyModel.ts) a question counts toward. */
export type QuestionType =
  | 'GENERAL'
  | 'TECHNICAL'
  | 'SCENARIO'
  | 'PROBLEM_SOLVING'
  | 'EXPERIENCE_BASED'
  | 'CASE_STUDY'
  | 'IMAGE_BASED'
  | 'BEHAVIORAL'
  | 'HSE'
  | 'JUDGMENT'

export const QUESTION_TYPE_LABEL_FA: Record<QuestionType, string> = {
  GENERAL: 'عمومی شغلی',
  TECHNICAL: 'تخصصی',
  SCENARIO: 'سناریومحور',
  PROBLEM_SOLVING: 'حل مسئله',
  EXPERIENCE_BASED: 'تجربه‌محور',
  CASE_STUDY: 'مطالعه موردی',
  IMAGE_BASED: 'تصویری',
  BEHAVIORAL: 'رفتاری',
  HSE: 'ایمنی و بهداشت (HSE)',
  JUDGMENT: 'قضاوت حرفه‌ای',
}

/** Every comp_question_bank row's editorial lifecycle state (spec section 2/12). Admin-authored
 * rows are auto-APPROVED; a future non-admin "propose a question" workflow lands new rows as
 * PENDING_REVIEW instead of writing the bank directly. */
export type QuestionApprovalStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION'

export const QUESTION_APPROVAL_STATUS_LABEL_FA: Record<QuestionApprovalStatus, string> = {
  PENDING_REVIEW: 'در انتظار بررسی',
  APPROVED: 'تأییدشده',
  REJECTED: 'ردشده',
  NEEDS_REVISION: 'نیازمند اصلاح',
}

/** One cell of an assessment template's question-mix grid (spec section 36/7): how many questions
 * of this exact type+difficulty combination the generated assessment should draw from the bank. */
export interface QuestionMixCell {
  category: QuestionType
  difficulty: QuestionDifficulty
  count: number
}

/** A reusable, named "recipe" for how many questions of each type/difficulty a job role's
 * assessment should draw from comp_question_bank (spec section 6/36) — designed once by an admin
 * or assessment designer, then applied to generate any number of candidates' actual frozen question
 * selections. Replaces the old fixed hardcoded target counts. */
export interface CompAssessmentTemplate {
  id: string
  jobRole: JobRole
  title: string
  /** null = no target duration set for this template. */
  durationMinutes: number | null
  /** Only meaningful when durationMinutes is set — whether the live interview timer should
   * auto-stop itself once that duration elapses, or just keep counting into overtime. */
  autoFinishOnTimeout: boolean
  panelSizeDefault: number
  questionMix: QuestionMixCell[]
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type QuestionDifficulty = 'L1' | 'L2' | 'L3' | 'L4'

export const QUESTION_DIFFICULTY_LABEL_FA: Record<QuestionDifficulty, string> = {
  L1: 'پایه (Basic)',
  L2: 'کاربردی (Intermediate)',
  L3: 'تحلیلی (Advanced)',
  L4: 'خبره (Expert)',
}

export const QUESTION_DIFFICULTY_COLOR: Record<QuestionDifficulty, string> = {
  L1: '#38bdf8',
  L2: '#34d399',
  L3: '#fbbf24',
  L4: '#f87171',
}

/** One row of the DB-backed, multi-role question bank (comp_question_bank) — everything an admin
 * can author/edit and everything an evaluator needs to score a candidate's answer without a fixed,
 * versioned-in-code rubric like the Project Manager one. */
export interface CompQuestionBankItem {
  id: string
  jobRole: JobRole
  category: QuestionType
  subCategory: string
  difficulty: QuestionDifficulty
  questionText: string
  imageUrl: string
  /** Short reference paragraph — never shown to the candidate, only to the evaluator, and only after the candidate's own answer has been recorded (see RoleQuestionScoreCard). */
  referenceAnswer: string
  keyPoints: string[]
  excellentAnswerIndicators: string[]
  commonMistakes: string[]
  standardReference: string
  scoreMin: number
  scoreMax: number
  evaluatorNoteRequired: boolean
  active: boolean
  /** Relative weight of this question within its category — feeds future weighted category
   * scoring (spec section 16); defaults to 1, which reproduces today's plain average. */
  weight: number
  approvalStatus: QuestionApprovalStatus
  /** Ties every edit of "the same question" together (spec section 13 versioning) — a freshly
   * created question is its own group (questionGroupId === id). */
  questionGroupId: string
  /** 1 for a question's first-ever version; incremented on every admin edit. */
  version: number
  /** Set on the OLD row once an edit creates a new version — points at the replacement. A row
   * with supersededBy set is historical only, kept so past assessment snapshots keep resolving to
   * the exact wording/reference-answer that was actually used. */
  supersededBy: string | null
  /** How many times this exact question has been drawn into a generated assessment (spec section
   * 8's "Previous Usage" control) — selection prefers lower values so the same handful of
   * questions don't keep coming up. */
  usageCount: number
  /** Why a non-admin proposer thinks this question should be added (spec section 12's "Reason for
   * Proposal" field) — empty for questions admins author directly. */
  proposalReason: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** The full admin-configurable job-role catalog row (comp_job_role_config, schema.sql Section 47) —
 * this IS the JobRole catalog now: label_fa/description/active/sort_order turn what used to be the
 * frontend's hardcoded JOB_ROLE_LABEL_FA/JOB_ROLES into real, admin-editable data, alongside the
 * pre-existing allowed_question_types (spec section 3). See jobRoleLabel/sortedJobRoles in
 * lib/competencyData.ts for the read-side helpers every call site that used to read those constants
 * now uses instead. */
export interface CompJobRoleConfig {
  jobRole: JobRole
  labelFa: string
  description: string
  active: boolean
  sortOrder: number
  allowedQuestionTypes: QuestionType[]
  updatedBy: string | null
  updatedAt: string
  createdAt: string
}

/** comp_competencies.domain (schema.sql Section 47) — which evidence domain(s) a competency
 * conceptually draws from; informs a future Evidence Engine phase, not itself a scoring input yet. */
export type CompCompetencyDomain = 'TECHNICAL' | 'BEHAVIORAL' | 'HYBRID'

export const COMP_COMPETENCY_DOMAIN_LABEL_FA: Record<CompCompetencyDomain, string> = {
  TECHNICAL: 'فنی',
  BEHAVIORAL: 'رفتاری',
  HYBRID: 'ترکیبی',
}

/** One rung of a competency's configurable proficiency scale (comp_competencies.proficiency_levels)
 * — mirrors personality_response_scales' own jsonb-labels pattern rather than a fixed level count
 * baked into a column. Not yet editable from the UI (this phase is catalog/model only — see the
 * Evidence Engine note in schema.sql Section 47); every competency is created with the schema's
 * default 5-level scale. */
export interface CompCompetencyProficiencyLevel {
  level: number
  labelFa: string
}

/** One row of the unified Competency Model (comp_competencies, schema.sql Section 47) — a named
 * competency spanning technical and/or behavioral evidence, independent of any one job role. Job
 * roles opt into it (with a required level/weight/criticality) via CompJobCompetencyRequirement. */
export interface CompCompetency {
  id: string
  key: string
  labelFa: string
  description: string
  domain: CompCompetencyDomain
  proficiencyLevels: CompCompetencyProficiencyLevel[]
  active: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
  updatedBy: string | null
}

/** One row of comp_job_competency_requirements (schema.sql Section 47) — how much of a given
 * competency a given job role requires, mirroring the exact shape already proven by
 * PersonalityJobBehavioralRequirement (required level, critical flag, weight) but scoped directly to
 * job_role rather than a separate "profile" indirection. Evidence-source wiring (which
 * assessments/items actually feed this competency's score) is a later phase — this is catalog/model
 * only. */
export interface CompJobCompetencyRequirement {
  id: string
  jobRole: JobRole
  competencyId: string
  requiredLevel: number
  isCritical: boolean
  weight: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
  updatedBy: string | null
}

export interface EducationEntry {
  id: string
  degree: string
  field: string
  institution: string
  year: string
}

export interface EmploymentEntry {
  id: string
  employer: string
  position: string
  startDate: string
  /** Empty = still employed there; duration is computed through today. */
  endDate: string
  insuranceMonths: number | null
  /** Marks this position as pipeline-construction work specifically, so its duration counts toward yearsExperiencePipeline (auto-computed) rather than only the generic career total. */
  isPipelineRole: boolean
  note: string
}

export interface CertificationEntry {
  id: string
  title: string
  issuer: string
  date: string
  isPmp: boolean
}

export interface CompetencyAssessment {
  id: string
  /** Which question bank scores this candidate — 'project_manager' (the default, including every
   * pre-existing row) keeps using the fixed in-code rubric untouched; every other role draws its
   * questions from comp_question_bank via selectedQuestionIds below. */
  jobRole: JobRole
  /** The specific comp_question_bank row ids randomly assigned to this assessment (see
   * useCompetencyStore.assignRandomQuestions) — frozen once set, so every panelist and the lead
   * score the exact same question set and re-opening the assessment never reshuffles it. Unused
   * (always []) for jobRole = 'project_manager'. */
  selectedQuestionIds: string[]
  /** Exam Design Panel decision (see comp_set_exam_design in schema.sql) — whether this candidate's
   * flow needs the personality/behavioral assessment and/or the technical assessment+interview.
   * Set only by an ASSESSMENT_DESIGNER (or module admin) in the "examDesign" wizard stage; drives
   * whether the "personality" stage shows a real assessment or a "not required" message. */
  needsPersonalityAssessment: boolean
  needsTechnicalAssessment: boolean
  /** How many panelists this assessment's panel should have — the lead's own choice per candidate
   * (e.g. a specialty needing extra scrutiny might warrant 4-5), no longer a fixed 3 for everyone. */
  panelSize: number
  candidateName: string
  candidatePosition: string
  candidateNationalId: string
  candidatePhone: string
  candidateEmail: string
  /** Source of truth for age — candidateAge is derived from this and stored alongside it (see profileCalc.ts) rather than typed in directly, so the two can never disagree. */
  candidateBirthDate: string
  candidateAge: number | null
  hasDisability: boolean
  disabilityNote: string
  photoUrl: string
  yearsExperienceTotal: number | null
  yearsExperiencePipeline: number | null
  currentEmployer: string
  education: EducationEntry[]
  employmentHistory: EmploymentEntry[]
  certifications: CertificationEntry[]
  notableProjects: string
  interviewDate: string
  status: AssessmentStatus
  answers: CompetencyAnswers
  capstoneScore: number | null
  capstoneNote: string
  educationScore: number | null
  experienceScore: number | null
  pmTrainingScore: number | null
  pmCertificationScore: number | null
  selfServiceToken: string
  selfServiceStatus: SelfServiceStatus
  /** Separate, unguessable token for the public "view results online" link — see comp_public_results_get in schema.sql. Never the same token as selfServiceToken. */
  resultsShareToken: string
  reviewedBy: string | null
  reviewedAt: string | null
  /** Explicit go/no-go verdict from the interview lead / final assessor — distinct from status='completed', which only means the scoring flow was finished. Shown as a badge on the candidate's card. */
  isApproved: boolean
  /** Lead's own narrative judgment — distinct from the per-domain strengths/weaknesses derived automatically from question scores (see domainFlags in competencyModel.ts). */
  strengths: string
  developmentAreas: string
  /** Target interview duration copied from the Assessment Designer's template at generation time —
   * null means no target duration was set. See interviewTimer* below for the live, running timer
   * itself, which is independent of this configured target. */
  durationMinutes: number | null
  /** Only meaningful when durationMinutes is set — whether the live interview timer auto-stops
   * itself once that duration elapses, or just keeps counting into overtime. */
  autoFinishOnTimeout: boolean
  /** Live interview timer state (spec: judge-controllable interview timer) — start/pause/reset via
   * comp_set_interview_timer, never written directly. interviewTimerStartedAt is set only while
   * running; the displayed elapsed time is interviewTimerElapsedSeconds plus time since that
   * timestamp when running. */
  interviewTimerStartedAt: string | null
  interviewTimerElapsedSeconds: number
  interviewTimerRunning: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface DomainScore {
  domain: CompetencyDomain
  answeredCount: number
  totalCount: number
  averageScore: number | null
  percentScore: number | null
}

export interface CompProfileLite {
  id: string
  email: string
  fullName: string
}

/** A user granted full admin-equivalent standing within the Competency module specifically —
 * independent of the global RASTA profiles.is_admin flag (see comp_is_module_admin() in schema.sql). */
export interface CompModuleAdmin {
  userId: string
  addedBy: string | null
  createdAt: string
}

/** One user holding the module-scoped ASSESSMENT_DESIGNER or REPORT_VIEWER role, backed by the
 * shared rasta_user_roles/rasta_roles framework (not a comp-specific table) — see
 * comp_is_assessment_designer()/comp_is_report_viewer() in schema.sql. */
export interface CompRoleAssignment {
  userId: string
  addedBy: string | null
  createdAt: string
}

export interface CompPanelist {
  id: string
  assessmentId: string
  userId: string
  isLead: boolean
  addedBy: string | null
  createdAt: string
}

/** A reusable, named set of interviewers a lead can save once and apply to any matching future
 * candidate in one click — e.g. "گروه مصاحبه برق و ابزار دقیق" for every electrical/instrumentation
 * candidate — instead of re-adding the same people to the panel every time. jobRole is optional: a
 * group with none set is generic and shows up as a suggestion for every role. */
export interface CompPanelGroup {
  id: string
  name: string
  jobRole: JobRole | null
  createdBy: string | null
  createdAt: string
  members: CompPanelGroupMember[]
}

export interface CompPanelGroupMember {
  id: string
  groupId: string
  userId: string
  isLead: boolean
}

export interface CompPanelistScore {
  id: string
  assessmentId: string
  panelistId: string
  answers: CompetencyAnswers
  capstoneScore: number | null
  capstoneNote: string
  /** This panelist's own qualification-scorecard judgment — same four components as the shared
   * QualificationScorecardCard, but per-judge now so the final value can be the average across the
   * whole panel instead of a single lead-entered number. */
  educationScore: number | null
  experienceScore: number | null
  pmTrainingScore: number | null
  pmCertificationScore: number | null
  /** Mandatory before this panelist can submit — see submitMyPanelistScore. */
  strengths: string
  developmentAreas: string
  submittedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AttachmentKind = 'resume' | 'education' | 'certification' | 'national_id' | 'insurance' | 'other'

export interface CompAttachment {
  id: string
  assessmentId: string
  kind: AttachmentKind
  fileName: string
  storagePath: string
  uploadedBy: string | null
  uploadedByCandidate: boolean
  createdAt: string
}

export const ATTACHMENT_KIND_LABEL_FA: Record<AttachmentKind, string> = {
  resume: 'رزومه',
  education: 'مدرک تحصیلی',
  certification: 'گواهینامه حرفه‌ای',
  national_id: 'کارت ملی',
  insurance: 'سوابق بیمه',
  other: 'سایر مدارک',
}

/** One row of comp_audit_log (spec section 31) — always written server-side via comp_log_audit(),
 * never directly by the client, so this is a read-only view for admins. */
export interface CompAuditLogEntry {
  id: string
  action: string
  entityType: string
  entityId: string | null
  actor: string | null
  previousValue: unknown
  newValue: unknown
  createdAt: string
}

/** One competency dimension's AI-generated analysis (spec section 25's competency_analysis.*). */
export interface AiCompetencyDimension {
  score: number
  analysis: string
  evidence: string[]
}

/** A candidate's evidence-based analysis returned by the comp-gemini-analysis Edge Function (spec
 * section 18-27) — never the final decision (that's always the judges'/Rule Engine's), always
 * grounded in the actual recorded answers/scores it was given. */
export interface AiAnalysisContent {
  executive_summary: string
  overall_assessment: string
  competency_analysis: {
    technical: AiCompetencyDimension
    problem_solving: AiCompetencyDimension
    experience: AiCompetencyDimension
    hse: AiCompetencyDimension
    judgment: AiCompetencyDimension
    communication: AiCompetencyDimension
    leadership: AiCompetencyDimension
    commercial: AiCompetencyDimension
  }
  strengths: string[]
  development_areas: string[]
  critical_gaps: string[]
  recommended_training: string[]
  follow_up_questions: { question_id?: string; question: string; reason: string }[]
  evidence_log: { question_id: string; candidate_answer?: string; analysis: string }[]
  confidence: number
}

export interface CompAiAnalysis {
  id: string
  assessmentId: string
  model: string
  analysis: AiAnalysisContent
  confidence: number | null
  generatedBy: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Unified Candidate AI Analysis (spec follow-up, schema.sql Section 46) — ONE
// comprehensive, evidence-based analysis per candidate covering personality
// profiling, behavioral pattern, technical/specialized evaluation, and
// job-fit together, returned by the comp-candidate-ai-analysis Edge Function.
// Replaces the two separate AiAnalysisContent (technical-only) and
// PersonalityAiAnalysisContent (personality-only) analyses as the module's
// single AI-generation surface — see CandidateAiAnalysisStage.
// ---------------------------------------------------------------------------

export interface CandidateAiTechnicalAnalysis {
  available: boolean
  competency_analysis: {
    technical: AiCompetencyDimension
    problem_solving: AiCompetencyDimension
    experience: AiCompetencyDimension
    hse: AiCompetencyDimension
    judgment: AiCompetencyDimension
    communication: AiCompetencyDimension
    leadership: AiCompetencyDimension
    commercial: AiCompetencyDimension
  }
  strengths: string[]
  development_areas: string[]
  critical_gaps: string[]
}

export interface CandidateAiTraitAnalysis {
  trait_key: string
  score: number
  range_label: string
  analysis: string
}

export interface CandidateAiBehavioralAnalysis {
  dimension_key: string
  score: number
  analysis: string
  evidence: string[]
}

export interface CandidateAiPersonalityAnalysis {
  available: boolean
  response_validity_interpretation: string
  trait_analysis: CandidateAiTraitAnalysis[]
  behavioral_analysis: CandidateAiBehavioralAnalysis[]
  observed_patterns: string[]
  strength_patterns: string[]
  watchpoints: string[]
}

export interface CandidateAiFollowUpQuestion {
  question: string
  purpose: string
  competency: string
  dimension_key: string
  evidence_to_look_for: string
  positive_indicators: string[]
  risk_indicators: string[]
}

export interface CandidateAiEvidence {
  source_type: 'QUESTION' | 'SJT' | 'JUDGE_COMMENT' | 'EXPERIENCE'
  source_id: string
  dimension_key: string
  note: string
}

/** The comprehensive analysis content (spec follow-up) — always covers whichever of
 * technical_analysis/personality_analysis actually has data for this candidate (each carries its
 * own `available` flag rather than being nullable, so a half not yet completed still renders as an
 * explicit "not yet available" state instead of a missing key). */
export interface CandidateAiAnalysisContent {
  executive_summary: string
  technical_analysis: CandidateAiTechnicalAnalysis
  personality_analysis: CandidateAiPersonalityAnalysis
  /** Evidence-based narrative synthesizing the candidate's fit against the TARGET JOB's required
   * behavioral profile — grounded strictly in the same role-alignment numbers the deterministic
   * RoleAlignmentCard shows; explicitly says job-fit analysis isn't available yet when personality
   * data or a job profile is missing. */
  role_fit_narrative: string
  development_areas: string[]
  training_recommendations: string[]
  career_development_paths: string[]
  follow_up_questions: CandidateAiFollowUpQuestion[]
  evidence: CandidateAiEvidence[]
  confidence: 'low' | 'medium' | 'high'
}

export interface CandidateAiAnalysis {
  id: string
  assessmentId: string
  model: string
  analysis: CandidateAiAnalysisContent
  confidence: string | null
  generatedBy: string | null
  createdAt: string
}
