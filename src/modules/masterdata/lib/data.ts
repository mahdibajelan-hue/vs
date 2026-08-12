import type {
  DependencyType,
  MasterProject,
  Organization,
  OrgType,
  PhaseStatus,
  Portfolio,
  PortfolioProgramStatus,
  Program,
  ProjectDependency,
  ProjectLifecycleStatus,
  ProjectPhase,
  ScheduleStatus,
} from '../types'

interface OrganizationRow {
  id: string
  name: string
  short_name: string
  org_type: string
  description: string
  contact_name: string
  contact_email: string
  contact_phone: string
  is_active: boolean
  created_at: string
}

export function organizationFromRow(r: OrganizationRow): Organization {
  return {
    id: r.id,
    name: r.name,
    shortName: r.short_name,
    orgType: r.org_type as OrgType,
    description: r.description,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    isActive: r.is_active,
    createdAt: r.created_at,
  }
}

export function organizationToRow(o: Partial<Organization>) {
  const row: Record<string, unknown> = {}
  if (o.name !== undefined) row.name = o.name
  if (o.shortName !== undefined) row.short_name = o.shortName
  if (o.orgType !== undefined) row.org_type = o.orgType
  if (o.description !== undefined) row.description = o.description
  if (o.contactName !== undefined) row.contact_name = o.contactName
  if (o.contactEmail !== undefined) row.contact_email = o.contactEmail
  if (o.contactPhone !== undefined) row.contact_phone = o.contactPhone
  if (o.isActive !== undefined) row.is_active = o.isActive
  return row
}

interface PortfolioRow {
  id: string
  code: string
  name: string
  description: string
  owner_id: string | null
  organization_id: string | null
  status: string
  start_date: string | null
  end_date: string | null
  strategic_objectives: string
  is_active: boolean
  created_at: string
}

export function portfolioFromRow(r: PortfolioRow): Portfolio {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    ownerId: r.owner_id,
    organizationId: r.organization_id,
    status: r.status as PortfolioProgramStatus,
    startDate: r.start_date,
    endDate: r.end_date,
    strategicObjectives: r.strategic_objectives,
    isActive: r.is_active,
    createdAt: r.created_at,
  }
}

export function portfolioToRow(p: Partial<Portfolio>) {
  const row: Record<string, unknown> = {}
  if (p.code !== undefined) row.code = p.code
  if (p.name !== undefined) row.name = p.name
  if (p.description !== undefined) row.description = p.description
  if (p.ownerId !== undefined) row.owner_id = p.ownerId || null
  if (p.organizationId !== undefined) row.organization_id = p.organizationId || null
  if (p.status !== undefined) row.status = p.status
  if (p.startDate !== undefined) row.start_date = p.startDate || null
  if (p.endDate !== undefined) row.end_date = p.endDate || null
  if (p.strategicObjectives !== undefined) row.strategic_objectives = p.strategicObjectives
  if (p.isActive !== undefined) row.is_active = p.isActive
  return row
}

interface ProgramRow {
  id: string
  code: string
  name: string
  description: string
  portfolio_id: string | null
  program_manager_id: string | null
  sponsor_id: string | null
  status: string
  start_date: string | null
  planned_finish: string | null
  strategic_objectives: string
  created_at: string
}

export function programFromRow(r: ProgramRow): Program {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    portfolioId: r.portfolio_id,
    programManagerId: r.program_manager_id,
    sponsorId: r.sponsor_id,
    status: r.status as PortfolioProgramStatus,
    startDate: r.start_date,
    plannedFinish: r.planned_finish,
    strategicObjectives: r.strategic_objectives,
    createdAt: r.created_at,
  }
}

export function programToRow(p: Partial<Program>) {
  const row: Record<string, unknown> = {}
  if (p.code !== undefined) row.code = p.code
  if (p.name !== undefined) row.name = p.name
  if (p.description !== undefined) row.description = p.description
  if (p.portfolioId !== undefined) row.portfolio_id = p.portfolioId || null
  if (p.programManagerId !== undefined) row.program_manager_id = p.programManagerId || null
  if (p.sponsorId !== undefined) row.sponsor_id = p.sponsorId || null
  if (p.status !== undefined) row.status = p.status
  if (p.startDate !== undefined) row.start_date = p.startDate || null
  if (p.plannedFinish !== undefined) row.planned_finish = p.plannedFinish || null
  if (p.strategicObjectives !== undefined) row.strategic_objectives = p.strategicObjectives
  return row
}

