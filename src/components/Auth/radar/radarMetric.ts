export type MetricState = 'ready' | 'empty' | 'error'
export type MetricKey = 'health' | 'progress' | 'spi' | 'cpi' | 'finish' | 'cost' | 'risks' | 'issues' | 'overdue' | 'changes' | 'gate' | 'contract' | 'epc' | 'milestones'
export type MetricSource = { source: string; state: MetricState; asOf: string | null; readAt?: string }

export const metricStateLabel: Record<MetricState, string> = {
  ready: 'داده ثبت شده',
  empty: 'داده موجود نیست',
  error: 'خطای خواندن',
}

export function metricSource(source: string, value: unknown, asOf: string | null, failed = false, readAt?: string): MetricSource {
  return { source, state: failed ? 'error' : value == null ? 'empty' : 'ready', asOf, readAt }
}
