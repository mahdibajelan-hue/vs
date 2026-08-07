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

/** Only the project owner or a platform admin manages members (invite / change role / remove). */
export function canManageUsers(role: UserRole | null | undefined, isAdmin: boolean): boolean {
  return isAdmin || role === 'owner'
}

/** Only a platform admin may grant the 'owner' ("کارفرما") role — everyone else is limited to contractor/consultant. */
export function assignableRoles(isAdmin: boolean): UserRole[] {
  return isAdmin ? ['contractor', 'consultant', 'owner'] : ['contractor', 'consultant']
}
