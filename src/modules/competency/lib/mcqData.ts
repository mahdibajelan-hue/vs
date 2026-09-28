import { supabase } from '../../../lib/supabaseClient'
import type { JobRole, QuestionApprovalStatus, QuestionType } from '../types'

/**
 * Online technical multiple-choice test («آزمون تستی آنلاین», schema.sql Section 56).
 *
 * Staff read the bank through RLS (comp_mcq_questions) and a test's full detail — including every
 * question's correct option — through comp_mcq_get_test_detail. The anonymous candidate only ever
 * talks to the comp_mcq_candidate_* token RPCs, which never return the correct option, the
 * explanation, the topic or the category.
 */

/** Categories an MCQ can carry — the same keys the in-person bank uses, so a topic's result feeds
 * the competencies that already read that category (TECHNICAL_MCQ evidence source). */
export const MCQ_CATEGORIES = ['TECHNICAL', 'GENERAL', 'HSE', 'SCENARIO', 'PROBLEM_SOLVING', 'CASE_STUDY', 'JUDGMENT'] as const satisfies readonly QuestionType[]
export type McqCategory = (typeof MCQ_CATEGORIES)[number]

export type McqDifficulty = 1 | 2 | 3
export const MCQ_DIFFICULTY_LABEL_FA: Record<McqDifficulty, string> = { 1: 'ساده', 2: 'متوسط', 3: 'دشوار' }
export const MCQ_DIFFICULTY_COLOR: Record<McqDifficulty, string> = { 1: '#34d399', 2: '#fbbf24', 3: '#f87171' }

/** Persian option letters (the candidate sees options in a per-test random order, so these are only
 * display labels for the position, never tied to the stored option index). */
export const MCQ_OPTION_LETTERS = ['الف', 'ب', 'ج', 'د'] as const

export type McqTestStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'SCORED'
export const MCQ_TEST_STATUS_LABEL_FA: Record<McqTestStatus, string> = {
  NOT_STARTED: 'آماده؛ شروع‌نشده',
  IN_PROGRESS: 'در حال پاسخ‌گویی',
  SUBMITTED: 'ثبت‌شده',
  SCORED: 'تصحیح‌شده',
}

export interface McqQuestion {
  id: string
  jobRole: JobRole
  category: McqCategory
  topic: string
  difficulty: McqDifficulty
  stemFa: string
  options: string[]
  correctOption: number
  explanationFa: string
  standardRef: string
  approvalStatus: QuestionApprovalStatus
  active: boolean
  version: number
  usageCount: number
  updatedAt: string
}

interface McqQuestionRow {
  id: string
  job_role: string
  category: string
  topic: string
  difficulty: number
  stem_fa: string
  options: string[]
  correct_option: number
  explanation_fa: string
  standard_ref: string
  approval_status: string
  active: boolean
  version: number
  usage_count: number
  updated_at: string
}

const mcqFromRow = (r: McqQuestionRow): McqQuestion => ({
  id: r.id,
  jobRole: r.job_role,
  category: r.category as McqCategory,
  topic: r.topic,
  difficulty: r.difficulty as McqDifficulty,
  stemFa: r.stem_fa,
  options: Array.isArray(r.options) ? r.options : [],
  correctOption: r.correct_option,
  explanationFa: r.explanation_fa ?? '',
  standardRef: r.standard_ref ?? '',
  approvalStatus: r.approval_status as QuestionApprovalStatus,
  active: r.active,
  version: r.version,
  usageCount: r.usage_count,
  updatedAt: r.updated_at,
})

export interface McqQuestionInput {
  jobRole: JobRole
  category: McqCategory
  topic: string
  difficulty: McqDifficulty
  stemFa: string
  options: string[]
  correctOption: number
  explanationFa: string
  standardRef: string
  active: boolean
  approvalStatus?: QuestionApprovalStatus
}

const inputToRow = (i: McqQuestionInput) => ({
  job_role: i.jobRole,
  category: i.category,
  topic: i.topic.trim(),
  difficulty: i.difficulty,
  stem_fa: i.stemFa.trim(),
  options: i.options.map((o) => o.trim()),
  correct_option: i.correctOption,
  explanation_fa: i.explanationFa.trim(),
  standard_ref: i.standardRef.trim(),
  active: i.active,
  ...(i.approvalStatus ? { approval_status: i.approvalStatus } : {}),
})

const MCQ_COLUMNS =
  'id, job_role, category, topic, difficulty, stem_fa, options, correct_option, explanation_fa, standard_ref, approval_status, active, version, usage_count, updated_at'

export async function fetchMcqBank(jobRole?: JobRole): Promise<{ data: McqQuestion[]; error: string | null }> {
  let q = supabase.from('comp_mcq_questions').select(MCQ_COLUMNS).order('job_role').order('category').order('topic').order('difficulty')
  if (jobRole) q = q.eq('job_role', jobRole)
  const { data, error } = await q
  return { data: ((data ?? []) as McqQuestionRow[]).map(mcqFromRow), error: error?.message ?? null }
}

export async function saveMcqQuestion(id: string | null, input: McqQuestionInput): Promise<string | null> {
  const row = inputToRow(input)
  const { error } = id ? await supabase.from('comp_mcq_questions').update(row).eq('id', id) : await supabase.from('comp_mcq_questions').insert(row)
  return error ? error.message : null
}

