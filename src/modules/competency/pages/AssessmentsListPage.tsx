import { useEffect, useState } from 'react'
import { ClipboardList, Plus, Trash2, User } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { computeDomainScores, computeOverallPercent, maturityBand } from '../lib/competencyModel'
import { getCompDocSignedUrl } from '../lib/compStorage'
import { formatJalali } from '../../../lib/jalali'
import { ApprovalMedal } from '../components/ApprovalMedal'
import type { CompetencyAssessment } from '../types'

interface AssessmentsListPageProps {
  onOpen: (id: string) => void
  onNew: () => void
}

export function AssessmentsListPage({ onOpen, onNew }: AssessmentsListPageProps) {
  const assessments = useCompetencyStore((s) => s.assessments)
  const deleteAssessment = useCompetencyStore((s) => s.deleteAssessment)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-lg font-extrabold">مصاحبه‌ها و ارزیابی‌های شایستگی</p>
          <p className="text-xs text-muted">ارزیابی شایستگی مدیران پروژه احداث خطوط لوله انتقال گاز</p>
        </div>
        <button onClick={onNew} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400 transition-colors">
          <Plus size={14} /> مصاحبه جدید
        </button>
      </div>

      {assessments.length === 0 ? (
        <div className="glass-panel flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
          <ClipboardList size={28} className="text-muted" />
          <p className="text-sm text-secondary">هنوز مصاحبه‌ای ثبت نشده است.</p>
          <button onClick={onNew} className="mt-2 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400">
            شروع اولین مصاحبه
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assessments.map((a) => (
            <CandidateCard key={a.id} assessment={a} onOpen={() => onOpen(a.id)} onDelete={() => setConfirmId(a.id)} />
          ))}
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

function CandidateCard({ assessment: a, onOpen, onDelete }: { assessment: CompetencyAssessment; onOpen: () => void; onDelete: () => void }) {
  const domainScores = computeDomainScores(a.answers)
  const overall = computeOverallPercent(domainScores)
  const band = maturityBand(overall)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (a.photoUrl) getCompDocSignedUrl(a.photoUrl).then((u) => active && setPhotoUrl(u))
    return () => {
      active = false
    }
  }, [a.photoUrl])

  const tier = overall == null ? '#6b7280' : overall >= 75 ? '#34d399' : overall >= 60 ? '#fbbf24' : '#f87171'

  return (
    <div
      className="glass-panel group relative overflow-hidden rounded-xl border-r-[3px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_26px_-10px_rgba(168,85,247,0.4)]"
      style={{ borderRightColor: tier }}
    >
      <button onClick={onOpen} className="flex w-full flex-col items-center gap-1.5 p-2.5 pt-3 text-center">
        <div className="relative">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 border-purple-400/30 bg-purple-500/10 text-purple-300">
            {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : <User size={17} />}
          </div>
          {a.isApproved && (
            <span className="absolute -bottom-1.5 -left-1.5">
              <ApprovalMedal size="sm" />
            </span>
          )}
        </div>
        <div className="min-w-0 w-full">
          <p className="truncate text-[12.5px] font-bold">{a.candidateName}</p>
          <p className="truncate text-[10px] text-muted">{a.candidatePosition}</p>
        </div>
        <div className="mt-0.5 flex items-center gap-1">
          <span className="num text-sm font-extrabold" style={{ color: tier }}>
            {overall != null ? `٪${overall.toLocaleString('fa-IR')}` : '—'}
          </span>
          <span className="text-[9.5px] text-muted">{band.label}</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1">
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${a.status === 'completed' ? 'bg-green-500/15 text-green-300' : 'bg-amber-500/15 text-amber-300'}`}
          >
            {a.status === 'completed' ? 'تکمیل‌شده' : 'در حال انجام'}
          </span>
          <span className="text-[9px] text-muted">{formatJalali(a.interviewDate)}</span>
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        title="حذف"
        className="absolute left-1 top-1 rounded-lg p-1 text-muted opacity-0 hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}
