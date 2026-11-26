import { formatJalaliFa } from '../../../lib/jalali'
import { metricStateLabel, type MetricSource } from './radarMetric'

export function MetricProvenance({ meta, loading }: { meta?: MetricSource; loading?: boolean }) {
  if (loading) return <small className="rc-sub">در حال خواندن…</small>
  if (!meta) return <small className="rc-sub">داده موجود نیست</small>
  const date = meta.asOf
    ? `مبنای داده ${formatJalaliFa(meta.asOf.slice(0, 10))}`
    : meta.readAt ? `خواندن ${formatJalaliFa(meta.readAt.slice(0, 10))}` : 'تاریخ مبنا ثبت نشده'
  return <small className="rc-sub rc-metric-source" data-state={meta.state}>{meta.source} · {meta.state === 'ready' ? date : metricStateLabel[meta.state]}</small>
}
