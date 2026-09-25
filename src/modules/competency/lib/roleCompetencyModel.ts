import type { CompetencyAnswers, CompetencyAssessment, CompetencyDomain, CompPanelistScore, CompQuestionBankItem, DomainScore, JobRole, QuestionType } from '../types'
import { COMPETENCY_QUESTIONS, tierColor } from './competencyModel'

export { tierColor }

/**
 * The "official" answer set for an assessment is the panel's own average, not whatever the lead
 * typed into the shared comp_assessments row — every judge scores independently (comp_panelist_
 * scores), and the final per-question score is the average across every judge who has submitted.
 * Falls back to the assessment's own answers only when no panelist has submitted yet (a solo lead
 * scoring with no panel assigned), so nothing silently loses a score. Notes/candidate-answer text
 * come from the assessment row first (the lead's transcript) and otherwise from whichever
 * submitted sheet has one, since the score itself — not the note — is what gets averaged.
 */
export function resolveOfficialAnswers(fallbackAnswers: CompetencyAnswers, panelistScores: CompPanelistScore[]): CompetencyAnswers {
  const submitted = panelistScores.filter((s) => s.submittedAt != null)
  if (submitted.length === 0) return fallbackAnswers

  const keys = new Set<string>(Object.keys(fallbackAnswers))
  submitted.forEach((s) => Object.keys(s.answers).forEach((k) => keys.add(k)))

  const result: CompetencyAnswers = {}
  keys.forEach((key) => {
    const scores = submitted.map((s) => s.answers[key]?.score).filter((v): v is number => typeof v === 'number')
    const score = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : (fallbackAnswers[key]?.score ?? null)
    const note = fallbackAnswers[key]?.note ?? submitted.find((s) => s.answers[key]?.note)?.answers[key]?.note ?? ''
    const candidateAnswer = fallbackAnswers[key]?.candidateAnswer ?? submitted.find((s) => s.answers[key]?.candidateAnswer)?.answers[key]?.candidateAnswer
    result[key] = { score, note, candidateAnswer }
  })
  return result
}

/** Same official-vs-fallback principle as resolveOfficialAnswers, applied to the legacy PM rubric's
 * single capstone scenario score/note (not part of the keyed answers map, so it needs its own
 * resolution). */
export function resolveOfficialCapstone(
  fallbackScore: number | null,
  fallbackNote: string,
  panelistScores: CompPanelistScore[],
): { score: number | null; note: string } {
  const submitted = panelistScores.filter((s) => s.submittedAt != null)
  if (submitted.length === 0) return { score: fallbackScore, note: fallbackNote }
  const scores = submitted.map((s) => s.capstoneScore).filter((v): v is number => typeof v === 'number')
  const score = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : fallbackScore
  const note = fallbackNote || submitted.find((s) => s.capstoneNote)?.capstoneNote || ''
  return { score, note }
}

type QualificationFields = Pick<CompetencyAssessment, 'educationScore' | 'experienceScore' | 'pmTrainingScore' | 'pmCertificationScore'>
const QUALIFICATION_KEYS: (keyof QualificationFields)[] = ['educationScore', 'experienceScore', 'pmTrainingScore', 'pmCertificationScore']

/** Same averaging principle as resolveOfficialAnswers, applied to the four qualification-scorecard
 * components — each judge scores their own copy, and the official value per component is the
 * average across whichever judges actually filled that one in (falls back to the legacy
 * assessment-level value when no judge has scored that component at all). */
export function resolveOfficialQualificationScores(assessment: QualificationFields, panelistScores: CompPanelistScore[]): QualificationFields {
  const submitted = panelistScores.filter((s) => s.submittedAt != null)
  const result = {} as QualificationFields
  QUALIFICATION_KEYS.forEach((key) => {
    const values = submitted.map((s) => s[key]).filter((v): v is number => typeof v === 'number')
    result[key] = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : assessment[key]
  })
  return result
}

/** Whether this assessment uses the original, fixed, in-code Project Manager rubric
 * (competencyModel.ts) rather than the DB-backed multi-role question bank below. */
export function isProjectManagerRole(jobRole: JobRole): boolean {
  return jobRole === 'project_manager'
}

/**
 * Project Manager candidates now go through the same DB-backed question bank + Assessment Designer
 * as every other role — the fixed in-code rubric (competencyModel.ts) is kept ONLY to keep already-
 * scored legacy PM assessments (recorded before this change) rendering exactly as they always have.
 * A PM assessment falls back to the legacy rubric when it truly has no bank selection AND already
 * carries real answers under the fixed rubric's own question keys (governance-1, etc.) — never for
 * a brand-new PM assessment, which instead sees the normal "select questions from the bank" flow.
 */
