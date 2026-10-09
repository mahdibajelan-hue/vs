import { supabase } from '../../../lib/supabaseClient'
import type { ImIssuePriority } from '../types'
import type { IssueFilter } from './imRegister'
import { extractCandidates, parseNlQuery, suggestFromText, type AiSuggestion, type Candidate } from './imAi'

/** Calls the `im-ai` gateway. Any failure or an unconfigured provider yields `null` and callers use the local rule engine. */
type Task = 'suggest' | 'summarize' | 'extract' | 'nl_query'
let pingCache: { at: number; ok: boolean; provider: string | null } | null = null

export async function aiStatus(force = false): Promise<{ available: boolean; provider: string | null }> {
  if (!force && pingCache && Date.now() - pingCache.at < 60_000) return { available: pingCache.ok, provider: pingCache.provider }
  try {
    const { data, error } = await supabase.functions.invoke('im-ai', { body: { task: 'ping' } })
    const ok = !error && !!(data as { available?: boolean })?.available
    pingCache = { at: Date.now(), ok, provider: ok ? ((data as { provider?: string }).provider ?? null) : null }
  } catch {
    pingCache = { at: Date.now(), ok: false, provider: null }
  }
  return { available: pingCache.ok, provider: pingCache.provider }
}

async function call<T>(task: Task, payload: unknown): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke('im-ai', { body: { task, payload } })
    if (error || !(data as { available?: boolean })?.available) return null
    return (data as { result: T }).result
  } catch {
    return null
  }
}

export async function suggestIssue(title: string, description: string): Promise<AiSuggestion & { tasks: string[]; acceptance: string }> {
  const ai = await call<{ category: string | null; severity: ImIssuePriority; acceptance_criteria: string; tasks: string[]; reasons: string[] }>('suggest', { title, description })
  if (ai) return { category: ai.category, categoryLabel: null, severity: ai.severity, reasons: ai.reasons, source: 'ai', tasks: ai.tasks, acceptance: ai.acceptance_criteria }
  return { ...suggestFromText(title, description), tasks: [], acceptance: '' }
}

export async function extractIssues(text: string): Promise<{ items: Candidate[]; source: 'ai' | 'rules' }> {
  const ai = await call<{ title: string; description: string; category: string | null; severity: ImIssuePriority }[]>('extract', { text })
  if (ai && ai.length) return { items: ai.map((c) => ({ ...c, cues: [] })), source: 'ai' }
  return { items: extractCandidates(text), source: 'rules' }
}

export async function askRegister(question: string, ctx: Parameters<typeof parseNlQuery>[1]): Promise<{ filter: Partial<IssueFilter>; explanation: string[]; source: 'ai' | 'rules' }> {
  const ai = await call<Partial<IssueFilter> & { explanation: string[] }>('nl_query', { question })
  if (ai) { const { explanation, ...f } = ai; const local = parseNlQuery(question, ctx); return { filter: { ...local.filter, ...f, ...(local.filter.projectId ? { projectId: local.filter.projectId } : {}), ...(local.filter.userId ? { userId: local.filter.userId } : {}) }, explanation, source: 'ai' } }
  return { ...parseNlQuery(question, ctx), source: 'rules' }
}

export async function summarizeWithAi(payload: unknown): Promise<{ summary: string; next_actions: string[]; risks: string[] } | null> {
  return call('summarize', payload)
}
