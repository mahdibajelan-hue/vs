import type {
  AssessmentStatus,
  AttachmentKind,
  CertificationEntry,
  CompAttachment,
  CompetencyAnswers,
  CompetencyAssessment,
  CompPanelist,
  CompPanelistScore,
  CompProfileLite,
  EducationEntry,
  EmploymentEntry,
  SelfServiceStatus,
} from '../types'

export interface CompAssessmentRow {
  id: string
  candidate_name: string
  candidate_position: string
  candidate_national_id: string
  candidate_phone: string
  candidate_email: string
  candidate_birth_date: string | null
  candidate_age: number | null
  has_disability: boolean
  disability_note: string
  photo_url: string
  years_experience_total: number | null
  years_experience_pipeline: number | null
  current_employer: string
  education: EducationEntry[]
  employment_history: EmploymentEntry[]
  certifications: CertificationEntry[]
  notable_projects: string
  interview_date: string
  status: string
  answers: CompetencyAnswers
  capstone_score: number | null
  capstone_note: string
  education_score: number | null
  experience_score: number | null
  pm_training_score: number | null
  pm_certification_score: number | null
  self_service_token: string
  self_service_status: string
  reviewed_by: string | null
  reviewed_at: string | null
  is_approved: boolean
  strengths: string
  development_areas: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export function compAssessmentFromRow(r: CompAssessmentRow): CompetencyAssessment {
  return {
    id: r.id,
    candidateName: r.candidate_name,
    candidatePosition: r.candidate_position,
    candidateNationalId: r.candidate_national_id,
    candidatePhone: r.candidate_phone,
    candidateEmail: r.candidate_email,
    candidateBirthDate: r.candidate_birth_date ?? '',
    candidateAge: r.candidate_age,
    hasDisability: r.has_disability,
    disabilityNote: r.disability_note ?? '',
    photoUrl: r.photo_url,
    yearsExperienceTotal: r.years_experience_total,
    yearsExperiencePipeline: r.years_experience_pipeline,
    currentEmployer: r.current_employer,
    education: r.education ?? [],
    employmentHistory: r.employment_history ?? [],
    certifications: r.certifications ?? [],
    notableProjects: r.notable_projects,
    interviewDate: r.interview_date,
    status: r.status as AssessmentStatus,
    answers: r.answers ?? {},
    capstoneScore: r.capstone_score,
    capstoneNote: r.capstone_note ?? '',
    educationScore: r.education_score,
    experienceScore: r.experience_score,
    pmTrainingScore: r.pm_training_score,
    pmCertificationScore: r.pm_certification_score,
    selfServiceToken: r.self_service_token,
    selfServiceStatus: r.self_service_status as SelfServiceStatus,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    isApproved: r.is_approved,
    strengths: r.strengths ?? '',
    developmentAreas: r.development_areas ?? '',
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export interface CompPanelistRow {
  id: string
  assessment_id: string
  user_id: string
  is_lead: boolean
  added_by: string | null
  created_at: string
}

export function compPanelistFromRow(r: CompPanelistRow): CompPanelist {
  return {
    id: r.id,
    assessmentId: r.assessment_id,
    userId: r.user_id,
    isLead: r.is_lead,
    addedBy: r.added_by,
    createdAt: r.created_at,
  }
}

export interface CompPanelistScoreRow {
  id: string
  assessment_id: string
  panelist_id: string
  answers: CompetencyAnswers
  capstone_score: number | null
  capstone_note: string
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export function compPanelistScoreFromRow(r: CompPanelistScoreRow): CompPanelistScore {
  return {
    id: r.id,
    assessmentId: r.assessment_id,
    panelistId: r.panelist_id,
    answers: r.answers ?? {},
    capstoneScore: r.capstone_score,
    capstoneNote: r.capstone_note ?? '',
    submittedAt: r.submitted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export interface CompAttachmentRow {
  id: string
  assessment_id: string
  kind: string
  file_name: string
  storage_path: string
  uploaded_by: string | null
  uploaded_by_candidate: boolean
  created_at: string
}

export function compAttachmentFromRow(r: CompAttachmentRow): CompAttachment {
  return {
    id: r.id,
    assessmentId: r.assessment_id,
    kind: r.kind as AttachmentKind,
    fileName: r.file_name,
    storagePath: r.storage_path,
    uploadedBy: r.uploaded_by,
    uploadedByCandidate: r.uploaded_by_candidate,
    createdAt: r.created_at,
  }
}

export interface ProfileLiteRow {
  id: string
  email: string
  full_name: string
}

export function profileLiteFromRow(r: ProfileLiteRow): CompProfileLite {
  return { id: r.id, email: r.email, fullName: r.full_name || r.email }
}
