import { computeIssueMetrics, type IssueMetrics } from '../../../issues/lib/issueAnalytics'
import { isIssueOpen, isIssueOverdue, isoDiffDays, todayIso } from '../../../issues/lib/issueRing'
import { IM_PRIORITY_COLOR, IM_PRIORITY_LABEL_FA, type ImIssue } from '../../../issues/types'
import type { WidgetDefinition } from '../../lib/widgetTypes'
import { EmptyWidgetState, ToneBadge, UnmappedNotice } from '../ui'

export const issueTopWidget: WidgetDefinition<ImIssue[] | null> = {
  id: 'issue-top',
  label: 'مسائل با اولویت بالا',
  category: 'issue',
  description: 'مسائل باز با اولویت بحرانی یا زیاد',
  defaultReportTypes: ['daily', 'weekly', 'monthly', 'management'],
  compute: ({ bundle }) => {
    if (!bundle.issues) return null
    return bundle.issues.issues
      .filter((i) => isIssueOpen(i) && (i.priority === 'critical' || i.priority === 'high'))
      .sort((a, b) => (a.deadlineDate < b.deadlineDate ? -1 : 1))
      .slice(0, 6)
  },
  Render: ({ data }) => {
    if (data === null) return <UnmappedNotice moduleLabel="مدیریت مسائل" />
    if (data.length === 0) return <EmptyWidgetState text="مسئله با اولویت بالای باز وجود ندارد" />
    return (
      <div className="space-y-1.5">
        {data.map((issue) => (
          <div key={issue.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-1.5">
            <p className="min-w-0 truncate text-xs font-medium">{issue.title}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              {isIssueOverdue(issue) && <ToneBadge tone="critical" label="معوق" />}
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: IM_PRIORITY_COLOR[issue.priority] }}>
                {IM_PRIORITY_LABEL_FA[issue.priority]}
              </span>
            </div>
          </div>
        ))}
      </div>
    )
  },
}

export const issueClosureWidget: WidgetDefinition<IssueMetrics | null> = {
  id: 'issue-closure',
  label: 'نرخ بستن مسائل',
  category: 'issue',
  description: 'نرخ پیگیری به‌موقع، نسبت بسته‌شده و میانگین زمان بستن',
  defaultReportTypes: ['weekly', 'monthly', 'management'],
  compute: ({ bundle }) => (bundle.issues ? computeIssueMetrics(bundle.issues.issues) : null),
  Render: ({ data }) => {
    if (data === null) return <UnmappedNotice moduleLabel="مدیریت مسائل" />
    return (
      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
        <div>
          <p className="text-lg font-extrabold" style={{ color: data.onTimeRate >= 70 ? '#2ecc71' : data.onTimeRate >= 40 ? '#f1c40f' : '#e74c3c' }}>
            {data.onTimeRate}%
          </p>
          <p className="text-[10px] text-muted">پیگیری به‌موقع</p>
        </div>
        <div>
          <p className="text-lg font-extrabold">{data.closedRatio}%</p>
          <p className="text-[10px] text-muted">نسبت بسته‌شده</p>
        </div>
        <div>
          <p className="text-lg font-extrabold">{Math.round(data.avgDays)}</p>
          <p className="text-[10px] text-muted">میانگین روز تا بستن</p>
        </div>
      </div>
    )
  },
}

interface AgingBucket {
  bucket: string
  count: number
}

export const issueAgingWidget: WidgetDefinition<AgingBucket[] | null> = {
  id: 'issue-aging',
  label: 'قدمت مسائل باز',
  category: 'issue',
  description: 'توزیع مسائل باز بر اساس تعداد روز از ثبت',
  defaultReportTypes: ['weekly', 'monthly', 'management'],
  compute: ({ bundle }) => {
    if (!bundle.issues) return null
    const today = todayIso()
    const open = bundle.issues.issues.filter(isIssueOpen)
    const buckets = [
      { bucket: '۰ تا ۷ روز', min: 0, max: 7, count: 0 },
      { bucket: '۸ تا ۱۴ روز', min: 8, max: 14, count: 0 },
      { bucket: '۱۵ تا ۳۰ روز', min: 15, max: 30, count: 0 },
      { bucket: 'بیش از ۳۰ روز', min: 31, max: Infinity, count: 0 },
    ]
    for (const issue of open) {
      const age = isoDiffDays(issue.createdAt.slice(0, 10), today)
      const b = buckets.find((x) => age >= x.min && age <= x.max)
      if (b) b.count++
    }
    return buckets.map(({ bucket, count }) => ({ bucket, count }))
  },
  Render: ({ data }) => {
    if (data === null) return <UnmappedNotice moduleLabel="مدیریت مسائل" />
    const total = data.reduce((s, b) => s + b.count, 0)
    if (total === 0) return <EmptyWidgetState text="مسئله باز فعالی وجود ندارد" />
    return (
      <div className="space-y-2">
        {data.map((b, i) => {
          const pct = total > 0 ? Math.round((b.count / total) * 100) : 0
          const color = i === 0 ? '#2ecc71' : i === 1 ? '#f1c40f' : i === 2 ? '#f97316' : '#e74c3c'
          return (
            <div key={b.bucket}>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-secondary">{b.bucket}</span>
                <span className="text-muted">{b.count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          )
        })}
      </div>
    )
  },
}
