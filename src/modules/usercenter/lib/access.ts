import type { PermissionAction, RastaPermission, RastaRole, UserProjectScope } from '../../masterdata/rbacTypes'
import type { MasterProject } from '../../masterdata/types'
import type { Membership, PermissionOverride, ProductKey, UcProject } from '../types'
import { PRODUCTS } from '../types'

/** The six actions the matrix leads with (labels follow the product vocabulary; `configure` is the module "Admin" level). */
export const PRIMARY_ACTIONS: { action: PermissionAction; label: string; en: string }[] = [
  { action: 'view', label: 'مشاهده', en: 'View' },
  { action: 'create', label: 'ایجاد', en: 'Create' },
  { action: 'edit', label: 'ویرایش', en: 'Edit' },
  { action: 'delete', label: 'حذف', en: 'Delete' },
  { action: 'approve', label: 'تأیید', en: 'Approve' },
  { action: 'configure', label: 'مدیریت', en: 'Admin' },
]
export const EXTRA_ACTIONS: { action: PermissionAction; label: string; en: string }[] = [
  { action: 'submit', label: 'ثبت', en: 'Submit' },
  { action: 'review', label: 'بازبینی', en: 'Review' },
  { action: 'reject', label: 'رد', en: 'Reject' },
  { action: 'export', label: 'خروجی', en: 'Export' },
]
export const ALL_ACTIONS = [...PRIMARY_ACTIONS, ...EXTRA_ACTIONS]

// ------------------------------------------------------------------------------------------------ permissions

export interface PermissionContext {
  permissions: RastaPermission[]
  roles: RastaRole[]
  /** role_id -> permission ids */
  rolePermissions: Record<string, Set<string>>
  userRoleIds: string[]
  overrides: PermissionOverride[]
}

export type CellSource = 'role' | 'direct' | 'denied' | 'none'
export interface PermissionCell {
  granted: boolean
  source: CellSource
  /** Names of the roles that grant it (also filled for a denied cell: the roles being overridden). */
  roleNames: string[]
  permissionId: string | null
}

export function findPermissionId(perms: RastaPermission[], moduleKey: string, action: PermissionAction): string | null {
  return perms.find((p) => p.moduleKey === moduleKey && p.action === action)?.id ?? null
}

/** Same precedence as the database function rasta_has_permission: deny override > allow override > roles. */
export function permissionCell(ctx: PermissionContext, moduleKey: string, action: PermissionAction): PermissionCell {
  const permissionId = findPermissionId(ctx.permissions, moduleKey, action)
  if (!permissionId) return { granted: false, source: 'none', roleNames: [], permissionId: null }
  const roleNames = ctx.userRoleIds
    .filter((rid) => ctx.rolePermissions[rid]?.has(permissionId))
    .map((rid) => ctx.roles.find((r) => r.id === rid)?.name ?? '—')
  const override = ctx.overrides.find((o) => o.permissionId === permissionId)
  if (override?.effect === 'deny') return { granted: false, source: 'denied', roleNames, permissionId }
  if (override?.effect === 'allow') return { granted: true, source: 'direct', roleNames, permissionId }
  if (roleNames.length) return { granted: true, source: 'role', roleNames, permissionId }
  return { granted: false, source: 'none', roleNames: [], permissionId }
}

/** How many of a module's actions the user effectively holds (0..10) — drives the access ring and the summaries. */
export function moduleGrantCount(ctx: PermissionContext, moduleKey: string): number {
  return ALL_ACTIONS.reduce((n, a) => n + (permissionCell(ctx, moduleKey, a.action).granted ? 1 : 0), 0)
}

// ------------------------------------------------------------------------------------------------ project access

export function scopeCovers(scope: UserProjectScope, p: { masterId: string | null; portfolioId: string | null; programId: string | null }): boolean {
  switch (scope.scopeLevel) {
    case 'all':
      return true
    case 'portfolio':
      return !!scope.portfolioId && scope.portfolioId === p.portfolioId
    case 'program':
      return !!scope.programId && scope.programId === p.programId
    case 'project':
      return !!scope.projectId && scope.projectId === p.masterId
    default:
      return false
  }
}

