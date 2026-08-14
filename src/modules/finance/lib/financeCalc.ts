import { isoToJalali, todayJalali } from '../../../lib/jalali'
import type { FinAnnualBudget, FinBudget, FinBudgetChange, FinClaim, FinContract, FinContractAmendment, FinGuarantee, FinPaymentCertificate, FinRetentionRelease } from '../types'

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Current Budget = Approved Budget + every logged change (spec: a running log, never an overwritten single field). */
export function currentBudget(budget: FinBudget | null, changes: FinBudgetChange[]): number {
  const approved = budget?.approvedBudget ?? 0
  return approved + changes.reduce((sum, c) => sum + c.amount, 0)
}

/**
 * Multi-currency policy for this calc layer (mirrors schema.sql §21's comment): Contract Value,
 * Certificate Gross Amount, Paid Amount and Budget each fold their foreign-currency
 * rial-equivalent directly into the one true rial total everywhere below, so every KPI/chart
 * automatically reflects both currency portions without callers having to remember to add two
 * numbers. Certified Amount stays rial-only (no FC field exists for it — certification runs
 * against the rial payable_amount; the FC portion is tracked for transparency on the gross/paid
 * side, not run back through the certify workflow).
 */

/** Current Contract Value = (Contract Value + FX rial-equivalent) + every amendment against that contract. */
export function currentContractValue(contract: FinContract, amendments: FinContractAmendment[]): number {
  const base = contract.contractValue + contract.fx.fcRialEquivalent
  return base + amendments.filter((a) => a.contractId === contract.id).reduce((sum, a) => sum + a.amount, 0)
}

/** Paid Amount including its FX rial-equivalent. */
export function certificatePaidTotal(cert: FinPaymentCertificate): number {
  return cert.paidAmount + cert.paidFx.fcRialEquivalent
}

/** Gross Amount including its FX rial-equivalent — informational total, not run through the deduction formula (see schema.sql §21). */
export function certificateGrossTotal(cert: FinPaymentCertificate): number {
  return cert.grossAmount + cert.grossFx.fcRialEquivalent
}

/** Outstanding = what's been certified (or, before certification, what's payable) minus what's actually been paid (incl. FX). */
export function certificateOutstanding(cert: FinPaymentCertificate): number {
  const owed = cert.certifiedAmount ?? cert.payableAmount
  return Math.max(0, owed - certificatePaidTotal(cert))
}

/** Days since the certificate was submitted (or dated, if never formally submitted) and still not fully paid — null once paid in full. */
export function paymentAgingDays(cert: FinPaymentCertificate, today = todayIso()): number | null {
  if (certificateOutstanding(cert) <= 0) return null
  const from = cert.submittedDate ?? cert.certificateDate
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(from)) / 86400000))
}

/** Realized delay for an already (at least partially) paid certificate — paidDate minus certifiedDate (fallback submittedDate). */
export function realizedPaymentDelayDays(cert: FinPaymentCertificate): number | null {
  if (!cert.paidDate) return null
  const from = cert.certifiedDate ?? cert.submittedDate ?? cert.certificateDate
  return Math.max(0, Math.round((Date.parse(cert.paidDate) - Date.parse(from)) / 86400000))
}

export function averagePaymentDelayDays(certificates: FinPaymentCertificate[]): number | null {
  const delays = certificates.map(realizedPaymentDelayDays).filter((d): d is number => d != null)
  if (delays.length === 0) return null
  return Math.round(delays.reduce((s, d) => s + d, 0) / delays.length)
}

export function maxPaymentDelayDays(certificates: FinPaymentCertificate[]): number | null {
  const delays = certificates.map(realizedPaymentDelayDays).filter((d): d is number => d != null)
  if (delays.length === 0) return null
  return Math.max(...delays)
}

/** Sum of outstanding balances for certificates overdue beyond the given threshold (default 30 days). */
export function overduePayableTotal(certificates: FinPaymentCertificate[], today = todayIso(), thresholdDays = 30): number {
  return certificates.filter((c) => (paymentAgingDays(c, today) ?? 0) > thresholdDays).reduce((sum, c) => sum + certificateOutstanding(c), 0)
}

/** When paid exceeds certified on a certificate (e.g. advance not yet fully recovered), that's owed back by the contractor. */
export function contractorOverpaymentTotal(certificates: FinPaymentCertificate[]): number {
  return certificates.reduce((sum, c) => {
    const owed = c.certifiedAmount ?? c.payableAmount
    return sum + Math.max(0, certificatePaidTotal(c) - owed)
  }, 0)
}

