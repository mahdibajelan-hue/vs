import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import type {
  MappingSourceModule,
  ModuleKeyRef,
  ProjectMapping,
  ProjectRoleAssignment,
  RastaModule,
  RastaPermission,
  RastaProjectRole,
  RastaRole,
  ScopeLevel,
  UserModuleAccess,
  UserProjectScope,
} from '../rbacTypes'
import {
  projectMappingFromRow,
  projectRoleAssignmentFromRow,
  rastaModuleFromRow,
  rastaPermissionFromRow,
  rastaProjectRoleFromRow,
  rastaRoleFromRow,
  userModuleAccessFromRow,
  userProjectScopeFromRow,
  userProjectScopeToRow,
} from '../lib/rbacData'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

export interface SourceProjectRef {
  sourceModule: MappingSourceModule
  sourceProjectId: string
  name: string
}

interface AccessState {
  modules: RastaModule[]
  roles: RastaRole[]
  permissions: RastaPermission[]
  /** role_id -> Set<permission_id> */
  rolePermissions: Record<string, Set<string>>
  /** user_id -> role_id[] */
  userRoles: Record<string, string[]>
  userScopes: UserProjectScope[]
  /** Explicit deny rows only — absence of a row for a (user, module) pair means access is granted. */
  moduleAccess: UserModuleAccess[]
  projectRoles: RastaProjectRole[]
  projectRoleAssignments: ProjectRoleAssignment[]
  projectMappings: ProjectMapping[]
  sourceProjects: SourceProjectRef[]
  loading: boolean
  loaded: boolean

  fetchAll: () => Promise<void>

  createRole: (name: string, description: string) => Promise<void>
  deleteRole: (id: string) => Promise<void>
  setRolePermission: (roleId: string, permissionId: string, granted: boolean) => Promise<void>

  setUserRoles: (userId: string, roleIds: string[]) => Promise<void>
  setUserScope: (userId: string, scope: { scopeLevel: ScopeLevel; portfolioId?: string | null; programId?: string | null; projectId?: string | null }) => Promise<void>
  clearUserScope: (scopeId: string, userId: string) => Promise<void>

  /** true = grant (remove any deny row); false = restrict (upsert an explicit deny row). */
  setUserModuleAccess: (userId: string, moduleKey: ModuleKeyRef, hasAccess: boolean) => Promise<void>

  assignProjectRole: (projectId: string, userId: string, projectRoleId: string) => Promise<void>
  removeProjectRoleAssignment: (id: string) => Promise<void>

  createMapping: (data: { masterProjectId: string; sourceModule: MappingSourceModule; sourceProjectId: string; aliasName: string; status?: 'confirmed' | 'suggested' }) => Promise<void>
  decideMapping: (id: string, status: 'confirmed' | 'rejected') => Promise<void>
  deleteMapping: (id: string) => Promise<void>
}

