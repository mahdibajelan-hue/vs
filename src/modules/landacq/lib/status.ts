import type { Parcel } from '../types'
import { criticality, type Criticality } from './scoring'
import { isReleased, isStarted } from './workflow'

/** The seven map colours of the Land Acquisition Layer. */
export type DisplayStatus = 'released' | 'acquiring' | 'risk' | 'critical' | 'natural' | 'governmental' | 'review'

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  released: 'آزاد',
  acquiring: 'در حال تحصیل',
  risk: 'دارای ریسک',
  critical: 'Critical',
  natural: 'منابع طبیعی / ملی',
  governmental: 'دولتی / سازمانی',
  review: 'نیازمند بررسی',
}
export const STATUS_COLOR: Record<DisplayStatus, string> = {
  released: '#22c55e',
  acquiring: '#eab308',
  risk: '#f97316',
  critical: '#ef4444',
  natural: '#38bdf8',
  governmental: '#a78bfa',
  review: '#cbd5e1',
}
export const STATUS_ORDER: DisplayStatus[] = ['released', 'acquiring', 'risk', 'critical', 'natural', 'governmental', 'review']

/**
 * Precedence: released land is green whatever it was; then criticality wins (red / orange), then the special
 * ownership classes (blue / purple), then "being acquired" (yellow); everything else still needs a look (white).
 */
export function displayStatus(p: Parcel, crit: Criticality = criticality(p)): DisplayStatus {
  if (isReleased(p)) return 'released'
  if (crit.level === 'critical') return 'critical'
  if (p.ownershipClass === 'natural_resources') return 'natural'
  if (p.ownershipClass === 'governmental') return 'governmental'
  if (crit.level === 'high') return 'risk'
  if (isStarted(p)) return 'acquiring'
  return 'review'
}
