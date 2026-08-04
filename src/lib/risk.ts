import type { Risk } from '../types'

export function riskScore(risk: Pick<Risk, 'probability' | 'impact'>): number {
  return risk.probability * risk.impact
}

/** 1-25 score bucketed into a 5-stop red/orange/yellow/green heat scale. */
export function riskScoreColor(score: number): string {
  if (score >= 20) return '#b91c1c'
  if (score >= 15) return '#ef4444'
  if (score >= 10) return '#f97316'
  if (score >= 5) return '#eab308'
  return '#22c55e'
}

export function riskScoreLabel(score: number): string {
  if (score >= 20) return 'بحرانی'
  if (score >= 15) return 'بالا'
  if (score >= 10) return 'متوسط'
  if (score >= 5) return 'پایین'
  return 'ناچیز'
}

export function sortRisksBySeverity(risks: Risk[]): Risk[] {
  return [...risks].sort((a, b) => riskScore(b) - riskScore(a))
}
