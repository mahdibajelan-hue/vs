import type { DefectType, Pass, Verdict } from './rules'

/**
 * Welder and repair analysis — read from what QC records (evaluations, defects, repairs) and from the welding reports
 * (who made each pass of each weld). Nothing is typed again for it.
 *
 *  • A weld counts for a welder when the welder's stamp is on any pass of it.
 *  • Its first-round result (the latest evaluation of round 0) decides whether it was «repaired the first time».
 *    repair % = welds whose round-0 result was repair or cut-out ÷ welds of the welder with a round-0 result.
 *  • A defect is charged to the welders of its pass (the interpreter picks the pass; the default follows the defect type).
 *  • A repair succeeded when the next round was accepted; it failed when the next round needed another repair or a cut-out.
 */

export interface QWeld { id: string; label: string; date: string; stamps: Record<Pass, string[]> }
export interface QEval { weldId: string; round: number; overall: Verdict; at: string; signed: boolean }
export interface QDefect { id: string; weldId: string; round: number; type: DefectType; pass: Pass | ''; welders: string[]; verdict: Verdict | null; lengthMm: number; removed: boolean }
export interface QRepair { weldId: string; round: number; performedBy: string; method: string; at: string }

export const PASSES: Pass[] = ['root', 'hot', 'fill', 'cap']
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0)

/** the latest evaluation of each (weld, round) */
export function latestByRound(evals: QEval[]): Map<string, QEval> {
  const m = new Map<string, QEval>()
  for (const e of [...evals].sort((a, b) => a.at.localeCompare(b.at))) m.set(`${e.weldId}#${e.round}`, e)
  return m
}

export interface WelderRow {
  key: string
  welds: number; evaluated: number; firstRepair: number; cutOut: number; repairPct: number
  defects: number; rejectable: number
  byType: Partial<Record<DefectType, number>>; byPass: Partial<Record<Pass, number>>
  months: { key: string; evaluated: number; repaired: number; rate: number }[]
  top: DefectType | null
  /** per 100 evaluated welds, defects that led to a repair or cut-out */
  rejectPer100: number
}

export function welderReport(a: { welds: QWeld[]; evals: QEval[]; defects: QDefect[]; monthOf: (iso: string) => string; from?: string; to?: string }): WelderRow[] {
  const last = latestByRound(a.evals)
  const inRange = (d: string) => (!a.from || d >= a.from) && (!a.to || d <= a.to)
  const rows = new Map<string, WelderRow>()
  const row = (k: string) => { let r = rows.get(k); if (!r) { r = { key: k, welds: 0, evaluated: 0, firstRepair: 0, cutOut: 0, repairPct: 0, defects: 0, rejectable: 0, byType: {}, byPass: {}, months: [], top: null, rejectPer100: 0 }; rows.set(k, r) } return r }
  const months = new Map<string, Map<string, { evaluated: number; repaired: number }>>()
  const weldById = new Map(a.welds.map((w) => [w.id, w]))
  for (const w of a.welds) {
    if (w.date && !inRange(w.date)) continue
    const all = new Set(PASSES.flatMap((p) => w.stamps[p]))
    const e0 = last.get(`${w.id}#0`)
    for (const k of all) {
      const r = row(k); r.welds++
      if (!e0) continue
      r.evaluated++
      const rep = e0.overall !== 'accept'
      if (rep) r.firstRepair++
      if (e0.overall === 'cut_out') r.cutOut++
      const mk = a.monthOf(e0.at.slice(0, 10))
      const mm = months.get(k) ?? new Map(); const x = mm.get(mk) ?? { evaluated: 0, repaired: 0 }
      x.evaluated++; if (rep) x.repaired++; mm.set(mk, x); months.set(k, mm)
    }
  }
  for (const d of a.defects) {
    if (d.removed) continue
    const w = weldById.get(d.weldId); if (w?.date && !inRange(w.date)) continue
    for (const k of new Set(d.welders)) {
      const r = row(k); r.defects++
      if (d.verdict === 'repair' || d.verdict === 'cut_out') r.rejectable++
      r.byType[d.type] = (r.byType[d.type] ?? 0) + 1
      if (d.pass) r.byPass[d.pass] = (r.byPass[d.pass] ?? 0) + 1
    }
  }
  for (const r of rows.values()) {
    r.repairPct = pct(r.firstRepair, r.evaluated)
    r.rejectPer100 = r.evaluated ? Math.round((r.rejectable / r.evaluated) * 1000) / 10 : 0
    const t = Object.entries(r.byType).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))[0]
    r.top = t ? (t[0] as DefectType) : null
    r.months = [...(months.get(r.key) ?? new Map()).entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([key, v]) => ({ key, ...v, rate: pct(v.repaired, v.evaluated) }))
  }
  return [...rows.values()].sort((x, y) => y.repairPct - x.repairPct || y.evaluated - x.evaluated || x.key.localeCompare(y.key))
}