// ---------------------------------------------------------------------------
// Guarantees
// ---------------------------------------------------------------------------

export function activeGuaranteesTotal(guarantees: FinGuarantee[]): number {
  return guarantees.filter((g) => g.status === 'active').reduce((sum, g) => sum + g.amount, 0)
}

/** Active guarantees whose expiry falls within the next `withinDays` (default 60) — for expiry alerts. */
export function expiringGuarantees(guarantees: FinGuarantee[], today = todayIso(), withinDays = 60): FinGuarantee[] {
  const horizon = Date.parse(today) + withinDays * 86400000
  return guarantees.filter((g) => g.status === 'active' && g.expiryDate && Date.parse(g.expiryDate) <= horizon)
}

// ---------------------------------------------------------------------------
// Retention (حسن انجام کار) — the amount withheld per certificate is already tracked
// (certificate.retentionAmount); these compute the *liability* side: how much is currently held
// vs. how much has actually been released back to the contractor.
// ---------------------------------------------------------------------------

/** Total retention withheld to date across the given certificates. */
export function retentionHeldTotal(certificates: FinPaymentCertificate[]): number {
  return certificates.reduce((sum, c) => sum + c.retentionAmount, 0)
}

/** Total retention actually released (only rows marked 'released', using the actual amount if entered). */
export function retentionReleasedTotal(releases: FinRetentionRelease[]): number {
  return releases.filter((r) => r.status === 'released').reduce((sum, r) => sum + (r.actualAmount ?? r.plannedAmount), 0)
}

/** Outstanding retention liability — held minus what's already been paid back. Never negative. */
export function retentionLiability(certificates: FinPaymentCertificate[], releases: FinRetentionRelease[]): number {
  return Math.max(0, retentionHeldTotal(certificates) - retentionReleasedTotal(releases))
}

/** Pending retention releases whose planned date falls within `withinDays` (default 60) — release-schedule alerts. */
export function upcomingRetentionReleases(releases: FinRetentionRelease[], today = todayIso(), withinDays = 60): FinRetentionRelease[] {
  const horizon = Date.parse(today) + withinDays * 86400000
  return releases.filter((r) => r.status === 'pending' && r.plannedDate && Date.parse(r.plannedDate) <= horizon)
}

// ---------------------------------------------------------------------------
// Contractor claims (کلایم پیمانکار) — a claim is a contractor assertion that may be rejected or
// only partially approved, so its claimed amount is a contingent exposure, not a settled cost,
// until it resolves to 'approved'/'partially_approved'/'rejected'.
// ---------------------------------------------------------------------------

const UNRESOLVED_CLAIM_STATUSES = new Set(['submitted', 'under_review', 'arbitration'])

/** Sum of amountClaimed across every claim still unresolved (submitted/under_review/arbitration) — the contingent financial exposure. */
export function claimsExposureTotal(claims: FinClaim[]): number {
  return claims.filter((c) => UNRESOLVED_CLAIM_STATUSES.has(c.status)).reduce((sum, c) => sum + c.amountClaimed, 0)
}

/** Claims still awaiting a decision, past `staleDays` (default 14) since submission — for a "needs attention" alert. */
export function staleClaims(claims: FinClaim[], today = todayIso(), staleDays = 14): FinClaim[] {
  return claims.filter((c) => UNRESOLVED_CLAIM_STATUSES.has(c.status) && Math.round((Date.parse(today) - Date.parse(c.submittedDate)) / 86400000) > staleDays)
}

// ---------------------------------------------------------------------------
// Contractor payment scorecard — per-contract view of the employer's own payment discipline
// (delay, on-time rate, outstanding) plus that contract's claim load, so the CEO can see at a
// glance which contractor relationships are running hot.
// ---------------------------------------------------------------------------

export interface ContractorScorecardRow {
  contractId: string
  certificateCount: number
  certifiedTotal: number
  paidTotal: number
  outstandingTotal: number
  avgPaymentDelayDays: number | null
  maxPaymentDelayDays: number | null
  /** % of realized (paid) certificates settled within `onTimeDays` of certification. Null when nothing paid yet. */
  onTimePaymentPct: number | null
  overdueCount: number
  claimCount: number
  claimsExposure: number
  /** 0-100 composite: starts at 100, penalized by average delay, outstanding-vs-contract-value ratio, and claims exposure-vs-contract-value ratio. A rough, honest single number — not a certified KPI. */
  score: number
}