export interface MatrixCell {
  /** The product's own project id this row maps to (null: no confirmed mapping for this product). */
  sourceId: string | null
  membership: Membership | null
}
export interface ProjectRow {
  key: string
  masterId: string | null
  label: string
  /** the official name, for search and the full title */
  fullName: string
  code: string
  portfolioId: string | null
  programId: string | null
  cells: Record<ProductKey, MatrixCell>
  /** Scope rows that cover this project for the user (inherited access). */
  inheritedBy: UserProjectScope[]
  /** the user's project roles here (rasta_project_role_assignments) — a project role makes the person a member */
  roleIds: string[]
  /** the user's place in the project's team (master_project_team) — also membership */
  inTeam: boolean
}

export interface ProjectMapRef {
  masterProjectId: string
  sourceModule: ProductKey
  sourceProjectId: string
  status: string
}

/**
 * One row per master project (its PipePulse / Risk / Issues projects are found through the confirmed mappings),
 * then one row per product project that no confirmed mapping points at.
 */
export function buildProjectRows(args: {
  masterProjects: MasterProject[]
  mappings: ProjectMapRef[]
  products: UcProject[]
  memberships: Membership[]
  scopes: UserProjectScope[]
  /** the user's project-role assignments and team places (any project) */
  assignments?: { projectId: string; projectRoleId: string }[]
  teamProjects?: Set<string>
}): ProjectRow[] {
  const { masterProjects, mappings, products, memberships, scopes } = args
  const assignments = args.assignments ?? [], teamProjects = args.teamProjects ?? new Set<string>()
  const confirmed = mappings.filter((m) => m.status === 'confirmed')
  const memberOf = (product: ProductKey, projectId: string | null) => (projectId ? memberships.find((m) => m.product === product && m.projectId === projectId) ?? null : null)
  const used = new Set<string>()
  const rows: ProjectRow[] = masterProjects.map((mp) => {
    const cells = {} as Record<ProductKey, MatrixCell>
    for (const product of PRODUCTS) {
      const map = confirmed.find((m) => m.masterProjectId === mp.id && m.sourceModule === product)
      const sourceId = map?.sourceProjectId ?? null
      if (sourceId) used.add(`${product}:${sourceId}`)
      cells[product] = { sourceId, membership: memberOf(product, sourceId) }
    }
    const ref = { masterId: mp.id, portfolioId: mp.portfolioId, programId: mp.programId }
    return {
      key: `m:${mp.id}`,
      masterId: mp.id,
      label: mp.shortName || mp.officialName,
      fullName: mp.officialName,
      code: mp.projectCode || mp.projectIdCode,
      portfolioId: mp.portfolioId,
      programId: mp.programId,
      cells,
      inheritedBy: scopes.filter((s) => scopeCovers(s, ref)),
      roleIds: assignments.filter((a) => a.projectId === mp.id).map((a) => a.projectRoleId),
      inTeam: teamProjects.has(mp.id),
    }
  })
  for (const p of products) {
    if (used.has(`${p.product}:${p.id}`)) continue
    const cells = {} as Record<ProductKey, MatrixCell>
    for (const product of PRODUCTS) cells[product] = product === p.product ? { sourceId: p.id, membership: memberOf(product, p.id) } : { sourceId: null, membership: null }
    rows.push({ key: `u:${p.product}:${p.id}`, masterId: null, label: p.name, fullName: p.name, code: '', portfolioId: null, programId: null, cells, inheritedBy: scopes.filter((s) => s.scopeLevel === 'all'), roleIds: [], inTeam: false })
  }
  return rows
}

/** the same rule as the database (rasta_user_can_access_master_project): scope, project role, team place or a product membership */
export function rowHasAccess(row: ProjectRow): boolean {
  return row.inheritedBy.length > 0 || isMember(row) || PRODUCTS.some((p) => !!row.cells[p].membership)
}
/** a direct member of the project (role or team place), not only through a scope */
export const isMember = (row: ProjectRow) => row.roleIds.length > 0 || row.inTeam

// ------------------------------------------------------------------------------------------------ joining a project

