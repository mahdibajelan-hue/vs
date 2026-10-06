import type { Finding, FindingKind, Objective, Priority } from '../types'
import { normalizeFa } from './fa'
import { reportFindings } from './reportBuilder'

/**
 * Numbers behind the report's charts and tables. Computed from the live findings and objectives (not from the
 * stored report text), so a report always shows exactly what the findings list shows — including the owner and
 * due date of every decision.
 */

export const KIND_COLOR: Record<FindingKind, string> = {
  issue: '#e11d48',
  risk: '#f97316',
  action: '#0284c7',
  commitment: '#7c3aed',
  decision: '#059669',
  progress: '#64748b',
  observation: '#94a3b8',
}

export const SEVERITY_COLOR: Record<Priority, string> = { critical: '#b91c1c', high: '#ea580c', medium: '#d97706', low: '#65a30d' }
export const SEVERITY_FA: Record<Priority, string> = { critical: 'بحرانی', high: 'زیاد', medium: 'متوسط', low: 'کم' }

const DISCIPLINES: [string, string][] = [['engineering', 'مهندسی'], ['procurement', 'خرید و تأمین'], ['construction', 'ساخت و اجرا'], ['quality', 'کیفیت'], ['hse', 'HSE'], ['legal', 'حقوقی'], ['finance', 'مالی'], ['hr_admin', 'منابع انسانی و اداری']]

export interface OwnedRow {
  id: string
  kind: FindingKind
  title: string
  owner: string
  /** ISO date when it could be resolved, else null */
  dueIso: string | null
  /** The user's own wording of the deadline when no date could be resolved */
  dueText: string
  note: string
  severity: Priority
}

export interface IssueRow {
  id: string
  title: string
  severity: Priority
  cause: string
  impact: string
  owner: string
  dueIso: string | null
  dueText: string
}

export interface MatrixPoint {
  n: number
  title: string
  probability: number
  impact: number
  kind: 'issue' | 'risk'
}

export interface ReportVisuals {
  kinds: { kind: FindingKind; label: string; count: number; color: string }[]
  severity: Record<Priority, number>
  disciplines: { key: string; label: string; issues: number; risks: number }[]
  objectives: { achieved: number; partial: number; notAchieved: number; other: number; total: number; percent: number }
  matrix: MatrixPoint[]
  decisions: OwnedRow[]
  actions: OwnedRow[]
  issues: IssueRow[]
  risks: IssueRow[]
}

const SEV_ORDER: Priority[] = ['critical', 'high', 'medium', 'low']
const rank = (s: Priority) => SEV_ORDER.indexOf(s)

function dueOf(f: Finding): { iso: string | null; text: string } {
  const text = f.details.due || f.details.newDate || ''
  const iso = f.dueDate ?? (/^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null)
  return { iso, text: iso ? '' : /^(نامشخص|اعلام نشده)$/.test(text.trim()) ? '' : text }
}

function ownerOf(f: Finding): string {
  const o = f.ownerText || f.details.owner || f.details.party || ''
  return /^(نامشخص|اعلام نشده)$/.test(o.trim()) ? '' : o
}

function sortOwned(a: OwnedRow, b: OwnedRow): number {
  if (a.dueIso && b.dueIso) return a.dueIso.localeCompare(b.dueIso)
  if (a.dueIso) return -1
  if (b.dueIso) return 1
  return 0
}

function probabilityOf(f: Finding): number {
  const p = normalizeFa(f.details.probability ?? '')
  if (/خیلی\s*زیاد|بسیار\s*زیاد|قطعی/.test(p)) return 5
  if (/خیلی\s*کم|بسیار\s*کم/.test(p)) return 1
  if (/زیاد|بالا|محتمل/.test(p)) return 4
  if (/متوسط|نسبتا|معمولی/.test(p)) return 3
  if (/کم|پایین/.test(p)) return 2
  return f.severity === 'critical' || f.severity === 'high' ? 4 : f.severity === 'medium' ? 3 : 2
}

const impactOf = (f: Finding): number => (f.severity === 'critical' ? 5 : f.severity === 'high' ? 4 : f.severity === 'medium' ? 3 : 2)

export function buildVisuals(findingsAll: Finding[], objectives: Objective[]): ReportVisuals {
  const findings = reportFindings(findingsAll)
  const count = (k: FindingKind) => findings.filter((f) => f.kind === k).length
  const kinds: ReportVisuals['kinds'] = [
    { kind: 'issue', label: 'مسئله', count: count('issue'), color: KIND_COLOR.issue },
    { kind: 'risk', label: 'ریسک', count: count('risk'), color: KIND_COLOR.risk },
    { kind: 'decision', label: 'مصوبه / تصمیم', count: count('decision'), color: KIND_COLOR.decision },
    { kind: 'commitment', label: 'تعهد', count: count('commitment'), color: KIND_COLOR.commitment },
    { kind: 'action', label: 'اقدام', count: count('action'), color: KIND_COLOR.action },
  ]
  const severity: Record<Priority, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const f of findings) if (f.kind === 'issue' || f.kind === 'risk') severity[f.severity]++

  const disciplines = DISCIPLINES.map(([key, label]) => {
    const own = findings.filter((f) => (f.details._area ?? f.topicKey) === key)
    return { key, label, issues: own.filter((f) => f.kind === 'issue').length, risks: own.filter((f) => f.kind === 'risk').length }
  }).filter((d) => d.issues + d.risks > 0)

  const total = objectives.length
  const achieved = objectives.filter((o) => o.status === 'achieved').length
  const partial = objectives.filter((o) => o.status === 'partial').length
  const notAchieved = objectives.filter((o) => o.status === 'not_achieved').length

  const toOwned = (f: Finding): OwnedRow => {
    const d = dueOf(f)
    return { id: f.id, kind: f.kind, title: f.title, owner: ownerOf(f), dueIso: d.iso, dueText: d.text, note: f.details.note ?? '', severity: f.severity }
  }
  const toIssue = (f: Finding): IssueRow => {
    const d = dueOf(f)
    return { id: f.id, title: f.title, severity: f.severity, cause: f.details.cause ?? '', impact: f.details.impact ?? '', owner: ownerOf(f), dueIso: d.iso, dueText: d.text }
  }

  // Same numbering as the issue and risk tables: issues first, then risks, each by severity.
  const bySev = (kind: FindingKind) => findings.filter((f) => f.kind === kind).sort((a, b) => rank(a.severity) - rank(b.severity))
  const risky = [...bySev('issue'), ...bySev('risk')]
  return {
    kinds,
    severity,
    disciplines,
    objectives: { achieved, partial, notAchieved, other: total - achieved - partial - notAchieved, total, percent: total ? Math.round(((achieved + partial * 0.5) / total) * 100) : 0 },
    matrix: risky.slice(0, 12).map((f, i) => ({ n: i + 1, title: f.title, probability: f.kind === 'issue' ? 5 : probabilityOf(f), impact: impactOf(f), kind: f.kind as 'issue' | 'risk' })),
    decisions: findings.filter((f) => f.kind === 'decision' || f.kind === 'commitment').map(toOwned).sort(sortOwned),
    actions: findings.filter((f) => f.kind === 'action').map(toOwned).sort(sortOwned),
    issues: findings.filter((f) => f.kind === 'issue').sort((a, b) => rank(a.severity) - rank(b.severity)).map(toIssue),
    risks: findings.filter((f) => f.kind === 'risk').sort((a, b) => rank(a.severity) - rank(b.severity)).map(toIssue),
  }
}
