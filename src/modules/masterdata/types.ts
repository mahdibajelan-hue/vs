export type OrgType = 'employer' | 'consultant' | 'contractor' | 'partner' | 'internal' | 'other'

export const ORG_TYPES: OrgType[] = ['employer', 'consultant', 'contractor', 'partner', 'internal', 'other']

export const ORG_TYPE_LABEL_FA: Record<OrgType, string> = {
  employer: 'کارفرما',
  consultant: 'مشاور',
  contractor: 'پیمانکار',
  partner: 'شریک',
  internal: 'واحد داخلی',
  other: 'سایر',
}

export interface Organization {
  id: string
  name: string
  shortName: string
  orgType: OrgType
  description: string
  contactName: string
  contactEmail: string
  contactPhone: string
  isActive: boolean
  createdAt: string
}

export type PortfolioProgramStatus = 'active' | 'on_hold' | 'closed'

export const PORTFOLIO_PROGRAM_STATUSES: PortfolioProgramStatus[] = ['active', 'on_hold', 'closed']

export const PORTFOLIO_PROGRAM_STATUS_LABEL_FA: Record<PortfolioProgramStatus, string> = {
  active: 'فعال',
  on_hold: 'متوقف',
  closed: 'بسته',
}

export interface Portfolio {
  id: string
  code: string
  name: string
  description: string
  ownerId: string | null
  organizationId: string | null
  status: PortfolioProgramStatus
  startDate: string | null
  endDate: string | null
  strategicObjectives: string
  isActive: boolean
  createdAt: string
}

export interface Program {
  id: string
  code: string
  name: string
  description: string
  portfolioId: string | null
  programManagerId: string | null
  sponsorId: string | null
  status: PortfolioProgramStatus
  startDate: string | null
  plannedFinish: string | null
  strategicObjectives: string
  createdAt: string
}

export type ProjectLifecycleStatus =
  | 'idea'
  | 'proposed'
  | 'approved'
  | 'planning'
  | 'executing'
  | 'on_hold'
  | 'completed'
  | 'closed'
  | 'archived'
  | 'cancelled'

export const PROJECT_LIFECYCLE_STATUSES: ProjectLifecycleStatus[] = [
  'idea',
  'proposed',
  'approved',
  'planning',
  'executing',
  'on_hold',
  'completed',
  'closed',
  'archived',
  'cancelled',
]

export const PROJECT_STATUS_LABEL_FA: Record<ProjectLifecycleStatus, string> = {
  idea: 'ایده',
  proposed: 'پیشنهادی',
  approved: 'تاییدشده',
  planning: 'برنامه‌ریزی',
  executing: 'در حال اجرا',
  on_hold: 'متوقف',
  completed: 'تکمیل‌شده',
  closed: 'بسته‌شده',
  archived: 'بایگانی‌شده',
  cancelled: 'لغوشده',
}

// Rough health color derived from lifecycle + schedule status — a real "Project Health" metric
// (rule/AI-driven, per spec sections 37-38) is future work; this is just enough to color the list.
export const PROJECT_STATUS_TONE: Record<ProjectLifecycleStatus, 'neutral' | 'green' | 'amber' | 'red'> = {
  idea: 'neutral',
  proposed: 'neutral',
  approved: 'neutral',
  planning: 'neutral',
  executing: 'green',
  on_hold: 'amber',
  completed: 'green',
  closed: 'neutral',
  archived: 'neutral',
  cancelled: 'red',
}

export type ScheduleStatus = 'on_track' | 'at_risk' | 'delayed' | 'ahead' | 'unknown'

export const SCHEDULE_STATUSES: ScheduleStatus[] = ['on_track', 'at_risk', 'delayed', 'ahead', 'unknown']

export const SCHEDULE_STATUS_LABEL_FA: Record<ScheduleStatus, string> = {
  on_track: 'طبق برنامه',
  at_risk: 'در معرض ریسک',
  delayed: 'تاخیردار',
  ahead: 'جلوتر از برنامه',
  unknown: 'نامشخص',
}

export interface MasterProject {
  id: string
  projectIdCode: string
  projectCode: string
  officialName: string
  shortName: string
  description: string
  projectType: string
  projectCategory: string
  portfolioId: string | null
  programId: string | null
  status: ProjectLifecycleStatus

  contractNumber: string
  contractType: string
  contractValue: number | null
  currency: string
  contractStartDate: string | null
  contractualCompletionDate: string | null
  revisedCompletionDate: string | null
  employerOrgId: string | null
  consultantOrgId: string | null
  contractorOrgId: string | null
  partnerOrgId: string | null

  sponsorId: string | null
  projectManagerId: string | null
  projectDirectorId: string | null
  programManagerId: string | null
  portfolioManagerId: string | null
  pmoOwnerId: string | null

  plannedStartDate: string | null
  plannedFinishDate: string | null
  actualStartDate: string | null
  actualFinishDate: string | null
  forecastFinishDate: string | null
  baselineVersion: string
  scheduleStatus: ScheduleStatus

  createdAt: string
}

export type PhaseStatus = 'not_started' | 'in_progress' | 'completed' | 'on_hold'

export const PHASE_STATUSES: PhaseStatus[] = ['not_started', 'in_progress', 'completed', 'on_hold']

export const PHASE_STATUS_LABEL_FA: Record<PhaseStatus, string> = {
  not_started: 'شروع‌نشده',
  in_progress: 'در حال انجام',
  completed: 'تکمیل‌شده',
  on_hold: 'متوقف',
}

export interface ProjectPhase {
  id: string
  projectId: string
  name: string
  code: string
  sequence: number
  plannedStart: string | null
  plannedFinish: string | null
  actualStart: string | null
  actualFinish: string | null
  forecastFinish: string | null
  status: PhaseStatus
  progress: number
}
