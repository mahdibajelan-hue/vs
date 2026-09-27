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
  // N-11: screening is done once the candidate's background is on file — through the self-service
  // form OR entered by staff — and the question/panel steps follow the exam design: a design
  // without the technical test marks them "not in design" instead of leaving them open forever.
  const hasBackground =
    assessment.yearsExperienceTotal != null ||
    assessment.yearsExperiencePipeline != null ||
    assessment.education.length > 0 ||
    assessment.employmentHistory.length > 0 ||
    assessment.certifications.length > 0
  const technical = assessment.needsTechnicalAssessment
  return [
    { label: 'ثبت رزومه', done: true, date: assessment.createdAt },
    {
      label: 'غربالگری اولیه',
      done: assessment.selfServiceStatus === 'submitted' || assessment.selfServiceStatus === 'reviewed' || hasBackground,
      date: assessment.reviewedAt,
    },
    technical
      ? { label: 'پاسخ به سؤالات', done: completionPercent === 100, date: assessment.interviewDate || null }
      : { label: 'پاسخ به سؤالات (خارج از طرح)', done: true, date: null },
    technical || panelistsCount > 0
      ? {
          label: 'امتیازدهی پنل',
          // No panel assigned = the lead scores alone, so the step follows the question completion.
          done: panelistsCount > 0 ? submittedScoresCount >= panelistsCount : completionPercent === 100,
          date: null,
        }
      : { label: 'امتیازدهی پنل (خارج از طرح)', done: true, date: null },
    { label: 'ثبت نهایی', done: assessment.status === 'completed', date: assessment.status === 'completed' ? assessment.reviewedAt || assessment.updatedAt : null },
  ]
}
