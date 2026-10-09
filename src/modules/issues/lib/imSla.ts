import type { ImIssue, ImIssuePriority } from '../types'
import { dayDiff, effectiveDue, isActiveIssue, stageOf } from './imModel'

export interface SlaPolicy { severity: ImIssuePriority; responseHours: number; resolveDays: number }
export const DEFAULT_SLA: SlaPolicy[] = [
  { severity: 'critical', responseHours: 4, resolveDays: 3 },
  { severity: 'high', responseHours: 24, resolveDays: 7 },
  { severity: 'medium', responseHours: 72, resolveDays: 14 },
  { severity: 'low', responseHours: 120, resolveDays: 30 },
]

export type SlaState = 'ok' | 'at_risk' | 'breached' | 'met' | 'na'
export interface SlaResult { state: SlaState; elapsedPct: number; hoursLeft: number | null; label: string }

const H = 3600_000
const AT_RISK_AT = 0.8

/** First-response SLA: from creation until the issue leaves «registered» (or a first action starts). */
export function responseSla(i: ImIssue, policy: SlaPolicy[], respondedAt: string | null, nowMs: number): SlaResult {
  const p = policy.find((x) => x.severity === (i.severity ?? i.priority))
  if (!p) return { state: 'na', elapsedPct: 0, hoursLeft: null, label: 'SLA تعریف نشده' }
  const start = Date.parse(i.createdAt)
  const limit = p.responseHours * H
  const end = respondedAt ? Date.parse(respondedAt) : nowMs
  const pct = Math.round(((end - start) / limit) * 100)
  if (respondedAt) return { state: end - start <= limit ? 'met' : 'breached', elapsedPct: pct, hoursLeft: null, label: end - start <= limit ? 'پاسخ در مهلت' : 'پاسخ با تأخیر' }
  const left = (start + limit - nowMs) / H
  return { state: pct >= 100 ? 'breached' : pct >= AT_RISK_AT * 100 ? 'at_risk' : 'ok', elapsedPct: pct, hoursLeft: Math.round(left * 10) / 10, label: pct >= 100 ? 'نقض SLA پاسخ' : 'در مهلت پاسخ' }
}

/** Resolution SLA against the effective due date (approved extensions move it, original is kept for KPIs). */
export function resolutionSla(i: ImIssue, today: string): SlaResult {
  const due = effectiveDue(i)
  if (!isActiveIssue(i) && stageOf(i) !== 'closed') return { state: 'na', elapsedPct: 0, hoursLeft: null, label: '—' }
  if (stageOf(i) === 'closed') {
    const closed = (i.closedAt ?? '').slice(0, 10)
    return { state: closed && closed <= due ? 'met' : 'breached', elapsedPct: 100, hoursLeft: null, label: closed && closed <= due ? 'بسته در مهلت' : 'بسته با تأخیر' }
  }
  const total = Math.max(1, dayDiff(i.createdAt.slice(0, 10), due))
  const used = dayDiff(i.createdAt.slice(0, 10), today)
  const pct = Math.round((used / total) * 100)
  const left = dayDiff(today, due)
  return { state: left < 0 ? 'breached' : pct >= AT_RISK_AT * 100 ? 'at_risk' : 'ok', elapsedPct: pct, hoursLeft: left * 24, label: left < 0 ? `${-left} روز تأخیر` : left === 0 ? 'امروز سررسید' : `${left} روز مانده` }
}

export function slaColor(s: SlaState): string {
  return s === 'breached' ? 'var(--im-coral)' : s === 'at_risk' ? 'var(--im-amber)' : s === 'met' || s === 'ok' ? 'var(--im-mint)' : 'var(--im-muted-2)'
}
