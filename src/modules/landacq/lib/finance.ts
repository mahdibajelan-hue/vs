import type { Parcel, Payment, PaymentCategory } from '../types'
import { addDays, diffDays } from './dates'

export const PAYMENT_LABEL: Record<PaymentCategory, string> = {
  owner: 'پرداخت به مالکین',
  expert: 'هزینهٔ کارشناسی رسمی',
  transfer: 'انتقال مالکیت و ثبت سند',
  legal: 'حقوقی و دادگاهی',
  other: 'سایر هزینه‌ها',
}
/** Fee categories, in the order the ledger lists them (the owners' payments are their own section). */
export const FEE_CATEGORIES: PaymentCategory[] = ['expert', 'transfer', 'legal', 'other']

export interface FinanceSummary {
  byCategory: Record<PaymentCategory, number>
  owners: number
  fees: number
  expert: number
  total: number
  /** Sum of the recorded land-cost estimates of all parcels and stations. */
  estimated: number
  budget: number | null
  /** paid / budget, 0..n (null without a budget). */
  consumption: number | null
  remaining: number | null
  /** Estimated total cost exceeds the budget. */
  overrun: boolean
}

export function summarize(parcels: Pick<Parcel, 'estCost'>[], payments: Pick<Payment, 'category' | 'amount'>[], budget: number | null | undefined): FinanceSummary {
  const byCategory: Record<PaymentCategory, number> = { owner: 0, expert: 0, transfer: 0, legal: 0, other: 0 }
  for (const p of payments) byCategory[p.category] += p.amount
  const owners = byCategory.owner
  const fees = byCategory.expert + byCategory.transfer + byCategory.legal + byCategory.other
  const total = owners + fees
  const estimated = parcels.reduce((n, p) => n + (p.estCost ?? 0), 0)
  const b = budget && budget > 0 ? budget : null
  return { byCategory, owners, fees, expert: byCategory.expert, total, estimated, budget: b, consumption: b ? total / b : null, remaining: b ? b - total : null, overrun: !!b && estimated + fees > b }
}

export interface SpendPoint {
  /** First day of the month (ISO). */
  month: string
  paid: number
  cumulative: number
}

/** Cumulative spend per month, from the first payment up to the current month. */
export function spendSeries(payments: Pick<Payment, 'amount' | 'paidDate'>[], today: string): SpendPoint[] {
  if (payments.length === 0) return []
  const key = (d: string) => `${d.slice(0, 7)}-01`
  const first = payments.map((p) => key(p.paidDate)).sort()[0]
  const last = key(today) > key(payments.map((p) => p.paidDate).sort().at(-1)!) ? key(today) : key(payments.map((p) => p.paidDate).sort().at(-1)!)
  const per = new Map<string, number>()
  for (const p of payments) per.set(key(p.paidDate), (per.get(key(p.paidDate)) ?? 0) + p.amount)
  const out: SpendPoint[] = []
  let cum = 0
  for (let m = first; m <= last; ) {
    const paid = per.get(m) ?? 0
    cum += paid
    out.push({ month: m, paid, cumulative: cum })
    m = addDays(m, 32).slice(0, 7) + '-01'
  }
  return out
}

/** Months left at the current monthly burn before the budget is used up (null if not computable). */
export function monthsOfBudgetLeft(series: SpendPoint[], budget: number | null, today: string): number | null {
  if (!budget || series.length === 0) return null
  const recent = series.slice(-3)
  const burn = recent.reduce((n, x) => n + x.paid, 0) / recent.length
  if (burn <= 0) return null
  void today
  void diffDays
  return Math.max(0, (budget - series[series.length - 1].cumulative) / burn)
}