export async function setMcqApproval(id: string, status: QuestionApprovalStatus): Promise<string | null> {
  const { error } = await supabase.from('comp_mcq_questions').update({ approval_status: status }).eq('id', id)
  return error ? error.message : null
}

export async function setMcqActive(id: string, active: boolean): Promise<string | null> {
  const { error } = await supabase.from('comp_mcq_questions').update({ active }).eq('id', id)
  return error ? error.message : null
}

// ------------------------------------------------------------------ staff: tests

export interface McqScoreRow {
  total: number
  answered: number
  correct: number
  percent: number
}
export interface McqTopicScore extends McqScoreRow {
  topic: string
  category: McqCategory
}
export interface McqCategoryScore extends McqScoreRow {
  category: McqCategory
}
export interface McqDifficultyScore extends McqScoreRow {
  difficulty: McqDifficulty
}

export interface McqTestItem {
  order: number
  questionId: string
  version: number
  category: McqCategory
  topic: string
  difficulty: McqDifficulty
  stem: string
  options: string[]
  correctOption: number
  chosenOption: number | null
  isCorrect: boolean | null
  responseTimeMs: number | null
  answeredAt: string | null
  explanation: string
  standardRef: string
}

export interface McqTestDetail {
  id: string
  assessmentId: string
  status: McqTestStatus
  /** Only for the assessment's lead / an assessment designer (the RPC returns null otherwise). */
  candidateToken: string | null
  questionCount: number
  timeLimitMinutes: number
  generation: {
    requestedCount?: number
    drawnCount?: number
    poolSize?: number
    poolTopics?: number
    difficultyDrawn?: Record<string, number>
    topicsDrawn?: Record<string, number>
  }
  startedAt: string | null
  submittedAt: string | null
  submitReason: 'CANDIDATE' | 'TIMEOUT' | 'STAFF' | null
  scoredAt: string | null
  totalQuestions: number | null
  answeredCount: number
  correctCount: number | null
  scorePercent: number | null
  timeSpentSeconds: number | null
  topicScores: McqTopicScore[]
  categoryScores: McqCategoryScore[]
  difficultyScores: McqDifficultyScore[]
  createdAt: string
  items: McqTestItem[]
}

export async function fetchMcqTestDetail(assessmentId: string): Promise<{ data: McqTestDetail | null; error: string | null }> {
  const { data, error } = await supabase.rpc('comp_mcq_get_test_detail', { p_assessment_id: assessmentId })
  if (error) return { data: null, error: error.message }
  return { data: (data as McqTestDetail | null) ?? null, error: null }
}

export async function generateMcqTest(
  assessmentId: string,
  questionCount: number,
  timeLimitMinutes: number,
  discardExisting: boolean,
): Promise<{ data: { testId: string; count: number; poolSize: number; keptLink: boolean } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('comp_mcq_generate_test', {
    p_assessment_id: assessmentId,
    p_question_count: questionCount,
    p_time_limit_minutes: timeLimitMinutes,
    p_discard_existing: discardExisting,
  })
  if (error) return { data: null, error: error.message }
  return { data: data as { testId: string; count: number; poolSize: number; keptLink: boolean }, error: null }
}

/** Status of every test the viewer can see (RLS) — used by the dashboard's next-step column. */
export async function fetchMcqTestStatuses(): Promise<Map<string, McqTestStatus>> {
  const { data } = await supabase.from('comp_mcq_tests').select('assessment_id, status')
  return new Map(((data ?? []) as { assessment_id: string; status: McqTestStatus }[]).map((r) => [r.assessment_id, r.status]))
}

export function mcqCandidateUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}?mcq=${token}`
}

/** Friendly Persian message for the RPC errors a staff member can run into. */
export function mcqErrorFa(message: string): string {
  if (/responses_exist/.test(message)) return 'متقاضی آزمون را شروع کرده است؛ برای ساخت آزمون جدید باید حذف پاسخ‌های فعلی را تأیید کنید.'
  if (/mcq_not_in_design/.test(message)) return 'ابتدا «آزمون تستی آنلاین» را در طرح ارزیابی این متقاضی فعال کنید.'
  if (/mcq_no_questions/.test(message)) return 'برای این شغل هنوز سؤال تستی تأییدشده‌ای در بانک وجود ندارد.'
  if (/assessment_locked/.test(message)) return 'این ارزیابی ثبت نهایی شده و قفل است.'
  if (/forbidden/.test(message)) return 'اجازه‌ی این کار را ندارید.'
  if (/invalid question count/.test(message)) return 'تعداد سؤال باید بین ۵ تا ۱۰۰ باشد.'
  if (/invalid time limit/.test(message)) return 'زمان آزمون باید بین ۵ تا ۲۴۰ دقیقه باشد.'
  if (/four distinct/.test(message)) return 'هر سؤال باید چهار گزینه‌ی متفاوت و غیرخالی داشته باشد.'
  if (/only a module admin can approve/.test(message)) return 'فقط ادمین ماژول می‌تواند سؤال را تأیید کند.'
  return message
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m.toLocaleString('fa-IR')}:${s.toString().padStart(2, '0').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])}`
}
