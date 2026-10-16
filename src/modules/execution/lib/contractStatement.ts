import type { ReportLine } from '../types'
import type { ActionRule, WorkAction } from './workActions'
import { actionOf } from './workActions'

/** Contract statement arithmetic. Every row stores THREE cumulative values — system, contractor request, consultant opinion — and the previous statement's three values.
 *  The month is cumulative − previous, per column; every amount and total is calculated from the CONSULTANT column (an empty consultant value counts as 0 and is reported as missing). */
export interface StRow { activityId: string; unitPrice: number; baseQty: number; sys: number; req: number | null; con: number | null; prevSys: number; prevReq: number; prevCon: number }
export interface StCalc { sysMonth: number; reqMonth: number; conMonth: number; conMissing: boolean; basisCum: number; basisPrev: number; monthAmt: number; cumAmt: number; prevAmt: number; contractAmt: number; over: boolean }
export const calcRow = (r: StRow, tolPct = 0): StCalc => {
  const reqCum = r.req ?? r.sys, conCum = r.con ?? 0
  const monthC = conCum - r.prevCon
  return {
    sysMonth: r.sys - r.prevSys, reqMonth: reqCum - r.prevReq, conMonth: monthC, conMissing: r.con == null,
    basisCum: conCum, basisPrev: r.prevCon, monthAmt: monthC * r.unitPrice, cumAmt: conCum * r.unitPrice, prevAmt: r.prevCon * r.unitPrice, contractAmt: r.baseQty * r.unitPrice,
    over: r.baseQty > 0 && conCum > r.baseQty * (1 + tolPct / 100) + 1e-9,
  }
}
export interface StTotals { month: number; cum: number; prev: number; contract: number; missing: number; over: number }
export function totals(rows: StRow[], tolPct = 0): StTotals {
  const t: StTotals = { month: 0, cum: 0, prev: 0, contract: 0, missing: 0, over: 0 }
  for (const r of rows) { const c = calcRow(r, tolPct); t.month += c.monthAmt; t.cum += c.cumAmt; t.prev += c.prevAmt; t.contract += c.contractAmt; if (c.conMissing && r.sys > 0) t.missing += 1; if (c.over) t.over += 1 }
  return t
}

/** Executed (supervision-approved) quantities, grouped for the linking step: per action, and per value of each choice field of the action — so a price row can be linked to exactly "welding with wall 0.750". */
export interface ExecGroup { id: string; actionKey: string; actionTitle: string; unit: string; group: string; fieldKey: string; fieldLabel: string; value: string; cum: number; month: number; lines: number }
export function executedGroups(lines: ReportLine[], actions: Pick<WorkAction, 'key' | 'title' | 'unit' | 'group' | 'fields'>[], dateOf: (reportId: string) => string, monthFrom: string, monthTo: string): ExecGroup[] {
  const by = new Map(actions.map((a) => [a.key, a])), out = new Map<string, ExecGroup>()
  const add = (a: (typeof actions)[number], fieldKey: string, fieldLabel: string, value: string, qty: number, inMonth: boolean) => {
    const id = `${a.key}|${fieldKey}|${value}`, g = out.get(id) ?? { id, actionKey: a.key, actionTitle: a.title, unit: a.unit, group: a.group, fieldKey, fieldLabel, value, cum: 0, month: 0, lines: 0 }
    g.cum += qty; if (inMonth) g.month += qty; g.lines += 1; out.set(id, g)
  }
  for (const l of lines) {
    const key = actionOf(l), a = by.get(key); if (!a || l.status !== 'approved') continue
    const q = l.approvedQty ?? l.qty, d = dateOf(l.reportId), inM = d >= monthFrom && d <= monthTo
    add(a, '', '', '', q, inM)
    for (const f of a.fields) if (f.kind === 'select') { const v = String(l.detail[f.key] ?? '').trim(); if (v) add(a, f.key, f.label, v, q, inM) }
  }
  return [...out.values()].sort((x, y) => x.group.localeCompare(y.group, 'fa') || x.actionTitle.localeCompare(y.actionTitle, 'fa') || x.fieldKey.localeCompare(y.fieldKey))
}
export const ruleLabel = (r: ActionRule, actions: Pick<WorkAction, 'key' | 'title' | 'fields'>[]): string => {
  const a = actions.find((x) => x.key === r.actionKey)
  return `${a?.title ?? r.actionKey}${r.whenField ? ` — ${a?.fields.find((f) => f.key === r.whenField)?.label ?? r.whenField}: ${r.whenValue}` : ''}`
}
