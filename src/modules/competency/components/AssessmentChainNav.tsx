import { ChevronLeft, ChevronRight, Link2 } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { formatJalali } from '../../../lib/jalali'
import type { CompetencyAssessment } from '../types'

/**
 * Reassessment chain links (Phase 5) — previous / next assessment of the same candidate, linked via
 * comp_assessments.previous_assessment_id (a linear chain). Renders nothing for a standalone
 * assessment. The chain position counts back through predecessors present in the local list.
 */
export function AssessmentChainNav({ assessment, onOpen }: { assessment: CompetencyAssessment; onOpen: (id: string) => void }) {
  const assessments = useCompetencyStore((s) => s.assessments)
  const previous = assessment.previousAssessmentId ? assessments.find((a) => a.id === assessment.previousAssessmentId) : undefined
  const next = assessments.find((a) => a.previousAssessmentId === assessment.id)
  if (!assessment.previousAssessmentId && !next) return null

  let position = 1
  let cursor: CompetencyAssessment | undefined = assessment
  const seen = new Set<string>()
  while (cursor?.previousAssessmentId && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    position += 1
    cursor = assessments.find((a) => a.id === cursor!.previousAssessmentId)
  }

  return (
    <div className="flex items-center gap-1 rounded-full border border-sky-400/25 bg-sky-500/10 px-1.5 py-1 text-[10.5px]">
      <Link2 size={12} className="mx-1 text-sky-300" />
      {previous || assessment.previousAssessmentId ? (
        <button
          onClick={() => assessment.previousAssessmentId && onOpen(assessment.previousAssessmentId)}
          disabled={!previous}
          title={previous ? `ارزیابی قبلی — ${formatJalali(previous.interviewDate)}` : 'ارزیابی قبلی در دسترس شما نیست'}
          className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-sky-200 hover:bg-sky-500/20 disabled:opacity-40"
        >
          <ChevronRight size={12} /> قبلی
        </button>
      ) : null}
      <span className="num rounded-full bg-sky-500/20 px-2 py-0.5 font-bold text-sky-100">ارزیابی {position.toLocaleString('fa-IR')}</span>
      {next && (
        <button
          onClick={() => onOpen(next.id)}
          title={`ارزیابی مجدد — ${formatJalali(next.interviewDate)}`}
          className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-sky-200 hover:bg-sky-500/20"
        >
          بعدی <ChevronLeft size={12} />
        </button>
      )}
    </div>
  )
}
