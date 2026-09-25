import type {
  CandidateAiAnalysis,
  CandidateAiCompetencyBasisRow,
  CompCompetency,
  CompCompetencyConfidence,
  CompCompetencyEvidence,
  CompCompetencyScore,
  CompCompetencyStatus,
  CompEvidenceSourceType,
  CompetencyAssessment,
} from '../types'

// ---------------------------------------------------------------------------
// Candidate 360 competency gap analysis (Phase 4) — pure presentation-side
// helpers over the Competency Engine's own output (comp_competency_scores /
// comp_competency_evidence). Nothing here re-scores a competency: required/
// actual level, gap, status and confidence are shown exactly as the engine
// computed them. The only derived numbers are the summary header's readiness
// figure and overall confidence, both clearly labeled as derived in the UI.
// Lack of evidence is never treated as lack of competency: INSUFFICIENT_EVIDENCE
// rows are excluded from readiness and counted separately.
// ---------------------------------------------------------------------------

export const GAP_STATUS_META: Record<CompCompetencyStatus, { label: string; color: string; severity: number }> = {
  CRITICAL_GAP: { label: 'شکاف حیاتی', color: '#f87171', severity: 0 },
  GAP: { label: 'دارای شکاف', color: '#fbbf24', severity: 1 },
  INSUFFICIENT_EVIDENCE: { label: 'شواهد ناکافی', color: '#94a3b8', severity: 2 },
  MEETS: { label: 'مطابق الزام', color: '#34d399', severity: 3 },
  EXCEEDS: { label: 'فراتر از انتظار', color: '#38bdf8', severity: 4 },
}

export const GAP_CONFIDENCE_META: Record<CompCompetencyConfidence, { label: string; color: string; rank: number }> = {
  NONE: { label: 'بدون شواهد', color: '#64748b', rank: 0 },
  LOW: { label: 'کم', color: '#fb923c', rank: 1 },
  MEDIUM: { label: 'متوسط', color: '#facc15', rank: 2 },
  HIGH: { label: 'بالا', color: '#34d399', rank: 3 },
}

export const EVIDENCE_SOURCE_CHIP: Record<CompEvidenceSourceType, { label: string; color: string }> = {
  TECHNICAL_CATEGORY: { label: 'فنی', color: '#a855f7' },
  PERSONALITY_DIMENSION: { label: 'بعد رفتاری', color: '#f472b6' },
  PERSONALITY_TRAIT: { label: 'شخصیت', color: '#e879f9' },
  SJT: { label: 'موقعیتی', color: '#818cf8' },
  STRUCTURED_INTERVIEW: { label: 'مصاحبه', color: '#38bdf8' },
  EXPERIENCE: { label: 'سوابق', color: '#2dd4bf' },
}

export interface GapRow {
  score: CompCompetencyScore
  competencyId: string
  labelFa: string
  description: string
  /** Evidence rows per source type — the "Supporting Evidence" column. */
  sourceCounts: Partial<Record<CompEvidenceSourceType, number>>
}

export function buildGapRows(scores: CompCompetencyScore[], evidence: CompCompetencyEvidence[], competencies: CompCompetency[]): GapRow[] {
  return scores.map((score) => {
    const competency = competencies.find((c) => c.id === score.competencyId)
    const sourceCounts: Partial<Record<CompEvidenceSourceType, number>> = {}
    for (const e of evidence) {
      if (e.competencyId !== score.competencyId) continue
      sourceCounts[e.sourceType] = (sourceCounts[e.sourceType] ?? 0) + 1
    }
    return {
      score,
      competencyId: score.competencyId,
      labelFa: competency?.labelFa ?? 'شایستگی',
      description: competency?.description ?? '',
      sourceCounts,
    }
  })
}

export type GapSortKey = 'severity' | 'gap' | 'criticality' | 'name'

