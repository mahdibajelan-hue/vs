import type { JobRole } from '../competency/types'

// Personality & Behavioral Assessment Engine — Phase 1 domain types.
// Mirrors the schema in supabase/schema.sql (Section 40) exactly. This module deliberately reuses
// the competency module's JobRole domain (same job roles, no parallel job-role concept) and links
// every personality assessment to an existing comp_assessments row rather than a separate candidate
// model — see the reuse notes in schema.sql for the full reasoning.

export type { JobRole }

export type PersonalityQuestionType = 'LIKERT' | 'FORCED_CHOICE' | 'SJT' | 'FREQUENCY' | 'PRIORITY_CHOICE' | 'EXPERIENCE_ANCHORED'

export const PERSONALITY_QUESTION_TYPE_LABEL_FA: Record<PersonalityQuestionType, string> = {
  LIKERT: 'طیف لیکرت',
  FORCED_CHOICE: 'انتخاب اجباری',
  SJT: 'قضاوت موقعیتی (SJT)',
  FREQUENCY: 'فراوانی رفتار',
  PRIORITY_CHOICE: 'اولویت‌بندی',
  EXPERIENCE_ANCHORED: 'تجربه‌محور',
}

export type PersonalityComplexity = 'L1' | 'L2' | 'L3' | 'L4'

export const PERSONALITY_COMPLEXITY_LABEL_FA: Record<PersonalityComplexity, string> = {
  L1: 'ساده',
  L2: 'متوسط',
  L3: 'پیچیده',
  L4: 'مبهم / حساسیت بالا',
}

export type PersonalityApprovalStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION'

export const PERSONALITY_APPROVAL_STATUS_LABEL_FA: Record<PersonalityApprovalStatus, string> = {
  PENDING_REVIEW: 'در انتظار بررسی',
  APPROVED: 'تأییدشده',
  REJECTED: 'ردشده',
  NEEDS_REVISION: 'نیازمند اصلاح',
}

/** Full assessment lifecycle (spec section 45) — LOCKED can only be reopened by an admin, audited
 * via comp_log_audit (see schema.sql Section 40's reuse note). */
export type PersonalityAssessmentStatus =
  | 'DRAFT'
  | 'DESIGNED'
  | 'GENERATED'
  | 'ASSIGNED'
  | 'STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'VALIDITY_CHECK'
  | 'SCORING'
  | 'FINGERPRINT'
  | 'AI_ANALYSIS'
  | 'FINAL_REVIEW'
  | 'LOCKED'
  | 'ARCHIVED'

export const PERSONALITY_ASSESSMENT_STATUS_LABEL_FA: Record<PersonalityAssessmentStatus, string> = {
  DRAFT: 'پیش‌نویس',
  DESIGNED: 'طراحی‌شده',
  GENERATED: 'تولیدشده',
  ASSIGNED: 'اختصاص‌یافته',
  STARTED: 'شروع‌شده',
  IN_PROGRESS: 'در حال انجام',
  SUBMITTED: 'ثبت‌شده',
  VALIDITY_CHECK: 'بررسی اعتبار پاسخ',
  SCORING: 'امتیازدهی',
  FINGERPRINT: 'اثرانگشت رفتاری',
  AI_ANALYSIS: 'تحلیل هوشمند',
  FINAL_REVIEW: 'بازبینی نهایی',
  LOCKED: 'قفل‌شده',
  ARCHIVED: 'بایگانی‌شده',
}

export type PersonalityFormKey = 'A' | 'B' | 'C' | 'D'

export type PersonalityScoreKind = 'TRAIT' | 'FACET' | 'BEHAVIORAL_DIMENSION'

export type PersonalityConfidence = 'LOW' | 'MEDIUM' | 'HIGH'

/** Response-validity verdict (spec section 24-25) — evidence for review, never an automatic
 * dishonesty label. */
export type PersonalityValidityStatus = 'VALID' | 'ACCEPTABLE' | 'REVIEW_REQUIRED' | 'INVALID'

export const PERSONALITY_VALIDITY_STATUS_LABEL_FA: Record<PersonalityValidityStatus, string> = {
  VALID: 'معتبر',
  ACCEPTABLE: 'قابل‌قبول',
  REVIEW_REQUIRED: 'نیازمند بازبینی',
  INVALID: 'نامعتبر',
}

