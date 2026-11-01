import type { EngCycleRow, EngDocRow, EngCycleResult } from '../../execution/epcTypes'
import { canonDiscipline } from './disciplines'

/**
 * Engineering reports — pure functions over the document register and its issue / review cycles, so the same figures
 * feed the screen, the printout and the Excel file. `credit(doc, date)` is the progress credit (0–1) of a document on a
 * date (the engine's creditAt with the project's stage weights); amounts are a document's share of the engineering total.
 */
export type DocState = 'not_started' | 'in_preparation' | 'with_consultant' | 'commented' | 'rejected' | 'approved_as_noted' | 'approved' | 'superseded'
export const DOC_STATE_FA: Record<DocState, string> = {
  not_started: 'شروع‌نشده', in_preparation: 'در حال تهیه', with_consultant: 'در انتظار بررسی مشاور', commented: 'کامنت‌دار — منتظر ارسال دوباره',
  rejected: 'ردشده — منتظر ارسال دوباره', approved_as_noted: 'تأیید با ملاحظات — منتظر ویرایش نهایی', approved: 'تأیید نهایی', superseded: 'منسوخ (حذف‌شده)',
}
export const DOC_STATE_COLOR: Record<DocState, string> = {
  not_started: '#94a3b8', in_preparation: '#f97316', with_consultant: '#0ea5e9', commented: '#f59e0b', rejected: '#ef4444', approved_as_noted: '#84cc16', approved: '#22c55e', superseded: '#64748b',
}
export const DOC_STATE_ORDER: DocState[] = ['approved', 'approved_as_noted', 'with_consultant', 'commented', 'rejected', 'in_preparation', 'not_started', 'superseded']

const daysBetween = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000)
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** the cycles that count on a date: not withdrawn, sent by then; a result given after the date reads as still pending */
export function cyclesAsOf(d: EngDocRow, asOf: string): EngCycleRow[] {
  return [...(d.cycles ?? [])].filter((c) => c.result !== 'withdrawn' && c.submittedOn <= asOf).sort((a, b) => a.seq - b.seq)
    .map((c) => (c.resultOn && c.resultOn > asOf ? { ...c, result: 'pending' as EngCycleResult, resultOn: null } : c))
}
export const lastCycle = (d: EngDocRow, asOf: string): EngCycleRow | null => { const c = cyclesAsOf(d, asOf); return c.length ? c[c.length - 1] : null }

/** where a document stands on a date */
export function docState(d: EngDocRow, asOf: string): DocState {
  if (d.status === 'superseded') return 'superseded'
  const all = cyclesAsOf(d, asOf)
  if (all.some((c) => c.result === 'approved')) return 'approved'
  const c = all[all.length - 1]
  if (!c) {
    // a document entered before the cycle register existed carries only its status
    if (!(d.cycles ?? []).length) {
      if (d.status === 'approved' && d.actualApproved && d.actualApproved <= asOf) return 'approved'
      if (d.status === 'restricted' && d.actualApproved && d.actualApproved <= asOf) return 'approved_as_noted'
      if ((d.status === 'issued' || d.status === 'pending_approval') && d.actualPrepared && d.actualPrepared <= asOf) return 'with_consultant'
      return d.status === 'in_preparation' ? 'in_preparation' : 'not_started'
    }
    return d.status === 'required' ? 'not_started' : 'in_preparation'
  }
  return c.result === 'pending' ? 'with_consultant' : c.result === 'commented' ? 'commented' : c.result === 'rejected' ? 'rejected' : 'approved_as_noted'
}

export interface Ctx { asOf: string; credit: (d: EngDocRow, date: string) => number; /** the engineering total (rial) amounts are shares of; 0 = no amounts */ total: number }
const liveW = (docs: EngDocRow[]) => docs.filter((d) => d.status !== 'superseded').reduce((a, d) => a + d.weight, 0)

// ── 1. status register: the latest position of every document, rolled up by discipline (the basis of an engineering statement)
export interface RegRow {
  id: string; docNo: string; title: string; discipline: string; weight: number; amount: number | null
  rev: string; purpose: string; issuedOn: string | null; state: DocState
  /** progress credit 0–1 at the start of the period (when `from` is given) and at its end */
  prev: number | null; now: number
  earnedWeight: number; earnedAmount: number | null; periodAmount: number | null
}
export interface RegSum { n: number; weight: number; amount: number | null; earnedWeight: number; earnedAmount: number | null; prevWeight: number | null; periodAmount: number | null; progress: number; prevProgress: number | null }
export interface RegGroup { name: string; rows: RegRow[]; sum: RegSum }