type UserTypeKey = 'project_manager' | 'owner' | 'consultant' | 'contractor' | 'supervisor' | 'other'
/** the project role a person of this type usually holds (by the role's name in rasta_project_roles) */
export const DEFAULT_PROJECT_ROLE: Record<UserTypeKey, string> = { project_manager: 'مدیر پروژه', owner: 'بازرس کارفرما', consultant: 'مشاور', contractor: 'پیمانکار', supervisor: 'بازرس کارفرما', other: 'پیمانکار' }
/** where a project role sits in the project's team structure (master data «ساختار و تیم») */
const POSITION_BY_ROLE: Record<string, string> = {
  'مدیر پروژه': 'project_manager', 'مدیر ارشد پروژه': 'project_manager', 'مجری': 'executive', 'مدیر مهندسی': 'engineering_manager',
  'مدیر کنترل پروژه': 'planning_manager', 'مدیر برنامه‌ریزی و کنترل پروژه': 'planning_manager', 'مدیر امور پیمان': 'contracts_manager',
  'مشاور': 'consultant_rep', 'پیمانکار': 'contractor_rep', 'بازرس کارفرما': 'employer_rep',
}
const POSITION_BY_TYPE: Record<UserTypeKey, string> = { project_manager: 'project_manager', owner: 'employer_rep', consultant: 'consultant_rep', contractor: 'contractor_rep', supervisor: 'site_supervisor', other: 'other' }
/** the team position for someone joining with this role: the role's own position, else the person's type; a role with no position keeps its name as the title */
export function teamPositionFor(roleName: string | undefined, userType: string): { positionKey: string; positionTitle: string } {
  const byRole = roleName ? POSITION_BY_ROLE[roleName] : undefined
  if (byRole) return { positionKey: byRole, positionTitle: '' }
  return { positionKey: POSITION_BY_TYPE[(userType as UserTypeKey)] ?? 'other', positionTitle: roleName ?? '' }
}
/** the legacy products' own role for this person (each product keeps its own project roles) */
export function productRoleFor(product: ProductKey, userType: string): string {
  if (product === 'pipepulse') return userType === 'owner' || userType === 'project_manager' ? 'owner' : userType === 'consultant' || userType === 'supervisor' ? 'consultant' : 'contractor'
  return product === 'risk' ? 'team_member' : 'pursuer'
}

// ------------------------------------------------------------------------------------------------ module access levels

/**
 * One simple access level per module, instead of ten separate permissions. Opening a module lets the person see the data
 * of their projects in it; the level adds what they may do (the modules' own database rules check these permissions).
 */
export type AccessLevel = 'closed' | 'view' | 'edit' | 'approve' | 'admin'
export const ACCESS_LEVELS: { level: AccessLevel; label: string; hint: string }[] = [
  { level: 'closed', label: 'بسته', hint: 'ماژول را نمی‌بیند' },
  { level: 'view', label: 'مشاهده', hint: 'فقط می‌بیند و گزارش می‌گیرد' },
  { level: 'edit', label: 'ثبت و ویرایش', hint: 'اطلاعات و کارکرد ثبت و ویرایش می‌کند' },
  { level: 'approve', label: 'تأیید', hint: 'علاوه بر ثبت، بررسی و تأیید یا رد می‌کند' },
  { level: 'admin', label: 'مدیریت', hint: 'همهٔ کارها، شامل حذف و تنظیمات ماژول' },
]
/** the permissions each level holds (cumulative) */
export const LEVEL_ACTIONS: Record<Exclude<AccessLevel, 'closed'>, PermissionAction[]> = {
  view: ['view', 'export'],
  edit: ['view', 'export', 'create', 'edit', 'submit'],
  approve: ['view', 'export', 'create', 'edit', 'submit', 'review', 'approve', 'reject'],
  admin: ['view', 'export', 'create', 'edit', 'submit', 'review', 'approve', 'reject', 'delete', 'configure'],
}
/** the level a person effectively has in a module: the highest whose every permission they hold (roles or direct) */
export function moduleLevel(ctx: PermissionContext, moduleKey: string, closed: boolean): AccessLevel {
  if (closed) return 'closed'
  const has = (a: PermissionAction) => permissionCell(ctx, moduleKey, a).granted || !findPermissionId(ctx.permissions, moduleKey, a)
  for (const l of ['admin', 'approve', 'edit'] as const) if (LEVEL_ACTIONS[l].every(has)) return l
  return 'view'
}
/** roles of the person that give more in this module than the chosen level (so the level alone does not limit them) */
export function rolesAbove(ctx: PermissionContext, moduleKey: string, level: AccessLevel): string[] {
  if (level === 'closed' || level === 'admin') return []
  const extra = LEVEL_ACTIONS.admin.filter((a) => !LEVEL_ACTIONS[level].includes(a))
  return [...new Set(extra.flatMap((a) => { const c = permissionCell(ctx, moduleKey, a); return c.source === 'role' ? c.roleNames : [] }))]
}
