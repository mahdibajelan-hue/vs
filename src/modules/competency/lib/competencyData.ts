import type { AssessmentStatus, CompetencyAnswers, CompetencyAssessment } from '../types'

export interface CompAssessmentRow {
  id: string
  candidate_name: string
  candidate_position: string
  years_experience_total: number | null
  years_experience_pipeline: number | null
  current_employer: string
  education: string
  certifications: string
  notable_projects: string
  interview_date: string
  status: string
  answers: CompetencyAnswers
  created_by: string | null
  created_at: string
  updated_at: string
}

export function compAssessmentFromRow(r: CompAssessmentRow): CompetencyAssessment {
  return {
    id: r.id,
    candidateName: r.candidate_name,
    candidatePosition: r.candidate_position,
    yearsExperienceTotal: r.years_experience_total,
    yearsExperiencePipeline: r.years_experience_pipeline,
    currentEmployer: r.current_employer,
    education: r.education,
    certifications: r.certifications,
    notableProjects: r.notable_projects,
    interviewDate: r.interview_date,
    status: r.status as AssessmentStatus,
    answers: r.answers ?? {},
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