export function sortGapRows(rows: GapRow[], key: GapSortKey): GapRow[] {
  const sorted = [...rows]
  const byName = (a: GapRow, b: GapRow) => a.labelFa.localeCompare(b.labelFa, 'fa')
  sorted.sort((a, b) => {
    if (key === 'name') return byName(a, b)
    if (key === 'criticality') return Number(b.score.isCritical) - Number(a.score.isCritical) || b.score.weight - a.score.weight || byName(a, b)
    if (key === 'gap') {
      // Unknown gaps (no evidence) sort last — they're not "small gaps".
      const ga = a.score.gap ?? Number.NEGATIVE_INFINITY
      const gb = b.score.gap ?? Number.NEGATIVE_INFINITY
      return gb - ga || byName(a, b)
    }
    return (
      GAP_STATUS_META[a.score.status].severity - GAP_STATUS_META[b.score.status].severity ||
      Number(b.score.isCritical) - Number(a.score.isCritical) ||
      (b.score.gap ?? 0) - (a.score.gap ?? 0) ||
      byName(a, b)
    )
  })
  return sorted
}

/** A strength needs real support: EXCEEDS/MEETS with at least medium confidence. */
export const isConfidentStrength = (s: CompCompetencyScore) => (s.status === 'EXCEEDS' || s.status === 'MEETS') && (s.confidence === 'HIGH' || s.confidence === 'MEDIUM')
export const isCriticalGap = (s: CompCompetencyScore) => s.status === 'CRITICAL_GAP' || (s.status === 'GAP' && s.isCritical)
export const isDevelopmentGap = (s: CompCompetencyScore) => s.status === 'GAP' && !s.isCritical

/** Criticality-aware weight used by the derived summary figures: critical requirements count double. */
const summaryWeight = (s: CompCompetencyScore) => s.weight * (s.isCritical ? 2 : 1)

export type AssessmentMethodKey = 'technical' | 'personality' | 'structuredInterview' | 'experience'

export const ASSESSMENT_METHOD_LABEL_FA: Record<AssessmentMethodKey, string> = {
  technical: 'آزمون فنی',
  personality: 'شخصیت و SJT',
  structuredInterview: 'مصاحبه ساختاریافته',
  experience: 'سوابق و تجربه',
}

export interface GapSummary {
  total: number
  strengths: number
  /** MEETS/EXCEEDS but only LOW confidence — reported, never counted as a strength. */
  tentativeStrengths: number
  developmentGaps: number
  criticalGaps: number
  insufficientEvidence: number
  /** Derived: criticality-weighted attainment (min(actual/required, 1)) over competencies WITH
   * evidence only, 0-100. null when no competency has evidence. */
  readinessPercent: number | null
  /** Share of the criticality-weighted requirement set that readinessPercent actually rests on. */
  readinessBasisShare: number
  fitLabel: string
  fitColor: string
  /** Derived: criticality-weighted average of the per-competency confidences (NONE counts as 0). */
  overallConfidence: CompCompetencyConfidence
  methods: Record<AssessmentMethodKey, boolean>
  competenciesWithEvidence: number
  evidenceCoverageShare: number
}