export function usesLegacyPmRubric(assessment: Pick<CompetencyAssessment, 'jobRole' | 'selectedQuestionIds' | 'answers'>): boolean {
  if (!isProjectManagerRole(assessment.jobRole)) return false
  if (assessment.selectedQuestionIds.length > 0) return false
  return COMPETENCY_QUESTIONS.some((q) => assessment.answers[q.key] != null)
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
  // HSE and behavioral/conduct questions are general-job-competency in spirit (roleGeneral's own
  // description already covers "اخلاق حرفه‌ای و ایمنی"); professional-judgment questions belong
  // with the same bucket as experience-based ones per the §10 "Professional Judgment
  // (experience-based) 15%" bucket definition above.
  HSE: 'roleGeneral',
  BEHAVIORAL: 'roleGeneral',
  JUDGMENT: 'roleExperience',
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

// Competency Fingerprint (spec section 14/15): extra, purely-informational dimensions computed
// directly from a single question category's own scores — zero weight, so merging these into a
// radar chart or KPI grid alongside the 4 weighted buckets never changes computeOverallPercent or
// recommendationForRole, which keep reading only the original weighted DomainScore[].
const EXTENDED_FINGERPRINT_DOMAINS: Record<'roleHse' | 'roleBehavioral' | 'roleJudgment', CompetencyDomain> = {
  roleHse: {
    key: 'roleHse',
    title: 'آگاهی HSE',
    shortTitle: 'HSE',
    weight: 0,
    description: 'شناخت و رعایت الزامات ایمنی، بهداشت و محیط‌زیست.',
    excellentAnswerHint: 'شناخت دقیق ریسک‌ها و رویه‌های کنترلی، با نمونه عملی مشخص.',
  },
  roleBehavioral: {
    key: 'roleBehavioral',
    title: 'شایستگی رفتاری',
    shortTitle: 'رفتاری',
    weight: 0,
    description: 'رفتار حرفه‌ای، ارتباط مؤثر و تعامل تیمی.',
    excellentAnswerHint: 'مثال واقعی از رفتار حرفه‌ای با نتیجه قابل‌مشاهده.',
  },
  roleJudgment: {
    key: 'roleJudgment',
    title: 'قضاوت حرفه‌ای',
    shortTitle: 'قضاوت',
    weight: 0,
    description: 'توانایی تصمیم‌گیری درست در شرایط مبهم یا پرریسک.',
    excellentAnswerHint: 'تشخیص درست اولویت و تصمیم مستدل با در نظر گرفتن پیامدها.',
  },
}

/** Computes the 3 extra Competency Fingerprint dimensions (HSE/Behavioral/Judgment) directly from
 * their own question category's scores — display-only, see the module-level comment above. Callers
 * should filter out entries with totalCount === 0 (a role whose mix never used that question type)
 * before rendering. */
export function computeExtendedFingerprint(questions: CompQuestionBankItem[], answers: CompetencyAnswers): DomainScore[] {
  const buckets: Array<{ key: 'roleHse' | 'roleBehavioral' | 'roleJudgment'; category: QuestionType }> = [
    { key: 'roleHse', category: 'HSE' },
    { key: 'roleBehavioral', category: 'BEHAVIORAL' },
    { key: 'roleJudgment', category: 'JUDGMENT' },
  ]
  return buckets.map(({ key, category }) => {
    const bucketQuestions = questions.filter((q) => q.category === category)
    const scores = bucketQuestions.map((q) => answers[q.id]?.score).filter((s): s is number => typeof s === 'number')
    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
    return {
      domain: EXTENDED_FINGERPRINT_DOMAINS[key],
      answeredCount: scores.length,
      totalCount: bucketQuestions.length,
      averageScore,
      percentScore: averageScore != null ? Math.round((averageScore / 5) * 100) : null,
    }
  })
}

export function questionsForAssessment(assessment: Pick<CompetencyAssessment, 'selectedQuestionIds'>, bank: CompQuestionBankItem[]): CompQuestionBankItem[] {
  const ids = new Set(assessment.selectedQuestionIds)
  return bank.filter((q) => ids.has(q.id))
}

/** Category-weighted maturity score for one role's selected question set — shaped exactly like
 * competencyModel.computeDomainScores's output so computeOverallPercent/domainFlags/tierColor and
 * CompetencyRadarChart all work unmodified on either a PM assessment or a role assessment. */
export function computeCategoryScores(questions: Pick<CompQuestionBankItem, 'id' | 'category'>[], answers: CompetencyAnswers): DomainScore[] {
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
