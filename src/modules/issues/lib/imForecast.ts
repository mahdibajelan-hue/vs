import type { ImIssue } from '../types'
import { dayDiff, effectiveDue, isActiveIssue, isClosedIssue } from './imModel'

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** Median days-to-close by category and by severity from closed issues (history is the only input — no hidden model). */
export function resolutionBaselines(issues: ImIssue[]): { byCategory: Map<string, number>; bySeverity: Map<string, number>; overall: number | null } {
  const closed = issues.filter(isClosedIssue)
  const d = (i: ImIssue) => dayDiff((i.identifiedAt ?? i.createdAt).slice(0, 10), (i.closedAt ?? i.updatedAt).slice(0, 10))
  const group = (key: (i: ImIssue) => string) => { const g = new Map<string, number[]>(); for (const i of closed) g.set(key(i), [...(g.get(key(i)) ?? []), d(i)]); return new Map([...g.entries()].filter(([, v]) => v.length >= 2).map(([k, v]) => [k, median(v) as number])) }
  return { byCategory: group((i) => i.category ?? 'none'), bySeverity: group((i) => i.severity ?? i.priority), overall: median(closed.map(d)) }
}

export interface DelayForecast { issueId: string; predictedDays: number; ageDays: number; remainingEstimate: number; dueInDays: number; riskScore: number; reasons: string[] }

/**
 * Delay risk 0–100 for active issues: expected remaining days (baseline − age, floor 1) vs days left to the effective due date,
 * plus explicit penalties for blocked work, repeated extensions and stale activity. Transparent weights; confidence is low when history is thin.
 */
export function forecastDelays(issues: ImIssue[], today: string, blockedIssueIds: Set<string> = new Set()): { forecasts: DelayForecast[]; confident: boolean } {
  const base = resolutionBaselines(issues)
  const confident = issues.filter(isClosedIssue).length >= 8
  const out: DelayForecast[] = []
  for (const i of issues.filter(isActiveIssue)) {
    const predicted = base.byCategory.get(i.category ?? 'none') ?? base.bySeverity.get(i.severity ?? i.priority) ?? base.overall ?? 14
    const age = dayDiff(i.createdAt.slice(0, 10), today)
    const remaining = Math.max(1, predicted - age)
    const dueIn = dayDiff(today, effectiveDue(i))
    const reasons: string[] = []
    let risk = 0
    const gap = remaining - dueIn
    if (dueIn < 0) { risk += 60; reasons.push(`${-dueIn} روز از سررسید گذشته`) }
    else if (gap > 0) { risk += Math.min(45, 15 + gap * 4); reasons.push(`برآورد ${Math.round(remaining)} روز تا رفع در برابر ${dueIn} روز مهلت`) }
    if (blockedIssueIds.has(i.id) || i.blockedSince) { risk += 20; reasons.push('اقدام مسدود دارد') }
    if ((i.extensionCount ?? 0) >= 2) { risk += 15; reasons.push('بیش از یک‌بار تمدید شده') }
    if (dayDiff(i.updatedAt.slice(0, 10), today) >= 7) { risk += 10; reasons.push('بیش از ۷ روز بی‌حرکت') }
    out.push({ issueId: i.id, predictedDays: predicted, ageDays: age, remainingEstimate: remaining, dueInDays: dueIn, riskScore: Math.min(100, Math.round(risk)), reasons })
  }
  return { forecasts: out.sort((a, b) => b.riskScore - a.riskScore), confident }
}
