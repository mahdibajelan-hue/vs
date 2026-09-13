import type { CompetencyAnswers, CompetencyAssessment, CompetencyDomain, CompQuestionBankItem, DomainScore, JobRole, QuestionType } from '../types'
import { tierColor } from './competencyModel'

export { tierColor }

/** Whether this assessment uses the original, fixed, in-code Project Manager rubric
 * (competencyModel.ts) rather than the DB-backed multi-role question bank below. */
export function isProjectManagerRole(jobRole: JobRole): boolean {
  return jobRole === 'project_manager'
}

/**
 * Every question type maps into exactly one of the 4 scoring buckets from the assessment spec
 * (§10): General 20% / Technical 35% / Scenario+Problem-Solving 30% / Professional Judgment
 * (experience-based) 15%. CASE_STUDY and IMAGE_BASED are scenario-shaped in spirit (a described or
 * shown situation requiring interpretation + a decision), so they fold into the scenario bucket.
 */
const CATEGORY_BUCKET: Record<QuestionType, 'roleGeneral' | 'roleTechnical' | 'roleScenario' | 'roleExperience'> = {
  GENERAL: 'roleGeneral',
  TECHNICAL: 'roleTechnical',
  SCENARIO: 'roleScenario',
  PROBLEM_SOLVING: 'roleScenario',
  CASE_STUDY: 'roleScenario',
  IMAGE_BASED: 'roleScenario',
  EXPERIENCE_BASED: 'roleExperience',
}

const BUCKET_DOMAIN: Record<'roleGeneral' | 'roleTechnical' | 'roleScenario' | 'roleExperience', CompetencyDomain> = {
  roleGeneral: {
    key: 'roleGeneral',
    title: 'شایستگی عمومی شغلی',
    shortTitle: 'عمومی شغلی',
    weight: 20,
    description: 'نقش در چرخه پروژه، تعامل با کارفرما/مشاور/پیمانکار، مستندسازی، گزارش‌دهی، مدیریت تغییر و ریسک، اخلاق حرفه‌ای و ایمنی.',
    excellentAnswerHint: 'پاسخ ساختاریافته، مبتنی بر فرآیند مشخص، با ارجاع به مستندسازی و مسئولیت‌پذیری شفاف.',
  },
  roleTechnical: {
    key: 'roleTechnical',
    title: 'دانش و مهارت تخصصی',
    shortTitle: 'تخصصی',
    weight: 35,
    description: 'دانش فنی عمیق حوزه تخصصی و توانایی کاربرد آن در شرایط واقعی پروژه.',
    excellentAnswerHint: 'دقت فنی، ارجاع درست به مشخصات فنی/استاندارد، و تجربه کاربردی به‌جای تعریف صرف.',
  },
  roleScenario: {
    key: 'roleScenario',
    title: 'سناریو و حل مسئله',
    shortTitle: 'سناریو/حل مسئله',
    weight: 30,
    description: 'تحلیل یک موقعیت واقعی پروژه و اتخاذ تصمیم درست، مستدل و مبتنی بر اولویت صحیح (ایمنی/کیفیت/قرارداد/زمان).',
    excellentAnswerHint: 'تشخیص درست مسئله، اقدام فوری صحیح، و در نظر گرفتن مستندسازی و پیامدهای بعدی تصمیم.',
  },
  roleExperience: {
    key: 'roleExperience',
    title: 'تجربه عملی و قضاوت حرفه‌ای',
    shortTitle: 'تجربه/قضاوت',
    weight: 15,
    description: 'شواهد واقعی از تجربه اجرایی، تشخیص درست مسئله در گذشته، اقدام مستند و درس‌آموخته.',
    excellentAnswerHint: 'روایت مشخص و واقعی، با نتیجه قابل اندازه‌گیری و درس‌آموخته صریح — نه پاسخ کلی و غیرقابل راستی‌آزمایی.',
  },
}

export function questionsForAssessment(assessment: Pick<CompetencyAssessment, 'selectedQuestionIds'>, bank: CompQuestionBankItem[]): CompQuestionBankItem[] {
  const ids = new Set(assessment.selectedQuestionIds)
  return bank.filter((q) => ids.has(q.id))
}

