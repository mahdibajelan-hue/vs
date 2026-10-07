import type { CriticalityLevel, Parcel } from '../types'
import { isReleased, stageProgress } from './workflow'
import { faNum } from './fa'

export interface Factor {
  key: string
  label: string
  points: number
}
export interface Criticality {
  score: number
  level: CriticalityLevel
  factors: Factor[]
  /** Released land no longer carries land risk. */
  resolved: boolean
}

export const LEVEL_THRESHOLDS: { level: CriticalityLevel; min: number }[] = [
  { level: 'critical', min: 75 },
  { level: 'high', min: 50 },
  { level: 'medium', min: 25 },
  { level: 'low', min: 0 },
]
export const levelOf = (score: number): CriticalityLevel => LEVEL_THRESHOLDS.find((t) => score >= t.min)!.level

export const ownerCountOf = (p: Pick<Parcel, 'ownerCountEst' | 'owners'>): number => Math.max(p.ownerCountEst, p.owners.length)

const OWNERSHIP_POINTS = { unknown: 20, natural_resources: 14, governmental: 10, exempt: 8, private: 0 } as const
const LAND_TYPE_POINTS: Record<string, number> = { agricultural: 6, garden: 6, forest: 10, riverbed: 8, urban: 10, industrial: 10, road_rail: 8 }
const FLAG_POINTS = { sensitive_area: 10, has_facilities: 8, past_dispute: 12, high_value: 8, critical_for_execution: 14 } as const
const FLAG_LABEL = { sensitive_area: 'منطقهٔ حساس', has_facilities: 'تأسیسات یا نهاد خاص', past_dispute: 'سابقهٔ اختلاف', high_value: 'ارزش بالای زمین', critical_for_execution: 'حیاتی برای اجرا' } as const

/**
 * Land Criticality Score 0..100 — transparent, additive, and explainable (every point has a named factor).
 * The score of land that is already being acquired shrinks with workflow progress (up to −40%), because the
 * uncertainty is being retired; released land scores 0.
 */
export function criticality(p: Parcel): Criticality {
  if (isReleased(p)) return { score: 0, level: 'low', factors: [], resolved: true }
  const f: Factor[] = []
  const add = (key: string, label: string, points: number) => points > 0 && f.push({ key, label, points })

  add('ownership', p.ownershipClass === 'unknown' ? 'مالکیت نامشخص' : p.ownershipClass === 'natural_resources' ? 'منابع طبیعی / ملی' : p.ownershipClass === 'governmental' ? 'اراضی دولتی / سازمانی' : p.ownershipClass === 'exempt' ? 'مستثنیات' : '', OWNERSHIP_POINTS[p.ownershipClass])
  const n = ownerCountOf(p)
  add('owners', `تعدد مالکین (${faNum(n)} نفر)`, n <= 1 ? 0 : n <= 3 ? 6 : n <= 7 ? 12 : n <= 15 ? 18 : 22)
  if (p.ownershipClass === 'private' && !p.ownerKnown) add('owner_unknown', 'مالک هنوز شناسایی نشده', 10)
  add('dispute', `احتمال اختلاف (${faNum(p.disputeProbability)}٪)`, Math.round(p.disputeProbability * 0.22))
  add('complexity', `پیچیدگی ${faNum(p.complexity)} از ۵`, (p.complexity - 1) * 3)
  add('land_type', 'نوع / کاربری حساس زمین', LAND_TYPE_POINTS[p.landType] ?? 0)
  for (const k of Object.keys(FLAG_POINTS) as (keyof typeof FLAG_POINTS)[]) if (p.flags[k]) add(k, FLAG_LABEL[k], FLAG_POINTS[k])
  if (p.custodian.trim()) add('custodian', 'دخالت دستگاه متولی', 4)

  const raw = f.reduce((s, x) => s + x.points, 0)
  const discount = 1 - 0.4 * stageProgress(p)
  const score = Math.max(0, Math.min(100, Math.round(raw * discount)))
  f.sort((a, b) => b.points - a.points)
  return { score, level: levelOf(score), factors: f, resolved: false }
}
