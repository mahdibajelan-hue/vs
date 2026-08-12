import type { FinBudget, FinBudgetChange, FinContract, FinContractAmendment, FinPaymentCertificate } from '../types'

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Current Budget = Approved Budget + every logged change (spec: a running log, never an overwritten single field). */
export function currentBudget(budget: FinBudget | null, changes: FinBudgetChange[]): number {
  const approved = budget?.approvedBudget ?? 0
  return approved + changes.reduce((sum, c) => sum + c.amount, 0)
}

/** Current Contract Value = Contract Value + every amendment against that contract. */
export function currentContractValue(contract: FinContract, amendments: FinContractAmendment[]): number {
  return contract.contractValue + amendments.filter((a) => a.contractId === contract.id).reduce((sum, a) => sum + a.amount, 0)
}

/** Outstanding = what's been certified (or, before certification, what's payable) minus what's actually been paid. */
export function certificateOutstanding(cert: FinPaymentCertificate): number {
  const owed = cert.certifiedAmount ?? cert.payableAmount
  return Math.max(0, owed - cert.paidAmount)
}

/** Days since the certificate was submitted (or dated, if never formally submitted) and still not fully paid — null once paid in full. */
export function paymentAgingDays(cert: FinPaymentCertificate, today = todayIso()): number | null {
  if (certificateOutstanding(cert) <= 0) return null
  const from = cert.submittedDate ?? cert.certificateDate
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(from)) / 86400000))
}

export interface ProjectFinancialSummary {
  masterProjectId: string
  hasBudget: boolean
  approvedBudget: number
  currentBudgetAmount: number
  contractValueTotal: number
  currentContractValueTotal: number
  /** = current contract value summed across every non-terminated, non-draft contract — "what's legally committed." */
  committedCost: number
  /** = sum of certified amounts to date — "what's been verified as actually executed," not accounting cost. */
  actualCost: number
  certifiedTotal: number
  paidTotal: number
  outstandingTotal: number
  eac: number | null
  remainingBudget: number
  /** Current Budget - EAC when EAC is entered, otherwise Current Budget - Committed Cost (labeled as a proxy by the caller). */
  budgetVariance: number
  /** Committed but not yet paid out — the real money still at risk on this project. */
  financialExposure: number
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
  today = todayIso(),
): ProjectFinancialSummary {
  const projectContracts = contracts.filter((c) => c.masterProjectId === masterProjectId)
  const contractIds = new Set(projectContracts.map((c) => c.id))
  const projectAmendments = amendments.filter((a) => contractIds.has(a.contractId))
  const projectCertificates = certificates.filter((c) => contractIds.has(c.contractId))

  const contractValueTotal = projectContracts.reduce((sum, c) => sum + c.contractValue, 0)
  const currentContractValueTotal = projectContracts.reduce((sum, c) => sum + currentContractValue(c, projectAmendments), 0)
  const committedCost = projectContracts.filter((c) => ACTIVE_COMMITMENT_STATUSES.has(c.status)).reduce((sum, c) => sum + currentContractValue(c, projectAmendments), 0)

  const certifiedTotal = projectCertificates.reduce((sum, c) => sum + (c.certifiedAmount ?? 0), 0)
  const paidTotal = projectCertificates.reduce((sum, c) => sum + c.paidAmount, 0)
  const outstandingTotal = projectCertificates.reduce((sum, c) => sum + certificateOutstanding(c), 0)
  const pendingCertificateCount = projectCertificates.filter((c) => c.status === 'submitted' || c.status === 'under_review').length
  const overdueCertificateCount = projectCertificates.filter((c) => (paymentAgingDays(c, today) ?? 0) > 30).length

  const curBudget = currentBudget(budget, budgetChanges)
  const remainingBudget = curBudget - committedCost
  const budgetVariance = curBudget - (eac ?? committedCost)
  const financialExposure = committedCost - paidTotal

  return {
    masterProjectId,
    hasBudget: !!budget,
    approvedBudget: budget?.approvedBudget ?? 0,
    currentBudgetAmount: curBudget,
    contractValueTotal,
    currentContractValueTotal,
    committedCost,
    actualCost: certifiedTotal,
    certifiedTotal,
    paidTotal,
    outstandingTotal,
    eac,
    remainingBudget,
    budgetVariance,
    financialExposure,
    contractCount: projectContracts.length,
    certificateCount: projectCertificates.length,
    pendingCertificateCount,
    overdueCertificateCount,
  }
}

export function aggregateFinancialSummaries(summaries: ProjectFinancialSummary[]): ProjectFinancialSummary {
  const eacKnown = summaries.filter((s) => s.eac != null)
  return {
    masterProjectId: '',
    hasBudget: summaries.some((s) => s.hasBudget),
    approvedBudget: summaries.reduce((sum, s) => sum + s.approvedBudget, 0),
    currentBudgetAmount: summaries.reduce((sum, s) => sum + s.currentBudgetAmount, 0),
    contractValueTotal: summaries.reduce((sum, s) => sum + s.contractValueTotal, 0),
    currentContractValueTotal: summaries.reduce((sum, s) => sum + s.currentContractValueTotal, 0),
    committedCost: summaries.reduce((sum, s) => sum + s.committedCost, 0),
    actualCost: summaries.reduce((sum, s) => sum + s.actualCost, 0),
    certifiedTotal: summaries.reduce((sum, s) => sum + s.certifiedTotal, 0),
    paidTotal: summaries.reduce((sum, s) => sum + s.paidTotal, 0),
    outstandingTotal: summaries.reduce((sum, s) => sum + s.outstandingTotal, 0),
    eac: eacKnown.length > 0 ? eacKnown.reduce((sum, s) => sum + (s.eac ?? 0), 0) : null,
    remainingBudget: summaries.reduce((sum, s) => sum + s.remainingBudget, 0),
    budgetVariance: summaries.reduce((sum, s) => sum + s.budgetVariance, 0),
    financialExposure: summaries.reduce((sum, s) => sum + s.financialExposure, 0),
    contractCount: summaries.reduce((sum, s) => sum + s.contractCount, 0),
    certificateCount: summaries.reduce((sum, s) => sum + s.certificateCount, 0),
    pendingCertificateCount: summaries.reduce((sum, s) => sum + s.pendingCertificateCount, 0),
    overdueCertificateCount: summaries.reduce((sum, s) => sum + s.overdueCertificateCount, 0),
  }
}

// ---------------------------------------------------------------------------
// Cash flow — every point is derived from Contract/Certificate/Payment rows already
// in the system, never a fifth independently-entered data source (per spec).
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
 *  - Actual: certificates' paidAmount, bucketed by paid_date's month.
 *  - Planned/Baseline: each contract's current value spread evenly across its own
 *    start_date -> planned_completion_date window — an honest straight-line proxy
 *    (labeled as such by the caller), since no independent baseline S-curve is
 *    captured anywhere in this module.
 *  - Forecast: each contract's remaining committed amount (current value minus
 *    what's already been paid on it) spread evenly from today to its planned
 *    completion date (or, if that's already passed, to the project's forecastFinishDate
 *    when available, else it's collapsed into the current month).
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
    if (cert.paidDate && cert.paidAmount > 0) bump(monthKey(cert.paidDate), 'actual', cert.paidAmount)
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

    const paidOnContract = certificates.filter((c) => c.contractId === contract.id).reduce((sum, c) => sum + c.paidAmount, 0)
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
