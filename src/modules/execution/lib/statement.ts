import type { Activity, Report, ReportLine } from '../types'
import { cumulative } from './progress'

export interface StatementRow {
  activity: Activity
  /** contract quantity in force on the period's last day */
  base: number
  unitPrice: number
  prev: number; period: number; cum: number
  /** quantity of the period still waiting for the supervision (NOT part of the statement) */
  pending: number
  prevAmt: number; periodAmt: number; cumAmt: number; contractAmt: number; pendingAmt: number
  /** share of the contract quantity done to date */
  pct: number
  /** cumulative approved quantity is above the contract quantity */
  over: boolean
}
export interface StatementTotals { contractAmt: number; prevAmt: number; periodAmt: number; cumAmt: number; pendingAmt: number }
export interface StatementChapter { key: string; chapterNo: string; title: string; rows: StatementRow[]; totals: StatementTotals }
export interface StatementBook { key: string; title: string; chapters: StatementChapter[]; totals: StatementTotals }
export interface Statement { books: StatementBook[]; grand: StatementTotals; rowCount: number; overRows: number }

const zero = (): StatementTotals => ({ contractAmt: 0, prevAmt: 0, periodAmt: 0, cumAmt: 0, pendingAmt: 0 })
const add = (t: StatementTotals, r: StatementRow) => { t.contractAmt += r.contractAmt; t.prevAmt += r.prevAmt; t.periodAmt += r.periodAmt; t.cumAmt += r.cumAmt; t.pendingAmt += r.pendingAmt }

/**
 * The work-done statement of a period, straight from the supervision-approved quantities: per price-book row the quantity up to the period,
 * in the period and to date, priced with the contract unit price, summed per chapter and per price book. Quantities still waiting for approval
 * are shown beside it but never added. The payment-statement reviewer starts from this, nothing is typed twice.
 */
export function buildStatement(c: { activities: Activity[]; reports: Report[]; lines: ReportLine[] }, p: { from: string; to: string }, baseOf: (a: Activity, asOf: string) => number, bookTitle: (id: string | null) => string, tolPct = 0): Statement {
  const cumTo = cumulative(c.reports, c.lines, { until: p.to, mode: 'approved' })
  const cumBefore = cumulative(c.reports, c.lines, { before: p.from, mode: 'approved' })
  const work = new Map(c.reports.filter((r) => r.formKey === 'work').map((r) => [r.id, r]))
  const pending = new Map<string, number>()
  for (const l of c.lines) {
    if (!l.activityId || l.status !== 'pending') continue
    const r = work.get(l.reportId)
    if (!r || (r.status !== 'submitted' && r.status !== 'partially_approved') || r.reportDate < p.from || r.reportDate > p.to) continue
    pending.set(l.activityId, (pending.get(l.activityId) ?? 0) + l.qty)
  }
  const books = new Map<string, StatementBook>()
  const grand = zero()
  let rowCount = 0, overRows = 0
  const acts = c.activities.filter((a) => a.active && a.approval === 'approved').sort((a, b) => a.sort - b.sort)
  for (const a of acts) {
    const cum = cumTo.get(a.id) ?? 0, prev = cumBefore.get(a.id) ?? 0, pend = pending.get(a.id) ?? 0
    if (cum <= 0 && pend <= 0) continue
    const base = baseOf(a, p.to)
    const row: StatementRow = {
      activity: a, base, unitPrice: a.unitPrice, prev, period: Math.max(0, cum - prev), cum, pending: pend,
      prevAmt: prev * a.unitPrice, periodAmt: Math.max(0, cum - prev) * a.unitPrice, cumAmt: cum * a.unitPrice, contractAmt: base * a.unitPrice, pendingAmt: pend * a.unitPrice,
      pct: base > 0 ? cum / base : 0, over: base > 0 && cum > base * (1 + tolPct / 100) + 1e-9,
    }
    const bk = a.bookId ?? ''
    const book = books.get(bk) ?? { key: bk, title: bookTitle(a.bookId), chapters: [], totals: zero() }
    const chKey = a.chapterNo || a.chapter || '—'
    let ch = book.chapters.find((x) => x.key === chKey)
    if (!ch) { ch = { key: chKey, chapterNo: a.chapterNo, title: a.chapter || 'بدون فصل', rows: [], totals: zero() }; book.chapters.push(ch) }
    ch.rows.push(row); add(ch.totals, row); add(book.totals, row); add(grand, row)
    books.set(bk, book); rowCount += 1; if (row.over) overRows += 1
  }
  return { books: [...books.values()], grand, rowCount, overRows }
}
