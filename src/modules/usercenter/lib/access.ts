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
  code: string
  portfolioId: string | null
  programId: string | null
  cells: Record<ProductKey, MatrixCell>
  /** Scope rows that cover this project for the user (inherited access). */
  inheritedBy: UserProjectScope[]
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
}): ProjectRow[] {
  const { masterProjects, mappings, products, memberships, scopes } = args
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
      code: mp.projectCode || mp.projectIdCode,
      portfolioId: mp.portfolioId,
      programId: mp.programId,
      cells,
      inheritedBy: scopes.filter((s) => scopeCovers(s, ref)),
    }
  })
  for (const p of products) {
    if (used.has(`${p.product}:${p.id}`)) continue
    const cells = {} as Record<ProductKey, MatrixCell>
    for (const product of PRODUCTS) cells[product] = product === p.product ? { sourceId: p.id, membership: memberOf(product, p.id) } : { sourceId: null, membership: null }
    rows.push({ key: `u:${p.product}:${p.id}`, masterId: null, label: p.name, code: '', portfolioId: null, programId: null, cells, inheritedBy: scopes.filter((s) => s.scopeLevel === 'all') })
  }
  return rows
}

export function rowHasAccess(row: ProjectRow): boolean {
  return row.inheritedBy.length > 0 || PRODUCTS.some((p) => !!row.cells[p].membership)
}
