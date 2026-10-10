import type { FinClaim, FinContract, FinContractAmendment, FinGuarantee, FinPaymentCertificate } from '../types'
import { claimsExposureTotal, currentContractValue } from './financeCalc'

/** Whole days from b to a (a - b), both ISO dates. */
export const daysBetween = (a: string, b: string): number => Math.round((new Date(a.slice(0, 10)).getTime() - new Date(b.slice(0, 10)).getTime()) / 86400000)
export const addDaysIso = (iso: string, n: number): string => new Date(new Date(iso.slice(0, 10)).getTime() + n * 86400000).toISOString().slice(0, 10)

// ------------------------------------------------------------------ versioned settings
export interface FinThresholds {
  guaranteeExpiryDays: number
  overdueCertificateDays: number
  budgetWarnPct: number
  budgetCriticalPct: number
  /** Days a certificate may sit in each workflow stage before it is flagged. */
  stageSlaDays: { submitted: number; under_review: number; certified: number }
  claimStaleDays: number
  /** Cumulative approved increase of one contract, in % of its original value, that needs attention. */
  amendmentJumpPct: number
  landBudgetWarnPct: number
}
export const DEFAULT_THRESHOLDS: FinThresholds = { guaranteeExpiryDays: 60, overdueCertificateDays: 30, budgetWarnPct: 85, budgetCriticalPct: 100, stageSlaDays: { submitted: 7, under_review: 14, certified: 21 }, claimStaleDays: 14, amendmentJumpPct: 10, landBudgetWarnPct: 85 }

export interface SettingsVersion { version: number; validFrom: string; note: string; values: Partial<FinThresholds> }
/** The settings in force on `date`: the newest version whose valid-from has arrived. Older versions stay untouched (history), missing keys fall back to the defaults. */
export function effectiveThresholds(versions: SettingsVersion[], date: string): { thresholds: FinThresholds; version: number | null } {
  const inForce = versions.filter((v) => v.validFrom <= date).sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.version - a.version)[0]
  if (!inForce) return { thresholds: DEFAULT_THRESHOLDS, version: null }
  const v = inForce.values
  return { thresholds: { ...DEFAULT_THRESHOLDS, ...v, stageSlaDays: { ...DEFAULT_THRESHOLDS.stageSlaDays, ...(v.stageSlaDays ?? {}) } }, version: inForce.version }
}

// ------------------------------------------------------------------ contract file
export interface ContractFile {
  original: number
  /** Voided amendments are history only. */
  amendmentsTotal: number
  current: number
  increasePct: number
  daysExtension: number
  plannedEnd: string | null
  currentEnd: string | null
  amendmentCount: number
}
export function contractFile(c: FinContract, amendments: FinContractAmendment[]): ContractFile {
  const live = amendments.filter((a) => a.contractId === c.id && !a.voidedAt)
  const original = c.contractValue + c.fx.fcRialEquivalent
  const current = currentContractValue(c, amendments)
  const days = live.reduce((n, a) => n + (a.daysDelta || 0), 0)
  return { original, amendmentsTotal: current - original, current, increasePct: original > 0 ? Math.round(((current - original) / original) * 1000) / 10 : 0, daysExtension: days, plannedEnd: c.plannedCompletionDate, currentEnd: c.plannedCompletionDate ? addDaysIso(c.plannedCompletionDate, days) : null, amendmentCount: live.length }
}

// ------------------------------------------------------------------ land bridge (the numbers come from fin_land_summary)
export interface LandSummary { approved: number; approved_source: 'finance' | 'landacq' | 'none'; paid: number; voided: number; committed_unpaid: number; exposure: number; remaining: number }
export interface LandBridge extends LandSummary { usedPct: number | null; level: 'ok' | 'warn' | 'critical' | 'unset' }
export function landBridge(s: LandSummary, t: FinThresholds): LandBridge {
  if (!s.approved) return { ...s, usedPct: null, level: 'unset' }
  const usedPct = Math.round((s.exposure / s.approved) * 1000) / 10
  return { ...s, usedPct, level: usedPct >= t.budgetCriticalPct ? 'critical' : usedPct >= t.landBudgetWarnPct ? 'warn' : 'ok' }
}

