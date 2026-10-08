import type { Finding, Mission, Objective, ReportContent } from '../types'
import type { AnalysisResult } from '../lib/ruleAnalyzer'
import type { Slot } from '../lib/questionSets'

/**
 * Provider-independent AI contract. The product never imports a vendor SDK: everything intelligent goes
 * through this interface, and each capability has a deterministic rule-based implementation
 * (ruleProvider.ts) so the interview, the report and the quality score all work with AI switched off.
 * A concrete provider (the server-side gateway — Gemini, OpenAI-compatible, or an on-premise model, see
 * supabase/functions/mission-ai) is only an optional enrichment on top of the rules.
 */

export interface AiAnalyzeRequest {
  topic: { key: string; title: string }
  question: string
  answer: string
  today: string
  known: { key: string; title: string; kind: string }[]
  /** The slot the engine decided to ask about next, so the model can phrase that follow-up naturally. */
  wantedFollowUp?: { findingKey: string; slot: Slot; findingTitle: string } | null
  /** Set when this answer responds to a follow-up. */
  target?: { findingKey: string; slot: Slot; findingTitle: string } | null
  mission: { project: string; visitType: string; destination: string; objectives: string[] }
}

export interface AiReportRequest {
  mission: Mission
  objectives: Objective[]
  findings: Finding[]
  notes: Record<string, string[]>
  progress: { planned: number | null; actual: number | null }
  /** The deterministic draft; the model improves wording but must not invent facts. */
  draft: ReportContent
}

export interface AiReportParts {
  executiveSummary: string
  recommendations: string[]
  sectionBodies?: Record<string, string>
}

export interface AiProvider {
  id: string
  label: string
  analyzeAnswer(req: AiAnalyzeRequest): Promise<AnalysisResult>
  composeReport(req: AiReportRequest): Promise<AiReportParts>
}

export interface AiStatus {
  /** Active provider id: 'rules' when nothing else is configured or reachable. */
  provider: string
  label: string
  /** True when an external model is currently being used. */
  enhanced: boolean
}
