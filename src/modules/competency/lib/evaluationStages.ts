import type { CompetencyAssessment } from '../types'

export interface EvaluationStage {
  label: string
  done: boolean
  date: string | null
}

/** The five real, observable milestones of one candidate's evaluation — shared by the compact
 * header strip (every page) and the full results report, so both always agree. Every "done" here
 * reflects something actually recorded on the assessment; a step with no reliable date just omits
 * one rather than inventing a timestamp. */
export function computeEvaluationStages(
  assessment: CompetencyAssessment,
  completionPercent: number,
  panelistsCount: number,
  submittedScoresCount: number,
): EvaluationStage[] {
  return [
    { label: 'ثبت رزومه', done: true, date: assessment.createdAt },
    { label: 'غربالگری اولیه', done: assessment.selfServiceStatus === 'submitted' || assessment.selfServiceStatus === 'reviewed', date: null },
    { label: 'پاسخ به سؤالات', done: completionPercent === 100, date: assessment.interviewDate || null },
    { label: 'امتیازدهی پنل', done: panelistsCount > 0 && submittedScoresCount === panelistsCount, date: null },
    { label: 'ثبت نهایی', done: assessment.status === 'completed', date: assessment.status === 'completed' ? assessment.reviewedAt || assessment.updatedAt : null },
  ]
}
