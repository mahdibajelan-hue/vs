import type { FinClaim, FinContract, FinContractAmendment, FinGuarantee, FinPayment, FinPaymentCertificate } from '../types'
import type { FinThresholds } from './financeControl'
import { contractFile } from './financeControl'
import { isoMonthIdx } from './financeCurves'

const day = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)

// ───────────────────────────────────────────── certificate stage delays
export type StageKey = 'prepare' | 'review' | 'approve' | 'pay'
export const STAGE_LABEL: Record<StageKey, string> = { prepare: 'تهیه و ارسال', review: 'بررسی و تأیید کارکرد', approve: 'تصویب نهایی', pay: 'پرداخت' }
export const STAGE_ORDER: StageKey[] = ['prepare', 'review', 'approve', 'pay']
export const STAGE_COLOR: Record<StageKey, string> = { prepare: '#4f8ef7', review: '#f2c80f', approve: '#a66999', pay: '#fd625e' }

export interface StageTime {
  stage: StageKey
  from: string | null
  to: string | null
  /** days spent in the stage (still running when `open`) */
  days: number | null
  /** allowed days for the stage */
  sla: number
  /** days beyond the allowance; 0 when within it or the stage has not started */
  delay: number
  open: boolean
}
export interface CertDelay {
  cert: FinPaymentCertificate
  stages: StageTime[]
  /** total days beyond allowance across the stages */
  totalDelay: number
  /** days from certificate date to payment (or to today when unpaid) */
  cycleDays: number
  settled: boolean
}

/** Allowance per stage comes from the settings in force: submitted → review, under_review → approval, certified → payment. Preparation uses the submitted allowance. */
export function slaOf(t: FinThresholds): Record<StageKey, number> {
  return { prepare: t.stageSlaDays.submitted, review: t.stageSlaDays.under_review, approve: t.stageSlaDays.submitted, pay: t.stageSlaDays.certified }
}

export function certStages(cert: FinPaymentCertificate, today: string, t: FinThresholds): CertDelay {
  const sla = slaOf(t)
  const paid = cert.paidAmount + cert.paidFx.fcRialEquivalent
  const owed = cert.certifiedAmount ?? cert.payableAmount
  const settled = cert.status === 'paid' || (paid > 0 && paid >= owed - 1)
  // payment is measured from final approval; a certificate paid without a recorded approval is measured from certification
  const approvedAt = cert.approvedDate ?? (cert.paidDate ? cert.certifiedDate : null)
  const path: [StageKey, string | null, string | null][] = [
    ['prepare', cert.certificateDate, cert.submittedDate],
    ['review', cert.submittedDate ?? cert.certificateDate, cert.certifiedDate],
    ['approve', cert.certifiedDate, cert.approvedDate ?? (cert.paidDate && cert.certifiedDate ? cert.certifiedDate : null)],
    ['pay', approvedAt, settled ? cert.paidDate : null],
  ]
  const stages = path.map(([stage, from, to]): StageTime => {
    // a stage is running when it has started (previous milestone reached) and has not ended — rejected/draft certificates never run
    const started = from != null && cert.status !== 'rejected' && !(cert.status === 'draft' && stage !== 'prepare')
    const open = started && to == null && !(stage === 'prepare' && cert.status !== 'draft')
    const end = to ?? (open ? today : null)
    const days = from && end ? Math.max(0, day(end, from)) : null
    const delay = days != null && started ? Math.max(0, days - sla[stage]) : 0
    return { stage, from, to, days, sla: sla[stage], delay, open: open && to == null }
  })
  const last = settled && cert.paidDate ? cert.paidDate : today
  return { cert, stages, totalDelay: stages.reduce((s, x) => s + x.delay, 0), cycleDays: Math.max(0, day(last, cert.certificateDate)), settled }
}

/** One row per certificate, oldest first, with the running total of delay days (the «cumulative» view). */
export function delayReport(certs: FinPaymentCertificate[], today: string, t: FinThresholds): (CertDelay & { cumDelay: number })[] {
  let cum = 0
  return [...certs].sort((a, b) => (a.certificateDate < b.certificateDate ? -1 : 1)).map((c) => { const r = certStages(c, today, t); cum += r.totalDelay; return { ...r, cumDelay: cum } })
}

/** Average / worst delay per stage, and how many certificates exceeded the allowance in it. */
export function stageSummary(rows: CertDelay[]): { stage: StageKey; avgDays: number | null; avgDelay: number | null; maxDelay: number; late: number; n: number }[] {
  return STAGE_ORDER.map((stage) => {
    const xs = rows.map((r) => r.stages.find((s) => s.stage === stage)!).filter((s) => s.days != null)
    const n = xs.length
    return { stage, n, avgDays: n ? xs.reduce((a, s) => a + (s.days ?? 0), 0) / n : null, avgDelay: n ? xs.reduce((a, s) => a + s.delay, 0) / n : null, maxDelay: xs.reduce((m, s) => Math.max(m, s.delay), 0), late: xs.filter((s) => s.delay > 0).length }
  })
}

