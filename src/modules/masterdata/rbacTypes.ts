export type ModuleKeyRef = 'risk' | 'issues' | 'pipepulse' | 'reporting' | 'admin'

export interface RastaModule {
  key: ModuleKeyRef
  labelFa: string
  isActive: boolean
}

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'submit' | 'review' | 'approve' | 'reject' | 'export' | 'configure'

export const PERMISSION_ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'submit', 'review', 'approve', 'reject', 'export', 'configure']

export const PERMISSION_ACTION_LABEL_FA: Record<PermissionAction, string> = {
  view: 'مشاهده',
  create: 'ایجاد',
  edit: 'ویرایش',
  delete: 'حذف',
  submit: 'ثبت',
  review: 'بازبینی',
  approve: 'تایید',
  reject: 'رد',
  export: 'خروجی',
  configure: 'پیکربندی',
}

export interface RastaRole {
  id: string
  name: string
  description: string
  isSystem: boolean
  createdAt: string
}

export interface RastaPermission {
  id: string
  moduleKey: ModuleKeyRef
  action: PermissionAction
}

export interface UserRoleOption {
  id: string
  email: string
  fullName: string
}

export type ScopeLevel = 'all' | 'portfolio' | 'program' | 'project' | 'phase'

export const SCOPE_LEVELS: ScopeLevel[] = ['all', 'portfolio', 'program', 'project', 'phase']

export const SCOPE_LEVEL_LABEL_FA: Record<ScopeLevel, string> = {
  all: 'همه پروژه‌ها',
  portfolio: 'یک پورتفولیو',
  program: 'یک طرح',
  project: 'یک پروژه',
  phase: 'یک فاز',
}

export interface UserProjectScope {
  id: string
  userId: string
  scopeLevel: ScopeLevel
  portfolioId: string | null
  programId: string | null
  projectId: string | null
  phaseId: string | null
  createdAt: string
}

export interface RastaProjectRole {
  id: string
  name: string
  isSystem: boolean
}

export interface ProjectRoleAssignment {
  id: string
  projectId: string
  userId: string
  projectRoleId: string
  createdAt: string
}

export type MappingSourceModule = 'risk' | 'issues' | 'pipepulse'

export const MAPPING_SOURCE_MODULES: MappingSourceModule[] = ['risk', 'issues', 'pipepulse']

export const MAPPING_SOURCE_MODULE_LABEL_FA: Record<MappingSourceModule, string> = {
  risk: 'مدیریت ریسک',
  issues: 'مدیریت مسائل',
  pipepulse: 'PipePulse',
}

export type MappingStatus = 'suggested' | 'confirmed' | 'rejected' | 'pending_review'

export const MAPPING_STATUS_LABEL_FA: Record<MappingStatus, string> = {
  suggested: 'پیشنهادی',
  confirmed: 'تاییدشده',
  rejected: 'ردشده',
  pending_review: 'در انتظار بازبینی',
}

export interface ProjectMapping {
  id: string
  masterProjectId: string
  sourceModule: MappingSourceModule
  sourceProjectId: string
  aliasName: string
  status: MappingStatus
  matchConfidence: number | null
  createdAt: string
  decidedAt: string | null
}

/** A source-module project row not yet represented in rasta_project_mappings. */
export interface UnmappedSourceProject {
  sourceModule: MappingSourceModule
  sourceProjectId: string
  name: string
}