// ------------------------------------------------------------------ forecast with a clearly separated scenario
export interface PendingChange { contractId: string | null; status: string; proposedAmount: number }
export const PENDING_CHANGE_STATUSES = ['submitted', 'evaluating', 'awaiting_approval']
export interface Forecast {
  /** Active/completed contracts at their approved value (amendments from approved changes included). */
  contractCommitted: number
  /** Land: paid + still-to-pay estimate — taken from the land module, never re-entered. */
  landExposure: number
  paid: number
  /** Money that is in the books: contracts + land. */
  baseEac: number
  /** Proposed amounts of changes not yet approved, shown apart and never merged into approved figures. */
  scenarioDelta: number
  scenarioEac: number
  budget: number
  baseOverrun: number
  scenarioOverrun: number
  /** none/watch/possible/likely — "likely" = already over budget with approved figures, "possible" = only the scenario crosses it. */
  overrun: 'none' | 'watch' | 'possible' | 'likely'
  claimsExposure: number
}
export function forecast(args: { contracts: FinContract[]; amendments: FinContractAmendment[]; certificates: FinPaymentCertificate[]; claims: FinClaim[]; land: LandSummary | null; pending: PendingChange[]; budget: number; thresholds: FinThresholds; paidContracts: number }): Forecast {
  const ids = new Set(args.contracts.map((c) => c.id))
  const contractCommitted = args.contracts.filter((c) => c.status === 'active' || c.status === 'completed' || c.status === 'suspended').reduce((n, c) => n + currentContractValue(c, args.amendments), 0)
  const landExposure = args.land?.exposure ?? 0
  const baseEac = contractCommitted + landExposure
  const scenarioDelta = args.pending.filter((p) => PENDING_CHANGE_STATUSES.includes(p.status) && (p.contractId == null || ids.has(p.contractId))).reduce((n, p) => n + (p.proposedAmount || 0), 0)
  const scenarioEac = baseEac + scenarioDelta
  const budget = args.budget
  const baseOverrun = budget > 0 ? baseEac - budget : 0
  const scenarioOverrun = budget > 0 ? scenarioEac - budget : 0
  const pct = budget > 0 ? (baseEac / budget) * 100 : 0
  const overrun: Forecast['overrun'] = budget <= 0 ? 'none' : baseOverrun > 0 ? 'likely' : scenarioOverrun > 0 ? 'possible' : pct >= args.thresholds.budgetWarnPct ? 'watch' : 'none'
  return { contractCommitted, landExposure, paid: args.paidContracts + (args.land?.paid ?? 0), baseEac, scenarioDelta, scenarioEac, budget, baseOverrun, scenarioOverrun, overrun, claimsExposure: claimsExposureTotal(args.claims) }
}

// ------------------------------------------------------------------ exceptions that need a management decision
export type ExceptionKind = 'certificate_stuck' | 'payment_overdue' | 'guarantee_expiring' | 'guarantee_expired' | 'amendment_jump' | 'budget_over' | 'budget_warn' | 'claim_stale' | 'land_budget'
export interface FinException {
  /** Stable per source + kind, so the same finding is never raised twice. */
  key: string
  kind: ExceptionKind
  severity: 'critical' | 'high' | 'medium'
  sourceType: 'contract' | 'certificate' | 'guarantee' | 'claim' | 'budget' | 'land'
  sourceId: string | null
  masterProjectId: string
  title: string
  detail: string
}
const SEV: Record<FinException['severity'], number> = { critical: 0, high: 1, medium: 2 }

