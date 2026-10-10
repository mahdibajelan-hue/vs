import type { FinClaim, FinContract, FinContractAmendment, FinPayment, FinPaymentCertificate, FinGuarantee, FinCashflowForecast } from '../types'
import { certificatePaidTotal, averagePaymentDelayDays, claimsExposureTotal, currentContractValue, expiringGuarantees, overduePayableTotal } from './financeCalc'
import { buildCurves, isoMonthIdx, type CashPlan } from './financeCurves'
import { contractFile, forecast, PENDING_CHANGE_STATUSES, type FinThresholds, type LandSummary, type PendingChange } from './financeControl'
import { advanceStatus, type Clearance } from './financeInsights'

export type Tone = 'good' | 'warn' | 'bad' | 'neutral'
export interface ProjectInputs {
  contracts: FinContract[]; amendments: FinContractAmendment[]; certificates: FinPaymentCertificate[]; payments: FinPayment[]; guarantees: FinGuarantee[]; claims: FinClaim[]; clearances: Clearance[]
  /** Current budget (approved + approved changes). 0 = not entered. */
  bac: number
  /** Current Jalali year's allocation, when entered. */
  annual: number | null
  linesTotal: number
  land: LandSummary | null
  changes: (PendingChange & { id: string })[]
  plans: CashPlan[]; manualForecasts: FinCashflowForecast[]
  /** Physical progress % (0–100) from the schedule module, null when unknown. */
  physical: number | null
  thresholds: FinThresholds
  today: string
}

export interface ProjectKpi {
  // budget
  bac: number; annual: number | null; linesTotal: number; unallocated: number
  committedContracts: number; landExposure: number; committed: number; committedPct: number | null
  certified: number; paid: number; paidPct: number | null; remaining: number
  eac: number; scenarioEac: number; vac: number; overrun: 'none' | 'watch' | 'possible' | 'likely'
  // finance operations
  overdueAmount: number; avgDelay: number | null; pendingCerts: number; cashNext3: number
  /** Actual cumulative payments vs the employer's baseline plan to date, in %; null when no baseline is entered. */
  cashDeviationPct: number | null; unpaidCertified: number
  // contracts
  activeContracts: number; valueOriginal: number; valueCurrent: number; growthPct: number
  pendingChanges: number; pendingChangesAmount: number; guaranteesAtRisk: number; claimsOpen: number; clearancesMissing: number; advanceOpen: number
  // project performance
  physical: number | null; financialPct: number | null; gapPct: number | null; cpi: number | null
}