/** Delay days per stage for every contract (a heat matrix). */
export function delayByContract(rows: CertDelay[]): { contractId: string; n: number; byStage: Record<StageKey, number>; total: number }[] {
  const m = new Map<string, { contractId: string; n: number; byStage: Record<StageKey, number>; total: number }>()
  for (const r of rows) {
    const e = m.get(r.cert.contractId) ?? { contractId: r.cert.contractId, n: 0, byStage: { prepare: 0, review: 0, approve: 0, pay: 0 }, total: 0 }
    e.n++
    for (const s of r.stages) e.byStage[s.stage] += s.delay
    e.total += r.totalDelay
    m.set(r.cert.contractId, e)
  }
  return [...m.values()]
}

// ───────────────────────────────────────────── aging of what is owed
export const AGING_BUCKETS = [{ key: 'b0', label: 'تا ۳۰ روز', from: 0, to: 30 }, { key: 'b1', label: '۳۱ تا ۶۰', from: 31, to: 60 }, { key: 'b2', label: '۶۱ تا ۹۰', from: 61, to: 90 }, { key: 'b3', label: 'بیش از ۹۰', from: 91, to: Infinity }]
/** Unpaid certified (or payable) amount bucketed by days since submission. */
export function agingReport(certs: FinPaymentCertificate[], today: string): { key: string; label: string; amount: number; count: number }[] {
  const out = AGING_BUCKETS.map((b) => ({ key: b.key, label: b.label, amount: 0, count: 0 }))
  for (const c of certs) {
    if (c.status === 'rejected' || c.status === 'draft') continue
    const owed = (c.certifiedAmount ?? c.payableAmount) - (c.paidAmount + c.paidFx.fcRialEquivalent)
    if (owed <= 0) continue
    const age = Math.max(0, day(today, c.submittedDate ?? c.certificateDate))
    const i = AGING_BUCKETS.findIndex((b) => age >= b.from && age <= b.to)
    out[i].amount += owed
    out[i].count++
  }
  return out
}

// ───────────────────────────────────────────── monthly flows
export interface MonthRow { idx: number; certified: number; paid: number; cumCertified: number; cumPaid: number; gap: number }
/** Month by month: what was certified versus what was actually paid, with running totals. The gap is the debt that built up. */
export function monthlyFlow(certs: FinPaymentCertificate[], payments: FinPayment[]): MonthRow[] {
  const cert = new Map<number, number>(), paid = new Map<number, number>()
  for (const c of certs) { const d = c.certifiedDate; const i = d ? isoMonthIdx(d) : null; if (i != null) cert.set(i, (cert.get(i) ?? 0) + (c.certifiedAmount ?? 0)) }
  const cById = new Set(certs.map((c) => c.id))
  const withPay = new Set(payments.filter((p) => cById.has(p.certificateId)).map((p) => p.certificateId))
  for (const p of payments) { if (!cById.has(p.certificateId)) continue; const i = isoMonthIdx(p.paymentDate); if (i != null) paid.set(i, (paid.get(i) ?? 0) + p.amount + p.fx.fcRialEquivalent) }
  // certificates with no payment ledger rows still carry their own paid fields
  for (const c of certs) { if (withPay.has(c.id) || !c.paidDate) continue; const i = isoMonthIdx(c.paidDate); if (i != null) paid.set(i, (paid.get(i) ?? 0) + c.paidAmount + c.paidFx.fcRialEquivalent) }
  const keys = [...new Set([...cert.keys(), ...paid.keys()])].sort((a, b) => a - b)
  if (!keys.length) return []
  const rows: MonthRow[] = []
  let cc = 0, cp = 0
  for (let i = keys[0]; i <= keys[keys.length - 1]; i++) {
    const c = cert.get(i) ?? 0, p = paid.get(i) ?? 0
    cc += c; cp += p
    rows.push({ idx: i, certified: c, paid: p, cumCertified: cc, cumPaid: cp, gap: cc - cp })
  }
  return rows
}

// ───────────────────────────────────────────── contracts
export interface GrowthRow { contract: FinContract; original: number; current: number; delta: number; pct: number; amendments: number; daysExtension: number }
export function growthReport(contracts: FinContract[], amendments: FinContractAmendment[]): GrowthRow[] {
  return contracts.map((c) => { const f = contractFile(c, amendments); return { contract: c, original: f.original, current: f.current, delta: f.amendmentsTotal, pct: f.increasePct, amendments: f.amendmentCount, daysExtension: f.daysExtension } }).sort((a, b) => b.delta - a.delta)
}

export interface AdvanceRow { contract: FinContract; advance: number; recovered: number; remaining: number; retentionHeld: number; pctRecovered: number | null }
/** Advance paid (percentage of the current value) against what has been deducted back, plus retention withheld. */
export function advanceReport(contracts: FinContract[], amendments: FinContractAmendment[], certs: FinPaymentCertificate[]): AdvanceRow[] {
  return contracts.map((contract) => {
    const mine = certs.filter((c) => c.contractId === contract.id)
    const advance = (contractFile(contract, amendments).current * contract.advancePaymentPercent) / 100
    const recovered = mine.reduce((s, c) => s + c.advanceRecoveryAmount, 0)
    return { contract, advance, recovered, remaining: Math.max(0, advance - recovered), retentionHeld: mine.reduce((s, c) => s + c.retentionAmount, 0), pctRecovered: advance > 0 ? Math.round((recovered / advance) * 1000) / 10 : null }
  })
}