export function computeContractorScorecard(contract: FinContract, certificates: FinPaymentCertificate[], claims: FinClaim[], today = todayIso(), onTimeDays = 30): ContractorScorecardRow {
  const certs = certificates.filter((c) => c.contractId === contract.id)
  const contractClaims = claims.filter((c) => c.contractId === contract.id)

  const certifiedTotal = certs.reduce((sum, c) => sum + (c.certifiedAmount ?? 0), 0)
  const paidTotal = certs.reduce((sum, c) => sum + certificatePaidTotal(c), 0)
  const outstandingTotal = certs.reduce((sum, c) => sum + certificateOutstanding(c), 0)
  const realizedDelays = certs.map(realizedPaymentDelayDays).filter((d): d is number => d != null)
  const onTimeCount = realizedDelays.filter((d) => d <= onTimeDays).length
  const overdueCount = certs.filter((c) => (paymentAgingDays(c, today) ?? 0) > onTimeDays).length
  const claimsExposure = claimsExposureTotal(contractClaims)

  const avgDelay = averagePaymentDelayDays(certs)
  const maxDelay = maxPaymentDelayDays(certs)
  const onTimePaymentPct = realizedDelays.length > 0 ? Math.round((onTimeCount / realizedDelays.length) * 100) : null

  const contractValue = contract.contractValue + contract.fx.fcRialEquivalent
  const delayPenalty = avgDelay != null ? Math.min(40, avgDelay / 2) : 0
  const outstandingPenalty = outstandingTotal > 0 && contractValue > 0 ? Math.min(30, (outstandingTotal / contractValue) * 100) : 0
  const claimsPenalty = contractValue > 0 ? Math.min(30, (claimsExposure / contractValue) * 100) : 0
  const score = Math.max(0, Math.round(100 - delayPenalty - outstandingPenalty - claimsPenalty))

  return {
    contractId: contract.id,
    certificateCount: certs.length,
    certifiedTotal,
    paidTotal,
    outstandingTotal,
    avgPaymentDelayDays: avgDelay,
    maxPaymentDelayDays: maxDelay,
    onTimePaymentPct,
    overdueCount,
    claimCount: contractClaims.length,
    claimsExposure,
    score,
  }
}

// ---------------------------------------------------------------------------
// Annual Budget — Project -> Annual Budget -> Year, kept distinct from the Total Project Budget.
// ---------------------------------------------------------------------------

export interface AnnualBudgetRow {
  jalaliYear: number
  budgetAmount: number
  actualCommitted: number
  remaining: number
}

/** One row per Jalali year that has either a declared annual budget or certified activity, sorted ascending. */
export function computeAnnualBudgetRows(masterProjectId: string, annualBudgets: FinAnnualBudget[], projectCertificates: FinPaymentCertificate[]): AnnualBudgetRow[] {
  const years = new Set<number>()
  const byYearBudget = new Map<number, number>()
  for (const b of annualBudgets.filter((a) => a.masterProjectId === masterProjectId)) {
    years.add(b.jalaliYear)
    byYearBudget.set(b.jalaliYear, b.budgetAmount)
  }
  const byYearActual = new Map<number, number>()
  for (const c of projectCertificates) {
    const j = isoToJalali(c.certificateDate)
    if (!j) continue
    years.add(j.jy)
    byYearActual.set(j.jy, (byYearActual.get(j.jy) ?? 0) + (c.certifiedAmount ?? 0))
  }
  return [...years]
    .sort((a, b) => a - b)
    .map((jalaliYear) => {
      const budgetAmount = byYearBudget.get(jalaliYear) ?? 0
      const actualCommitted = byYearActual.get(jalaliYear) ?? 0
      return { jalaliYear, budgetAmount, actualCommitted, remaining: budgetAmount - actualCommitted }
    })
}

export function currentJalaliYearBudget(masterProjectId: string, annualBudgets: FinAnnualBudget[]): number | null {
  const jy = todayJalali().jy
  const row = annualBudgets.find((a) => a.masterProjectId === masterProjectId && a.jalaliYear === jy)
  return row ? row.budgetAmount : null
}

