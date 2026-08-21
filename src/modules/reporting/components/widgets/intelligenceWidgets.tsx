import { computeEarlyWarnings, computeExecutiveInsight, computeManagementAttention, computeWhatChanged, type AttentionItem, type ChangeItem, type EarlyWarning, type InsightStatement } from '../../lib/intelligence'
import type { WidgetDefinition } from '../../lib/widgetTypes'
import { EmptyWidgetState, ToneBadge } from '../ui'

export const whatChangedWidget: WidgetDefinition<ChangeItem[]> = {
  id: 'intel-what-changed',
  label: 'چه چیزی تغییر کرده؟',
  category: 'intelligence',
  description: 'مقایسه خودکار وضعیت فعلی با آخرین بار',
  defaultReportTypes: ['daily', 'weekly', 'monthly', 'management'],
  compute: ({ bundle, previousBundle }) => computeWhatChanged(bundle, previousBundle),
  Render: ({ data }) => {
    if (data.length === 0) return <EmptyWidgetState text="نسبت به بار قبل تغییر قابل‌توجهی ثبت نشده است" />
    return (
      <div className="space-y-1.5">
        {data.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-1.5">
            <p className="text-xs font-medium">{c.label}</p>
            <div className="flex items-center gap-1.5 text-[11px]" dir="ltr">
              <span className="text-muted">{c.previous}</span>
              <span className="text-muted">→</span>
              <span className="font-bold" style={{ color: c.tone === 'good' ? '#2ecc71' : c.tone === 'critical' ? '#e74c3c' : '#f1c40f' }}>
                {c.current}
              </span>
            </div>
          </div>
        ))}
      </div>
    )
  },
}

export const earlyWarningWidget: WidgetDefinition<EarlyWarning[]> = {
  id: 'intel-early-warning',
  label: 'هشدار زودهنگام',
  category: 'intelligence',
  description: 'قوانین خودکار تشخیص ریسک‌های پیش‌رو',
  defaultReportTypes: ['weekly', 'monthly', 'management'],
  compute: ({ bundle }) => computeEarlyWarnings(bundle),
  Render: ({ data }) => {
    if (data.length === 0) return <EmptyWidgetState text="هشدار فعالی وجود ندارد" />
    return (
      <div className="space-y-2">
        {data.map((w) => (
          <div key={w.id} className="rounded-lg border border-white/10 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold">{w.warning}</p>
              <ToneBadge tone={w.severity} />
            </div>
            <p className="mt-1 text-[10px] text-muted">{w.explanation}</p>
            <p className="mt-1 text-[10px] text-secondary">اقدام پیشنهادی: {w.recommendedAction}</p>
            <p className="mt-1 text-[9px] text-muted">منبع: {w.source}</p>
          </div>
        ))}
      </div>
    )
  },
}

export const managementAttentionWidget: WidgetDefinition<AttentionItem[]> = {
  id: 'intel-management-attention',
  label: 'موارد نیازمند توجه مدیریت',
  category: 'intelligence',
  description: 'مهم‌ترین موارد میان‌ماژولی، رتبه‌بندی‌شده بر اساس شدت',
  defaultReportTypes: ['daily', 'weekly', 'monthly', 'management'],
  compute: ({ bundle }) => computeManagementAttention(bundle),
  Render: ({ data }) => {
    if (data.length === 0) return <EmptyWidgetState text="در حال حاضر موردی نیازمند توجه فوری نیست" />
    return (
      <div className="space-y-1.5">
        {data.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{item.title}</p>
              <p className="text-[10px] text-muted">{item.reason}</p>
            </div>
            <ToneBadge tone={item.severity} />
          </div>
        ))}
      </div>
    )
  },
}

export const executiveInsightWidget: WidgetDefinition<InsightStatement[]> = {
  id: 'intel-executive-insight',
  label: 'خلاصه هوشمند اجرایی',
  category: 'intelligence',
  description: 'روایت خودکار مبتنی بر داده — هر جمله مستقیماً از یک شاخص محاسبه‌شده استخراج شده و قابل ردیابی به منبع است',
  defaultReportTypes: ['management'],
  compute: ({ bundle }) => computeExecutiveInsight(bundle),
  Render: ({ data }) => (
    <div className="space-y-2">
      {data.map((s) => (
        <div key={s.id} className="flex items-start gap-2 rounded-lg border border-white/10 p-2.5">
          <ToneBadge tone={s.tone} />
          <div className="min-w-0">
            <p className="text-xs leading-6">{s.text}</p>
            <p className="text-[9px] text-muted">منبع: {s.sourceLabel}</p>
          </div>
        </div>
      ))}
    </div>
  ),
}
