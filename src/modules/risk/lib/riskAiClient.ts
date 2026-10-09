import { supabase } from '../../../lib/supabaseClient'
import { aiStatus } from '../../issues/lib/imAiClient'
import { answerRiskQuestion, extractRiskCandidates, summarizeStatus, type ProjectSummary, type QueryAnswer, type QueryCtx, type RiskCandidate } from './riskAi'
import { RISK_LEVEL_LABEL_FA } from './riskScore'
import type { RiskState } from './riskState'
import type { RmRisk, RmRiskAction } from '../types'

/** Calls the shared `im-ai` gateway (tasks risk_*). Any failure / no provider → null and callers use the local rule engine. Answers are proposals only. */
export { aiStatus }
async function call<T>(task: string, payload: unknown): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke('im-ai', { body: { task, payload } })
    if (error || !(data as { available?: boolean })?.available) return null
    return (data as { result: T }).result
  } catch { return null }
}

export async function extractRisks(text: string, categories: string[]): Promise<{ items: RiskCandidate[]; source: 'ai' | 'rules' }> {
  const ai = await call<{ title: string; risk_event: string; cause: string; consequence: string; category: string; probability: number; impact: number; confidence: number; reasons: string[] }[]>('risk_extract', { text })
  if (ai && ai.length) return { items: ai.map((c) => ({ title: c.title, riskEvent: c.risk_event, cause: c.cause, consequence: c.consequence, category: categories.includes(c.category) ? c.category : 'other', probability: c.probability, impact: c.impact, confidence: c.confidence, reasons: c.reasons, source: 'ai' as const })), source: 'ai' }
  return { items: extractRiskCandidates(text, categories), source: 'rules' }
}

export interface AskResult extends QueryAnswer { source: 'ai' | 'rules'; answer?: string; confidence?: number; limitations: string[] }
/** Only what the user already sees is sent (codes, titles, levels, flags — no names, no descriptions), capped at 150 risks. */
export async function askRisks(question: string, ctx: QueryCtx): Promise<AskResult> {
  const local = answerRiskQuestion(question, ctx)
  const visible = ctx.risks.filter((r) => r.status !== 'closed').slice(0, 150)
  const payload = { question, risks: visible.map((r) => { const s = ctx.states.get(r.id)!; return { code: r.code, title: r.title, category: r.category, level: RISK_LEVEL_LABEL_FA[s.level], score: s.current, status: r.status, flags: s.attention } }) }
  const ai = await call<{ answer: string; codes: string[]; confidence: number; limitations: string[] }>('risk_ask', payload)
  if (ai && ai.answer) {
    const byCode = new Map(ctx.risks.map((r) => [r.code, r.id]))
    return { ids: ai.codes.map((c) => byCode.get(c)).filter(Boolean) as string[], explanation: local.explanation, understood: true, source: 'ai', answer: ai.answer, confidence: ai.confidence, limitations: ai.limitations }
  }
  return { ...local, source: 'rules', limitations: local.understood ? [] : ['پرسش به‌صورت جستجوی متنی خوانده شد؛ برای پاسخ تحلیلی، سرویس هوش مصنوعی باید فعال باشد.'] }
}

export async function summarize(risks: RmRisk[], states: Map<string, RiskState>, actions: RmRiskAction[], title: string): Promise<ProjectSummary & { source: 'ai' | 'rules'; aiText?: string }> {
  const local = summarizeStatus(risks, states, actions, title)
  const ai = await call<{ summary: string; attention: string[]; limitations: string[] }>('risk_summarize', { title, facts: local.lines, limitations: local.limitations })
  if (ai && ai.summary) return { lines: [ai.summary, ...ai.attention], limitations: ai.limitations.length ? ai.limitations : local.limitations, confidence: local.confidence, source: 'ai', aiText: ai.summary }
  return { ...local, source: 'rules' }
}