interface MasterProjectRow {
  id: string
  project_id_code: string
  project_code: string
  official_name: string
  short_name: string
  description: string
  project_type: string
  project_category: string
  portfolio_id: string | null
  program_id: string | null
  status: string
  contract_number: string
  contract_type: string
  contract_value: number | null
  forecast_cost_at_completion: number | null
  currency: string
  contract_start_date: string | null
  contractual_completion_date: string | null
  revised_completion_date: string | null
  employer_org_id: string | null
  consultant_org_id: string | null
  contractor_org_id: string | null
  partner_org_id: string | null
  sponsor_id: string | null
  project_manager_id: string | null
  project_director_id: string | null
  program_manager_id: string | null
  portfolio_manager_id: string | null
  pmo_owner_id: string | null
  planned_start_date: string | null
  planned_finish_date: string | null
  actual_start_date: string | null
  actual_finish_date: string | null
  forecast_finish_date: string | null
  baseline_version: string
  schedule_status: string
  created_at: string
}

export function masterProjectFromRow(r: MasterProjectRow): MasterProject {
  return {
    id: r.id,
    projectIdCode: r.project_id_code,
    projectCode: r.project_code,
    officialName: r.official_name,
    shortName: r.short_name,
    description: r.description,
    projectType: r.project_type,
    projectCategory: r.project_category,
    portfolioId: r.portfolio_id,
    programId: r.program_id,
    status: r.status as ProjectLifecycleStatus,
    contractNumber: r.contract_number,
    contractType: r.contract_type,
    contractValue: r.contract_value == null ? null : Number(r.contract_value),
    forecastCostAtCompletion: r.forecast_cost_at_completion == null ? null : Number(r.forecast_cost_at_completion),
    currency: r.currency,
    contractStartDate: r.contract_start_date,
    contractualCompletionDate: r.contractual_completion_date,
    revisedCompletionDate: r.revised_completion_date,
    employerOrgId: r.employer_org_id,
    consultantOrgId: r.consultant_org_id,
    contractorOrgId: r.contractor_org_id,
    partnerOrgId: r.partner_org_id,
    sponsorId: r.sponsor_id,
    projectManagerId: r.project_manager_id,
    projectDirectorId: r.project_director_id,
    programManagerId: r.program_manager_id,
    portfolioManagerId: r.portfolio_manager_id,
    pmoOwnerId: r.pmo_owner_id,
    plannedStartDate: r.planned_start_date,
    plannedFinishDate: r.planned_finish_date,
    actualStartDate: r.actual_start_date,
    actualFinishDate: r.actual_finish_date,
    forecastFinishDate: r.forecast_finish_date,
    baselineVersion: r.baseline_version,
    scheduleStatus: r.schedule_status as ScheduleStatus,
    createdAt: r.created_at,
  }
}

