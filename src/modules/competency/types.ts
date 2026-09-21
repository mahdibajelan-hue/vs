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
 * Every job whose competency is assessed. 'project_manager' is the original, fixed in-code rubric
 * (competencyModel.ts) and must never be affected by the DB-backed question bank below — every
 * other role draws its questions from comp_question_bank instead.
 */
export type JobRole =
  | 'project_manager'
  | 'welding_inspector'
  | 'mechanical_piping_inspector'
  | 'pipeline_inspector'
  | 'coating_cp_inspector'
  | 'radiography_interpreter'
  | 'civil_engineer'
  | 'project_control_specialist'
  | 'hse_specialist'
  | 'contracts_specialist'
  | 'site_supervisor'
  | 'inspection_body_supervisor'

export const JOB_ROLE_LABEL_FA: Record<JobRole, string> = {
  project_manager: 'مدیر پروژه',
  welding_inspector: 'مهندس ناظر جوش',
  mechanical_piping_inspector: 'مهندس ناظر مکانیکال و پایپینگ',
  pipeline_inspector: 'مهندس ناظر Pipeline',
  coating_cp_inspector: 'مهندس ناظر پوشش و حفاظت کاتدیک',
  radiography_interpreter: 'مهندس مفسر فیلم‌های رادیوگرافی',
  civil_engineer: 'مهندس Civil (مسیرسازی، حفاری و ابنیه)',
  project_control_specialist: 'کارشناس کنترل پروژه',
  hse_specialist: 'کارشناس HSE',
  contracts_specialist: 'کارشناس بررسی صورت‌وضعیت و قراردادها',
  site_supervisor: 'سرپرست کارگاه',
  inspection_body_supervisor: 'سرپرست دستگاه نظارت',
}

export const JOB_ROLES: JobRole[] = [
  'project_manager',
  'welding_inspector',
  'mechanical_piping_inspector',
  'pipeline_inspector',
  'coating_cp_inspector',
  'radiography_interpreter',
  'civil_engineer',
  'project_control_specialist',
  'hse_specialist',
  'contracts_specialist',
  'site_supervisor',
  'inspection_body_supervisor',
]

/** Question type per spec — drives which of the 4 scoring buckets (see roleCompetencyModel.ts) a question counts toward. */
export type QuestionType = 'GENERAL' | 'TECHNICAL' | 'SCENARIO' | 'PROBLEM_SOLVING' | 'EXPERIENCE_BASED' | 'CASE_STUDY' | 'IMAGE_BASED'

export const QUESTION_TYPE_LABEL_FA: Record<QuestionType, string> = {
  GENERAL: 'عمومی شغلی',
  TECHNICAL: 'تخصصی',
  SCENARIO: 'سناریومحور',
  PROBLEM_SOLVING: 'حل مسئله',
  EXPERIENCE_BASED: 'تجربه‌محور',
  CASE_STUDY: 'مطالعه موردی',
  IMAGE_BASED: 'تصویری',
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
  createdBy: string | null
  createdAt: string
  updatedAt: string
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
