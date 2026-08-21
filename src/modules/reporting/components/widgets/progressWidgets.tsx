import { computeProjectKpis, type ProjectKpis } from '../../../../lib/progress'
import type { Milestone } from '../../../../types'
import type { WidgetDefinition } from '../../lib/widgetTypes'
import { EmptyWidgetState, UnmappedNotice } from '../ui'

const LINE_STATUS_ROWS: { key: keyof Pick<ProjectKpis, 'completedLines' | 'inProgressLines' | 'testingLines' | 'notStartedLines'>; label: string; color: string }[] = [
  { key: 'completedLines', label: 'تکمیل‌شده', color: '#2ecc71' },
  { key: 'inProgressLines', label: 'در حال اجرا', color: '#38bdf8' },
  { key: 'testingLines', label: 'تست هیدرواستاتیک', color: '#a78bfa' },
  { key: 'notStartedLines', label: 'شروع‌نشده', color: '#64748b' },
]

export const progressLinesWidget: WidgetDefinition<ProjectKpis | null> = {
  id: 'progress-lines',
  label: 'وضعیت خطوط پایپینگ',
  category: 'progress',
  description: 'توزیع خطوط بر اساس وضعیت اجرا',
  defaultReportTypes: ['daily', 'weekly', 'monthly', 'management'],
  compute: ({ bundle }) => (bundle.pipepulse ? computeProjectKpis(bundle.pipepulse.project) : null),
  Render: ({ data }) => {
    if (data === null) return <UnmappedNotice moduleLabel="PipePulse" />
    if (data.lineCount === 0) return <EmptyWidgetState text="هنوز خطی برای این پروژه ثبت نشده است" />
    return (
      <div className="space-y-2">
        {LINE_STATUS_ROWS.map(({ key, label, color }) => {
          const count = data[key]
          const pct = data.lineCount > 0 ? Math.round((count / data.lineCount) * 100) : 0
          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-secondary">{label}</span>
                <span className="text-muted">
                  {count} خط ({pct}%)
                </span>
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

export const progressMilestonesWidget: WidgetDefinition<Milestone[] | null> = {
  id: 'progress-milestones',
  label: 'مراحل کلی پروژه (مایلستون‌ها)',
  category: 'progress',
  description: 'بر اساس درصد پیشرفت هر مایلستون — این نسخه فاقد تاریخ مقرر است، پس صرفاً درصد نمایش داده می‌شود، نه وضعیت زمان‌بندی',
  defaultReportTypes: ['weekly', 'monthly', 'management'],
  compute: ({ bundle }) => bundle.pipepulse?.project.milestones ?? null,
  Render: ({ data }) => {
    if (data === null) return <UnmappedNotice moduleLabel="PipePulse" />
    if (data.length === 0) return <EmptyWidgetState text="مایلستونی تعریف نشده است" />
    return (
      <div className="flex flex-wrap gap-3">
        {data.map((m) => (
          <div key={m.id} className="flex min-w-[110px] flex-1 flex-col items-center gap-1.5 rounded-xl border border-white/10 p-2.5 text-center">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-full" style={{ background: `conic-gradient(${m.color} ${m.percentComplete * 3.6}deg, rgba(255,255,255,0.08) 0deg)` }}>
              <div className="flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: 'var(--bg-panel-solid)' }}>
                {m.percentComplete}%
              </div>
            </div>
            <p className="text-[10px] leading-4 text-secondary">{m.label}</p>
          </div>
        ))}
      </div>
    )
  },
}