export function findExceptions(args: { contracts: FinContract[]; amendments: FinContractAmendment[]; certificates: FinPaymentCertificate[]; guarantees: FinGuarantee[]; claims: FinClaim[]; thresholds: FinThresholds; today: string; budgetByProject?: Map<string, { budget: number; commitment: number }>; land?: Map<string, LandBridge> }): FinException[] {
  const t = args.thresholds
  const byId = new Map(args.contracts.map((c) => [c.id, c]))
  const out: FinException[] = []
  const label = (id: string) => byId.get(id)?.contractNumber || byId.get(id)?.title || 'قرارداد'
  for (const cert of args.certificates) {
    const c = byId.get(cert.contractId)
    if (!c) continue
    const stage = cert.status === 'submitted' ? 'submitted' : cert.status === 'under_review' ? 'under_review' : cert.status === 'certified' ? 'certified' : null
    const since = stage === 'certified' ? cert.approvedDate ?? cert.certifiedDate : cert.submittedDate
    if (stage && since) {
      const d = daysBetween(args.today, since)
      const limit = t.stageSlaDays[stage]
      if (d > limit) out.push({ key: `cert-stuck:${cert.id}`, kind: stage === 'certified' ? 'payment_overdue' : 'certificate_stuck', severity: d > limit * 2 ? 'high' : 'medium', sourceType: 'certificate', sourceId: cert.id, masterProjectId: c.masterProjectId, title: `صورت‌وضعیت ${cert.certificateNumber} (${label(c.id)}) ${stage === 'certified' ? 'تأیید شده ولی پرداخت نشده' : 'در مرحلهٔ بررسی مانده'}`, detail: `${d} روز در این مرحله؛ مهلت ${limit} روز` })
    }
  }
  for (const g of args.guarantees) {
    const c = byId.get(g.contractId)
    if (!c || g.status !== 'active' || !g.expiryDate) continue
    const left = daysBetween(g.expiryDate, args.today)
    if (left < 0) out.push({ key: `guar-expired:${g.id}`, kind: 'guarantee_expired', severity: 'critical', sourceType: 'guarantee', sourceId: g.id, masterProjectId: c.masterProjectId, title: `ضمانت‌نامه ${g.number} (${label(c.id)}) منقضی شده است`, detail: `${-left} روز از انقضا گذشته؛ تمدید یا تعیین تکلیف لازم است` })
    else if (left <= t.guaranteeExpiryDays) out.push({ key: `guar-exp:${g.id}`, kind: 'guarantee_expiring', severity: left <= 15 ? 'high' : 'medium', sourceType: 'guarantee', sourceId: g.id, masterProjectId: c.masterProjectId, title: `ضمانت‌نامه ${g.number} (${label(c.id)}) تا ${left} روز دیگر منقضی می‌شود`, detail: 'تمدید، اصلاح یا آزادسازی را تعیین تکلیف کنید' })
  }
  for (const c of args.contracts) {
    if (c.status !== 'active') continue
    const f = contractFile(c, args.amendments)
    if (f.increasePct >= t.amendmentJumpPct) out.push({ key: `amend:${c.id}`, kind: 'amendment_jump', severity: f.increasePct >= t.amendmentJumpPct * 2 ? 'high' : 'medium', sourceType: 'contract', sourceId: c.id, masterProjectId: c.masterProjectId, title: `افزایش تجمعی مبلغ ${label(c.id)}: ${f.increasePct}٪`, detail: `${f.amendmentCount} الحاقیه؛ از حد ${t.amendmentJumpPct}٪ گذشته است` })
  }
  for (const cl of args.claims) {
    const c = byId.get(cl.contractId)
    if (!c || (cl.status !== 'submitted' && cl.status !== 'under_review')) continue
    const d = daysBetween(args.today, cl.submittedDate)
    if (d > t.claimStaleDays) out.push({ key: `claim:${cl.id}`, kind: 'claim_stale', severity: d > t.claimStaleDays * 3 ? 'high' : 'medium', sourceType: 'claim', sourceId: cl.id, masterProjectId: c.masterProjectId, title: `ادعای ${cl.claimNumber} (${label(c.id)}) ${d} روز بی‌تصمیم مانده`, detail: 'تعیین تکلیف ادعا' })
  }
  for (const [pid, b] of args.budgetByProject ?? []) {
    if (b.budget <= 0) continue
    const pct = (b.commitment / b.budget) * 100
    if (pct >= t.budgetCriticalPct) out.push({ key: `budget-over:${pid}`, kind: 'budget_over', severity: 'critical', sourceType: 'budget', sourceId: null, masterProjectId: pid, title: `تعهدات پروژه از بودجه گذشته است (${Math.round(pct)}٪)`, detail: 'کسری بودجه؛ نیاز به تصمیم مدیریتی' })
    else if (pct >= t.budgetWarnPct) out.push({ key: `budget-warn:${pid}`, kind: 'budget_warn', severity: 'medium', sourceType: 'budget', sourceId: null, masterProjectId: pid, title: `تعهدات پروژه ${Math.round(pct)}٪ بودجه را گرفته است`, detail: 'نزدیک به سقف بودجه' })
  }
  for (const [pid, l] of args.land ?? []) {
    if (l.level === 'critical') out.push({ key: `land:${pid}`, kind: 'land_budget', severity: 'critical', sourceType: 'land', sourceId: null, masterProjectId: pid, title: `بودجهٔ تملک اراضی تمام شده است (${l.usedPct}٪)`, detail: 'پرداخت‌شده + تعهد باقی‌مانده از بودجهٔ مصوب گذشته' })
    else if (l.level === 'warn') out.push({ key: `land:${pid}`, kind: 'land_budget', severity: 'medium', sourceType: 'land', sourceId: null, masterProjectId: pid, title: `بودجهٔ تملک اراضی ${l.usedPct}٪ مصرف/متعهد شده`, detail: 'نزدیک به سقف' })
  }
  return out.sort((a, b) => SEV[a.severity] - SEV[b.severity])
}

/** Totals by currency — amounts in different currencies are never added together. */
export function sumByCurrency<T>(rows: T[], amount: (r: T) => number, currency: (r: T) => string): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) m.set(currency(r) || 'ریال', (m.get(currency(r) || 'ریال') ?? 0) + amount(r))
  return m
}