export interface ProjectFinancialSummary {
  masterProjectId: string
  hasBudget: boolean
  approvedBudget: number
  currentBudgetAmount: number
  /** This Jalali year's declared annual budget — null when not entered, never confused with currentBudgetAmount (Total Project Budget). */
  annualBudgetAmount: number | null
  contractValueTotal: number
  currentContractValueTotal: number
  /** = current contract value summed across every non-terminated, non-draft contract of every role (EPC/Consultant/MC/TPI/Other) — "what's legally committed." */
  committedCost: number
  /** = sum of certified amounts to date — "what's been verified as actually executed," not accounting cost. */
  actualCost: number
  certifiedTotal: number
  paidTotal: number
  outstandingTotal: number
  eac: number | null
  /** Forecast Cost minus Cost Incurred to Date — what's left to spend to finish. */
  costToComplete: number
  remainingBudget: number
  /** Current Budget - EAC when EAC is entered, otherwise Current Budget - Committed Cost (labeled as a proxy by the caller). */
  budgetVariance: number
  /** Committed but not yet paid out — the real money still at risk on this project. */
  financialExposure: number
  /** Committed cost as a percentage of the current total project budget. */
  budgetAbsorptionPct: number
  guaranteesTotal: number
  expiringGuaranteeCount: number
  avgPaymentDelayDays: number | null
  maxPaymentDelayDays: number | null
  overduePayableTotal: number
  contractorOverpaymentTotal: number
  contractCount: number
  certificateCount: number
  pendingCertificateCount: number
  overdueCertificateCount: number
}

const ACTIVE_COMMITMENT_STATUSES = new Set(['active', 'completed'])

export function computeProjectFinancialSummary(
  masterProjectId: string,
  eac: number | null,
  budget: FinBudget | null,
  budgetChanges: FinBudgetChange[],
  contracts: FinContract[],
  amendments: FinContractAmendment[],
  certificates: FinPaymentCertificate[],
  annualBudgets: FinAnnualBudget[] = [],
  guarantees: FinGuarantee[] = [],
  today = todayIso(),
): ProjectFinancialSummary {
  const projectContracts = contracts.filter((c) => c.masterProjectId === masterProjectId)
  const contractIds = new Set(projectContracts.map((c) => c.id))
  const projectAmendments = amendments.filter((a) => contractIds.has(a.contractId))
  const projectCertificates = certificates.filter((c) => contractIds.has(c.contractId))
  const projectGuarantees = guarantees.filter((g) => contractIds.has(g.contractId))

  const contractValueTotal = projectContracts.reduce((sum, c) => sum + c.contractValue + c.fx.fcRialEquivalent, 0)
  const currentContractValueTotal = projectContracts.reduce((sum, c) => sum + currentContractValue(c, projectAmendments), 0)
  const committedCost = projectContracts.filter((c) => ACTIVE_COMMITMENT_STATUSES.has(c.status)).reduce((sum, c) => sum + currentContractValue(c, projectAmendments), 0)

  const certifiedTotal = projectCertificates.reduce((sum, c) => sum + (c.certifiedAmount ?? 0), 0)
  const paidTotal = projectCertificates.reduce((sum, c) => sum + certificatePaidTotal(c), 0)
  const outstandingTotal = projectCertificates.reduce((sum, c) => sum + certificateOutstanding(c), 0)
  const pendingCertificateCount = projectCertificates.filter((c) => c.status === 'submitted' || c.status === 'under_review').length
  const overdueCertificateCount = projectCertificates.filter((c) => (paymentAgingDays(c, today) ?? 0) > 30).length

  const curBudget = currentBudget(budget, budgetChanges)
  const forecastCost = eac ?? committedCost
  const remainingBudget = curBudget - committedCost
  const budgetVariance = curBudget - forecastCost
  const financialExposure = committedCost - paidTotal
  const costToComplete = Math.max(0, forecastCost - certifiedTotal)
  const budgetAbsorptionPct = curBudget > 0 ? Math.round((committedCost / curBudget) * 1000) / 10 : 0

  return {
    masterProjectId,
    hasBudget: !!budget,
    approvedBudget: budget?.approvedBudget ?? 0,
    currentBudgetAmount: curBudget,
    annualBudgetAmount: currentJalaliYearBudget(masterProjectId, annualBudgets),
    contractValueTotal,
    currentContractValueTotal,
    committedCost,
    actualCost: certifiedTotal,
    certifiedTotal,
    paidTotal,
    outstandingTotal,
    eac,
    costToComplete,
    remainingBudget,
    budgetVariance,
    financialExposure,
    budgetAbsorptionPct,
    guaranteesTotal: activeGuaranteesTotal(projectGuarantees),
    expiringGuaranteeCount: expiringGuarantees(projectGuarantees, today).length,
    avgPaymentDelayDays: averagePaymentDelayDays(projectCertificates),
    maxPaymentDelayDays: maxPaymentDelayDays(projectCertificates),
    overduePayableTotal: overduePayableTotal(projectCertificates, today),
    contractorOverpaymentTotal: contractorOverpaymentTotal(projectCertificates),
    contractCount: projectContracts.length,
    certificateCount: projectCertificates.length,
    pendingCertificateCount,
    overdueCertificateCount,
  }
}

