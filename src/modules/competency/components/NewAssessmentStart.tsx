import { useState } from 'react'
import { ArrowLeft, Briefcase } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'

/**
 * First step of starting a new interview: pick which job position the candidate is being
 * evaluated for. This determines which question bank (comp_questions) they'll be scored against,
 * so it's chosen once, up front — not a free-text field mixed into the candidate's personal
 * details (see ProfileForm), and not editable afterward without invalidating already-scored answers.
 */
export function NewAssessmentStart({ onContinue }: { onContinue: (jobPositionId: string) => void }) {
  const jobPositions = useCompetencyStore((s) => s.jobPositions).filter((p) => p.isActive)
  const [selected, setSelected] = useState('')

  return (
    <div className="glass-panel space-y-4 rounded-2xl p-5">
      <p className="flex items-center gap-1.5 text-sm font-bold">
        <Briefcase size={15} className="text-purple-300" /> سمت مورد ارزیابی
      </p>
      <p className="text-[11px] leading-5 text-muted">
        این مصاحبه برای کدام شغل برگزار می‌شود؟ سوالات مصاحبه بر اساس این انتخاب نمایش داده می‌شوند.
      </p>
      {jobPositions.length === 0 ? (
        <p className="text-[11px] text-amber-300">هنوز هیچ شغلی در فهرست ثبت نشده است — ابتدا از بخش «بانک سوالات» یک شغل اضافه کنید.</p>
      ) : (
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="input">
          <option value="">انتخاب شغل…</option>
          {jobPositions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        disabled={!selected}
        onClick={() => onContinue(selected)}
        className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ادامه و ثبت مشخصات نامزد <ArrowLeft size={14} />
      </button>
    </div>
  )
}
