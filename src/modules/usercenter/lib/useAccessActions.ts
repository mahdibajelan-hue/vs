import { useCallback } from 'react'
import { useAccessStore } from '../../masterdata/store/useAccessStore'
import { useUserCenterStore } from '../store/useUserCenterStore'
import { useToast } from '../components/ui'
import type { ModuleKeyRef, ScopeLevel } from '../../masterdata/rbacTypes'

/**
 * The role / scope / module-access writes already live in the master-data access store. This wraps them so that every change
 * from the User Center refreshes the user's audit trail and reports through the same toast.
 */
export function useAccessActions(userId: string) {
  const notify = useToast()
  const loadAudit = useUserCenterStore((s) => s.loadAudit)
  const setUserRoles = useAccessStore((s) => s.setUserRoles)
  const setUserScope = useAccessStore((s) => s.setUserScope)
  const clearUserScope = useAccessStore((s) => s.clearUserScope)
  const setUserModuleAccess = useAccessStore((s) => s.setUserModuleAccess)
  const assignProjectRole = useAccessStore((s) => s.assignProjectRole)
  const removeProjectRoleAssignment = useAccessStore((s) => s.removeProjectRoleAssignment)
  const createRole = useAccessStore((s) => s.createRole)

  // The access store reports its own failures on the global storage-error banner; a short wait lets the trigger-written audit row land.
  const after = useCallback(
    async (message?: string) => {
      await loadAudit(userId)
      if (message) notify(message)
    },
    [loadAudit, notify, userId],
  )

  return {
    setRoles: async (roleIds: string[], message?: string) => {
      await setUserRoles(userId, roleIds)
      await after(message)
    },
    addScope: async (scope: { scopeLevel: ScopeLevel; portfolioId?: string | null; programId?: string | null; projectId?: string | null }) => {
      await setUserScope(userId, scope)
      await after('محدودهٔ دسترسی افزوده شد')
    },
    removeScope: async (scopeId: string) => {
      await clearUserScope(scopeId, userId)
      await after('محدودهٔ دسترسی حذف شد')
    },
    setModule: async (moduleKey: ModuleKeyRef, hasAccess: boolean) => {
      await setUserModuleAccess(userId, moduleKey, hasAccess)
      await after(hasAccess ? 'دسترسی به ماژول باز شد' : 'دسترسی به ماژول بسته شد')
    },
    assignProjectRole: async (projectId: string, projectRoleId: string) => {
      await assignProjectRole(projectId, userId, projectRoleId)
      await after('سمت پروژه ثبت شد')
    },
    removeProjectRole: async (assignmentId: string) => {
      await removeProjectRoleAssignment(assignmentId)
      await after('سمت پروژه حذف شد')
    },
    createRole,
  }
}
