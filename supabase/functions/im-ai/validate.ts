// Output guards for the Issue Management AI gateway. A model answer is DATA to be reviewed by a person — it is clamped to
// known enums/lengths here and again on the client, and it can never trigger an action by itself.

export const CATEGORIES = ['engineering', 'document_approval', 'procurement', 'contractor', 'contract_commercial', 'land_right_of_way', 'permits', 'hse', 'quality', 'finance', 'interface', 'other']
export const SEVERITIES = ['low', 'medium', 'high', 'critical']
const STAGES = ['active', 'all', 'registered', 'validated', 'analysis', 'action_plan', 'in_progress', 'resolution_review', 'effectiveness_check', 'closed', 'returned', 'reopened', 'cancelled', 'duplicate']

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const oneOf = (v: unknown, set: string[]): string | null => (typeof v === 'string' && set.includes(v) ? v : null)

export interface Suggestion { category: string | null; severity: string; acceptance_criteria: string; tasks: string[]; reasons: string[] }
export function sanitizeSuggestion(o: Record<string, unknown>): Suggestion {
  return {
    category: oneOf(o.category, CATEGORIES),
    severity: oneOf(o.severity, SEVERITIES) ?? 'medium',
    acceptance_criteria: str(o.acceptance_criteria, 400),
    tasks: (Array.isArray(o.tasks) ? o.tasks : []).map((t) => str(t, 140)).filter(Boolean).slice(0, 6),
    reasons: (Array.isArray(o.reasons) ? o.reasons : []).map((t) => str(t, 200)).filter(Boolean).slice(0, 5),
  }
}

export interface Candidate { title: string; description: string; category: string | null; severity: string }
export function sanitizeCandidates(o: Record<string, unknown>): Candidate[] {
  const list = Array.isArray(o.candidates) ? o.candidates : []
  return list.map((c) => {
    const r = (c ?? {}) as Record<string, unknown>
    return { title: str(r.title, 120), description: str(r.description, 600), category: oneOf(r.category, CATEGORIES), severity: oneOf(r.severity, SEVERITIES) ?? 'medium' }
  }).filter((c) => c.title.length >= 4).slice(0, 25)
}

export interface FilterOut { q?: string; stage?: string; severity?: string; category?: string; overdueOnly?: boolean; blockedOnly?: boolean; explanation: string[] }
export function sanitizeFilter(o: Record<string, unknown>): FilterOut {
  const f: FilterOut = { explanation: (Array.isArray(o.explanation) ? o.explanation : []).map((t) => str(t, 160)).filter(Boolean).slice(0, 6) }
  const q = str(o.q, 120); if (q) f.q = q
  const stage = oneOf(o.stage, STAGES); if (stage) f.stage = stage
  const sev = oneOf(o.severity, SEVERITIES); if (sev) f.severity = sev
  const cat = oneOf(o.category, CATEGORIES); if (cat) f.category = cat
  if (o.overdueOnly === true) f.overdueOnly = true
  if (o.blockedOnly === true) f.blockedOnly = true
  return f
}

export function sanitizeSummary(o: Record<string, unknown>): { summary: string; next_actions: string[]; risks: string[] } {
  const arr = (v: unknown, n: number) => (Array.isArray(v) ? v : []).map((t) => str(t, 200)).filter(Boolean).slice(0, n)
  return { summary: str(o.summary, 900), next_actions: arr(o.next_actions, 5), risks: arr(o.risks, 5) }
}

/** Cap what leaves the system: free text is truncated, and obvious contact data is masked before it reaches a provider. */
export function redact(text: string, max = 4000): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/(?:\+98|0098|0)?9\d{9}\b/g, '[phone]')
    .replace(/\b\d{16}\b/g, '[card]')
    .slice(0, max)
}