// project_id_code is intentionally never included — the DB trigger assigns it on insert and
// silently rejects any attempted change on update (see prevent_project_id_code_change()).
export function masterProjectToRow(p: Partial<MasterProject>) {
  const row: Record<string, unknown> = {}
  if (p.projectCode !== undefined) row.project_code = p.projectCode
  if (p.officialName !== undefined) row.official_name = p.officialName
  if (p.shortName !== undefined) row.short_name = p.shortName
  if (p.description !== undefined) row.description = p.description
  if (p.projectType !== undefined) row.project_type = p.projectType
  if (p.projectCategory !== undefined) row.project_category = p.projectCategory
  if (p.portfolioId !== undefined) row.portfolio_id = p.portfolioId || null
  if (p.programId !== undefined) row.program_id = p.programId || null
  if (p.status !== undefined) row.status = p.status
  if (p.contractNumber !== undefined) row.contract_number = p.contractNumber
  if (p.contractType !== undefined) row.contract_type = p.contractType
  if (p.contractValue !== undefined) row.contract_value = p.contractValue
  if (p.forecastCostAtCompletion !== undefined) row.forecast_cost_at_completion = p.forecastCostAtCompletion
  if (p.currency !== undefined) row.currency = p.currency
  if (p.contractStartDate !== undefined) row.contract_start_date = p.contractStartDate || null
  if (p.contractualCompletionDate !== undefined) row.contractual_completion_date = p.contractualCompletionDate || null
  if (p.revisedCompletionDate !== undefined) row.revised_completion_date = p.revisedCompletionDate || null
  if (p.employerOrgId !== undefined) row.employer_org_id = p.employerOrgId || null
  if (p.consultantOrgId !== undefined) row.consultant_org_id = p.consultantOrgId || null
  if (p.contractorOrgId !== undefined) row.contractor_org_id = p.contractorOrgId || null
  if (p.partnerOrgId !== undefined) row.partner_org_id = p.partnerOrgId || null
  if (p.sponsorId !== undefined) row.sponsor_id = p.sponsorId || null
  if (p.projectManagerId !== undefined) row.project_manager_id = p.projectManagerId || null
  if (p.projectDirectorId !== undefined) row.project_director_id = p.projectDirectorId || null
  if (p.programManagerId !== undefined) row.program_manager_id = p.programManagerId || null
  if (p.portfolioManagerId !== undefined) row.portfolio_manager_id = p.portfolioManagerId || null
  if (p.pmoOwnerId !== undefined) row.pmo_owner_id = p.pmoOwnerId || null
  if (p.plannedStartDate !== undefined) row.planned_start_date = p.plannedStartDate || null
  if (p.plannedFinishDate !== undefined) row.planned_finish_date = p.plannedFinishDate || null
  if (p.actualStartDate !== undefined) row.actual_start_date = p.actualStartDate || null
  if (p.actualFinishDate !== undefined) row.actual_finish_date = p.actualFinishDate || null
  if (p.forecastFinishDate !== undefined) row.forecast_finish_date = p.forecastFinishDate || null
  if (p.baselineVersion !== undefined) row.baseline_version = p.baselineVersion
  if (p.scheduleStatus !== undefined) row.schedule_status = p.scheduleStatus
  return row
}

interface ProjectPhaseRow {
  id: string
  project_id: string
  name: string
  code: string
  sequence: number
  planned_start: string | null
  planned_finish: string | null
  actual_start: string | null
  actual_finish: string | null
  forecast_finish: string | null
  status: string
  progress: number
}

export function projectPhaseFromRow(r: ProjectPhaseRow): ProjectPhase {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    code: r.code,
    sequence: r.sequence,
    plannedStart: r.planned_start,
    plannedFinish: r.planned_finish,
    actualStart: r.actual_start,
    actualFinish: r.actual_finish,
    forecastFinish: r.forecast_finish,
    status: r.status as PhaseStatus,
    progress: r.progress,
  }
}

export function projectPhaseToRow(projectId: string, p: Partial<ProjectPhase>) {
  const row: Record<string, unknown> = { project_id: projectId }
  if (p.name !== undefined) row.name = p.name
  if (p.code !== undefined) row.code = p.code
  if (p.sequence !== undefined) row.sequence = p.sequence
  if (p.plannedStart !== undefined) row.planned_start = p.plannedStart || null
  if (p.plannedFinish !== undefined) row.planned_finish = p.plannedFinish || null
  if (p.actualStart !== undefined) row.actual_start = p.actualStart || null
  if (p.actualFinish !== undefined) row.actual_finish = p.actualFinish || null
  if (p.forecastFinish !== undefined) row.forecast_finish = p.forecastFinish || null
  if (p.status !== undefined) row.status = p.status
  if (p.progress !== undefined) row.progress = p.progress
  return row
}

interface ProjectDependencyRow {
  id: string
  project_id: string
  depends_on_project_id: string
  dependency_type: string
  notes: string
  created_at: string
}

export function projectDependencyFromRow(r: ProjectDependencyRow): ProjectDependency {
  return {
    id: r.id,
    projectId: r.project_id,
    dependsOnProjectId: r.depends_on_project_id,
    dependencyType: r.dependency_type as DependencyType,
    notes: r.notes,
    createdAt: r.created_at,
  }
}

export function projectDependencyToRow(p: { projectId: string; dependsOnProjectId: string; dependencyType?: DependencyType; notes?: string }) {
  const row: Record<string, unknown> = { project_id: p.projectId, depends_on_project_id: p.dependsOnProjectId }
  if (p.dependencyType !== undefined) row.dependency_type = p.dependencyType
  if (p.notes !== undefined) row.notes = p.notes
  return row
}
