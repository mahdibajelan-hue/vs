import type { RmImpactDim, RmPolicy } from '../types'
import { RM_IMPACT_DIMS } from '../types'
import type { RiskLevel } from './riskScore'

/** Organisation policy: how scores map to levels and to decisions (accept / tolerate / escalate). Editable in Settings, audited in the database. */
export const DEFAULT_POLICY: RmPolicy = {
  id: 'default', projectId: null, appetiteMax: 5, toleranceMax: 10, escalationMin: 16,
  levelBounds: [6, 11, 16], reviewDays: { low: 90, medium: 45, high: 30, critical: 14 }, staleAssessmentDays: 90, scaleLabels: {}, autoAcceptConfidence: null,
}

export type RiskZone = 'acceptable' | 'tolerable' | 'above_tolerance' | 'escalate'
export const ZONE_LABEL_FA: Record<RiskZone, string> = { acceptable: 'قابل‌پذیرش', tolerable: 'در محدودهٔ تحمل', above_tolerance: 'خارج از تحمل', escalate: 'نیازمند ارجاع به مدیریت' }
export const ZONE_COLOR: Record<RiskZone, string> = { acceptable: '#22c55e', tolerable: '#eab308', above_tolerance: '#f97316', escalate: '#ef4444' }

export function levelOf(score: number, p: RmPolicy = DEFAULT_POLICY): RiskLevel {
  if (score >= p.levelBounds[2]) return 'critical'
  if (score >= p.levelBounds[1]) return 'high'
  if (score >= p.levelBounds[0]) return 'medium'
  return 'low'
}

export function zoneOf(score: number, p: RmPolicy = DEFAULT_POLICY): RiskZone {
  if (score <= p.appetiteMax) return 'acceptable'
  if (score <= p.toleranceMax) return 'tolerable'
  if (score < p.escalationMin) return 'above_tolerance'
  return 'escalate'
}

export const PROBABILITY_LABELS_FA = ['بسیار کم', 'کم', 'متوسط', 'زیاد', 'تقریباً قطعی']
export const IMPACT_LABELS_FA = ['ناچیز', 'کم', 'متوسط', 'زیاد', 'فاجعه‌بار']

/** Default anchors per impact dimension, level 1…5 (shown as hints while assessing; overridable via policy.scaleLabels). */
export const IMPACT_ANCHORS_FA: Record<RmImpactDim, string[]> = {
  time: ['< ۱ هفته', '۱–۴ هفته', '۱–۳ ماه', '۳–۶ ماه', '> ۶ ماه'],
  cost: ['< ۰٫۵٪ بودجه', '۰٫۵–۲٪', '۲–۵٪', '۵–۱۰٪', '> ۱۰٪'],
  quality: ['بدون اثر', 'اصلاح جزئی', 'کار مجدد محدود', 'عدم‌انطباق مهم', 'رد کار / شکست آزمون'],
  hse: ['کمک‌های اولیه', 'درمان پزشکی', 'حادثهٔ ثبت‌شدنی', 'ازکارافتادگی دائم', 'فوت'],
  env: ['بدون اثر', 'محلی و کوتاه', 'قابل‌بازیابی', 'گسترده', 'جبران‌ناپذیر'],
  legal: ['بدون اثر', 'تذکر', 'جریمه جزئی', 'توقف جزئی کار', 'توقف پروژه / تعقیب'],
  objective: ['بدون اثر', 'انحراف جزئی', 'انحراف قابل‌توجه', 'خطر عدم‌دستیابی', 'عدم‌دستیابی به هدف'],
}

/** The impact of a risk is its WORST dimension (never an average — a small cost effect must not hide a safety one). */
export function impactFromDims(dims: Partial<Record<RmImpactDim, number>>): number {
  let m = 0
  for (const d of RM_IMPACT_DIMS) m = Math.max(m, Number(dims[d] ?? 0))
  return m
}
export function dominantDim(dims: Partial<Record<RmImpactDim, number>>): RmImpactDim | null {
  let best: RmImpactDim | null = null
  let v = 0
  for (const d of RM_IMPACT_DIMS) if (Number(dims[d] ?? 0) > v) { v = Number(dims[d]); best = d }
  return best
}

export function effectivePolicy(policies: RmPolicy[], projectId: string | null): RmPolicy {
  return policies.find((p) => p.projectId === projectId && projectId) ?? policies.find((p) => p.projectId === null) ?? DEFAULT_POLICY
}

export function validatePolicy(p: Pick<RmPolicy, 'appetiteMax' | 'toleranceMax' | 'escalationMin' | 'levelBounds' | 'staleAssessmentDays'>): string | null {
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= 25
  if (![p.appetiteMax, p.toleranceMax, p.escalationMin, ...p.levelBounds].every(ok)) return 'همهٔ آستانه‌ها باید عدد صحیح بین ۱ تا ۲۵ باشند'
  if (!(p.appetiteMax <= p.toleranceMax && p.toleranceMax < p.escalationMin)) return 'ترتیب لازم: پذیرش ≤ تحمل < ارجاع'
  if (!(p.levelBounds[0] < p.levelBounds[1] && p.levelBounds[1] < p.levelBounds[2])) return 'مرزهای سطح (متوسط، زیاد، بحرانی) باید صعودی باشند'
  if (p.staleAssessmentDays < 7 || p.staleAssessmentDays > 730) return 'سن مجاز ارزیابی باید بین ۷ تا ۷۳۰ روز باشد'
  return null
}
