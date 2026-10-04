import type { AiProvider, AiStatus } from './provider'
import { gatewayProvider, pingGateway } from './gatewayProvider'

export type { AiProvider, AiStatus } from './provider'
export { ruleProvider } from './ruleProvider'

/**
 * Chooses the provider for this session. The gateway (a configured model behind the mission-ai Edge
 * Function) is used only when the server reports one is available; otherwise — and on any later failure,
 * handled in the engine — the rule engine does the job.
 */
let cached: { provider: AiProvider | null; status: AiStatus } | null = null

export async function resolveAi(force = false): Promise<{ provider: AiProvider | null; status: AiStatus }> {
  if (cached && !force) return cached
  const ping = await pingGateway()
  cached = ping.available
    ? { provider: gatewayProvider, status: { provider: ping.provider ?? 'gateway', label: `مدل هوش مصنوعی (${ping.provider ?? 'gateway'})`, enhanced: true } }
    : { provider: null, status: { provider: 'rules', label: 'موتور قواعد داخلی (بدون AI)', enhanced: false } }
  return cached
}