export const useAccessStore = create<AccessState>()((set, get) => ({
  modules: [],
  roles: [],
  permissions: [],
  rolePermissions: {},
  userRoles: {},
  userScopes: [],
  moduleAccess: [],
  projectRoles: [],
  projectRoleAssignments: [],
  projectMappings: [],
  sourceProjects: [],
  loading: false,
  loaded: false,

  fetchAll: async () => {
    set({ loading: true })
    const [
      { data: modules, error: e1 },
      { data: roles, error: e2 },
      { data: permissions, error: e3 },
      { data: rolePerms, error: e4 },
      { data: userRoles, error: e5 },
      { data: userScopes, error: e6 },
      { data: moduleAccess, error: e6b },
      { data: projectRoles, error: e7 },
      { data: assignments, error: e8 },
      { data: mappings, error: e9 },
      { data: ppProjects, error: e10 },
      { data: rmProjects, error: e11 },
      { data: imProjects, error: e12 },
    ] = await Promise.all([
      supabase.from('rasta_modules').select('*'),
      supabase.from('rasta_roles').select('*').order('name'),
      supabase.from('rasta_permissions').select('*'),
      supabase.from('rasta_role_permissions').select('role_id, permission_id'),
      supabase.from('rasta_user_roles').select('user_id, role_id'),
      supabase.from('rasta_user_project_scope').select('*'),
      supabase.from('rasta_user_module_access').select('*'),
      supabase.from('rasta_project_roles').select('*').order('name'),
      supabase.from('rasta_project_role_assignments').select('*'),
      supabase.from('rasta_project_mappings').select('*'),
      supabase.from('projects').select('id, name'),
      supabase.from('rm_projects').select('id, name'),
      supabase.from('im_projects').select('id, name'),
    ])
    if (reportError('بارگذاری دسترسی‌ها', e1 ?? e2 ?? e3 ?? e4 ?? e5 ?? e6 ?? e6b ?? e7 ?? e8 ?? e9 ?? e10 ?? e11 ?? e12)) {
      set({ loading: false })
      return
    }

    const rolePermissions: Record<string, Set<string>> = {}
    for (const row of (rolePerms ?? []) as { role_id: string; permission_id: string }[]) {
      if (!rolePermissions[row.role_id]) rolePermissions[row.role_id] = new Set()
      rolePermissions[row.role_id].add(row.permission_id)
    }

    const userRolesMap: Record<string, string[]> = {}
    for (const row of (userRoles ?? []) as { user_id: string; role_id: string }[]) {
      if (!userRolesMap[row.user_id]) userRolesMap[row.user_id] = []
      userRolesMap[row.user_id].push(row.role_id)
    }

    const sourceProjects: SourceProjectRef[] = [
      ...((ppProjects ?? []) as { id: string; name: string }[]).map((p) => ({ sourceModule: 'pipepulse' as const, sourceProjectId: p.id, name: p.name })),
      ...((rmProjects ?? []) as { id: string; name: string }[]).map((p) => ({ sourceModule: 'risk' as const, sourceProjectId: p.id, name: p.name })),
      ...((imProjects ?? []) as { id: string; name: string }[]).map((p) => ({ sourceModule: 'issues' as const, sourceProjectId: p.id, name: p.name })),
    ]

    set({
      modules: (modules ?? []).map(rastaModuleFromRow),
      roles: (roles ?? []).map(rastaRoleFromRow),
      permissions: (permissions ?? []).map(rastaPermissionFromRow),
      rolePermissions,
      userRoles: userRolesMap,
      userScopes: (userScopes ?? []).map(userProjectScopeFromRow),
      moduleAccess: (moduleAccess ?? []).map(userModuleAccessFromRow),
      projectRoles: (projectRoles ?? []).map(rastaProjectRoleFromRow),
      projectRoleAssignments: (assignments ?? []).map(projectRoleAssignmentFromRow),
      projectMappings: (mappings ?? []).map(projectMappingFromRow),
      sourceProjects,
      loading: false,
      loaded: true,
    })
  },

  createRole: async (name, description) => {
    const { error } = await supabase.from('rasta_roles').insert({ name, description })
    if (reportError('ایجاد نقش', error)) return
    await get().fetchAll()
  },
  deleteRole: async (id) => {
    const { error } = await supabase.from('rasta_roles').delete().eq('id', id)
    if (reportError('حذف نقش', error)) return
    set((s) => ({ roles: s.roles.filter((r) => r.id !== id) }))
  },
  setRolePermission: async (roleId, permissionId, granted) => {
    if (granted) {
      const { error } = await supabase.from('rasta_role_permissions').insert({ role_id: roleId, permission_id: permissionId })
      if (reportError('اعطای دسترسی', error)) return
    } else {
      const { error } = await supabase.from('rasta_role_permissions').delete().eq('role_id', roleId).eq('permission_id', permissionId)
      if (reportError('لغو دسترسی', error)) return
    }
    set((s) => {
      const next = new Set(s.rolePermissions[roleId] ?? [])
      if (granted) next.add(permissionId)
      else next.delete(permissionId)
      return { rolePermissions: { ...s.rolePermissions, [roleId]: next } }
    })
  },

  setUserRoles: async (userId, roleIds) => {
    const current = get().userRoles[userId] ?? []
    const toAdd = roleIds.filter((id) => !current.includes(id))
    const toRemove = current.filter((id) => !roleIds.includes(id))
    if (toAdd.length > 0) {
      const { error } = await supabase.from('rasta_user_roles').insert(toAdd.map((roleId) => ({ user_id: userId, role_id: roleId })))
      if (reportError('اختصاص نقش', error)) return
    }
    if (toRemove.length > 0) {
      const { error } = await supabase.from('rasta_user_roles').delete().eq('user_id', userId).in('role_id', toRemove)
      if (reportError('حذف نقش کاربر', error)) return
    }
    set((s) => ({ userRoles: { ...s.userRoles, [userId]: roleIds } }))
  },

  setUserScope: async (userId, scope) => {
    const { error } = await supabase.from('rasta_user_project_scope').insert(userProjectScopeToRow(userId, scope))
    if (reportError('تعیین محدوده دسترسی', error)) return
    await get().fetchAll()
  },
  clearUserScope: async (scopeId, userId) => {
    const { error } = await supabase.from('rasta_user_project_scope').delete().eq('id', scopeId)
    if (reportError('حذف محدوده دسترسی', error)) return
    set((s) => ({ userScopes: s.userScopes.filter((sc) => !(sc.id === scopeId && sc.userId === userId)) }))
  },

  setUserModuleAccess: async (userId, moduleKey, hasAccess) => {
    if (hasAccess) {
      const { error } = await supabase.from('rasta_user_module_access').delete().eq('user_id', userId).eq('module_key', moduleKey)
      if (reportError('اعطای دسترسی به محیط', error)) return
      set((s) => ({ moduleAccess: s.moduleAccess.filter((a) => !(a.userId === userId && a.moduleKey === moduleKey)) }))
    } else {
      const { error } = await supabase
        .from('rasta_user_module_access')
        .upsert({ user_id: userId, module_key: moduleKey, has_access: false }, { onConflict: 'user_id,module_key' })
      if (reportError('محدودسازی دسترسی به محیط', error)) return
      set((s) => ({
        moduleAccess: [...s.moduleAccess.filter((a) => !(a.userId === userId && a.moduleKey === moduleKey)), { userId, moduleKey, hasAccess: false }],
      }))
    }
  },

  assignProjectRole: async (projectId, userId, projectRoleId) => {
    const { error } = await supabase.from('rasta_project_role_assignments').insert({ project_id: projectId, user_id: userId, project_role_id: projectRoleId })
    if (reportError('افزودن عضو پروژه', error)) return
    await get().fetchAll()
  },
  removeProjectRoleAssignment: async (id) => {
    const { error } = await supabase.from('rasta_project_role_assignments').delete().eq('id', id)
    if (reportError('حذف عضو پروژه', error)) return
    set((s) => ({ projectRoleAssignments: s.projectRoleAssignments.filter((a) => a.id !== id) }))
  },

  createMapping: async (data) => {
    const { error } = await supabase.from('rasta_project_mappings').insert({
      master_project_id: data.masterProjectId,
      source_module: data.sourceModule,
      source_project_id: data.sourceProjectId,
      alias_name: data.aliasName,
      status: data.status ?? 'confirmed',
    })
    if (reportError('ثبت نگاشت پروژه', error)) return
    await get().fetchAll()
  },
  decideMapping: async (id, status) => {
    const { error } = await supabase.rpc('rasta_decide_project_mapping', { p_mapping_id: id, p_status: status })
    if (reportError('ثبت تصمیم نگاشت', error)) return
    await get().fetchAll()
  },
  deleteMapping: async (id) => {
    const { error } = await supabase.from('rasta_project_mappings').delete().eq('id', id)
    if (reportError('حذف نگاشت', error)) return
    set((s) => ({ projectMappings: s.projectMappings.filter((m) => m.id !== id) }))
  },
}))
