import { useMemo } from 'react'
import { useDsStore } from '../store/useDsStore'
import { evaluate, type Result } from './engine'
import type { MethodKey } from './bank'

export const STATUS_FA: Record<string, string> = { draft: 'پیش‌نویس', analysed: 'تحلیل‌شده', in_review: 'در انتظار تصمیم', approved: 'تصویب‌شده', rejected: 'ردشده' }
export const DECISION_FA: Record<string, string> = { submitted: 'ارسال برای تصمیم', approve: 'تصویب', approve_override: 'تصویب با تصمیم متفاوت از پیشنهاد', return: 'برگشت برای اصلاح', reject: 'رد', reopen: 'بازگشایی' }
export const fa = (n: number | null | undefined, d = 0) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('fa-IR', { maximumFractionDigits: d }))
export const nameOf = (r: Result | null, k: MethodKey | string | null) => (k && r ? r.options.find((o) => o.key === k)?.fa ?? String(k) : '—')

/** the active study, its draft, the engine's live result on the draft and the latest saved version */
export function useLive() {
  const st = useDsStore()
  const study = st.studies.find((s) => s.id === st.activeId) ?? null
  const versions = st.versions.filter((v) => v.studyId === study?.id)
  const current = versions.find((v) => v.version === study?.currentVersion) ?? null
  const live = useMemo(() => (st.draft ? evaluate({ answers: st.draft.answers, weights: st.draft.weights, registerRisks: st.pre?.risks ?? [] }) : null), [st.draft, st.pre])
  const locked = !!study && (study.status === 'in_review' || study.status === 'approved')
  const canEdit = st.caps.admin || st.caps.edit || st.caps.create
  /** what to show: the draft's live result while editing; the frozen version once locked */
  const shown = locked && current ? current.result : live
  return { st, study, versions, current, live, shown, locked, canEdit }
}
