import type { RmRisk, RmRiskAction, RmRiskAssessment, RmRiskCategory } from '../types'
import { currentState, isActionOverdue, latestAssessment, riskLevel, todayIso, type RiskLevel } from './riskScore'

/**
 * Rule-based (non-AI) "Risk Intelligence" layer — duplicate detection, portfolio pattern
 * detection, trajectory-based early warnings, review-cadence reminders, and a data-quality
 * score. Everything here is a deterministic heuristic over existing risk data; nothing calls
 * an external model. Kept in its own file since it's conceptually a distinct layer on top of
 * lib/riskAnalytics.ts's straightforward KPI aggregation.
 */

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ')
}

function tokenize(s: string): Set<string> {
  return new Set(normalizeText(s).split(' ').filter((t) => t.length > 1))
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const t of a) if (b.has(t)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

export interface DuplicateRiskPair {
  riskA: RmRisk
  riskB: RmRisk
  similarity: number
  sameCategory: boolean
}

/** Title+description token overlap (Jaccard) — flags likely-duplicate risks within one project. */
export function detectDuplicateRisks(risks: RmRisk[], threshold = 0.35): DuplicateRiskPair[] {
  const active = risks.filter((r) => r.status !== 'closed')
  const pairs: DuplicateRiskPair[] = []
  for (let i = 0; i < active.length; i++) {
    const tokensA = tokenize(`${active[i].title} ${active[i].description}`)
    for (let j = i + 1; j < active.length; j++) {
      const tokensB = tokenize(`${active[j].title} ${active[j].description}`)
      const similarity = jaccardSimilarity(tokensA, tokensB)
      const sameCategory = active[i].category === active[j].category
      if (similarity >= threshold || (sameCategory && similarity >= threshold - 0.1)) {
        pairs.push({ riskA: active[i], riskB: active[j], similarity: Math.round(similarity * 100) / 100, sameCategory })
      }
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity)
}

export interface CrossProjectDuplicate {
  riskA: RmRisk
  projectNameA: string
  riskB: RmRisk
  projectNameB: string
  similarity: number
}

/** Same idea as detectDuplicateRisks, but across multiple projects (e.g. a portfolio) instead of within one. */
export function detectCrossProjectDuplicates(groups: { projectName: string; risks: RmRisk[] }[], threshold = 0.4, limit = 20): CrossProjectDuplicate[] {
  const flat = groups.flatMap((g) => g.risks.filter((r) => r.status !== 'closed').map((risk) => ({ risk, projectName: g.projectName })))
  const results: CrossProjectDuplicate[] = []
  for (let i = 0; i < flat.length; i++) {
    const tokensA = tokenize(`${flat[i].risk.title} ${flat[i].risk.description}`)
    for (let j = i + 1; j < flat.length; j++) {
      if (flat[i].projectName === flat[j].projectName) continue
      const tokensB = tokenize(`${flat[j].risk.title} ${flat[j].risk.description}`)
      const similarity = jaccardSimilarity(tokensA, tokensB)
      if (similarity >= threshold) {
        results.push({ riskA: flat[i].risk, projectNameA: flat[i].projectName, riskB: flat[j].risk, projectNameB: flat[j].projectName, similarity: Math.round(similarity * 100) / 100 })
      }
    }
  }
  return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit)
}

export interface CategoryPatternRow {
  category: RmRiskCategory
  projectCount: number
  totalProjects: number
  criticalHighCount: number
  totalActiveCount: number
}

/** Which risk categories recur across multiple projects in a portfolio/program, and how severe they are there. */
export function detectPortfolioPatterns(groups: { projectName: string; risks: RmRisk[]; assessments: RmRiskAssessment[] }[]): CategoryPatternRow[] {
  const totalProjects = groups.length
  const byCategory = new Map<RmRiskCategory, { projects: Set<string>; criticalHigh: number; active: number }>()
  for (const g of groups) {
    const active = g.risks.filter((r) => r.status !== 'closed')
    for (const r of active) {
      const state = currentState(r, g.assessments.filter((a) => a.riskId === r.id))
      const lv = riskLevel(state.score)
      const entry = byCategory.get(r.category) ?? { projects: new Set<string>(), criticalHigh: 0, active: 0 }
      entry.projects.add(g.projectName)
      entry.active++
      if (lv === 'critical' || lv === 'high') entry.criticalHigh++
      byCategory.set(r.category, entry)
    }
  }
  return [...byCategory.entries()]
    .map(([category, v]) => ({ category, projectCount: v.projects.size, totalProjects, criticalHighCount: v.criticalHigh, totalActiveCount: v.active }))
    .filter((r) => r.projectCount >= 2)
    .sort((a, b) => b.projectCount - a.projectCount || b.criticalHighCount - a.criticalHighCount)
}

export interface EarlyWarning {
  risk: RmRisk
  reason: string
}

/**
 * Trajectory-based warnings that go beyond the existing static threshold rule
 * (score>=16 OR overdue action OR time-to-impact<=14): a worsening trend across the last two
 * reviews, a rising score even if still below the critical band, or an in-progress action at
 * 0% completion with its deadline within a week.
 */
export function detectEarlyWarnings(risks: RmRisk[], assessments: RmRiskAssessment[], actions: RmRiskAction[], today = todayIso()): EarlyWarning[] {
  const warnings: EarlyWarning[] = []
  for (const risk of risks.filter((r) => r.status !== 'closed')) {
    const riskAssessments = [...assessments.filter((a) => a.riskId === risk.id)].sort((a, b) => (a.reviewDate !== b.reviewDate ? (a.reviewDate < b.reviewDate ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1))
    if (riskAssessments.length >= 2) {
      const [prev, latest] = riskAssessments.slice(-2)
      if (prev.trend === 'worsening' && latest.trend === 'worsening') {
        warnings.push({ risk, reason: 'روند نزولی در دو بازبینی اخیر — رو به وخامت' })
      } else if (latest.currentScore > prev.currentScore) {
        warnings.push({ risk, reason: `امتیاز از ${prev.currentScore} به ${latest.currentScore} افزایش یافته` })
      }
    }
    for (const action of actions.filter((a) => a.riskId === risk.id)) {
      if (action.status === 'in_progress' && action.completionPercentage === 0 && action.dueDate) {
        const daysLeft = Math.round((Date.parse(action.dueDate) - Date.parse(today)) / 86400000)
        if (daysLeft >= 0 && daysLeft <= 7) {
          warnings.push({ risk, reason: `اقدام «${action.description}» صفر درصد پیشرفت دارد و ${daysLeft} روز تا سررسید مانده` })
        }
      }
    }
  }
  return warnings
}

const REVIEW_CADENCE_DAYS: Record<RiskLevel, number> = { critical: 14, high: 14, medium: 30, low: 60 }

export interface ReviewDueRow {
  risk: RmRisk
  daysSinceLastReview: number
  cadenceDays: number
  neverReviewed: boolean
}

/** Risks overdue for their next review, using a level-based cadence (critical/high every 14 days, medium 30, low 60) — the in-app substitute for a periodic-review reminder, since RASTA has no email/push infrastructure. */
export function computeReviewsDue(risks: RmRisk[], assessments: RmRiskAssessment[], today = todayIso()): ReviewDueRow[] {
  const rows: ReviewDueRow[] = []
  for (const risk of risks.filter((r) => r.status !== 'closed')) {
    const riskAssessments = assessments.filter((a) => a.riskId === risk.id)
    const latest = latestAssessment(riskAssessments)
    const state = currentState(risk, riskAssessments)
    const cadenceDays = REVIEW_CADENCE_DAYS[riskLevel(state.score)]
    const baseDate = latest ? latest.reviewDate : risk.identifiedDate
    const daysSince = Math.round((Date.parse(today) - Date.parse(baseDate)) / 86400000)
    if (daysSince >= cadenceDays) rows.push({ risk, daysSinceLastReview: daysSince, cadenceDays, neverReviewed: !latest })
  }
  return rows.sort((a, b) => b.daysSinceLastReview - a.daysSinceLastReview)
}

export interface RiskQualityScore {
  risk: RmRisk
  score: number
  missing: string[]
}

const QUALITY_CHECKS: { weight: number; label: string; ok: (risk: RmRisk, hasAction: boolean, hasAssessment: boolean) => boolean }[] = [
  { weight: 20, label: 'توضیحات کامل (حداقل ۲۰ نویسه)', ok: (r) => r.description.trim().length >= 20 },
  { weight: 15, label: 'مالک ریسک تعیین‌شده', ok: (r) => r.ownerId !== null },
  { weight: 20, label: 'حداقل یک اقدام کنترلی', ok: (_r, hasAction) => hasAction },
  { weight: 20, label: 'حداقل یک بازبینی', ok: (_r, _a, hasAssessment) => hasAssessment },
  { weight: 15, label: 'جزئیات استراتژی پاسخ تکمیل‌شده', ok: (r) => Object.values(r.strategyDetails).some((v) => v.trim() !== '') },
  { weight: 10, label: 'فاز پروژه مشخص', ok: (r) => r.projectPhase !== null },
]

export function computeRiskQualityScore(risk: RmRisk, assessments: RmRiskAssessment[], actions: RmRiskAction[]): RiskQualityScore {
  const hasAction = actions.some((a) => a.riskId === risk.id)
  const hasAssessment = assessments.some((a) => a.riskId === risk.id)
  const results = QUALITY_CHECKS.map((c) => ({ ...c, ok: c.ok(risk, hasAction, hasAssessment) }))
  return { risk, score: results.reduce((sum, c) => sum + (c.ok ? c.weight : 0), 0), missing: results.filter((c) => !c.ok).map((c) => c.label) }
}

export function computeAverageQualityScore(risks: RmRisk[], assessments: RmRiskAssessment[], actions: RmRiskAction[]): number {
  const active = risks.filter((r) => r.status !== 'closed')
  if (active.length === 0) return 0
  return Math.round(active.reduce((sum, r) => sum + computeRiskQualityScore(r, assessments, actions).score, 0) / active.length)
}

/** Short, rule-based observations for one risk — the "review assistant" prompts and a per-risk insight list broader than just Critical/High. */
export function riskInsightBullets(risk: RmRisk, assessments: RmRiskAssessment[], actions: RmRiskAction[], today = todayIso()): string[] {
  const bullets: string[] = []
  const riskAssessments = assessments.filter((a) => a.riskId === risk.id)
  const riskActions = actions.filter((a) => a.riskId === risk.id)
  const overdue = riskActions.filter((a) => isActionOverdue(a, today))

  if (riskAssessments.length === 0) bullets.push('هنوز بازبینی نشده است — این می‌تواند اولین بازبینی رسمی باشد')
  else bullets.push(`از آخرین بازبینی ${Math.round((Date.parse(today) - Date.parse(latestAssessment(riskAssessments)!.reviewDate)) / 86400000)} روز گذشته است`)

  if (riskActions.length === 0) bullets.push('هیچ اقدام کنترلی ثبت نشده است')
  else bullets.push(`${riskActions.length} اقدام ثبت‌شده — ${overdue.length} مورد عقب‌افتاده`)

  const quality = computeRiskQualityScore(risk, assessments, actions)
  if (quality.score < 60) bullets.push(`کیفیت ثبت اطلاعات این ریسک پایین است (${quality.score}٪) — ${quality.missing[0]}`)

  if (risk.escalationStatus === 'recommended') bullets.push('پیشنهاد ارجاع به مقام بالاتر ثبت شده اما هنوز تکمیل نشده است')

  return bullets
}