/** Weighted (by certificate count) average of a per-project delay figure — avoids the bias of averaging pre-aggregated averages. */
function weightedAvgDelay(summaries: ProjectFinancialSummary[]): number | null {
  const withDelay = summaries.filter((s) => s.avgPaymentDelayDays != null && s.certificateCount > 0)
  const totalWeight = withDelay.reduce((sum, s) => sum + s.certificateCount, 0)
  if (totalWeight === 0) return null
  const weighted = withDelay.reduce((sum, s) => sum + (s.avgPaymentDelayDays ?? 0) * s.certificateCount, 0)
  return Math.round(weighted / totalWeight)
}

export function aggregateFinancialSummaries(summaries: ProjectFinancialSummary[]): ProjectFinancialSummary {
  const eacKnown = summaries.filter((s) => s.eac != null)
  const maxDelays = summaries.map((s) => s.maxPaymentDelayDays).filter((d): d is number => d != null)
  const currentBudgetTotal = summaries.reduce((sum, s) => sum + s.currentBudgetAmount, 0)
  const committedCostTotal = summaries.reduce((sum, s) => sum + s.committedCost, 0)
  return {
    masterProjectId: '',
    hasBudget: summaries.some((s) => s.hasBudget),
    approvedBudget: summaries.reduce((sum, s) => sum + s.approvedBudget, 0),
    currentBudgetAmount: currentBudgetTotal,
    annualBudgetAmount: summaries.some((s) => s.annualBudgetAmount != null) ? summaries.reduce((sum, s) => sum + (s.annualBudgetAmount ?? 0), 0) : null,
    contractValueTotal: summaries.reduce((sum, s) => sum + s.contractValueTotal, 0),
    currentContractValueTotal: summaries.reduce((sum, s) => sum + s.currentContractValueTotal, 0),
    committedCost: committedCostTotal,
    actualCost: summaries.reduce((sum, s) => sum + s.actualCost, 0),
    certifiedTotal: summaries.reduce((sum, s) => sum + s.certifiedTotal, 0),
    paidTotal: summaries.reduce((sum, s) => sum + s.paidTotal, 0),
    outstandingTotal: summaries.reduce((sum, s) => sum + s.outstandingTotal, 0),
    eac: eacKnown.length > 0 ? eacKnown.reduce((sum, s) => sum + (s.eac ?? 0), 0) : null,
    costToComplete: summaries.reduce((sum, s) => sum + s.costToComplete, 0),
    remainingBudget: summaries.reduce((sum, s) => sum + s.remainingBudget, 0),
    budgetVariance: summaries.reduce((sum, s) => sum + s.budgetVariance, 0),
    financialExposure: summaries.reduce((sum, s) => sum + s.financialExposure, 0),
    budgetAbsorptionPct: currentBudgetTotal > 0 ? Math.round((committedCostTotal / currentBudgetTotal) * 1000) / 10 : 0,
    guaranteesTotal: summaries.reduce((sum, s) => sum + s.guaranteesTotal, 0),
    expiringGuaranteeCount: summaries.reduce((sum, s) => sum + s.expiringGuaranteeCount, 0),
    avgPaymentDelayDays: weightedAvgDelay(summaries),
    maxPaymentDelayDays: maxDelays.length > 0 ? Math.max(...maxDelays) : null,
    overduePayableTotal: summaries.reduce((sum, s) => sum + s.overduePayableTotal, 0),
    contractorOverpaymentTotal: summaries.reduce((sum, s) => sum + s.contractorOverpaymentTotal, 0),
    contractCount: summaries.reduce((sum, s) => sum + s.contractCount, 0),
    certificateCount: summaries.reduce((sum, s) => sum + s.certificateCount, 0),
    pendingCertificateCount: summaries.reduce((sum, s) => sum + s.pendingCertificateCount, 0),
    overdueCertificateCount: summaries.reduce((sum, s) => sum + s.overdueCertificateCount, 0),
  }
}

// ---------------------------------------------------------------------------
// Cash flow & funding forecast — every point is derived from Contract/Certificate/Payment
// rows already in the system, never a fifth independently-entered data source (per spec).
// ---------------------------------------------------------------------------