export interface RepairAnalysis {
  evaluated: number; firstRepair: number; firstRepairPct: number
  repairs: number; succeeded: number; failed: number; pending: number; successPct: number
  secondRepairs: number; cutOuts: number; forcedCutOuts: number
  /** which defect types caused the repairs (defects with a repair / cut-out verdict, first round) */
  causes: { type: DefectType; count: number; share: number }[]
  /** repairs per person who did them (stamp or name), with how many of them passed the next radiography */
  byPerformer: { who: string; repairs: number; succeeded: number; failed: number; successPct: number }[]
  months: { key: string; evaluated: number; repaired: number; rate: number }[]
  /** days from the first-round result to the repair record, median */
  medianDaysToRepair: number | null
}

export function repairAnalysis(a: { evals: QEval[]; defects: QDefect[]; repairs: QRepair[]; forced?: number; monthOf: (iso: string) => string }): RepairAnalysis {
  const last = latestByRound(a.evals)
  const r0 = [...last.values()].filter((e) => e.round === 0)
  const firstRepair = r0.filter((e) => e.overall !== 'accept').length
  let succeeded = 0, failed = 0, pending = 0
  const perf = new Map<string, { repairs: number; succeeded: number; failed: number }>()
  const days: number[] = []
  for (const rp of a.repairs) {
    const next = last.get(`${rp.weldId}#${rp.round + 1}`)
    const who = rp.performedBy.trim() || 'نامشخص'
    const p = perf.get(who) ?? { repairs: 0, succeeded: 0, failed: 0 }
    p.repairs++
    if (!next) pending++
    else if (next.overall === 'accept') { succeeded++; p.succeeded++ } else { failed++; p.failed++ }
    perf.set(who, p)
    const e = last.get(`${rp.weldId}#${rp.round}`)
    if (e) { const d = (Date.parse(rp.at) - Date.parse(e.at)) / 86400000; if (Number.isFinite(d) && d >= 0) days.push(d) }
  }
  const causesMap = new Map<DefectType, number>()
  for (const d of a.defects) if (!d.removed && d.round === 0 && (d.verdict === 'repair' || d.verdict === 'cut_out')) causesMap.set(d.type, (causesMap.get(d.type) ?? 0) + 1)
  const causeTotal = [...causesMap.values()].reduce((s, x) => s + x, 0)
  const months = new Map<string, { evaluated: number; repaired: number }>()
  for (const e of r0) { const k = a.monthOf(e.at.slice(0, 10)); const x = months.get(k) ?? { evaluated: 0, repaired: 0 }; x.evaluated++; if (e.overall !== 'accept') x.repaired++; months.set(k, x) }
  days.sort((x, y) => x - y)
  return {
    evaluated: r0.length, firstRepair, firstRepairPct: pct(firstRepair, r0.length),
    repairs: a.repairs.length, succeeded, failed, pending, successPct: pct(succeeded, succeeded + failed),
    secondRepairs: a.repairs.filter((r) => r.round === 1).length,
    cutOuts: [...last.values()].filter((e) => e.overall === 'cut_out' && e.signed).length, forcedCutOuts: a.forced ?? 0,
    causes: [...causesMap.entries()].sort((x, y) => y[1] - x[1]).map(([type, count]) => ({ type, count, share: pct(count, causeTotal) })),
    byPerformer: [...perf.entries()].map(([who, v]) => ({ who, ...v, successPct: pct(v.succeeded, v.succeeded + v.failed) })).sort((x, y) => y.repairs - x.repairs),
    months: [...months.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([key, v]) => ({ key, ...v, rate: pct(v.repaired, v.evaluated) })),
    medianDaysToRepair: days.length ? Math.round(days[Math.floor(days.length / 2)] * 10) / 10 : null,
  }
}

/** the QC state of a weld, for lists and filters */
export type QcState = 'no_film' | 'quality' | 'interpret' | 'to_sign' | 'repair_due' | 'reshoot' | 'accepted' | 'cut_out'
export const QC_STATE_FA: Record<QcState, string> = {
  no_film: 'بدون فیلم', quality: 'بررسی کیفیت فیلم', interpret: 'در انتظار تفسیر و ارزیابی', to_sign: 'منتظر تأیید بازرس NDT',
  repair_due: 'منتظر ثبت تعمیر', reshoot: 'منتظر فیلم پس از تعمیر (RS)', accepted: 'پذیرفته (بسته)', cut_out: 'برش (بسته)',
}
export const QC_STATE_COLOR: Record<QcState, string> = {
  no_film: '#64748b', quality: '#0ea5e9', interpret: '#8b5cf6', to_sign: '#f59e0b', repair_due: '#f97316', reshoot: '#ec4899', accepted: '#22c55e', cut_out: '#ef4444',
}
export function qcState(a: { closed: boolean; finalStatus: Verdict | null; round: number; films: { round: number; quality: string }[]; lastEval: QEval | undefined }): QcState {
  if (a.closed) return a.finalStatus === 'cut_out' ? 'cut_out' : 'accepted'
  const films = a.films.filter((f) => f.round === a.round)
  const e = a.lastEval && a.lastEval.round === a.round ? a.lastEval : undefined
  if (e && !e.signed) return 'to_sign'
  if (e && e.signed && e.overall === 'repair') return 'repair_due'
  if (!films.length) return a.round > 0 ? 'reshoot' : 'no_film'
  if (!films.some((f) => f.quality === 'accepted')) return 'quality'
  return 'interpret'
}