/** Category-weighted maturity score for one role's selected question set — shaped exactly like
 * competencyModel.computeDomainScores's output so computeOverallPercent/domainFlags/tierColor and
 * CompetencyRadarChart all work unmodified on either a PM assessment or a role assessment. */
export function computeCategoryScores(questions: CompQuestionBankItem[], answers: CompetencyAnswers): DomainScore[] {
  const buckets: Array<'roleGeneral' | 'roleTechnical' | 'roleScenario' | 'roleExperience'> = ['roleGeneral', 'roleTechnical', 'roleScenario', 'roleExperience']
  return buckets.map((bucketKey) => {
    const bucketQuestions = questions.filter((q) => CATEGORY_BUCKET[q.category] === bucketKey)
    const scores = bucketQuestions.map((q) => answers[q.id]?.score).filter((s): s is number => typeof s === 'number')
    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
    return {
      domain: BUCKET_DOMAIN[bucketKey],
      answeredCount: scores.length,
      totalCount: bucketQuestions.length,
      averageScore,
      percentScore: averageScore != null ? Math.round((averageScore / 5) * 100) : null,
    }
  })
}

export function computeRoleCompletion(questions: CompQuestionBankItem[], answers: CompetencyAnswers): { answered: number; total: number; percent: number } {
  const total = questions.length
  const answered = questions.filter((q) => typeof answers[q.id]?.score === 'number').length
  return { answered, total, percent: total === 0 ? 0 : Math.round((answered / total) * 100) }
}

export type RoleRecommendationGrade = 'A' | 'B' | 'C' | 'D'

export const ROLE_RECOMMENDATION_LABEL_FA: Record<RoleRecommendationGrade, string> = {
  A: 'الف — قویاً توصیه‌شده',
  B: 'ب — توصیه‌شده',
  C: 'ج — توصیه‌شده با برنامه توسعه',
  D: 'د — توصیه‌نشده',
}

export const ROLE_RECOMMENDATION_COLOR: Record<RoleRecommendationGrade, string> = {
  A: '#34d399',
  B: '#38bdf8',
  C: '#fbbf24',
  D: '#f87171',
}

export interface RoleRecommendation {
  grade: RoleRecommendationGrade
  hasCriticalGap: boolean
  reason: string
}

/**
 * Final go/no-go per spec §19 — never a bare average. A category scoring under 30% (once answered)
 * is treated as a critical gap and caps the grade at C regardless of how high the overall average
 * is, because a single collapsed competency area (most often safety- or standards-related) should
 * not be masked by strength elsewhere.
 */
export function recommendationForRole(overallPercent: number | null, categoryScores: DomainScore[]): RoleRecommendation {
  if (overallPercent == null) return { grade: 'D', hasCriticalGap: false, reason: 'هنوز امتیازدهی نشده است.' }
  let grade: RoleRecommendationGrade = overallPercent >= 85 ? 'A' : overallPercent >= 70 ? 'B' : overallPercent >= 50 ? 'C' : 'D'
  const criticalGap = categoryScores.find((d) => d.percentScore != null && (d.percentScore as number) < 30)
  if (criticalGap) {
    if (grade === 'A' || grade === 'B') grade = 'C'
    return {
      grade,
      hasCriticalGap: true,
      reason: `علی‌رغم امتیاز کلی ٪${overallPercent}، حوزه «${criticalGap.domain.title}» امتیاز بسیار پایینی (٪${criticalGap.percentScore}) دارد که به‌عنوان یک نقص حیاتی (Critical Gap) نتیجه نهایی را محدود می‌کند.`,
      }
  }
  return { grade, hasCriticalGap: false, reason: '' }
}

/** Flags a question where evaluators disagreed sharply (max-min gap of 3+ on the 0-5 scale) —
 * shown to the lead so an unusually split panel doesn't get silently averaged away. */
export function hasPanelDivergence(scores: Array<number | null | undefined>): boolean {
  const valid = scores.filter((s): s is number => typeof s === 'number')
  if (valid.length < 2) return false
  return Math.max(...valid) - Math.min(...valid) >= 3
}