export function summarizeGapAnalysis(scores: CompCompetencyScore[], assessment: CompetencyAssessment): GapSummary {
  const evidenced = scores.filter((s) => s.status !== 'INSUFFICIENT_EVIDENCE' && s.actualLevel != null)
  const totalWeight = scores.reduce((sum, s) => sum + summaryWeight(s), 0)
  const evidencedWeight = evidenced.reduce((sum, s) => sum + summaryWeight(s), 0)
  const readinessPercent =
    evidencedWeight > 0
      ? Math.round(
          (evidenced.reduce((sum, s) => sum + Math.min((s.actualLevel as number) / Math.max(s.requiredLevel, 0.0001), 1) * summaryWeight(s), 0) / evidencedWeight) * 100,
        )
      : null

  const criticalGaps = scores.filter(isCriticalGap).length
  const confidenceRank = totalWeight > 0 ? scores.reduce((sum, s) => sum + GAP_CONFIDENCE_META[s.confidence].rank * summaryWeight(s), 0) / totalWeight : 0
  const overallConfidence: CompCompetencyConfidence = confidenceRank >= 2.5 ? 'HIGH' : confidenceRank >= 1.5 ? 'MEDIUM' : confidenceRank > 0 ? 'LOW' : 'NONE'

  let fitLabel: string
  let fitColor: string
  if (readinessPercent == null) {
    fitLabel = 'شواهد کافی برای برآورد آمادگی وجود ندارد'
    fitColor = '#94a3b8'
  } else if (criticalGaps > 0) {
    fitLabel = 'نیازمند بررسی — شکاف در شایستگی حیاتی'
    fitColor = '#f87171'
  } else if (readinessPercent >= 90) {
    fitLabel = 'آمادگی بالا برای الزامات شغل'
    fitColor = '#34d399'
  } else if (readinessPercent >= 75) {
    fitLabel = 'آمادگی نسبی — نیازمند توسعه هدفمند'
    fitColor = '#facc15'
  } else {
    fitLabel = 'آمادگی محدود — شکاف‌های قابل توجه'
    fitColor = '#fb923c'
  }

  const competenciesWithEvidence = scores.filter((s) => s.evidenceCount > 0).length
  return {
    total: scores.length,
    strengths: scores.filter(isConfidentStrength).length,
    tentativeStrengths: scores.filter((s) => (s.status === 'EXCEEDS' || s.status === 'MEETS') && !isConfidentStrength(s)).length,
    developmentGaps: scores.filter(isDevelopmentGap).length,
    criticalGaps,
    insufficientEvidence: scores.filter((s) => s.status === 'INSUFFICIENT_EVIDENCE').length,
    readinessPercent,
    readinessBasisShare: totalWeight > 0 ? evidencedWeight / totalWeight : 0,
    fitLabel,
    fitColor,
    overallConfidence,
    methods: {
      technical: assessment.needsTechnicalAssessment,
      personality: assessment.needsPersonalityAssessment,
      structuredInterview: assessment.needsStructuredInterview,
      experience: assessment.includesExperience,
    },
    competenciesWithEvidence,
    evidenceCoverageShare: scores.length > 0 ? competenciesWithEvidence / scores.length : 0,
  }
}

// ---- AI analysis staleness --------------------------------------------------

type SignatureRow = Pick<CandidateAiCompetencyBasisRow, 'competencyId' | 'requiredLevel' | 'actualScore' | 'status' | 'confidence'>

const fixed = (v: number | null | undefined) => (v == null ? '' : Number(v).toFixed(2))

/** Order-independent fingerprint of the numbers the AI analysis is grounded in. The results page
 * recomputes the profile on every visit, so computed_at alone can't tell a real change from a no-op
 * recompute — comparing the numbers themselves can. */
export function competencyProfileSignature(rows: SignatureRow[]): string {
  return rows
    .map((r) => `${r.competencyId}|${fixed(r.requiredLevel)}|${fixed(r.actualScore)}|${r.status}|${r.confidence}`)
    .sort()
    .join(';')
}

/** True when the cached AI analysis was not grounded in the candidate's CURRENT competency profile:
 * either it predates the profile being part of the prompt, or the profile changed since. Unknown
 * (no analysis, or the profile hasn't loaded) is reported as not stale. */
export function isAiAnalysisStale(analysis: CandidateAiAnalysis | null | undefined, scores: CompCompetencyScore[] | undefined): boolean {
  if (!analysis || !scores || scores.length === 0) return false
  if (!analysis.competencyBasis) return true
  return competencyProfileSignature(analysis.competencyBasis) !== competencyProfileSignature(scores)
}

export const formatLevel = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('fa-IR', { maximumFractionDigits: 1 }))
export const formatPercent = (share: number) => `٪${Math.round(share * 100).toLocaleString('fa-IR')}`
