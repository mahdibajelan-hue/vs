import { useMemo } from 'react'
import { useAccessStore } from '../../masterdata/store/useAccessStore'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useUserCenterStore } from '../store/useUserCenterStore'
import { buildProjectRows, rowHasAccess, type PermissionContext, type ProjectRow } from './access'
import type { ProjectMapRef } from './access'
import type { Membership, PermissionOverride, UcProject } from '../types'
import type { ProductKey } from '../types'

export interface BaseData {
  masterProjects: ReturnType<typeof useMasterDataStore.getState>['projects']
  mappings: ProjectMapRef[]
  products: UcProject[]
  memberships: Membership[]
}

/** Everything the matrices need, derived once from the three stores. */
export function useAccessData() {
  const masterProjects = useMasterDataStore((s) => s.projects)
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const organizations = useMasterDataStore((s) => s.organizations)
  const modules = useAccessStore((s) => s.modules)
  const roles = useAccessStore((s) => s.roles)
  const permissions = useAccessStore((s) => s.permissions)
  const rolePermissions = useAccessStore((s) => s.rolePermissions)
  const userRoles = useAccessStore((s) => s.userRoles)
  const userScopes = useAccessStore((s) => s.userScopes)
  const moduleAccess = useAccessStore((s) => s.moduleAccess)
  const projectMappings = useAccessStore((s) => s.projectMappings)
  const products = useUserCenterStore((s) => s.products)
  const memberships = useUserCenterStore((s) => s.memberships)
  const overrides = useUserCenterStore((s) => s.overrides)

  const mappings = useMemo<ProjectMapRef[]>(
    () => projectMappings.map((m) => ({ masterProjectId: m.masterProjectId, sourceModule: m.sourceModule as ProductKey, sourceProjectId: m.sourceProjectId, status: m.status })),
    [projectMappings],
  )
  return { masterProjects, portfolios, programs, organizations, modules, roles, permissions, rolePermissions, userRoles, userScopes, moduleAccess, mappings, products, memberships, overrides }
}

export function useUserAccess(userId: string) {
  const d = useAccessData()
  return useMemo(() => {
    const userRoleIds = d.userRoles[userId] ?? []
    const scopes = d.userScopes.filter((s) => s.userId === userId)
    const memberships = d.memberships.filter((m) => m.userId === userId)
    const overrides: PermissionOverride[] = d.overrides.filter((o) => o.userId === userId)
    const blockedModules = new Set(d.moduleAccess.filter((a) => a.userId === userId && !a.hasAccess).map((a) => a.moduleKey as string))
    const permCtx: PermissionContext = { permissions: d.permissions, roles: d.roles, rolePermissions: d.rolePermissions, userRoleIds, overrides }
    const rows: ProjectRow[] = buildProjectRows({ masterProjects: d.masterProjects, mappings: d.mappings, products: d.products, memberships, scopes })
    return { userRoleIds, scopes, memberships, overrides, blockedModules, permCtx, rows, accessibleProjects: rows.filter(rowHasAccess).length }
  }, [d, userId])
}

/** Per-user counts for the directory (one pass over every user). */
export function useDirectoryStats(userIds: string[]) {
  const d = useAccessData()
  return useMemo(() => {
    const out = new Map<string, { projects: number; roleCount: number; blockedModules: number; overrides: number }>()
    for (const id of userIds) {
      const scopes = d.userScopes.filter((s) => s.userId === id)
      const memberships = d.memberships.filter((m) => m.userId === id)
      const rows = buildProjectRows({ masterProjects: d.masterProjects, mappings: d.mappings, products: d.products, memberships, scopes })
      out.set(id, {
        projects: rows.filter(rowHasAccess).length,
        roleCount: (d.userRoles[id] ?? []).length,
        blockedModules: d.moduleAccess.filter((a) => a.userId === id && !a.hasAccess).length,
        overrides: d.overrides.filter((o) => o.userId === id).length,
      })
    }
    return out
  }, [d, userIds])
}
