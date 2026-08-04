import type { UserRole } from '../types'

/** Contractor and consultant can enter/edit data; owner is read-only. */
export function canEdit(role: UserRole | null | undefined): boolean {
  return role === 'contractor' || role === 'consultant'
}

/** Only the consultant validates (approves/rejects) submitted data. */
export function canApprove(role: UserRole | null | undefined): boolean {
  return role === 'consultant'
}

export function isReadOnly(role: UserRole | null | undefined): boolean {
  return role === 'owner'
}

/**
 * Only the owner defines users / resets passwords — except as a bootstrap
 * escape hatch when no owner account exists yet, so the system can never
 * lock itself out of user management entirely.
 */
export function canManageUsers(role: UserRole | null | undefined, accounts: { role: UserRole }[]): boolean {
  if (role === 'owner') return true
  return !accounts.some((a) => a.role === 'owner')
}