/** One project's management indicators. Money is rial only; foreign-currency contracts count with their rial equivalent exactly as the rest of the module does. */
export function projectKpis(a: ProjectInputs): ProjectKpi {
  const live = a.contracts.filter((c) => c.status !== 'draft' && c.status !== 'replaced')
  const active = live.filter((c) => c.status === 'active')
  const ids = new Set(live.map((c) => c.id))
  const certs = a.certificates.filter((c) => ids.has(c.contractId) && c.status !== 'rejected' && c.status !== 'draft')
  const certified = certs.reduce((n, c) => n + (c.certifiedAmount ?? 0), 0) + (a.land?.paid ?? 0)
  const paidContracts = certs.reduce((n, c) => n + certificatePaidTotal(c), 0)
  const paid = paidContracts + (a.land?.paid ?? 0)
  const fc = forecast({ contracts: live, amendments: a.amendments, certificates: certs, claims: a.claims, land: a.land, pending: a.changes, budget: a.bac, thresholds: a.thresholds, paidContracts })
  const committed = fc.baseEac
  const valueOriginal = live.filter((c) => c.status !== 'terminated').reduce((n, c) => n + contractFile(c, []).original, 0)
  const valueCurrent = live.filter((c) => c.status !== 'terminated').reduce((n, c) => n + currentContractValue(c, a.amendments), 0)
  const contractCertified = certs.reduce((n, c) => n + (c.certifiedAmount ?? 0), 0)
  const financialPct = valueCurrent > 0 ? Math.round((contractCertified / valueCurrent) * 1000) / 10 : null
  const gapPct = a.physical != null && financialPct != null ? Math.round((financialPct - a.physical) * 10) / 10 : null
  const ev = a.physical != null && a.bac > 0 ? (a.bac * a.physical) / 100 : null
  const cpi = ev != null && contractCertified > 0 ? Math.round((ev / contractCertified) * 100) / 100 : null
  const pending = a.changes.filter((c) => PENDING_CHANGE_STATUSES.includes(c.status))
  const idx = isoMonthIdx(a.today) ?? 0
  const rial = buildCurves({ contracts: live, amendments: a.amendments, certificates: certs, payments: a.payments, plans: a.plans, manualForecasts: a.manualForecasts, fund: { fund: 'rial', currency: 'ریال' }, todayIso: a.today })
  const cashNext3 = rial.months.filter((m) => m.idx > idx && m.idx <= idx + 3).reduce((n, m) => n + m.forecast, 0)
  const guar = expiringGuarantees(a.guarantees.filter((g) => ids.has(g.contractId)), a.today, a.thresholds.guaranteeExpiryDays).length
  const clearancesMissing = live.filter((c) => c.status === 'completed' && !a.clearances.some((x) => x.contractId === c.id && x.kind === 'social_security' && x.status === 'issued')).length
  const advanceOpen = live.reduce((n, c) => { const s = advanceStatus(c, a.amendments, certs); return n + (s && (c.status === 'completed' || c.status === 'terminated') ? Math.max(0, s.balance) : 0) }, 0)
  const growth = valueOriginal > 0 ? Math.round(((valueCurrent - valueOriginal) / valueOriginal) * 1000) / 10 : 0
  return {
    bac: a.bac, annual: a.annual, linesTotal: a.linesTotal, unallocated: Math.max(0, a.bac - a.linesTotal),
    committedContracts: fc.contractCommitted, landExposure: fc.landExposure, committed, committedPct: a.bac > 0 ? Math.round((committed / a.bac) * 1000) / 10 : null,
    certified, paid, paidPct: a.bac > 0 ? Math.round((paid / a.bac) * 1000) / 10 : null, remaining: a.bac - committed,
    eac: fc.baseEac, scenarioEac: fc.scenarioEac, vac: a.bac > 0 ? a.bac - fc.baseEac : 0, overrun: fc.overrun,
    overdueAmount: overduePayableTotal(certs, a.today, a.thresholds.overdueCertificateDays), avgDelay: averagePaymentDelayDays(certs),
    pendingCerts: certs.filter((c) => c.status === 'submitted' || c.status === 'under_review').length, cashNext3, cashDeviationPct: rial.deviationPct, unpaidCertified: Math.max(0, contractCertified - paidContracts),
    activeContracts: active.length, valueOriginal, valueCurrent, growthPct: growth,
    pendingChanges: pending.length, pendingChangesAmount: pending.reduce((n, c) => n + c.proposedAmount, 0), guaranteesAtRisk: guar, claimsOpen: claimsExposureTotal(a.claims.filter((c) => ids.has(c.contractId))), clearancesMissing, advanceOpen,
    physical: a.physical, financialPct, gapPct, cpi,
  }
}

export const toneOf = {
  committedPct: (v: number | null, t: FinThresholds): Tone => (v == null ? 'neutral' : v >= t.budgetCriticalPct ? 'bad' : v >= t.budgetWarnPct ? 'warn' : 'good'),
  vac: (v: number, bac: number): Tone => (bac <= 0 ? 'neutral' : v < 0 ? 'bad' : v < bac * 0.05 ? 'warn' : 'good'),
  cpi: (v: number | null): Tone => (v == null ? 'neutral' : v < 0.9 ? 'bad' : v < 1 ? 'warn' : 'good'),
  gap: (v: number | null): Tone => (v == null ? 'neutral' : Math.abs(v) > 15 ? 'bad' : Math.abs(v) > 5 ? 'warn' : 'good'),
  count: (v: number, warnAt = 1, badAt = 3): Tone => (v >= badAt ? 'bad' : v >= warnAt ? 'warn' : 'good'),
  growth: (v: number, t: FinThresholds): Tone => (v >= t.amendmentJumpPct * 2 ? 'bad' : v >= t.amendmentJumpPct ? 'warn' : 'good'),
}

export type Role = 'ceo' | 'pm' | 'finance' | 'contracts'
export interface KpiDef { key: string; label: string; value: string; unit?: string; sub?: string; tone: Tone; hint: string; go?: { tab: string; sub?: string } }