// ---------------------------------------------------------------------------
// Catalog: framework / traits / facets / behavioral dimensions / job profiles
// ---------------------------------------------------------------------------

export interface PersonalityFramework {
  id: string
  key: string
  labelFa: string
  description: string
  version: number
  active: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface PersonalityTrait {
  id: string
  frameworkId: string
  key: string
  labelFa: string
  description: string
  displayOrder: number
  active: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface PersonalityFacet {
  id: string
  traitId: string
  key: string
  labelFa: string
  description: string
  displayOrder: number
  active: boolean
  createdAt: string
  updatedAt: string
}

/** The 22+ professional behavioral dimensions (spec section 6) — a module-wide catalog, not tied
 * to one personality framework. */
export interface PersonalityBehavioralDimension {
  id: string
  key: string
  labelFa: string
  description: string
  defaultWeight: number
  relatedTraitIds: string[]
  relatedFacetIds: string[]
  active: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface PersonalityJobBehavioralProfile {
  id: string
  jobRole: JobRole
  version: number
  title: string
  active: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface PersonalityJobBehavioralRequirement {
  id: string
  profileId: string
  dimensionId: string
  weight: number
  minThreshold: number | null
  preferredMin: number | null
  preferredMax: number | null
  isCritical: boolean
  createdAt: string
}

export interface PersonalityResponseScaleLabel {
  value: number
  labelFa: string
}

export interface PersonalityResponseScale {
  id: string
  key: string
  labelFa: string
  minValue: number
  maxValue: number
  labels: PersonalityResponseScaleLabel[]
  scoringRule: string
  reverseRule: string
  active: boolean
  createdAt: string
}

// ---------------------------------------------------------------------------
// Module RBAC: module admins + assessment-designer/report-viewer role grants
// ---------------------------------------------------------------------------

export interface PersonalityProfileLite {
  id: string
  email: string
  fullName: string
}

/** A user granted full admin-equivalent standing within the Personality module specifically —
 * independent of the global RASTA profiles.is_admin flag (see personality_is_module_admin() in
 * schema.sql). */
export interface PersonalityModuleAdmin {
  userId: string
  addedBy: string | null
  createdAt: string
}

/** One user holding the module-scoped PERSONALITY_ASSESSMENT_DESIGNER or PERSONALITY_REPORT_VIEWER
 * role, backed by the shared rasta_user_roles/rasta_roles framework (not a personality-specific
 * table) — see personality_is_assessment_designer()/personality_is_report_viewer() in schema.sql. */
export interface PersonalityRoleAssignment {
  userId: string
  addedBy: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Question bank
// ---------------------------------------------------------------------------

/** One selectable choice for FORCED_CHOICE/SJT/PRIORITY_CHOICE/EXPERIENCE_ANCHORED items.
 * dimensionKey/score carry the scoring engine's per-choice evidence (which behavioral dimension
 * this choice reflects, and how strongly, 0-5) — admin/designer-only data, never sent to the
 * candidate-facing UI beyond the plain label. Resolved to a real dimension_id by the scoring engine
 * at scoring time via the key, rather than storing a foreign key directly in this jsonb blob. */
export interface PersonalityQuestionOption {
  key: string
  labelFa: string
  dimensionKey?: string
  score?: number
}

export interface PersonalityQuestionQuality {
  clarity?: number
  constructRelevance?: number
  socialDesirabilityRisk?: number
  ambiguityRisk?: number
  doubleBarreledRisk?: number
  responseBiasRisk?: number
}

export interface PersonalityQuestion {
  id: string
  questionGroupId: string
  version: number
  supersededBy: string | null
  frameworkId: string | null
  traitId: string | null
  facetId: string | null
  dimensionId: string | null
  questionType: PersonalityQuestionType
  questionText: string
  scenarioContext: string
  scaleId: string | null
  options: PersonalityQuestionOption[]
  reverseScored: boolean
  jobRole: JobRole | null
  complexity: PersonalityComplexity
  weight: number
  active: boolean
  approvalStatus: PersonalityApprovalStatus
  quality: PersonalityQuestionQuality
  usageCount: number
  lastUsedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Assessment templates + per-candidate assessment
// ---------------------------------------------------------------------------

export interface PersonalityQuestionMixCell {
  questionType: PersonalityQuestionType
  complexity: PersonalityComplexity
  count: number
}

export interface PersonalityAssessmentTemplate {
  id: string
  jobRole: JobRole
  title: string
  frameworkId: string | null
  jobProfileId: string | null
  questionMix: PersonalityQuestionMixCell[]
  durationMinutes: number | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** A rule-based (non-AI) behavioral pattern or watchpoint (spec sections 29-30) — always computed
 * deterministically from scores, independent of whether AI analysis has run. */
export interface PersonalityComputedPattern {
  dimensionKeys: string[]
  interpretation: string
}

export interface PersonalityComputedWatchpoint {
  dimensionKeys: string[]
  topic: string
}

/** The per-candidate personality assessment — links to an EXISTING comp_assessments row (1:1), so
 * a candidate's technical/competency assessment and personality assessment share the same identity
 * (spec section 36: Technical + Personality Integration). */
export interface PersonalityAssessment {
  id: string
  /** The existing comp_assessments.id this personality assessment belongs to. */
  assessmentId: string
  jobRole: JobRole
  frameworkId: string | null
  jobProfileId: string | null
  formKey: PersonalityFormKey
  selectedQuestionIds: string[]
  status: PersonalityAssessmentStatus
  computedPatterns: PersonalityComputedPattern[]
  computedWatchpoints: PersonalityComputedWatchpoint[]
  startedAt: string | null
  submittedAt: string | null
  lockedAt: string | null
  lockedBy: string | null
  /** Self-service candidate-taking link token — never the same token as resultsShareToken. */
  candidateToken: string
  /** Public "view results online" link token — never the same token as candidateToken. */
  resultsShareToken: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface PersonalityResponseValue {
  selected?: number | string
  selectedOption?: string
  rank?: string[]
}

export interface PersonalityResponse {
  id: string
  personalityAssessmentId: string
  questionId: string
  responseValue: PersonalityResponseValue
  responseTimeMs: number | null
  answeredAt: string
}

export interface PersonalityDimensionScore {
  id: string
  personalityAssessmentId: string
  scoreKind: PersonalityScoreKind
  traitId: string | null
  facetId: string | null
  dimensionId: string | null
  rawScore: number | null
  normalizedScore: number | null
  weightedScore: number | null
  coverageCount: number
  confidence: PersonalityConfidence
  createdAt: string
  updatedAt: string
}

export interface PersonalityValidityResult {
  id: string
  personalityAssessmentId: string
  completionSeconds: number | null
  straightLiningFlag: boolean
  extremeResponseRate: number | null
  consistencyScore: number | null
  socialDesirabilityScore: number | null
  randomPatternFlag: boolean
  missingResponseCount: number
  contradictionCount: number
  overallStatus: PersonalityValidityStatus
  computedAt: string
}

// ---------------------------------------------------------------------------
// Gemini AI analysis — structured output (spec section 42), validated against
// this shape before storage so malformed AI output never corrupts the DB.
// ---------------------------------------------------------------------------

export interface PersonalityAiTraitAnalysis {
  trait_key: string
  score: number
  range_label: string
  analysis: string
}

export interface PersonalityAiBehavioralAnalysis {
  dimension_key: string
  score: number
  analysis: string
  evidence: string[]
}

export interface PersonalityAiFollowUpQuestion {
  question: string
  purpose: string
  competency: string
  dimension_key: string
  evidence_to_look_for: string
  positive_indicators: string[]
  risk_indicators: string[]
}

export interface PersonalityAiEvidence {
  source_type: 'QUESTION' | 'SJT' | 'JUDGE_COMMENT' | 'EXPERIENCE'
  source_id: string
  dimension_key: string
  note: string
}

export interface PersonalityAiAnalysisContent {
  executive_summary: string
  response_validity_interpretation: string
  trait_analysis: PersonalityAiTraitAnalysis[]
  behavioral_analysis: PersonalityAiBehavioralAnalysis[]
  observed_patterns: string[]
  strength_patterns: string[]
  watchpoints: string[]
  development_areas: string[]
  follow_up_questions: PersonalityAiFollowUpQuestion[]
  training_recommendations: string[]
  career_development_paths: string[]
  evidence: PersonalityAiEvidence[]
  confidence: 'low' | 'medium' | 'high'
}

export interface PersonalityAiAnalysis {
  id: string
  personalityAssessmentId: string
  model: string
  analysis: PersonalityAiAnalysisContent
  confidence: string | null
  generatedBy: string | null
  createdAt: string
}
