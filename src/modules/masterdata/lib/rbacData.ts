import type {
  MappingSourceModule,
  MappingStatus,
  ModuleKeyRef,
  PermissionAction,
  ProjectMapping,
  ProjectRoleAssignment,
  RastaModule,
  RastaPermission,
  RastaProjectRole,
  RastaRole,
  ScopeLevel,
  UserProjectScope,
} from '../rbacTypes'

interface RastaModuleRow {
  key: string
  label_fa: string
  is_active: boolean
}

export function rastaModuleFromRow(r: RastaModuleRow): RastaModule {
  return { key: r.key as ModuleKeyRef, labelFa: r.label_fa, isActive: r.is_active }
}

interface RastaRoleRow {
  id: string
  name: string
  description: string
  is_system: boolean
  created_at: string
}

export function rastaRoleFromRow(r: RastaRoleRow): RastaRole {
  return { id: r.id, name: r.name, description: r.description, isSystem: r.is_system, createdAt: r.created_at }
}

interface RastaPermissionRow {
  id: string
  module_key: string
  action: string
}

export function rastaPermissionFromRow(r: RastaPermissionRow): RastaPermission {
  return { id: r.id, moduleKey: r.module_key as ModuleKeyRef, action: r.action as PermissionAction }
}

interface UserProjectScopeRow {
  id: string
  user_id: string
  scope_level: string
  portfolio_id: string | null
  program_id: string | null
  project_id: string | null
  phase_id: string | null
  created_at: string
}

export function userProjectScopeFromRow(r: UserProjectScopeRow): UserProjectScope {
  return {
    id: r.id,
    userId: r.user_id,
    scopeLevel: r.scope_level as ScopeLevel,
    portfolioId: r.portfolio_id,
    programId: r.program_id,
    projectId: r.project_id,
    phaseId: r.phase_id,
    createdAt: r.created_at,
  }
}

export function userProjectScopeToRow(userId: string, s: { scopeLevel: ScopeLevel; portfolioId?: string | null; programId?: string | null; projectId?: string | null }) {
  return {
    user_id: userId,
    scope_level: s.scopeLevel,
    portfolio_id: s.scopeLevel === 'portfolio' ? s.portfolioId || null : null,
    program_id: s.scopeLevel === 'program' ? s.programId || null : null,
    project_id: s.scopeLevel === 'project' ? s.projectId || null : null,
  }
}

interface RastaProjectRoleRow {
  id: string
  name: string
  is_system: boolean
}

export function rastaProjectRoleFromRow(r: RastaProjectRoleRow): RastaProjectRole {
  return { id: r.id, name: r.name, isSystem: r.is_system }
}

interface ProjectRoleAssignmentRow {
  id: string
  project_id: string
  user_id: string
  project_role_id: string
  created_at: string
}

export function projectRoleAssignmentFromRow(r: ProjectRoleAssignmentRow): ProjectRoleAssignment {
  return { id: r.id, projectId: r.project_id, userId: r.user_id, projectRoleId: r.project_role_id, createdAt: r.created_at }
}

interface ProjectMappingRow {
  id: string
  master_project_id: string
  source_module: string
  source_project_id: string
  alias_name: string
  status: string
  match_confidence: number | null
  created_at: string
  decided_at: string | null
}

export function projectMappingFromRow(r: ProjectMappingRow): ProjectMapping {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    sourceModule: r.source_module as MappingSourceModule,
    sourceProjectId: r.source_project_id,
    aliasName: r.alias_name,
    status: r.status as MappingStatus,
    matchConfidence: r.match_confidence,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  }
}
