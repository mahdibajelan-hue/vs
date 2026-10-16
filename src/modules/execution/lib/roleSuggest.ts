import type { ExRole } from '../types'

/** Suggested module role for a person of the project structure (master data): the organisation they belong to decides first (employer / consultant / contractor side), then their position. Only a suggestion — a manager confirms it. */
export function suggestExRole(positionKey: string, orgId: string | null, project: { employerOrgId: string | null; consultantOrgId: string | null; contractorOrgId: string | null; partnerOrgId?: string | null } | undefined): ExRole | null {
  if (orgId && project) {
    if (orgId === project.employerOrgId) return 'employer'
    if (orgId === project.consultantOrgId) return positionKey === 'consultant_rep' || positionKey === 'other' ? 'consultant' : 'supervision'
    if (orgId === project.contractorOrgId || orgId === project.partnerOrgId) return ['executive', 'project_manager', 'deputy_pm'].includes(positionKey) ? 'manager' : positionKey === 'site_manager' ? 'site_head' : positionKey === 'planning_manager' ? 'planner' : positionKey === 'finance_manager' ? 'payment' : positionKey === 'contracts_manager' ? 'claims' : 'contractor'
  }
  switch (positionKey) {
    case 'executive': case 'project_manager': case 'deputy_pm': return 'manager'
    case 'site_manager': return 'site_head'
    case 'planning_manager': return 'planner'
    case 'contracts_manager': return 'claims'
    case 'finance_manager': return 'payment'
    case 'employer_rep': return 'employer'
    case 'consultant_rep': return 'consultant'
    case 'contractor_rep': return 'contractor'
    default: return null
  }
}