export function statusRegister(docs: EngDocRow[], c: Ctx & { from?: string | null; includeSuperseded?: boolean }): { groups: RegGroup[]; sum: RegSum } {
  const W = liveW(docs)
  const amt = (w: number) => (c.total > 0 && W > 0 ? (w / W) * c.total : null)
  const rows: RegRow[] = docs.filter((d) => c.includeSuperseded || d.status !== 'superseded').map((d) => {
    const live = d.status !== 'superseded'
    const last = lastCycle(d, c.asOf)
    const legacyIssued = !(d.cycles ?? []).length && d.actualPrepared && d.actualPrepared <= c.asOf
    const now = live ? c.credit(d, c.asOf) : 0
    const prev = c.from ? (live ? c.credit(d, c.from) : 0) : null
    const amount = live ? amt(d.weight) : null
    return {
      id: d.id, docNo: d.docNo, title: d.title, discipline: canonDiscipline(d.discipline, d.docNo) || 'بدون رشته', weight: live ? d.weight : 0, amount,
      rev: last ? last.rev : legacyIssued ? d.rev : '', purpose: last ? last.purpose : legacyIssued ? d.targetIssue : '', issuedOn: last ? last.submittedOn : legacyIssued ? d.actualPrepared : null,
      state: docState(d, c.asOf), prev, now,
      earnedWeight: (live ? d.weight : 0) * now, earnedAmount: amount == null ? null : amount * now,
      periodAmount: amount == null || prev == null ? null : amount * (now - prev),
    }
  })
  const sumOf = (rs: RegRow[]): RegSum => {
    const weight = rs.reduce((a, r) => a + r.weight, 0), earnedWeight = rs.reduce((a, r) => a + r.earnedWeight, 0)
    const prevWeight = c.from ? rs.reduce((a, r) => a + r.weight * (r.prev ?? 0), 0) : null
    const anyAmount = rs.some((r) => r.amount != null)
    return {
      n: rs.length, weight, amount: anyAmount ? rs.reduce((a, r) => a + (r.amount ?? 0), 0) : null, earnedWeight,
      earnedAmount: anyAmount ? rs.reduce((a, r) => a + (r.earnedAmount ?? 0), 0) : null, prevWeight,
      periodAmount: anyAmount && c.from ? rs.reduce((a, r) => a + (r.periodAmount ?? 0), 0) : null,
      progress: weight > 0 ? earnedWeight / weight : 0, prevProgress: prevWeight != null && weight > 0 ? prevWeight / weight : null,
    }
  }
  const by = new Map<string, RegRow[]>()
  for (const r of rows) by.set(r.discipline, [...(by.get(r.discipline) ?? []), r])
  const groups = [...by].sort((a, b) => a[0].localeCompare(b[0])).map(([name, rs]) => ({ name, rows: rs.sort((a, b) => a.docNo.localeCompare(b.docNo)), sum: sumOf(rs) }))
  return { groups, sum: sumOf(rows) }
}

// ── 2. with the consultant longer than the limit
export interface WaitRow { id: string; docNo: string; title: string; discipline: string; weight: number; rev: string; purpose: string; since: string; days: number; over: number; result?: EngCycleResult; seq: number }
export function consultantOverdue(docs: EngDocRow[], today: string, limitDays: number): WaitRow[] {
  return docs.filter((d) => d.status !== 'superseded').flatMap((d) => {
    const c = lastCycle(d, today)
    if (!c || c.result !== 'pending') return []
    const days = daysBetween(c.submittedOn, today)
    return days > limitDays ? [{ id: d.id, docNo: d.docNo, title: d.title, discipline: canonDiscipline(d.discipline, d.docNo) || 'بدون رشته', weight: d.weight, rev: c.rev, purpose: c.purpose, since: c.submittedOn, days, over: days - limitDays, seq: c.seq }] : []
  }).sort((a, b) => b.days - a.days)
}

// ── 3. with the contractor, not produced yet
export interface TodoRow { id: string; docNo: string; title: string; discipline: string; weight: number; state: DocState; plannedOn: string | null; late: number | null; critical: boolean }
export function notProduced(docs: EngDocRow[], today: string): TodoRow[] {
  return docs.filter((d) => d.status !== 'superseded').flatMap((d) => {
    const st = docState(d, today)
    if (st !== 'not_started' && st !== 'in_preparation') return []
    const late = d.plannedPrepared ? daysBetween(d.plannedPrepared, today) : null
    return [{ id: d.id, docNo: d.docNo, title: d.title, discipline: canonDiscipline(d.discipline, d.docNo) || 'بدون رشته', weight: d.weight, state: st, plannedOn: d.plannedPrepared, late, critical: d.critical }]
  }).sort((a, b) => (b.late ?? -1e9) - (a.late ?? -1e9) || a.docNo.localeCompare(b.docNo))
}

