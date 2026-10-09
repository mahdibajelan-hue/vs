import type { ChangeRequest, ChangeStatus, ChangeStep, ChangeType } from '../types'
import { OPEN_STATUSES } from '../types'

/** Management aggregates. Money is summed only within the same currency/contract basis; percentages are always shown against the contract's ORIGINAL amount. */
export const APPROVED_STATUSES: ChangeStatus[] = ['approved', 'implementing', 'implemented', 'closed']
export const PENDING_STATUSES: ChangeStatus[] = ['submitted', 'evaluating', 'awaiting_approval', 'returned']
export const dayDiff = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
export const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
export const contractKey = (r: Pick<ChangeRequest, 'contractId' | 'masterProjectId'>) => r.contractId ?? 'p:' + r.masterProjectId

export interface ContractAgg { key: string; masterProjectId: string; contractId: string | null; base: number | null; approvedAmount: number; pendingAmount: number; approvedPct: number | null; withPendingPct: number | null; approvedDays: number; pendingDays: number; count: number; crossed: number | null; next: number | null }
/** Cumulative change per contract: approved (absolute sums) and pending, with the highest configured threshold already crossed and the next one. */
export function cumulativeByContract(reqs: ChangeRequest[], baseOf: (r: ChangeRequest) => number | null, thresholds: number[]): ContractAgg[] {
  const m = new Map<string, ContractAgg>()
  const ts = [...thresholds].sort((a, b) => a - b)
  for (const r of reqs) {
    if (r.status === 'draft' || r.status === 'cancelled' || r.status === 'rejected') continue
    const k = contractKey(r)
    const a = m.get(k) ?? { key: k, masterProjectId: r.masterProjectId, contractId: r.contractId, base: baseOf(r), approvedAmount: 0, pendingAmount: 0, approvedPct: null, withPendingPct: null, approvedDays: 0, pendingDays: 0, count: 0, crossed: null, next: null }
    a.count++
    if (APPROVED_STATUSES.includes(r.status)) { a.approvedAmount += Math.abs(r.approvedCost ?? r.proposedCost); a.approvedDays += Math.abs(r.approvedDays ?? r.proposedDays) }
    else { a.pendingAmount += Math.abs(r.proposedCost); a.pendingDays += Math.abs(r.proposedDays) }
    m.set(k, a)
  }
  for (const a of m.values()) {
    if (a.base && a.base > 0) { a.approvedPct = Math.round(a.approvedAmount / a.base * 10000) / 100; a.withPendingPct = Math.round((a.approvedAmount + a.pendingAmount) / a.base * 10000) / 100 }
    const p = a.withPendingPct ?? 0
    a.crossed = [...ts].reverse().find((t) => p > t) ?? null
    a.next = ts.find((t) => p <= t) ?? null
  }
  return [...m.values()].sort((x, y) => (y.withPendingPct ?? 0) - (x.withPendingPct ?? 0))
}

export const countBy = <T,>(xs: T[], key: (x: T) => string) => { const m = new Map<string, number>(); for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1); return m }

export interface Dwell { role: string; n: number; avgDays: number; maxDays: number }
/** Decision time per authority: decided steps (entered → decided) plus currently waiting ones (entered → now), separately. */
export function dwellByRole(steps: ChangeStep[], now: string): { decided: Dwell[]; waiting: Dwell[] } {
  const agg = (items: { role: string; days: number }[]): Dwell[] => {
    const m = new Map<string, number[]>()
    for (const i of items) m.set(i.role, [...(m.get(i.role) ?? []), i.days])
    return [...m].map(([role, ds]) => ({ role, n: ds.length, avgDays: Math.round(ds.reduce((s, x) => s + x, 0) / ds.length * 10) / 10, maxDays: Math.max(...ds) })).sort((a, b) => b.avgDays - a.avgDays)
  }
  const decided = steps.filter((s) => s.decidedAt && s.enteredAt).map((s) => ({ role: s.roleName, days: Math.max(0, (new Date(s.decidedAt!).getTime() - new Date(s.enteredAt!).getTime()) / 86400000) }))
  const waiting = steps.filter((s) => s.status === 'active' && s.enteredAt).map((s) => ({ role: s.roleName, days: Math.max(0, (new Date(now).getTime() - new Date(s.enteredAt!).getTime()) / 86400000) }))
  return { decided: agg(decided), waiting: agg(waiting) }
}

export const overdueSteps = (steps: ChangeStep[], now: string) => steps.filter((s) => s.status === 'active' && s.dueAt && s.dueAt < now)

/** Requests stuck in an open state longer than `days` without a stage change. */
export function stalled(reqs: ChangeRequest[], now: string, days: number) {
  return reqs.filter((r) => OPEN_STATUSES.includes(r.status) && (new Date(now).getTime() - new Date(r.stageEnteredAt).getTime()) / 86400000 > days)
}

export interface Summary { total: number; open: number; awaiting: number; approved: number; rejected: number; cancelled: number; implementing: number; implementedWithDeviation: number; approvedAmount: number; pendingAmount: number; approvedDays: number; pendingDays: number; byType: Map<string, number> }
export function summarize(reqs: ChangeRequest[]): Summary {
  const live = reqs.filter((r) => r.status !== 'draft')
  const sum = (xs: ChangeRequest[], f: (r: ChangeRequest) => number) => xs.reduce((s, r) => s + f(r), 0)
  const appr = live.filter((r) => APPROVED_STATUSES.includes(r.status)), pend = live.filter((r) => PENDING_STATUSES.includes(r.status))
  return {
    total: live.length, open: pend.length, awaiting: live.filter((r) => r.status === 'awaiting_approval').length, approved: appr.length, rejected: live.filter((r) => r.status === 'rejected').length, cancelled: live.filter((r) => r.status === 'cancelled').length,
    implementing: live.filter((r) => r.status === 'implementing').length, implementedWithDeviation: live.filter((r) => r.implementedAsApproved === false).length,
    approvedAmount: sum(appr, (r) => Math.abs(r.approvedCost ?? r.proposedCost)), pendingAmount: sum(pend, (r) => Math.abs(r.proposedCost)), approvedDays: sum(appr, (r) => Math.abs(r.approvedDays ?? r.proposedDays)), pendingDays: sum(pend, (r) => Math.abs(r.proposedDays)),
    byType: countBy(live, (r) => r.changeType ?? 'other'),
  }
}

/** Contract end date moved by the approved extensions (extensions are summed in days; the date is informational — it never edits master data). */
export const endDateImpact = (contractEnd: string | null, approvedDays: number) => (contractEnd ? { from: contractEnd, to: addDays(contractEnd, approvedDays), days: approvedDays } : null)

export function reasonFrequency(reqs: ChangeRequest[]) { return [...countBy(reqs.filter((r) => r.status !== 'draft').flatMap((r) => r.reasonCategories.map((c) => ({ c }))), (x) => x.c)].sort((a, b) => b[1] - a[1]) }
export const typeOf = (r: ChangeRequest): ChangeType => r.changeType ?? 'other'
