import type { OwnershipClass } from '../types'
import type { Analysis } from './kpis'
import { LEVEL_COLOR } from './labels'
import { STATUS_COLOR } from './status'

export type ColorMode = 'status' | 'criticality' | 'ownership' | 'stage'

export const OWNERSHIP_COLOR: Record<OwnershipClass, string> = {
  private: '#94a3b8',
  natural_resources: '#38bdf8',
  exempt: '#f59e0b',
  governmental: '#a78bfa',
  unknown: '#e2e8f0',
}

/** Progress colour ramp: slate (nothing done) → amber → green (released). */
export function progressColor(p: number): string {
  const hue = 40 + Math.round(p * 95) // 40 (amber) → 135 (green)
  const sat = 18 + Math.round(Math.min(1, p * 2) * 55)
  return `hsl(${hue} ${sat}% ${58 - Math.round(p * 8)}%)`
}

export function parcelColor(a: Analysis, mode: ColorMode): string {
  switch (mode) {
    case 'criticality':
      return a.released ? LEVEL_COLOR.low : LEVEL_COLOR[a.crit.level]
    case 'ownership':
      return OWNERSHIP_COLOR[a.parcel.ownershipClass]
    case 'stage':
      return progressColor(a.progress)
    default:
      return STATUS_COLOR[a.status]
  }
}
