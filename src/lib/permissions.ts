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
