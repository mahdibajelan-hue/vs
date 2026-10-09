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

// ---- Risk Management tasks (risk_extract · risk_ask · risk_summarize). Same rules: clamp, never act, always a proposal.
export const RISK_CATEGORIES = ['engineering', 'procurement', 'contractor', 'schedule', 'cost', 'land', 'permits', 'construction', 'quality', 'hse', 'logistics', 'hr', 'stakeholders', 'commissioning', 'legal', 'other']
const int15 = (v: unknown, d: number): number => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : d }
const conf = (v: unknown, d = 0.5): number => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 100) / 100)) : d }

export interface RiskCandidateOut { title: string; risk_event: string; cause: string; consequence: string; category: string; probability: number; impact: number; confidence: number; reasons: string[] }
export function sanitizeRiskCandidates(o: Record<string, unknown>): RiskCandidateOut[] {
  const list = Array.isArray(o.candidates) ? o.candidates : []
  return list.map((c) => {
    const r = (c ?? {}) as Record<string, unknown>
    return {
      title: str(r.title, 140), risk_event: str(r.risk_event, 400), cause: str(r.cause, 300), consequence: str(r.consequence, 300), category: oneOf(r.category, RISK_CATEGORIES) ?? 'other',
      probability: int15(r.probability, 3), impact: int15(r.impact, 3), confidence: conf(r.confidence), reasons: (Array.isArray(r.reasons) ? r.reasons : []).map((t) => str(t, 200)).filter(Boolean).slice(0, 4),
    }
  }).filter((c) => c.title.length >= 4).slice(0, 25)
}

/** The answer may cite only risk codes that were really supplied; anything else is dropped. */
export function sanitizeRiskAnswer(o: Record<string, unknown>, knownCodes: Set<string>): { answer: string; codes: string[]; confidence: number; limitations: string[] } {
  const codes = (Array.isArray(o.codes) ? o.codes : []).map((c) => str(c, 20)).filter((c) => knownCodes.has(c)).slice(0, 40)
  return { answer: str(o.answer, 1200), codes, confidence: conf(o.confidence), limitations: (Array.isArray(o.limitations) ? o.limitations : []).map((t) => str(t, 200)).filter(Boolean).slice(0, 5) }
}

export function sanitizeRiskSummary(o: Record<string, unknown>): { summary: string; attention: string[]; limitations: string[] } {
  const arr = (v: unknown, n: number) => (Array.isArray(v) ? v : []).map((t) => str(t, 220)).filter(Boolean).slice(0, n)
  return { summary: str(o.summary, 1200), attention: arr(o.attention, 5), limitations: arr(o.limitations, 5) }
}
