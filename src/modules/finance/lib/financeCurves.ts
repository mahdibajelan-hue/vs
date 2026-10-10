import type { FinCashflowForecast, FinContract, FinContractAmendment, FinPayment, FinPaymentCertificate } from '../types'
import { contractFile } from './financeControl'
import { isoToJalali } from '../../../lib/jalali'

/** Month ordinal: Jalali year*12 + month-1, so months subtract and sort as plain numbers. */
export const monthIdx = (jy: number, jm: number): number => jy * 12 + (jm - 1)
export const idxToYM = (i: number): { jy: number; jm: number } => ({ jy: Math.floor(i / 12), jm: (i % 12) + 1 })
export const isoMonthIdx = (iso: string): number | null => { const j = isoToJalali(iso.slice(0, 10)); return j ? monthIdx(j.jy, j.jm) : null }

export interface CashPlan { contractId: string; kind: 'baseline' | 'contractor'; fund: 'rial' | 'fx'; currency: string; jalaliYear: number; jalaliMonth: number; amount: number }
export interface Fund { fund: 'rial' | 'fx'; currency: string }
export interface CurveMonth { idx: number; jy: number; jm: number; baseline: number; contractor: number; actual: number; forecast: number; isFuture: boolean; cumBaseline: number; cumContractor: number; cumActual: number | null; cumForecast: number | null }
export interface Curves { fund: Fund; months: CurveMonth[]; totals: { baseline: number; contractor: number; paid: number; forecastRemaining: number }; deviationPct: number | null; contractorGap: number }

/** Paid amount of a certificate in the requested fund, dated by payment records when there are any, else by the certificate's paid date. Rial and foreign currency are never mixed. */
export function paidEvents(certs: FinPaymentCertificate[], payments: FinPayment[], fund: Fund): { idx: number; amount: number }[] {
  const out: { idx: number; amount: number }[] = []
  const byCert = new Map<string, FinPayment[]>()
  for (const p of payments) byCert.set(p.certificateId, [...(byCert.get(p.certificateId) ?? []), p])
  for (const c of certs) {
    const ps = byCert.get(c.id) ?? []
    const rows = ps.length ? ps.map((p) => ({ date: p.paymentDate, rial: p.amount, fc: p.fx.fcAmount, cur: p.fx.fcCurrency })) : c.paidDate ? [{ date: c.paidDate, rial: c.paidAmount, fc: c.paidFx.fcAmount, cur: c.paidFx.fcCurrency }] : []
    for (const r of rows) {
      const idx = isoMonthIdx(r.date); if (idx == null) continue
      const amount = fund.fund === 'rial' ? r.rial : r.cur === fund.currency ? r.fc : 0
      if (amount) out.push({ idx, amount })
    }
  }
  return out
}

