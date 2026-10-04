import type { AiProvider } from './provider'
import { analyzeAnswer } from '../lib/ruleAnalyzer'

/** The always-available provider: the deterministic rule engine behind the same interface. */
export const ruleProvider: AiProvider = {
  id: 'rules',
  label: 'موتور قواعد داخلی',
  async analyzeAnswer(req) {
    return analyzeAnswer({
      topicKey: req.topic.key,
      answer: req.answer,
      today: req.today,
      target: req.target ?? undefined,
      known: req.known.map((k) => ({ key: k.key, title: k.title, kind: k.kind as never })),
    })
  },
  async composeReport(req) {
    return { executiveSummary: req.draft.executiveSummary, recommendations: req.draft.recommendations }
  },
}
