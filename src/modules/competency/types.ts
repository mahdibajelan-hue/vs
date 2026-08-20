export type CompetencyDomainKey =
  | 'governance'
  | 'planning'
  | 'cost'
  | 'hse'
  | 'quality'
  | 'changeRisk'
  | 'stakeholder'
  | 'execution'

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
}

export type CompetencyAnswers = Record<string, CompetencyAnswer>

export type AssessmentStatus = 'draft' | 'completed'
export type SelfServiceStatus = 'not_sent' | 'pending' | 'submitted' | 'reviewed'

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
  endDate: string
  insuranceMonths: number | null
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
  candidateName: string
  candidatePosition: string
  candidateNationalId: string
  candidatePhone: string
  candidateEmail: string
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
  reviewedBy: string | null
  reviewedAt: string | null
  /** Explicit go/no-go verdict from the interview lead / final assessor — distinct from status='completed', which only means the scoring flow was finished. Shown as a badge on the candidate's card. */
  isApproved: boolean
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

export interface CompPanelist {
  id: string
  assessmentId: string
  userId: string
  isLead: boolean
  addedBy: string | null
  createdAt: string
}

export interface CompPanelistScore {
  id: string
  assessmentId: string
  panelistId: string
  answers: CompetencyAnswers
  capstoneScore: number | null
  capstoneNote: string
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
