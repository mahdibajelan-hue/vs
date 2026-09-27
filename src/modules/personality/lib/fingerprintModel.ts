import type {
  PersonalityAssessment,
  PersonalityBehavioralDimension,
  PersonalityDimensionScore,
  PersonalityJobBehavioralRequirement,
  PersonalityTrait,
  PersonalityValidityResult,
} from '../types'
import { bilingual, dimensionFamily, traitTone, type BilingualLabel } from './bilingual'
import { computeRoleAlignment, type RoleAlignmentResult, type RoleAlignmentStatus } from './roleAlignment'

/**
 * One candidate's behavioral fingerprint, resolved to display-ready rows (bilingual labels, trait
 * hue, dimension family, job threshold) — shared by the on-screen fingerprint panel, the results
 * page hero and the full PDF report so all three name and color every trait the same way.
 */

export interface FingerprintTraitRow {
  id: string
  key: string
  label: BilingualLabel
  score: number | null
  tone: string
  confidence: PersonalityDimensionScore['confidence']
}

export interface FingerprintDimensionRow {
  id: string
  key: string
  label: BilingualLabel
  score: number | null
  familyKey: string
  familyLabelFa: string
  familyLabelEn: string
  tone: string
  minThreshold: number | null
  preferredMin: number | null
  preferredMax: number | null
  isCritical: boolean
  status: RoleAlignmentStatus | null
}

export interface FingerprintSnapshot {
  traits: FingerprintTraitRow[]
  dimensions: FingerprintDimensionRow[]
  alignment: RoleAlignmentResult
  hasJobProfile: boolean
  validity: PersonalityValidityResult | undefined
  patterns: string[]
  watchpoints: string[]
  /** Up to three highest-scoring dimensions (≥ 60) and up to three below the job minimum / lowest. */
  topStrengths: FingerprintDimensionRow[]
  watchDimensions: FingerprintDimensionRow[]
}

export function buildFingerprintSnapshot(input: {
  assessment: PersonalityAssessment
  scores: PersonalityDimensionScore[]
  traits: PersonalityTrait[]
  dimensions: PersonalityBehavioralDimension[]
  requirements: PersonalityJobBehavioralRequirement[]
  validity: PersonalityValidityResult | undefined
}): FingerprintSnapshot {
  const { assessment, scores, traits, dimensions, validity } = input
  const requirements = input.requirements.filter((r) => r.profileId === assessment.jobProfileId)
  const alignment = computeRoleAlignment(requirements, scores, dimensions)
  const statusByDimension = new Map(alignment.rows.map((r) => [r.dimensionId, r.status]))

  const traitOrder = (s: PersonalityDimensionScore) => traits.find((x) => x.id === s.traitId)?.displayOrder ?? 99
  const traitRows: FingerprintTraitRow[] = scores
    .filter((s) => s.scoreKind === 'TRAIT')
    .sort((a, b) => traitOrder(a) - traitOrder(b))
    .map((s) => {
      const t = traits.find((x) => x.id === s.traitId)
      return { id: s.id, key: t?.key ?? '', label: bilingual('trait', t), score: s.normalizedScore, tone: traitTone(t?.key), confidence: s.confidence }
    })

  const dimensionRows: FingerprintDimensionRow[] = scores
    .filter((s) => s.scoreKind === 'BEHAVIORAL_DIMENSION')
    .map((s) => {
      const d = dimensions.find((x) => x.id === s.dimensionId)
      const fam = dimensionFamily(d?.key)
      const req = requirements.find((r) => r.dimensionId === s.dimensionId)
      return {
        id: s.id,
        key: d?.key ?? '',
        label: bilingual('dimension', d),
        score: s.normalizedScore,
        familyKey: fam.key,
        familyLabelFa: fam.labelFa,
        familyLabelEn: fam.labelEn,
        tone: fam.tone,
        minThreshold: req?.minThreshold ?? null,
        preferredMin: req?.preferredMin ?? null,
        preferredMax: req?.preferredMax ?? null,
        isCritical: req?.isCritical ?? false,
        status: s.dimensionId ? (statusByDimension.get(s.dimensionId) ?? null) : null,
      }
    })
    .sort((a, b) => a.familyKey.localeCompare(b.familyKey) || Number(b.isCritical) - Number(a.isCritical) || (b.score ?? -1) - (a.score ?? -1))

  const scored = dimensionRows.filter((d) => d.score != null)
  const topStrengths = [...scored].filter((d) => (d.score as number) >= 60).sort((a, b) => (b.score as number) - (a.score as number)).slice(0, 3)
  const below = scored.filter((d) => d.status === 'BELOW_MIN' || d.status === 'BELOW_PREFERRED')
  const watchDimensions = (below.length > 0 ? below : [...scored].filter((d) => (d.score as number) < 50))
    .sort((a, b) => Number(b.isCritical) - Number(a.isCritical) || (a.score as number) - (b.score as number))
    .slice(0, 3)

  return {
    traits: traitRows,
    dimensions: dimensionRows,
    alignment,
    hasJobProfile: assessment.jobProfileId != null,
    validity,
    patterns: assessment.computedPatterns.map((p) => p.interpretation).filter(Boolean),
    watchpoints: assessment.computedWatchpoints.map((w) => w.topic).filter(Boolean),
    topStrengths,
    watchDimensions,
  }
}

/** Band label for a 0-100 trait/dimension score — printed next to the number, never color alone. */
export function scoreBandFa(score: number | null): string {
  if (score == null) return 'بدون داده'
  if (score >= 75) return 'بالا'
  if (score >= 55) return 'متوسط رو به بالا'
  if (score >= 40) return 'متوسط'
  return 'پایین'
}