// ───────────────────────────────────────────── guarantees and claims
/** Active guarantees falling due per month (a calendar of renewals); overdue ones go into the first bucket as `overdue`. */
export function expiryCalendar(gs: FinGuarantee[], today: string): { overdue: { count: number; amount: number }; months: { idx: number; count: number; amount: number }[] } {
  const overdue = { count: 0, amount: 0 }
  const m = new Map<number, { count: number; amount: number }>()
  for (const g of gs) {
    if (g.status !== 'active' || !g.expiryDate) continue
    if (g.expiryDate < today) { overdue.count++; overdue.amount += g.amount; continue }
    const i = isoMonthIdx(g.expiryDate); if (i == null) continue
    const e = m.get(i) ?? { count: 0, amount: 0 }; e.count++; e.amount += g.amount; m.set(i, e)
  }
  return { overdue, months: [...m.entries()].sort((a, b) => a[0] - b[0]).map(([idx, v]) => ({ idx, ...v })) }
}

export function claimsReport(claims: FinClaim[], today: string): { byType: { type: string; count: number; claimed: number; approved: number }[]; open: { claim: FinClaim; ageDays: number }[]; acceptancePct: number | null } {
  const t = new Map<string, { type: string; count: number; claimed: number; approved: number }>()
  for (const c of claims) { const e = t.get(c.claimType) ?? { type: c.claimType, count: 0, claimed: 0, approved: 0 }; e.count++; e.claimed += c.amountClaimed; e.approved += c.amountApproved ?? 0; t.set(c.claimType, e) }
  const closed = claims.filter((c) => ['approved', 'partially_approved', 'rejected'].includes(c.status))
  const claimed = closed.reduce((s, c) => s + c.amountClaimed, 0)
  return {
    byType: [...t.values()].sort((a, b) => b.claimed - a.claimed),
    open: claims.filter((c) => ['submitted', 'under_review', 'arbitration'].includes(c.status)).map((claim) => ({ claim, ageDays: Math.max(0, day(today, claim.submittedDate)) })).sort((a, b) => b.ageDays - a.ageDays),
    acceptancePct: claimed > 0 ? Math.round((closed.reduce((s, c) => s + (c.amountApproved ?? 0), 0) / claimed) * 1000) / 10 : null,
  }
}

// ───────────────────────────────────────────── budget consumption
export interface ConsumptionRow { key: string; label: string; budget: number; committed: number; certified: number; paid: number; remaining: number; usedPct: number | null }
const addTo = (m: Map<string, ConsumptionRow>, key: string, label: string, p: Partial<ConsumptionRow>) => {
  const e = m.get(key) ?? { key, label, budget: 0, committed: 0, certified: 0, paid: 0, remaining: 0, usedPct: null }
  e.budget += p.budget ?? 0; e.committed += p.committed ?? 0; e.certified += p.certified ?? 0; e.paid += p.paid ?? 0
  m.set(key, e)
}
/** Budget consumption grouped by budget line or by cost category: budget, commitment (current contract values), certified and paid. Contracts without a line fall under «بدون ردیف». */
export function consumptionReport(a: { lines: { id: string; code: string; title: string; costCategory: string; approvedAmount: number }[]; contracts: FinContract[]; amendments: FinContractAmendment[]; certs: FinPaymentCertificate[]; categories: Map<string, string>; by: 'line' | 'category' }): ConsumptionRow[] {
  const m = new Map<string, ConsumptionRow>()
  const keyOf = (line?: { id: string; code: string; title: string; costCategory: string }) => a.by === 'line' ? (line ? { k: line.id, l: `${line.code} · ${line.title}` } : { k: '—', l: 'بدون ردیف' }) : (line?.costCategory ? { k: line.costCategory, l: a.categories.get(line.costCategory) ?? line.costCategory } : { k: '—', l: 'بدون دسته' })
  for (const l of a.lines) { const { k, l: lab } = keyOf(l); addTo(m, k, lab, { budget: l.approvedAmount }) }
  for (const c of a.contracts) {
    if (c.status === 'terminated' || c.status === 'replaced' || c.status === 'draft') continue
    const line = a.lines.find((l) => l.id === c.budgetLineId)
    const { k, l: lab } = keyOf(line)
    const mine = a.certs.filter((x) => x.contractId === c.id)
    addTo(m, k, lab, { committed: contractFile(c, a.amendments).current, certified: mine.reduce((s, x) => s + (x.certifiedAmount ?? 0), 0), paid: mine.reduce((s, x) => s + x.paidAmount + x.paidFx.fcRialEquivalent, 0) })
  }
  return [...m.values()].map((r) => ({ ...r, remaining: r.budget - r.committed, usedPct: r.budget > 0 ? Math.round((r.committed / r.budget) * 1000) / 10 : null })).sort((a, b) => b.committed - a.committed)
}
