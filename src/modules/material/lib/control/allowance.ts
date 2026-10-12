import type { Position } from './model'

/**
 * How much of an item can still go into a new package or purchase order.
 * open     — part of the requirement is not yet packaged / ordered (normal case).
 * shortage — already ordered (so covered on paper) but a material shortage remains (rejected, scrapped, lost): more may be ordered, up to the uncovered gap, with the reason filled in automatically.
 * locked   — fully covered and no shortage: a second order needs an explicit exception with a written reason.
 */
export type AllowState = 'open' | 'shortage' | 'locked'
export interface Allowance { state: AllowState; remaining: number; reasonAuto: string }

export function orderAllowance(p: Position, kind: 'package' | 'order'): Allowance {
  const covered = kind === 'package' ? Math.max(p.packaged, p.ordered) : p.ordered
  const remaining = Math.max(0, p.requiredQty - covered)
  if (remaining > 0) return { state: 'open', remaining, reasonAuto: '' }
  if (p.ordered > 0 && p.uncoveredGap > 0) return { state: 'shortage', remaining: p.uncoveredGap, reasonAuto: `کسری متریال: ${p.uncoveredGap.toLocaleString('fa-IR', { maximumFractionDigits: 2 })} ${p.unit} بدون پوشش` }
  return { state: 'locked', remaining: 0, reasonAuto: '' }
}

export const ALLOW_LABEL_FA: Record<AllowState, string> = { open: 'قابل افزودن', shortage: 'کسری دارد', locked: 'قبلاً سفارش شده' }
