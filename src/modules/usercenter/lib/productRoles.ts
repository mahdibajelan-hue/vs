import { RM_ROLE_LABEL_FA, RM_ROLES } from '../../risk/types'
import { IM_ROLE_LABEL_FA, IM_ROLES } from '../../issues/types'
import { ROLE_LABEL_FA } from '../../../types'
import type { ProductKey } from '../types'

export interface RoleOption {
  value: string
  label: string
}

/** Per-product project roles (the same ones each product enforces through its own RLS). */
export const PRODUCT_ROLES: Record<ProductKey, RoleOption[]> = {
  pipepulse: (['contractor', 'consultant', 'owner'] as const).map((r) => ({ value: r, label: ROLE_LABEL_FA[r] })),
  risk: RM_ROLES.map((r) => ({ value: r, label: RM_ROLE_LABEL_FA[r] })),
  issues: IM_ROLES.map((r) => ({ value: r, label: IM_ROLE_LABEL_FA[r] })),
}

export const roleLabel = (product: ProductKey, role: string): string => PRODUCT_ROLES[product].find((r) => r.value === role)?.label ?? role

/** The role a bulk "give access" starts from — the least privileged one each product offers. */
export const DEFAULT_ROLE: Record<ProductKey, string> = { pipepulse: 'contractor', risk: 'team_member', issues: 'pursuer' }
