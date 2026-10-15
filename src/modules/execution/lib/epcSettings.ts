import { DEFAULT_THRESHOLDS } from './engine/alerts'
import { DEFAULT_PRODUCTIVITY_PARAMS } from './engine/productivity'
import { EMPTY_PARTIES, type EpcSettings } from '../epcTypes'

/** Reads the EPC block out of the project's raw settings JSON, filling every missing value with the documented default. */
export function epcSettings(raw: Record<string, unknown> | undefined | null): EpcSettings {
  const r = (raw ?? {}) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const step = r.employerStep === 'advisory' || r.employerStep === 'binding' ? r.employerStep : 'off'
  const par = r.parties ?? {}
  const pr = r.productivity ?? {}
  return {
    employerStep: step,
    parties: { employer: { ...EMPTY_PARTIES.employer, ...(par.employer ?? {}) }, consultant: { ...EMPTY_PARTIES.consultant, ...(par.consultant ?? {}) }, contractor: { ...EMPTY_PARTIES.contractor, ...(par.contractor ?? {}) } },
    productivity: { windowDays: Number(pr.windowDays) || DEFAULT_PRODUCTIVITY_PARAMS.windowDays, weighting: pr.weighting === 'all' || pr.weighting === 'sma' ? pr.weighting : 'wma', smaDays: Number(pr.smaDays) || DEFAULT_PRODUCTIVITY_PARAMS.smaDays, outlierSigma: Number(pr.outlierSigma) || DEFAULT_PRODUCTIVITY_PARAMS.outlierSigma, assumedElasticity: pr.assumedElasticity != null ? Number(pr.assumedElasticity) : 0.6, extraShiftEfficiency: pr.extraShiftEfficiency != null ? Number(pr.extraShiftEfficiency) : 0.8, shiftHours: Number(pr.shiftHours) || 10, crewDayCost: pr.crewDayCost != null && pr.crewDayCost !== '' ? Number(pr.crewDayCost) : null, laborKeys: Array.isArray(pr.laborKeys) && pr.laborKeys.length ? pr.laborKeys : DEFAULT_PRODUCTIVITY_PARAMS.laborKeys },
    thresholds: { ...DEFAULT_THRESHOLDS, ...(r.thresholds ?? {}) },
  }
}
