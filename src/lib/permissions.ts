import type { UserRole } from '../types'

/**
 * Contractor and consultant can enter/edit data day-to-day; the owner and a platform admin can
 * also enter/edit anything without restriction (same level as the contractor) — they simply don't
 * have to, since their real job is approving/auditing (see canApprove/canAudit below).
 */
export function canEdit(role: UserRole | null | undefined, isAdmin = false): boolean {
  return isAdmin || role === 'contractor' || role === 'consultant' || role === 'owner'
}

/** Only the consultant validates (approves/rejects) submitted data. */
export function canApprove(role: UserRole | null | undefined): boolean {
  return role === 'consultant'
}

export function isReadOnly(role: UserRole | null | undefined): boolean {
  return role === 'owner'
}

/**
 * The owner sits outside the contractor→consultant approve/reject cycle, but after a consultant
 * approves an entry, the owner may audit it — confirm as-is, or correct it — on a case-by-case
 * basis. A platform admin gets the same ability (isAdmin is checked separately by callers).
 */
export function canAudit(role: UserRole | null | undefined): boolean {
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