/** Baseline / contractor-proposed / actual / forecast, month by month, for one fund. The forecast is the manual monthly entry when present, otherwise what is still unpaid on each contract (current value incl. approved amendments) spread evenly to its amended end date. */
export function buildCurves(a: { contracts: FinContract[]; amendments: FinContractAmendment[]; certificates: FinPaymentCertificate[]; payments: FinPayment[]; plans: CashPlan[]; manualForecasts: FinCashflowForecast[]; fund: Fund; todayIso: string }): Curves {
  const nowIdx = isoMonthIdx(a.todayIso) ?? 0
  const ids = new Set(a.contracts.map((c) => c.id))
  const sel = (p: CashPlan) => ids.has(p.contractId) && p.fund === a.fund.fund && (a.fund.fund === 'rial' || p.currency === a.fund.currency)
  const m = new Map<number, { baseline: number; contractor: number; actual: number; forecast: number }>()
  const cell = (i: number) => { let c = m.get(i); if (!c) { c = { baseline: 0, contractor: 0, actual: 0, forecast: 0 }; m.set(i, c) } return c }
  for (const p of a.plans.filter(sel)) cell(monthIdx(p.jalaliYear, p.jalaliMonth))[p.kind] += p.amount
  const certs = a.certificates.filter((c) => ids.has(c.contractId))
  const certIds = new Set(certs.map((c) => c.id))
  const events = paidEvents(certs, a.payments.filter((p) => certIds.has(p.certificateId)), a.fund)
  for (const e of events) cell(e.idx).actual += e.amount
  const paidTotal = events.reduce((n, e) => n + e.amount, 0)
  let forecastRemaining = 0
  for (const c of a.contracts) {
    if (c.status !== 'active' && c.status !== 'suspended') continue
    const f = contractFile(c, a.amendments)
    const myCerts = certs.filter((x) => x.contractId === c.id)
    const manual = a.fund.fund === 'rial' ? a.manualForecasts.filter((x) => x.contractId === c.id && monthIdx(x.jalaliYear, x.jalaliMonth) > nowIdx) : []
    if (manual.length) { for (const x of manual) { cell(monthIdx(x.jalaliYear, x.jalaliMonth)).forecast += x.forecastAmount; forecastRemaining += x.forecastAmount } continue }
    const total = a.fund.fund === 'rial' ? f.current - c.fx.fcRialEquivalent : c.fx.fcCurrency === a.fund.currency ? c.fx.fcAmount : 0
    const paid = myCerts.reduce((n, x) => n + (a.fund.fund === 'rial' ? x.paidAmount : x.paidFx.fcCurrency === a.fund.currency ? x.paidFx.fcAmount : 0), 0)
    const remaining = Math.max(0, total - paid)
    if (remaining <= 0) continue
    const endIdx = f.currentEnd ? isoMonthIdx(f.currentEnd) ?? nowIdx + 1 : nowIdx + 6
    const span = Math.min(60, Math.max(1, endIdx - nowIdx))
    for (let k = 1; k <= span; k++) cell(nowIdx + k).forecast += remaining / span
    forecastRemaining += remaining
  }
  const keys = [...m.keys()].sort((x, y) => x - y)
  if (!keys.length) return { fund: a.fund, months: [], totals: { baseline: 0, contractor: 0, paid: 0, forecastRemaining: 0 }, deviationPct: null, contractorGap: 0 }
  const months: CurveMonth[] = []
  let cb = 0, cc = 0, ca = 0
  for (let i = keys[0]; i <= Math.max(keys[keys.length - 1], nowIdx); i++) {
    const v = m.get(i) ?? { baseline: 0, contractor: 0, actual: 0, forecast: 0 }
    cb += v.baseline; cc += v.contractor
    const future = i > nowIdx
    if (!future) ca += v.actual
    const { jy, jm } = idxToYM(i)
    months.push({ idx: i, jy, jm, ...v, isFuture: future, cumBaseline: cb, cumContractor: cc, cumActual: future ? null : ca, cumForecast: i >= nowIdx ? (future ? ca + cumFuture(months, v.forecast, nowIdx) : ca) : null })
  }
  const upToNow = months.filter((x) => !x.isFuture).at(-1)
  const deviationPct = upToNow && upToNow.cumBaseline > 0 ? Math.round(((upToNow.cumActual! - upToNow.cumBaseline) / upToNow.cumBaseline) * 1000) / 10 : null
  const totBase = months.at(-1)?.cumBaseline ?? 0, totCon = months.at(-1)?.cumContractor ?? 0
  return { fund: a.fund, months, totals: { baseline: totBase, contractor: totCon, paid: paidTotal, forecastRemaining }, deviationPct, contractorGap: totCon - totBase }
}
// running sum of the forecast already placed after "now" (kept out of the object literal for readability)
function cumFuture(prev: CurveMonth[], thisMonth: number, nowIdx: number): number {
  return prev.filter((p) => p.idx > nowIdx).reduce((n, p) => n + p.forecast, 0) + thisMonth
}

/** Funds present in the data: rial plus each foreign currency that appears on a contract, plan or payment. */
export function fundsOf(contracts: FinContract[], plans: CashPlan[], certs: FinPaymentCertificate[]): Fund[] {
  const cur = new Set<string>()
  for (const c of contracts) if (c.fx.fcAmount > 0 && c.fx.fcCurrency) cur.add(c.fx.fcCurrency)
  for (const p of plans) if (p.fund === 'fx') cur.add(p.currency)
  for (const c of certs) if (c.paidFx.fcAmount > 0 && c.paidFx.fcCurrency) cur.add(c.paidFx.fcCurrency)
  return [{ fund: 'rial', currency: 'ریال' }, ...[...cur].sort().map((currency): Fund => ({ fund: 'fx', currency }))]
}
