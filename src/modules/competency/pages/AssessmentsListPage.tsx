import { useState } from 'react'
import { ClipboardList, Plus, Trash2, User } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { computeDomainScores, computeOverallPercent, overallRatingLabel } from '../lib/competencyModel'
import { formatJalali } from '../../../lib/jalali'

interface AssessmentsListPageProps {
  onOpen: (id: string) => void
  onNew: () => void
}

export function AssessmentsListPage({ onOpen, onNew }: AssessmentsListPageProps) {
  const assessments = useCompetencyStore((s) => s.assessments)
  const deleteAssessment = useCompetencyStore((s) => s.deleteAssessment)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-lg font-extrabold">مصاحبه‌ها و ارزیابی‌های شایستگی</p>
          <p className="text-xs text-muted">ارزیابی شایستگی مدیران پروژه احداث خطوط لوله انتقال گاز</p>
        </div>
        <button onClick={onNew} className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-400 transition-colors">
          <Plus size={14} /> مصاحبه جدید
        </button>
      </div>

      {assessments.length === 0 ? (
        <div className="glass-panel flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
          <ClipboardList size={28} className="text-muted" />
          <p className="text-sm text-secondary">هنوز مصاحبه‌ای ثبت نشده است.</p>
          <button onClick={onNew} className="mt-2 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-400">
            شروع اولین مصاحبه
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {assessments.map((a) => {
            const domainScores = computeDomainScores(a.answers)
            const overall = computeOverallPercent(domainScores)
            return (
              <div key={a.id} className="glass-panel flex items-center gap-3 rounded-xl p-3.5">
                <button onClick={() => onOpen(a.id)} className="flex flex-1 items-center gap-3 text-right">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300">
                    <User size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{a.candidateName}</p>
                    <p className="truncate text-[11px] text-muted">
                      {a.candidatePosition} · {formatJalali(a.interviewDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-left">
                    <p className="num text-base font-extrabold">{overall != null ? `٪${overall.toLocaleString('fa-IR')}` : '—'}</p>
                    <p className="text-[10px] text-muted">{overall != null ? overallRatingLabel(overall) : 'شروع‌نشده'}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${a.status === 'completed' ? 'bg-green-500/15 text-green-300' : 'bg-amber-500/15 text-amber-300'}`}
                  >
                    {a.status === 'completed' ? 'تکمیل‌شده' : 'در حال انجام'}
                  </span>
                </button>
                <button onClick={() => setConfirmId(a.id)} title="حذف" className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-red-500/10 hover:text-red-300">
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmId(null)}>
          <div className="glass-panel w-full max-w-sm rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold">حذف این ارزیابی؟</p>
            <p className="mt-1 text-xs text-muted">این عمل قابل بازگشت نیست.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmId(null)} className="rounded-lg border border-white/10 px-3.5 py-1.5 text-xs">
                انصراف
              </button>
              <button
                onClick={() => {
                  deleteAssessment(confirmId)
                  setConfirmId(null)
                }}
                className="rounded-lg bg-red-500 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-400"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
