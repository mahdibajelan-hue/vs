import { supabase } from '../platform'
import type { AiAnalyzeRequest, AiProvider, AiReportParts, AiReportRequest } from './provider'
import type { AnalysisResult, ExtractedFinding } from '../lib/ruleAnalyzer'
import { findingKey } from '../lib/ruleAnalyzer'
import type { FindingDetails, FindingKind, Priority } from '../types'
import type { Slot } from '../lib/questionSets'

/**
 * Talks to the `mission-ai` Edge Function — a provider-agnostic gateway (Gemini, any OpenAI-compatible
 * endpoint, or an on-premise model, chosen by server-side configuration). The browser never sees a
 * vendor key or SDK. Any failure throws, and the interview engine falls back to the rule engine.
 */

const KINDS: FindingKind[] = ['issue', 'risk', 'action', 'commitment', 'decision']
const SEVERITIES: Priority[] = ['low', 'medium', 'high', 'critical']
const SLOTS: Slot[] = ['cause', 'status', 'impact', 'party', 'newDate', 'needAction', 'probability', 'mitigation', 'owner', 'due']

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const isoOrNull = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

function toAnalysis(raw: Record<string, unknown>, req: AiAnalyzeRequest): AnalysisResult {
  const findings: ExtractedFinding[] = []
  for (const f of Array.isArray(raw.findings) ? (raw.findings as Record<string, unknown>[]) : []) {
    const kind = str(f.kind) as FindingKind
    const title = str(f.title)
    if (!KINDS.includes(kind) || title.length < 4) continue
    const details: FindingDetails = {}
    for (const [k, v] of Object.entries((f.details as Record<string, unknown>) ?? {})) {
      const s = str(v)
      if (s) details[k] = s
    }
    const sev = str(f.severity) as Priority
    findings.push({
      key: findingKey(kind, req.topic.key, title),
      kind,
      topicKey: req.topic.key,
      title,
      description: str(f.description) || title,
      details,
      severity: SEVERITIES.includes(sev) ? sev : 'medium',
      ownerText: str(f.ownerText) || details.party || details.owner || '',
      dueDate: isoOrNull(f.dueDate),
      confidence: typeof f.confidence === 'number' ? Math.max(0, Math.min(1, f.confidence)) : 0.7,
    })
  }
  const slotFills: AnalysisResult['slotFills'] = []
  for (const s of Array.isArray(raw.slotFills) ? (raw.slotFills as Record<string, unknown>[]) : []) {
    const slot = str(s.slot) as Slot
    if (SLOTS.includes(slot) && str(s.value) && str(s.findingKey)) slotFills.push({ findingKey: str(s.findingKey), slot, value: str(s.value) })
  }
  if (req.target && !slotFills.length && !raw.nothingToReport && !raw.unknown) {
    // The model answered a follow-up but returned no explicit fill: use its words.
    slotFills.push({ findingKey: req.target.findingKey, slot: req.target.slot, value: req.answer.trim() })
  }
  const m = (raw.metrics as Record<string, unknown>) ?? {}
  const metrics: Record<string, number> = {}
  if (typeof m.planned === 'number') metrics.planned = m.planned
  if (typeof m.actual === 'number') metrics.actual = m.actual
  const sentiment = str(raw.sentiment)
  return {
    findings,
    slotFills,
    metrics,
    sentiment: sentiment === 'positive' || sentiment === 'negative' ? sentiment : 'neutral',
    nothingToReport: raw.nothingToReport === true,
    unknown: raw.unknown === true,
    vague: raw.vague === true,
    summary: str(raw.summary) || req.answer.trim(),
    source: 'ai',
    followUpText: str(raw.followUpText) || undefined,
  }
}

interface GatewayReply {
  available?: boolean
  provider?: string
  result?: Record<string, unknown>
}

export const gatewayProvider: AiProvider = {
  id: 'gateway',
  label: 'مدل هوش مصنوعی (درگاه)',
  async analyzeAnswer(req) {
    const { data, error } = await supabase.functions.invoke('mission-ai', { body: { task: 'analyze_answer', payload: req } })
    const reply = data as GatewayReply | null
    if (error || !reply?.available || !reply.result) throw new Error('ai_unavailable')
    return toAnalysis(reply.result, req)
  },
  async composeReport(req: AiReportRequest): Promise<AiReportParts> {
    const payload = {
      mission: { code: req.mission.code, project: req.mission.projectName, visitType: req.mission.visitType, destination: req.mission.destination },
      draft: { executiveSummary: req.draft.executiveSummary, recommendations: req.draft.recommendations, sections: req.draft.sections.map((s) => ({ title: s.title, body: s.body, bullets: s.bullets })) },
    }
    const { data, error } = await supabase.functions.invoke('mission-ai', { body: { task: 'compose_report', payload } })
    const reply = data as GatewayReply | null
    const r = reply?.result
    if (error || !reply?.available || !r) throw new Error('ai_unavailable')
    const rec = Array.isArray(r.recommendations) ? (r.recommendations as unknown[]).map(str).filter(Boolean) : []
    return { executiveSummary: str(r.executiveSummary) || req.draft.executiveSummary, recommendations: rec.length ? rec : req.draft.recommendations }
  },
}

/** Ask the gateway whether a model is configured (cheap; no model call). */
export async function pingGateway(): Promise<{ available: boolean; provider: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('mission-ai', { body: { task: 'ping' } })
    const r = data as { available?: boolean; provider?: string | null } | null
    if (error || !r) return { available: false, provider: null }
    return { available: !!r.available, provider: r.provider ?? null }
  } catch {
    return { available: false, provider: null }
  }
}

/** Speech-to-text through the gateway (Gemini audio understanding, or an OpenAI-compatible /audio/transcriptions). */
export async function transcribeViaGateway(wavBase64: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('mission-ai', { body: { task: 'transcribe', payload: { audio: wavBase64, mime: 'audio/wav', lang: 'fa' } } })
  if (error) {
    let detail = error.message
    try {
      const ctx = (error as unknown as { context?: Response }).context
      if (ctx && typeof ctx.text === 'function') detail = `${ctx.status} ${(await ctx.text()).slice(0, 200)}`
    } catch {
      /* keep message */
    }
    throw new Error(`gateway: ${detail}`)
  }
  const r = data as { available?: boolean; text?: string; error?: string; detail?: string } | null
  if (!r?.available) throw new Error('gateway: هیچ سرویس هوش مصنوعی روی سرور فعال نیست (کلید یا ارائه‌دهنده تنظیم نشده).')
  if (r.error) throw new Error(`model: ${r.detail ?? r.error}`)
  if (typeof r.text !== 'string') throw new Error('gateway: پاسخ نامعتبر')
  return r.text.trim()
}
