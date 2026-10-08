import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Lock, X } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import type { CompetencyAssessment } from '../types'

export interface FinalizeChecklist {
  /** Panel members whose own sheet is not yet final — their scores are NOT in the official average. */
  pendingPanelists: string[]
  /** Technical questions (or legacy PM rubric items) without an official score. */
  unscoredQuestions: number
  totalQuestions: number
  /** The design includes the personality test but it has no scored result yet. */
  personalityUnfinished: boolean
}

/**
 * «ثبت نهایی ارزیابی» confirmation (demo-test-report M-6). Summarizes what is still missing before
 * the assessment is locked — none of it hard-blocks (a lead may legitimately finalize with a panelist
 * who never showed up), but the lead has to see it first. Completing makes the scores, interview
 * ratings, question selection and exam design immutable in the database (schema.sql Section 53);
 * only a module admin's «بازگشایی» lifts that again.
 */
export function FinalizeAssessmentDialog({
  assessment,
  checklist,
  onCancel,
  onConfirm,
}: {
  assessment: CompetencyAssessment
  checklist: FinalizeChecklist
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const interviewRatings = useCompetencyStore((s) => s.interviewRatings)
  const fetchInterviewRatings = useCompetencyStore((s) => s.fetchInterviewRatings)
  const [ratingsLoaded, setRatingsLoaded] = useState(!assessment.needsStructuredInterview)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!assessment.needsStructuredInterview) return
    fetchInterviewRatings(assessment.id).then(() => setRatingsLoaded(true))
  }, [assessment.id, assessment.needsStructuredInterview, fetchInterviewRatings])

  const interviewMissing = assessment.needsStructuredInterview && ratingsLoaded && !interviewRatings.some((r) => r.assessmentId === assessment.id)

  const warnings: string[] = []
  if (checklist.pendingPanelists.length > 0) {
    warnings.push(
      `${checklist.pendingPanelists.length.toLocaleString('fa-IR')} داور هنوز «ثبت نهایی» نکرده‌اند (${checklist.pendingPanelists.join('، ')}) — امتیاز آن‌ها در میانگین رسمی حساب نمی‌شود و پس از ثبت نهایی دیگر نمی‌توانند ثبت کنند.`,
    )
  }
  if (assessment.needsTechnicalAssessment && checklist.totalQuestions > 0 && checklist.unscoredQuestions > 0) {
    warnings.push(
      `${checklist.unscoredQuestions.toLocaleString('fa-IR')} سؤال از ${checklist.totalQuestions.toLocaleString('fa-IR')} سؤال فنی امتیاز رسمی ندارد.`,
    )
  }
  if (assessment.needsTechnicalAssessment && checklist.totalQuestions === 0) {
    warnings.push('آزمون فنی در طرح است ولی هیچ سؤالی برای این متقاضی انتخاب/امتیازدهی نشده است.')
  }
  if (checklist.personalityUnfinished) {
    warnings.push('آزمون شخصیت در طرح است ولی متقاضی آن را کامل نکرده یا نتیجه‌ی آن هنوز محاسبه نشده است.')
  }
  if (interviewMissing) {
    warnings.push('مصاحبه‌ی ساختاریافته در طرح است ولی هیچ ارزیابی هنوز امتیاز مصاحبه ثبت نکرده است.')
  }

  const handleConfirm = async () => {
    setSaving(true)
    await onConfirm()
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4" onClick={onCancel}>
      <div className="flex min-h-full items-start justify-center py-6 sm:items-center sm:py-10">
        <div className="glass-panel w-full max-w-lg rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <Lock size={15} className="text-green-300" /> ثبت نهایی ارزیابی — {assessment.candidateName}
            </p>
            <button onClick={onCancel} className="text-muted hover:text-primary">
              <X size={16} />
            </button>
          </div>

          {!ratingsLoaded ? (
            <div className="flex items-center gap-2 p-3 text-[11px] text-muted">
              <Loader2 size={13} className="animate-spin" /> در حال بررسی وضعیت مراحل…
            </div>
          ) : warnings.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-[11px] leading-6 text-amber-100">
              <p className="flex items-center gap-1.5 font-bold">
                <AlertTriangle size={14} /> پیش از ثبت نهایی به این موارد توجه کنید:
              </p>
              <ul className="list-disc space-y-1 pr-4">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-[11px] text-emerald-200">
              <CheckCircle2 size={14} /> همه‌ی مراحل طرح آزمون تکمیل شده است.
            </div>
          )}

          <p className="mt-3 text-[11px] leading-6 text-secondary">
            پس از ثبت نهایی، امتیاز داوران، امتیازهای مصاحبه، سؤالات انتخاب‌شده و طرح آزمون این متقاضی قفل می‌شود و پروفایل شایستگی دیگر خودکار بازمحاسبه نمی‌شود.
            اصلاح بعدی فقط با «بازگشایی» توسط ادمین ماژول ممکن است (این اقدام در گزارش رویدادها ثبت می‌شود).
          </p>

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-white/10 pt-3">
            <button onClick={onCancel} className="rounded-xl border border-white/10 px-3.5 py-2 text-xs text-secondary hover:bg-white/5">
              انصراف
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || !ratingsLoaded}
              className="flex items-center gap-1.5 rounded-xl bg-green-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-green-400 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {warnings.length > 0 ? 'ثبت نهایی با وجود هشدارها' : 'ثبت نهایی'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
