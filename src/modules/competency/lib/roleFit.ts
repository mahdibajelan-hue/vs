/**
 * Role fit — the matching layer between what the assessment centre measured and what a job
 * requires, in the spirit of job-matching and skills-passport systems: one competency profile,
 * many roles. A candidate is scored against every role's requirement set, so the same evidence
 * answers "how fit is this person for role X", "which roles suit them best" and "what stands
 * between them and role Y". Lack of evidence is never treated as lack of competency: competencies
 * without evidence are left out of the fit figure and lower the stated confidence instead.
 */
export interface LevelRow { competencyId: string; actualLevel: number | null }
export interface Requirement { competencyId: string; requiredLevel: number; isCritical: boolean; weight: number }

export type Readiness = 'ready' | 'near' | 'developing' | 'far' | 'unknown'
export interface FitGap { competencyId: string; required: number; actual: number; gap: number; isCritical: boolean; weight: number }
export interface RoleFit {
  roleId: string
  /** weighted attainment 0–100 over the competencies that have evidence */
  fit: number | null
  /** share of requirement weight that has evidence 0–1 */
  coverage: number
  criticalGaps: FitGap[]
  gaps: FitGap[]
  unknown: string[]
  strengths: { competencyId: string; required: number; actual: number }[]
  readiness: Readiness
  /** rough time to close the stated gaps, in months (null when nothing is known) */
  monthsToReady: number | null
}

export interface FitOptions { monthsPerLevel?: number; criticalMultiplier?: number }
const DEFAULTS = { monthsPerLevel: 4, criticalMultiplier: 1.25 }

export function readinessOf(fit: number | null, criticalGaps: number, coverage: number): Readiness {
  if (fit == null || coverage < 0.3) return 'unknown'
  if (fit >= 90 && criticalGaps === 0 && coverage >= 0.6) return 'ready'
  if (fit >= 75 && criticalGaps <= 1) return 'near'
  if (fit >= 55) return 'developing'
  return 'far'
}

export function roleFit(roleId: string, levels: LevelRow[], requirements: Requirement[], opts: FitOptions = {}): RoleFit {
  const o = { ...DEFAULTS, ...opts }
  const byId = new Map(levels.map((l) => [l.competencyId, l.actualLevel]))
  let num = 0, den = 0, totalW = 0, months = 0
  const gaps: FitGap[] = [], unknown: string[] = [], strengths: RoleFit['strengths'] = []
  for (const r of requirements) {
    const w = r.weight > 0 ? r.weight : 1
    totalW += w
    const a = byId.get(r.competencyId)
    if (a == null) { unknown.push(r.competencyId); continue }
    den += w; num += w * Math.min(1, r.requiredLevel > 0 ? a / r.requiredLevel : 1)
    if (a < r.requiredLevel) { const gap = r.requiredLevel - a; gaps.push({ competencyId: r.competencyId, required: r.requiredLevel, actual: a, gap, isCritical: r.isCritical, weight: w }); months += gap * o.monthsPerLevel * (r.isCritical ? o.criticalMultiplier : 1) }
    else if (a > r.requiredLevel) strengths.push({ competencyId: r.competencyId, required: r.requiredLevel, actual: a })
  }
  const fit = den > 0 ? Math.round((num / den) * 100) : null
  const coverage = totalW > 0 ? den / totalW : 0
  const criticalGaps = gaps.filter((g) => g.isCritical)
  gaps.sort((a, b) => Number(b.isCritical) - Number(a.isCritical) || b.gap * b.weight - a.gap * a.weight)
  return { roleId, fit, coverage, criticalGaps, gaps, unknown, strengths, readiness: readinessOf(fit, criticalGaps.length, coverage), monthsToReady: fit == null ? null : Math.round(months) }
}

/** Every role ranked best-fit first; a critical gap weighs as much as 15 fit points when ordering, so a polished profile with a hole in a critical competency does not outrank a slightly lower but sound one. */
export function rankRoles(levels: LevelRow[], requirementsByRole: Map<string, Requirement[]>, opts?: FitOptions): RoleFit[] {
  return [...requirementsByRole].map(([id, reqs]) => roleFit(id, levels, reqs, opts)).filter((r) => r.fit != null)
    .sort((a, b) => (b.fit! - 15 * b.criticalGaps.length) - (a.fit! - 15 * a.criticalGaps.length) || b.coverage - a.coverage)
}

export const READINESS_META: Record<Readiness, { label: string; color: string; hint: string }> = {
  ready: { label: 'آمادهٔ همین حالا', color: '#34d399', hint: 'الزام‌های حیاتی برآورده است و شواهد کافی وجود دارد' },
  near: { label: 'نزدیک به آمادگی', color: '#38bdf8', hint: 'با چند اقدام توسعه‌ای هدفمند آماده می‌شود' },
  developing: { label: 'در حال توسعه', color: '#fbbf24', hint: 'برای این نقش به برنامهٔ توسعهٔ فشرده و پشتیبانی نیاز دارد' },
  far: { label: 'فاصلهٔ زیاد', color: '#f87171', hint: 'در حال حاضر مناسب این نقش نیست' },
  unknown: { label: 'شواهد ناکافی', color: '#94a3b8', hint: 'برای قضاوت، شواهد بیشتری لازم است' },
}

/** Does the candidate meet every given "competency ≥ level" condition? Competencies without evidence do not match. */
export function meetsCompetencyFilters(levels: LevelRow[], filters: { competencyId: string; minLevel: number }[]): boolean {
  const by = new Map(levels.map((l) => [l.competencyId, l.actualLevel]))
  return filters.every((f) => { const a = by.get(f.competencyId); return a != null && a >= f.minLevel })
}