// ── 4. answered by the consultant (commented / rejected / approved as noted), not resubmitted within the limit
export function commentsOverdue(docs: EngDocRow[], today: string, limitDays: number): WaitRow[] {
  return docs.filter((d) => d.status !== 'superseded').flatMap((d) => {
    const all = cyclesAsOf(d, today)
    if (all.some((c) => c.result === 'approved')) return []
    const c = all[all.length - 1]
    if (!c || !c.resultOn || !['commented', 'rejected', 'approved_as_noted'].includes(c.result)) return []
    const days = daysBetween(c.resultOn, today)
    return days > limitDays ? [{ id: d.id, docNo: d.docNo, title: d.title, discipline: canonDiscipline(d.discipline, d.docNo) || 'بدون رشته', weight: d.weight, rev: c.rev, purpose: c.purpose, since: c.resultOn, days, over: days - limitDays, result: c.result, seq: c.seq }] : []
  }).sort((a, b) => b.days - a.days)
}

// ── 5. statistics
export interface EngStats {
  total: number; live: number; superseded: number; weight: number
  byState: { state: DocState; n: number; weight: number }[]
  submissions: number; byPurpose: Record<string, number>; byResult: Record<string, number>
  /** approved at the first submission / all approved through the cycle register */
  firstTimeRate: number | null; avgSubmissionsToApproval: number | null
  /** median days: submission → consultant's answer, answer → contractor's next submission */
  consultantDays: number | null; contractorDays: number | null
  progress: number
  byDiscipline: { name: string; n: number; weight: number; progress: number; approved: number; withConsultant: number; notStarted: number; returned: number }[]
}
export function engStats(docs: EngDocRow[], c: Ctx): EngStats {
  const live = docs.filter((d) => d.status !== 'superseded')
  const W = live.reduce((a, d) => a + d.weight, 0)
  const st = new Map(docs.map((d) => [d.id, docState(d, c.asOf)]))
  const byState = DOC_STATE_ORDER.map((s) => { const ds = docs.filter((d) => st.get(d.id) === s); return { state: s, n: ds.length, weight: ds.filter((d) => d.status !== 'superseded').reduce((a, d) => a + d.weight, 0) } })
  const cyc = live.flatMap((d) => cyclesAsOf(d, c.asOf).map((x) => ({ d, x })))
  const byPurpose: Record<string, number> = {}, byResult: Record<string, number> = {}
  for (const { x } of cyc) { byPurpose[x.purpose] = (byPurpose[x.purpose] ?? 0) + 1; byResult[x.result] = (byResult[x.result] ?? 0) + 1 }
  const approvedVia = live.map((d) => cyclesAsOf(d, c.asOf)).filter((cs) => cs.some((x) => x.result === 'approved'))
  const nToApproval = approvedVia.map((cs) => cs.findIndex((x) => x.result === 'approved') + 1)
  const consultantDays = median(cyc.filter(({ x }) => x.resultOn).map(({ x }) => daysBetween(x.submittedOn, x.resultOn as string)))
  const back: number[] = []
  for (const d of live) { const cs = cyclesAsOf(d, c.asOf); for (let i = 1; i < cs.length; i++) if (cs[i - 1].resultOn) back.push(daysBetween(cs[i - 1].resultOn as string, cs[i].submittedOn)) }
  const earned = live.reduce((a, d) => a + d.weight * c.credit(d, c.asOf), 0)
  const discs = new Map<string, EngDocRow[]>()
  for (const d of live) { const k = canonDiscipline(d.discipline, d.docNo) || 'بدون رشته'; discs.set(k, [...(discs.get(k) ?? []), d]) }
  const byDiscipline = [...discs].sort((a, b) => a[0].localeCompare(b[0])).map(([name, ds]) => {
    const w = ds.reduce((a, d) => a + d.weight, 0)
    const cnt = (f: (s: DocState) => boolean) => ds.filter((d) => f(st.get(d.id) as DocState)).length
    return { name, n: ds.length, weight: w, progress: w > 0 ? ds.reduce((a, d) => a + d.weight * c.credit(d, c.asOf), 0) / w : 0, approved: cnt((s) => s === 'approved'), withConsultant: cnt((s) => s === 'with_consultant'), notStarted: cnt((s) => s === 'not_started' || s === 'in_preparation'), returned: cnt((s) => s === 'commented' || s === 'rejected' || s === 'approved_as_noted') }
  })
  return {
    total: docs.length, live: live.length, superseded: docs.length - live.length, weight: W, byState,
    submissions: cyc.length, byPurpose, byResult,
    firstTimeRate: nToApproval.length ? nToApproval.filter((n) => n === 1).length / nToApproval.length : null,
    avgSubmissionsToApproval: nToApproval.length ? nToApproval.reduce((a, n) => a + n, 0) / nToApproval.length : null,
    consultantDays, contractorDays: median(back), progress: W > 0 ? earned / W : 0, byDiscipline,
  }
}
