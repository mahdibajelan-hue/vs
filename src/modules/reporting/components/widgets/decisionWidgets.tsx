import { DECISION_STATUS_LABEL_FA, RASTA_ACTION_PRIORITY_LABEL_FA, RASTA_ACTION_STATUS_LABEL_FA, type Decision, type RastaAction } from '../../types'
import type { WidgetDefinition } from '../../lib/widgetTypes'
import { EmptyWidgetState, ToneBadge } from '../ui'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export const decisionsRequiredWidget: WidgetDefinition<Decision[]> = {
  id: 'decision-required',
  label: 'تصمیمات نیازمند مدیریت',
  category: 'decision',
  description: 'تصمیمات در انتظار یا در حال بررسی برای این پروژه',
  defaultReportTypes: ['weekly', 'monthly', 'management'],
  compute: ({ decisions }) => decisions.filter((d) => d.status === 'pending' || d.status === 'in_review'),
  Render: ({ data }) => {
    if (data.length === 0) return <EmptyWidgetState text="تصمیم بازی برای این پروژه ثبت نشده است" />
    const today = todayIso()
    return (
      <div className="space-y-1.5">
        {data.map((d) => {
          const dueSoon = d.requiredBy !== null && d.requiredBy <= today
          return (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{d.title}</p>
                <p className="text-[10px] text-muted">{DECISION_STATUS_LABEL_FA[d.status]}</p>
              </div>
              {dueSoon ? <ToneBadge tone="critical" label="مهلت رسیده" /> : <ToneBadge tone="info" />}
            </div>
          )
        })}
      </div>
    )
  },
}

export const managementActionsWidget: WidgetDefinition<RastaAction[]> = {
  id: 'decision-actions',
  label: 'اقدامات مدیریتی باز',
  category: 'decision',
  description: 'اقدامات پیگیری‌نشده و در حال انجام',
  defaultReportTypes: ['daily', 'weekly', 'monthly', 'management'],
  compute: ({ actions }) => actions.filter((a) => a.status === 'not_started' || a.status === 'in_progress'),
  Render: ({ data }) => {
    if (data.length === 0) return <EmptyWidgetState text="اقدام باز فعالی وجود ندارد" />
    const today = todayIso()
    return (
      <div className="space-y-1.5">
        {data.map((a) => {
          const overdue = a.dueDate !== null && a.dueDate < today
          return (
            <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{a.title}</p>
                <p className="text-[10px] text-muted">
                  {RASTA_ACTION_STATUS_LABEL_FA[a.status]} · اولویت {RASTA_ACTION_PRIORITY_LABEL_FA[a.priority]}
                </p>
              </div>
              {overdue && <ToneBadge tone="critical" label="عقب‌افتاده" />}
            </div>
          )
        })}
      </div>
    )
  },
}
