import type {
  PersonalityAiAnalysis,
  PersonalityAiAnalysisContent,
  PersonalityAssessment,
  PersonalityAssessmentStatus,
  PersonalityAssessmentTemplate,
  PersonalityBehavioralDimension,
  PersonalityComplexity,
  PersonalityComputedPattern,
  PersonalityComputedWatchpoint,
  PersonalityConfidence,
  PersonalityDimensionScore,
  PersonalityFacet,
  PersonalityFormKey,
  PersonalityFramework,
  PersonalityJobBehavioralProfile,
  PersonalityJobBehavioralRequirement,
  PersonalityQuestion,
  PersonalityQuestionMixCell,
  PersonalityQuestionOption,
  PersonalityQuestionQuality,
  PersonalityQuestionType,
  PersonalityResponse,
  PersonalityResponseScale,
  PersonalityResponseScaleLabel,
  PersonalityResponseValue,
  PersonalityScoreKind,
  PersonalityTrait,
  PersonalityValidityResult,
  PersonalityValidityStatus,
  JobRole,
} from '../types'

export interface PersonalityFrameworkRow {
  id: string
  key: string
  label_fa: string
  description: string
  version: number
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export function personalityFrameworkFromRow(r: PersonalityFrameworkRow): PersonalityFramework {
  return {
    id: r.id,
    key: r.key,
    labelFa: r.label_fa,
    description: r.description,
    version: r.version,
    active: r.active,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export interface PersonalityTraitRow {
  id: string
  framework_id: string
  key: string
  label_fa: string
  description: string
  display_order: number
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export function personalityTraitFromRow(r: PersonalityTraitRow): PersonalityTrait {
  return {
    id: r.id,
    frameworkId: r.framework_id,
    key: r.key,
    labelFa: r.label_fa,
    description: r.description,
    displayOrder: r.display_order,
    active: r.active,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export interface PersonalityFacetRow {
  id: string
  trait_id: string
  key: string
  label_fa: string
  description: string
  display_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export function personalityFacetFromRow(r: PersonalityFacetRow): PersonalityFacet {
  return {
    id: r.id,
    traitId: r.trait_id,
    key: r.key,
    labelFa: r.label_fa,
    description: r.description,
    displayOrder: r.display_order,
    active: r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export interface PersonalityBehavioralDimensionRow {
  id: string
  key: string
  label_fa: string
  description: string
  default_weight: number
  related_trait_ids: string[] | null
  related_facet_ids: string[] | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export function personalityBehavioralDimensionFromRow(r: PersonalityBehavioralDimensionRow): PersonalityBehavioralDimension {
  return {
    id: r.id,
    key: r.key,
    labelFa: r.label_fa,
    description: r.description,
    defaultWeight: r.default_weight,
    relatedTraitIds: r.related_trait_ids ?? [],
    relatedFacetIds: r.related_facet_ids ?? [],
    active: r.active,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export interface PersonalityJobBehavioralProfileRow {
  id: string
  job_role: string
  version: number
  title: string
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export function personalityJobBehavioralProfileFromRow(r: PersonalityJobBehavioralProfileRow): PersonalityJobBehavioralProfile {
  return {
    id: r.id,
    jobRole: r.job_role as JobRole,
    version: r.version,
    title: r.title,
    active: r.active,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export interface PersonalityJobBehavioralRequirementRow {
  id: string
  profile_id: string
  dimension_id: string
  weight: number
  min_threshold: number | null
  preferred_min: number | null
  preferred_max: number | null
  is_critical: boolean
  created_at: string
}

export function personalityJobBehavioralRequirementFromRow(r: PersonalityJobBehavioralRequirementRow): PersonalityJobBehavioralRequirement {
  return {
    id: r.id,
    profileId: r.profile_id,
    dimensionId: r.dimension_id,
    weight: r.weight,
    minThreshold: r.min_threshold,
    preferredMin: r.preferred_min,
    preferredMax: r.preferred_max,
    isCritical: r.is_critical,
    createdAt: r.created_at,
  }
}

export interface PersonalityResponseScaleRow {
  id: string
  key: string
  label_fa: string
  min_value: number
  max_value: number
  labels: PersonalityResponseScaleLabel[] | null
  scoring_rule: string
  reverse_rule: string
  active: boolean
  created_at: string
}

export function personalityResponseScaleFromRow(r: PersonalityResponseScaleRow): PersonalityResponseScale {
  return {
    id: r.id,
    key: r.key,
    labelFa: r.label_fa,
    minValue: r.min_value,
    maxValue: r.max_value,
    labels: r.labels ?? [],
    scoringRule: r.scoring_rule,
    reverseRule: r.reverse_rule,
    active: r.active,
    createdAt: r.created_at,
  }
}

export interface PersonalityQuestionRow {
  id: string
  question_group_id: string
  version: number
  superseded_by: string | null
  framework_id: string | null
  trait_id: string | null
  facet_id: string | null
  dimension_id: string | null
  question_type: string
  question_text: string
  scenario_context: string
  scale_id: string | null
  options: PersonalityQuestionOption[] | null
  reverse_scored: boolean
  job_role: string | null
  complexity: string
  weight: number
  active: boolean
  approval_status: string
  quality: PersonalityQuestionQuality | null
  usage_count: number
  last_used_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export function personalityQuestionFromRow(r: PersonalityQuestionRow): PersonalityQuestion {
  return {
    id: r.id,
    questionGroupId: r.question_group_id,
    version: r.version,
    supersededBy: r.superseded_by,
    frameworkId: r.framework_id,
    traitId: r.trait_id,
    facetId: r.facet_id,
    dimensionId: r.dimension_id,
    questionType: r.question_type as PersonalityQuestionType,
    questionText: r.question_text,
    scenarioContext: r.scenario_context,
    scaleId: r.scale_id,
    options: r.options ?? [],
    reverseScored: r.reverse_scored,
    jobRole: (r.job_role as JobRole | null) ?? null,
    complexity: r.complexity as PersonalityComplexity,
    weight: r.weight,
    active: r.active,
    approvalStatus: r.approval_status as PersonalityQuestion['approvalStatus'],
    quality: r.quality ?? {},
    usageCount: r.usage_count,
    lastUsedAt: r.last_used_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export interface PersonalityAssessmentTemplateRow {
  id: string
  job_role: string
  title: string
  framework_id: string | null
  job_profile_id: string | null
  question_mix: { question_type: string; complexity: string; count: number }[] | null
  duration_minutes: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export function personalityAssessmentTemplateFromRow(r: PersonalityAssessmentTemplateRow): PersonalityAssessmentTemplate {
  return {
    id: r.id,
    jobRole: r.job_role as JobRole,
    title: r.title,
    frameworkId: r.framework_id,
    jobProfileId: r.job_profile_id,
    questionMix: (r.question_mix ?? []).map((c) => ({
      questionType: c.question_type as PersonalityQuestionType,
      complexity: c.complexity as PersonalityComplexity,
      count: c.count,
    })),
    durationMinutes: r.duration_minutes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export interface PersonalityAssessmentRow {
  id: string
  assessment_id: string
  job_role: string
  framework_id: string | null
  job_profile_id: string | null
  form_key: string
  selected_question_ids: string[] | null
  status: string
  computed_patterns: PersonalityComputedPattern[] | null
  computed_watchpoints: PersonalityComputedWatchpoint[] | null
  started_at: string | null
  submitted_at: string | null
  locked_at: string | null
  locked_by: string | null
  candidate_token: string
  results_share_token: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export function personalityAssessmentFromRow(r: PersonalityAssessmentRow): PersonalityAssessment {
  return {
    id: r.id,
    assessmentId: r.assessment_id,
    jobRole: r.job_role as JobRole,
    frameworkId: r.framework_id,
    jobProfileId: r.job_profile_id,
    formKey: r.form_key as PersonalityFormKey,
    selectedQuestionIds: r.selected_question_ids ?? [],
    status: r.status as PersonalityAssessmentStatus,
    computedPatterns: r.computed_patterns ?? [],
    computedWatchpoints: r.computed_watchpoints ?? [],
    startedAt: r.started_at,
    submittedAt: r.submitted_at,
    lockedAt: r.locked_at,
    lockedBy: r.locked_by,
    candidateToken: r.candidate_token,
    resultsShareToken: r.results_share_token,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export interface PersonalityResponseRow {
  id: string
  personality_assessment_id: string
  question_id: string
  response_value: PersonalityResponseValue
  response_time_ms: number | null
  answered_at: string
}

export function personalityResponseFromRow(r: PersonalityResponseRow): PersonalityResponse {
  return {
    id: r.id,
    personalityAssessmentId: r.personality_assessment_id,
    questionId: r.question_id,
    responseValue: r.response_value,
    responseTimeMs: r.response_time_ms,
    answeredAt: r.answered_at,
  }
}

export interface PersonalityDimensionScoreRow {
  id: string
  personality_assessment_id: string
  score_kind: string
  trait_id: string | null
  facet_id: string | null
  dimension_id: string | null
  raw_score: number | null
  normalized_score: number | null
  weighted_score: number | null
  coverage_count: number
  confidence: string
  created_at: string
  updated_at: string
}

export function personalityDimensionScoreFromRow(r: PersonalityDimensionScoreRow): PersonalityDimensionScore {
  return {
    id: r.id,
    personalityAssessmentId: r.personality_assessment_id,
    scoreKind: r.score_kind as PersonalityScoreKind,
    traitId: r.trait_id,
    facetId: r.facet_id,
    dimensionId: r.dimension_id,
    rawScore: r.raw_score,
    normalizedScore: r.normalized_score,
    weightedScore: r.weighted_score,
    coverageCount: r.coverage_count,
    confidence: r.confidence as PersonalityConfidence,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export interface PersonalityValidityResultRow {
  id: string
  personality_assessment_id: string
  completion_seconds: number | null
  straight_lining_flag: boolean
  extreme_response_rate: number | null
  consistency_score: number | null
  social_desirability_score: number | null
  random_pattern_flag: boolean
  missing_response_count: number
  contradiction_count: number
  overall_status: string
  computed_at: string
}

export function personalityValidityResultFromRow(r: PersonalityValidityResultRow): PersonalityValidityResult {
  return {
    id: r.id,
    personalityAssessmentId: r.personality_assessment_id,
    completionSeconds: r.completion_seconds,
    straightLiningFlag: r.straight_lining_flag,
    extremeResponseRate: r.extreme_response_rate,
    consistencyScore: r.consistency_score,
    socialDesirabilityScore: r.social_desirability_score,
    randomPatternFlag: r.random_pattern_flag,
    missingResponseCount: r.missing_response_count,
    contradictionCount: r.contradiction_count,
    overallStatus: r.overall_status as PersonalityValidityStatus,
    computedAt: r.computed_at,
  }
}

export interface PersonalityAiAnalysisRow {
  id: string
  personality_assessment_id: string
  model: string
  analysis: PersonalityAiAnalysisContent
  confidence: string | null
  generated_by: string | null
  created_at: string
}

export function personalityAiAnalysisFromRow(r: PersonalityAiAnalysisRow): PersonalityAiAnalysis {
  return {
    id: r.id,
    personalityAssessmentId: r.personality_assessment_id,
    model: r.model,
    analysis: r.analysis,
    confidence: r.confidence,
    generatedBy: r.generated_by,
    createdAt: r.created_at,
  }
}

export function personalityQuestionMixToRowPayload(mix: PersonalityQuestionMixCell[]) {
  return mix.map((c) => ({ question_type: c.questionType, complexity: c.complexity, count: c.count }))
}
