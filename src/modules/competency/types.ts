/** Data model for the Competency Assessment module — a structured interview/scoring tool for gas
 * transmission pipeline construction project manager candidates. The question bank itself lives in
 * lib/competencyModel.ts as a fixed, versioned rubric (not a DB table) — only the candidate's
 * profile and their answers to that fixed rubric are real per-assessment data.
 */

export type CompetencyDomainKey = 'technical' | 'planning' | 'hse' | 'quality' | 'risk' | 'contract' | 'leadership'

export interface CompetencyDomain {
  key: CompetencyDomainKey
  title: string
  shortTitle: string
  description: string
}

export interface CompetencyQuestion {
  key: string
  domain: CompetencyDomainKey
  text: string
}

/** score: 1 (ضعیف) to 5 (عالی), or null if not yet answered. */
export interface CompetencyAnswer {
  score: number | null
  note: string
}

export type CompetencyAnswers = Record<string, CompetencyAnswer>

export type AssessmentStatus = 'draft' | 'completed'

export interface CompetencyAssessment {
  id: string
  candidateName: string
  candidatePosition: string
  yearsExperienceTotal: number | null
  yearsExperiencePipeline: number | null
  currentEmployer: string
  education: string
  certifications: string
  notableProjects: string
  interviewDate: string
  status: AssessmentStatus
  answers: CompetencyAnswers
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface DomainScore {
  domain: CompetencyDomain
  answeredCount: number
  totalCount: number
  /** 1-5 average of answered questions in this domain; null until at least one is answered. */
  averageScore: number | null
  /** averageScore mapped to 0-100. */
  percentScore: number | null
}
