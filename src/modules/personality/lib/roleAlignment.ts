import type { PersonalityBehavioralDimension, PersonalityDimensionScore, PersonalityJobBehavioralRequirement } from '../types'

export type RoleAlignmentStatus = 'MEETS_CRITICAL' | 'MEETS' | 'BELOW_MIN' | 'BELOW_PREFERRED' | 'ABOVE_PREFERRED' | 'NO_DATA'

export interface RoleAlignmentRow {
  requirementId: string
  dimensionId: string
  dimensionKey: string
  dimensionLabelFa: string
  weight: number
  isCritical: boolean
  minThreshold: number | null
  preferredMin: number | null
  preferredMax: number | null
  score: number | null
  status: RoleAlignmentStatus
}

export interface RoleAlignmentResult {
  rows: RoleAlignmentRow[]
  /** Weighted average of each row's own 0-100 fit score, over rows that actually have a candidate
   * score — never penalizes a candidate for a requirement the assessment didn't cover. null when no
   * requirement has any coverage yet. */
  overallAlignmentPercent: number | null
  criticalGapCount: number
}

function rowFitScore(row: Pick<RoleAlignmentRow, 'score' | 'minThreshold' | 'preferredMin' | 'preferredMax'>): number | null {
  if (row.score == null) return null
  const { score, minThreshold, preferredMin, preferredMax } = row
  // No explicit target at all — the raw score is its own fit signal (a high behavioral score is
  // its own evidence, absent any stated threshold for this role).
  if (minThreshold == null && preferredMin == null && preferredMax == null) return score
  if (minThreshold != null && score < minThreshold) {
    // Below the hard minimum: scale down further the further below it the candidate lands, so a
    // near-miss and a wide miss are visibly different rather than both just "failing".
    return Math.max(0, (score / minThreshold) * 60)
  }
  if (preferredMin != null && score < preferredMin) {
    const floor = minThreshold ?? 0
    const span = Math.max(1, preferredMin - floor)
    return 60 + Math.min(40, ((score - floor) / span) * 40)
  }
  if (preferredMax != null && score > preferredMax) {
    // Over-shooting a preferred BAND (not just a minimum) is itself evidence worth flagging —
    // e.g. extreme risk-tolerance for a compliance-heavy role — so it's scored as a partial fit,
    // not a perfect one.
    const over = score - preferredMax
    return Math.max(50, 100 - over)
  }
  return 100
}

function rowStatus(row: Pick<RoleAlignmentRow, 'score' | 'minThreshold' | 'preferredMin' | 'preferredMax' | 'isCritical'>): RoleAlignmentStatus {
  if (row.score == null) return 'NO_DATA'
  if (row.minThreshold != null && row.score < row.minThreshold) return 'BELOW_MIN'
  if (row.preferredMin != null && row.score < row.preferredMin) return 'BELOW_PREFERRED'
  if (row.preferredMax != null && row.score > row.preferredMax) return 'ABOVE_PREFERRED'
  return row.isCritical ? 'MEETS_CRITICAL' : 'MEETS'
}

/**
 * Deterministic, non-AI role-fit computation — the same "always computed, never replaces by AI
 * interpretation" principle as personality_score_assessment's computed_patterns/watchpoints
 * (schema.sql). Gemini's own role-fit narrative (see personality-gemini-analysis) is given these
 * exact numbers as input, so its prose is always grounded in what this table already shows rather
 * than a separate, potentially inconsistent calculation.
 */
export function computeRoleAlignment(
  requirements: PersonalityJobBehavioralRequirement[],
  dimensionScores: PersonalityDimensionScore[],
  dimensions: PersonalityBehavioralDimension[],
): RoleAlignmentResult {
  const scoreByDimension = new Map(
    dimensionScores.filter((s) => s.scoreKind === 'BEHAVIORAL_DIMENSION' && s.dimensionId).map((s) => [s.dimensionId as string, s.normalizedScore]),
  )

  const rows: RoleAlignmentRow[] = requirements.map((req) => {
    const dim = dimensions.find((d) => d.id === req.dimensionId)
    const score = scoreByDimension.get(req.dimensionId) ?? null
    const base = { score, minThreshold: req.minThreshold, preferredMin: req.preferredMin, preferredMax: req.preferredMax, isCritical: req.isCritical }
    return {
      requirementId: req.id,
      dimensionId: req.dimensionId,
      dimensionKey: dim?.key ?? '',
      dimensionLabelFa: dim?.labelFa ?? '—',
      weight: req.weight,
      isCritical: req.isCritical,
      minThreshold: req.minThreshold,
      preferredMin: req.preferredMin,
      preferredMax: req.preferredMax,
      score,
      status: rowStatus(base),
    }
  })

  const covered = rows.filter((r) => r.score != null)
  const weightedSum = covered.reduce((sum, r) => sum + (rowFitScore(r) ?? 0) * r.weight, 0)
  const totalWeight = covered.reduce((sum, r) => sum + r.weight, 0)
  const overallAlignmentPercent = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null

  const criticalGapCount = rows.filter((r) => r.isCritical && (r.status === 'BELOW_MIN' || r.status === 'BELOW_PREFERRED')).length

  return { rows, overallAlignmentPercent, criticalGapCount }
}