export interface CashFlowPoint {
  month: string
  planned: number
  actual: number
  forecast: number
}

function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7)
}

function addMonths(monthIso: string, n: number): string {
  const [y, m] = monthIso.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const months: string[] = []
  let cur = fromMonth
  let guard = 0
  while (cur <= toMonth && guard < 240) {
    months.push(cur)
    cur = addMonths(cur, 1)
    guard++
  }
  return months
}

/**
 * Monthly cash flow for one or more projects, built entirely from real dated rows:
 *  - Actual: certificates' paidAmount (incl. FX equivalent), bucketed by paid_date's month.
 *  - Planned/Baseline: each contract's current value spread evenly across its own
 *    start_date -> planned_completion_date window — an honest straight-line proxy
 *    (labeled as such by the caller), since no independent baseline S-curve is
 *    captured anywhere in this module.
 *  - Forecast: each contract's remaining committed amount (current value minus
 *    what's already been paid on it) spread evenly from today to its planned
 *    completion date (or, if that's already passed, to the project's forecastFinishDate
 *    when available, else it's collapsed into the current month). This is also read as the
 *    "Funding Requirement" per month by the Cash Flow & Funding Forecast page.
 */
export function computeCashFlowSeries(
  contracts: FinContract[],
  amendments: FinContractAmendment[],
  certificates: FinPaymentCertificate[],
  today = todayIso(),
): CashFlowPoint[] {
  const monthly = new Map<string, { planned: number; actual: number; forecast: number }>()
  const bump = (month: string, key: 'planned' | 'actual' | 'forecast', amount: number) => {
    const entry = monthly.get(month) ?? { planned: 0, actual: 0, forecast: 0 }
    entry[key] += amount
    monthly.set(month, entry)
  }

  for (const cert of certificates) {
    const paid = certificatePaidTotal(cert)
    if (cert.paidDate && paid > 0) bump(monthKey(cert.paidDate), 'actual', paid)
  }

  for (const contract of contracts) {
    const value = currentContractValue(contract, amendments)
    if (contract.startDate && contract.plannedCompletionDate && contract.plannedCompletionDate >= contract.startDate) {
      const months = monthsBetween(monthKey(contract.startDate), monthKey(contract.plannedCompletionDate))
      if (months.length > 0) {
        const perMonth = value / months.length
        for (const m of months) bump(m, 'planned', perMonth)
      }
    }

    const paidOnContract = certificates.filter((c) => c.contractId === contract.id).reduce((sum, c) => sum + certificatePaidTotal(c), 0)
    const remaining = Math.max(0, value - paidOnContract)
    if (remaining > 0) {
      const horizon = contract.plannedCompletionDate && contract.plannedCompletionDate > today ? contract.plannedCompletionDate : today
      const months = monthsBetween(monthKey(today), monthKey(horizon))
      const spread = months.length > 0 ? months : [monthKey(today)]
      const perMonth = remaining / spread.length
      for (const m of spread) bump(m, 'forecast', perMonth)
    }
  }

  return [...monthly.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, v]) => ({ month, planned: Math.round(v.planned), actual: Math.round(v.actual), forecast: Math.round(v.forecast) }))
}

/** Cumulative running totals of a monthly series — the "S-curve" read of the same data. */
export function cumulativeCashFlow(points: CashFlowPoint[]): CashFlowPoint[] {
  let planned = 0
  let actual = 0
  let forecast = 0
  return points.map((p) => {
    planned += p.planned
    actual += p.actual
    forecast += p.forecast
    return { month: p.month, planned: Math.round(planned), actual: Math.round(actual), forecast: Math.round(forecast) }
  })
}

/**
 * The same monthly series, but guaranteed to cover at least `minMonths` months forward from the
 * current month (spec: "minimum 12-month forecast") — months with no contract/certificate
 * activity are padded with zeros rather than simply missing from the chart/report.
 */
export function ensureForwardMonths(points: CashFlowPoint[], today = todayIso(), minMonths = 12): CashFlowPoint[] {
  const byMonth = new Map(points.map((p) => [p.month, p]))
  const currentMonth = monthKey(today)
  const lastForwardMonth = addMonths(currentMonth, minMonths - 1)
  const forwardMonths = monthsBetween(currentMonth, lastForwardMonth)
  const past = points.filter((p) => p.month < currentMonth)
  const forward = forwardMonths.map((m) => byMonth.get(m) ?? { month: m, planned: 0, actual: 0, forecast: 0 })
  return [...past, ...forward]
}
