/**
 * Lean in-person session. The technical questions and the structured interview both end up as evidence for the same
 * competencies, so asking both in full measures the same thing twice and stretches the session past what panels can
 * sustain (a 15-question technical part plus 12 rated competencies is about three hours). The plan keeps every critical
 * competency and every competency the technical questions do not already cover, and parks the rest.
 */
export interface PlanCompetency { id: string; isCritical: boolean; weight: number; /** technical categories whose questions feed this competency */ techCategories: string[] }
export interface InterviewPlan { primary: string[]; covered: string[]; deferred: string[] }

export const MAX_INTERVIEW_COMPETENCIES = 8

export function planInterview(cs: PlanCompetency[], selectedCategories: Set<string>, opts: { needsTechnical: boolean; max?: number } = { needsTechnical: true }): InterviewPlan {
  const max = opts.max ?? MAX_INTERVIEW_COMPETENCIES
  const isCovered = (c: PlanCompetency) => opts.needsTechnical && c.techCategories.some((t) => selectedCategories.has(t))
  const ranked = [...cs].sort((a, b) => Number(b.isCritical) - Number(a.isCritical) || b.weight - a.weight)
  const covered = ranked.filter((c) => isCovered(c) && !c.isCritical)
  const wanted = ranked.filter((c) => !isCovered(c) || c.isCritical)
  const primary = wanted.slice(0, max)
  return { primary: primary.map((c) => c.id), covered: covered.map((c) => c.id), deferred: wanted.slice(max).map((c) => c.id) }
}

const TECH_MINUTES: Record<string, number> = { L1: 3, L2: 4, L3: 6, L4: 8 }
export const INTERVIEW_MINUTES_PER_COMPETENCY = 5
export const SESSION_OVERHEAD_MINUTES = 10
export const COMFORTABLE_SESSION_MINUTES = 90

/** Rough session length: ~3–8 minutes per technical question by difficulty (scenario and problem-solving +2), 5 per rated competency, 10 for opening and closing. */
export function estimateMinutes(tech: { difficulty: string; category: string }[], interviewCompetencies: number): { tech: number; interview: number; total: number } {
  const t = tech.reduce((s, q) => s + (TECH_MINUTES[q.difficulty] ?? 5) + (q.category === 'SCENARIO' || q.category === 'PROBLEM_SOLVING' ? 2 : 0), 0)
  const i = interviewCompetencies * INTERVIEW_MINUTES_PER_COMPETENCY
  return { tech: t, interview: i, total: t + i + (t + i > 0 ? SESSION_OVERHEAD_MINUTES : 0) }
}

/**
 * Interview ratings derived from the technical questions: for a competency whose evidence includes technical categories,
 * the rater's own average score (0–5) on that session's questions in those categories becomes a 1–5 competency rating.
 * It is a starting point the rater can overwrite, so nothing is rated twice and nothing already entered is lost.
 */
export function deriveRatings(competencies: { id: string; techCategories: string[] }[], questions: { id: string; category: string }[], scores: Record<string, number>): Map<string, { rating: number; questions: number }> {
  const out = new Map<string, { rating: number; questions: number }>()
  for (const c of competencies) {
    if (!c.techCategories.length) continue
    const xs = questions.filter((q) => c.techCategories.includes(q.category) && typeof scores[q.id] === 'number').map((q) => scores[q.id])
    if (!xs.length) continue
    out.set(c.id, { rating: Math.min(5, Math.max(1, Math.round(xs.reduce((a, b) => a + b, 0) / xs.length))), questions: xs.length })
  }
  return out
}
