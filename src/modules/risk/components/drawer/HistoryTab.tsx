import { useEffect, useMemo, useState } from 'react'
import { formatJalali } from '../../../../lib/jalali'
import { useRiskStore } from '../../store/useRiskStore'
import { useRiskDirectory } from '../../lib/useRiskData'
import {
  RM_ACTION_STATUS_LABEL_FA, RM_ACTION_TYPE_LABEL_FA, RM_EFFECT_LABEL_FA, RM_ESCALATION_LEVEL_LABEL_FA, RM_ESCALATION_STATUS_LABEL_FA, RM_PROJECT_PHASE_LABEL_FA, RM_RESPONSE_STRATEGY_LABEL_FA, RM_RISK_STATUS_LABEL_FA, RM_RISK_TYPE_LABEL_FA,
  type RmRiskHistoryEntry,
} from '../../types'
import { useCategoryLabel } from '../rk'
import type { TabProps } from './common'

const FIELD_FA: Record<string, string> = {
  owner_id: 'مالک ریسک', monitor_id: 'مسئول پایش', approver_id: 'مرجع تأیید', response_owner_id: 'مسئول اقدامات', status: 'وضعیت', response_strategy: 'راهبرد پاسخ', category: 'دسته‌بندی', subcategory: 'زیردسته',
  risk_type: 'نوع', project_phase: 'مرحله', escalation_status: 'وضعیت ارجاع', escalation_level: 'سطح ارجاع', next_review_date: 'تاریخ بازنگری', review_interval_days: 'فاصلهٔ بازنگری', corporate_risk_id: 'ریسک مادر',
  initial_probability: 'احتمال ذاتی (مدیر سامانه)', initial_impact: 'اثر ذاتی (مدیر سامانه)',
}
const ACT_FA: Record<string, string> = { status: 'وضعیت اقدام', owner_id: 'مسئول اقدام', due_date: 'سررسید اقدام', effect_status: 'نتیجهٔ اثربخشی اقدام', action_type: 'نوع اقدام' }
const SIMPLE: Record<string, string> = {
  risk_created: 'ریسک ثبت شد', assessment_added: 'ارزیابی جدید ثبت شد', comment: 'نظر', kri_breach: 'عبور شاخص هشدار از آستانه', realized_to_issue: 'ریسک محقق شد و به مسئله تبدیل شد',
  acceptance_requested: 'درخواست پذیرش رسمی ریسک باقیمانده', acceptance_approved: 'پذیرش رسمی ریسک باقیمانده تأیید شد', acceptance_rejected: 'پذیرش ریسک باقیمانده رد شد', field_changed: 'تغییر',
}

export function HistoryTab({ risk }: TabProps) {
  const loadExtras = useRiskStore((s) => s.loadRiskExtras)
  const history = useRiskStore((s) => s.historyByRisk[risk.id])
  const dir = useRiskDirectory()
  const catLabel = useCategoryLabel()
  const [limit, setLimit] = useState(40)
  useEffect(() => { if (!history) loadExtras(risk.id) }, [history, loadExtras, risk.id])

  const fmt = useMemo(() => (field: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—'
    const s = String(v)
    if (field.endsWith('_id') && field !== 'corporate_risk_id') return dir.name(s)
    if (field === 'status') return RM_RISK_STATUS_LABEL_FA[s as keyof typeof RM_RISK_STATUS_LABEL_FA] ?? ACTION_STATUS(s)
    if (field === 'response_strategy') return RM_RESPONSE_STRATEGY_LABEL_FA[s as keyof typeof RM_RESPONSE_STRATEGY_LABEL_FA] ?? s
    if (field === 'category' || field === 'subcategory') return catLabel(s)
    if (field === 'risk_type') return RM_RISK_TYPE_LABEL_FA[s as 'threat'] ?? s
    if (field === 'project_phase') return RM_PROJECT_PHASE_LABEL_FA[s as 'engineering'] ?? s
    if (field === 'escalation_status') return RM_ESCALATION_STATUS_LABEL_FA[s as 'none'] ?? s
    if (field === 'escalation_level') return RM_ESCALATION_LEVEL_LABEL_FA[s as 'project_team'] ?? s
    if (field === 'effect_status') return RM_EFFECT_LABEL_FA[s as 'pending'] ?? s
    if (field === 'action_type') return RM_ACTION_TYPE_LABEL_FA[s as 'preventive'] ?? s
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return formatJalali(s.slice(0, 10))
    return s
  }, [dir, catLabel])
  const describe = (h: RmRiskHistoryEntry): string => {
    if (h.activity.startsWith('field:')) { const k = h.activity.slice(6); return `${FIELD_FA[k] ?? k}: «${fmt(k, h.previousValue)}» ← «${fmt(k, h.newValue)}»` }
    if (h.activity.startsWith('action:')) { const k = h.activity.slice(7); return `${ACT_FA[k] ?? k}: «${fmt(k, h.previousValue)}» ← «${fmt(k, h.newValue)}» — ${h.comment}` }
    return SIMPLE[h.activity] ?? h.activity
  }
  const color = (a: string) => (a.startsWith('field:status') ? '#a855f7' : a.includes('acceptance') ? '#0ea5e9' : a === 'kri_breach' || a === 'realized_to_issue' ? '#ef4444' : a === 'assessment_added' ? '#22c55e' : a === 'comment' ? '#64748b' : 'var(--im-accent)')

  if (!history) return <div className="im-skeleton" style={{ height: 120 }} />
  if (!history.length) return <div className="im-empty">تاریخچه‌ای ثبت نشده است.</div>
  return (
    <div>
      <div className="rk-timeline">
        {history.slice(0, limit).map((h) => (
          <div key={h.id} className="rk-tl" style={{ ['--c' as string]: color(h.activity) }}>
            <div><b>{describe(h)}</b>{!h.activity.startsWith('action:') && h.comment ? <span> — {h.comment}</span> : null}</div>
            <time>{formatJalali(h.createdAt.slice(0, 10))} · {h.createdAt.slice(11, 16)} · {dir.name(h.userId)}</time>
          </div>
        ))}
      </div>
      {history.length > limit && <button className="im-ghostlink" style={{ marginTop: 10 }} onClick={() => setLimit((l) => l + 60)}>نمایش بیشتر ({history.length - limit})</button>}
    </div>
  )
}
const ACTION_STATUS = (s: string) => RM_ACTION_STATUS_LABEL_FA[s as keyof typeof RM_ACTION_STATUS_LABEL_FA] ?? s
