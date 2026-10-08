import type { DomainScore, JobRole } from '../types'
import { recommendationForRole, ROLE_RECOMMENDATION_COLOR, ROLE_RECOMMENDATION_LABEL_FA, type RoleRecommendation } from './roleCompetencyModel'

/**
 * Role- and score-aware «تفسیر بلوغ و توصیه استفاده» (schema.sql Section 57).
 *
 * Before this, every results view read the fixed MATURITY_BANDS of competencyModel.ts — text that
 * was written for the project-manager rubric only — so a welding inspector with 65% was told
 * «توان مدیریت پروژه با پیچیدگی متوسط» and offered «مدیر پروژه خط لوله با پیچیدگی متوسط و
 * تک‌پیمانکار». Real candidates cluster around 55-70%, which is why it looked like the same text
 * every time. Now the text comes from comp_role_maturity_guidance (role + band, admin-editable),
 * falls back to a role-family template filled with the role's own label, and always ends with the
 * candidate's own weakest areas so two candidates in the same band still read differently.
 */

export type MaturityBandKey = 'high_risk' | 'basic' | 'acceptable' | 'capable' | 'strategic'

export const MATURITY_BAND_DEFS: { key: MaturityBandKey; min: number; max: number; label: string }[] = [
  { key: 'high_risk', min: 0, max: 39, label: 'پرریسک' },
  { key: 'basic', min: 40, max: 59, label: 'پایه' },
  { key: 'acceptable', min: 60, max: 74, label: 'قابل‌قبول' },
  { key: 'capable', min: 75, max: 84, label: 'توانمند' },
  { key: 'strategic', min: 85, max: 100, label: 'راهبردی' },
]

export interface RoleMaturityGuidanceRow {
  jobRole: JobRole
  band: MaturityBandKey
  guidance: string
  suggestedPositions: string
}

export interface RoleMaturityGuidanceDbRow {
  job_role: string
  band: string
  guidance: string
  suggested_positions: string
}

export function roleMaturityGuidanceFromRow(r: RoleMaturityGuidanceDbRow): RoleMaturityGuidanceRow {
  return { jobRole: r.job_role, band: r.band as MaturityBandKey, guidance: r.guidance, suggestedPositions: r.suggested_positions }
}

type RoleFamily = 'management' | 'supervisor' | 'inspector' | 'specialist'

/** Same classification the Section 57 seed uses, so a role added after the seed still reads right. */
export function roleFamily(jobRole: JobRole): RoleFamily {
  if (jobRole.endsWith('_manager') || jobRole === 'project_director') return 'management'
  if (jobRole.endsWith('supervisor')) return 'supervisor'
  if (jobRole.endsWith('inspector') || jobRole.endsWith('interpreter')) return 'inspector'
  return 'specialist'
}

const FAMILY_TEMPLATES: Record<RoleFamily, Record<MaturityBandKey, [string, string]>> = {
  management: {
    high_risk: ['برای ایفای مستقل نقش «%s» آماده نیست؛ در صورت جذب، فقط در نقش معاون یا دستیار و با راهبری فشرده (Mentoring) توصیه می‌شود.', 'دستیار «%s» زیر نظر مستقیم مدیر ارشد؛ بدون واگذاری تصمیم‌گیری مستقل'],
    basic: ['مناسب ایفای نقش «%s» در محدوده‌ای کوچک‌تر یا زیر نظر یک مدیر ارشد، با نظارت نزدیک و برنامه توسعه مشخص.', '«%s» در پروژه یا واحدی کوچک، یا معاون «%s» در پروژه بزرگ'],
    acceptable: ['توان ایفای نقش «%s» در پروژه‌هایی با پیچیدگی و مقیاس متوسط؛ برای پروژه‌های بزرگ‌تر، تقویت حوزه‌های ضعیف‌تر لازم است.', '«%s» در پروژه‌ای با پیچیدگی و مقیاس متوسط'],
    capable: ['توانمند در ایفای مستقل نقش «%s» در پروژه‌های بزرگ با اختیار و کنترل مستقل.', '«%s» پروژه‌های بزرگ (از جمله EPC) با اختیار تصمیم‌گیری مستقل'],
    strategic: ['توان راهبری در سطح «%s» برای پروژه‌های پیچیده، چندپیمانکاری و بحران‌محور؛ گزینه مناسب جانشین‌پروری.', '«%s» ارشد/راهبردی؛ راهبری چند پروژه یا مربی‌گری سایر مدیران'],
  },
  supervisor: {
    high_risk: ['برای سرپرستی مستقل در نقش «%s» آماده نیست؛ فقط به‌عنوان عضو تیم اجرایی و زیر نظر یک سرپرست باتجربه توصیه می‌شود.', 'عضو تیم اجرایی یا تکنسین زیر نظر سرپرست ارشد'],
    basic: ['مناسب سرپرستی یک جبهه یا تیم کوچک در نقش «%s» با نظارت نزدیک سرپرست ارشد.', 'کمک‌سرپرست یا سرپرست یک جبهه کاری کوچک'],
    acceptable: ['توان سرپرستی مستقل یک جبهه کاری در نقش «%s» با حجم و پیچیدگی متوسط.', '«%s» یک جبهه کاری با پیچیدگی متوسط'],
    capable: ['توانمند در سرپرستی هم‌زمان چند تیم یا جبهه در نقش «%s» با کمترین نیاز به نظارت.', '«%s» ارشد برای چند جبهه یا تیم کاری'],
    strategic: ['سطح برتر در نقش «%s»؛ آماده ارتقا به نقش‌های مدیریتی و آموزش سایر سرپرستان.', 'سرپرست ارشد یا مسئول واحد اجرایی؛ گزینه ارتقا به مدیریت'],
  },
  inspector: {
    high_risk: ['برای انجام مستقل بازرسی یا تفسیر در نقش «%s» صلاحیت کافی نشان نداده است؛ کار او باید توسط بازرس ارشد تأیید شود.', 'کمک‌بازرس زیر نظر بازرس ارشد، بدون امضای مستقل گزارش'],
    basic: ['مناسب انجام بازرسی‌های روتین در نقش «%s» با بازبینی گزارش‌ها توسط بازرس ارشد.', '«%s» سطح پایه برای فعالیت‌های روتین با بازبینی ارشد'],
    acceptable: ['توان انجام مستقل بازرسی‌های متعارف در نقش «%s»؛ در موارد حساس و نقاط توقف (Hold Point) حیاتی بهتر است با بازرس ارشد هماهنگ شود.', '«%s» مستقل برای فعالیت‌های متعارف'],
    capable: ['توانمند در انجام مستقل بازرسی‌ها و تصمیم‌گیری در موارد حساس در نقش «%s».', '«%s» ارشد با اختیار امضای گزارش و تصمیم در نقاط توقف'],
    strategic: ['سطح برتر در نقش «%s»؛ مناسب هدایت تیم بازرسی، ممیزی و آموزش سایر بازرسان.', 'سرپرست تیم بازرسی یا ممیز ارشد کیفیت'],
  },
  specialist: {
    high_risk: ['برای ایفای مستقل نقش «%s» آماده نیست؛ در صورت جذب، در سطح کارآموز و با راهنمایی نزدیک توصیه می‌شود.', 'کارآموز یا کمک‌کارشناس زیر نظر کارشناس ارشد'],
    basic: ['مناسب انجام وظایف روتین نقش «%s» با بازبینی خروجی‌ها توسط کارشناس ارشد.', '«%s» سطح پایه با بازبینی ارشد'],
    acceptable: ['توان ایفای مستقل نقش «%s» در وظایف متعارف و پروژه‌هایی با پیچیدگی متوسط.', '«%s» مستقل در پروژه‌ای با پیچیدگی متوسط'],
    capable: ['توانمند در ایفای مستقل نقش «%s» در پروژه‌های بزرگ و حل مسائل غیرمتعارف.', '«%s» ارشد در پروژه‌های بزرگ'],
    strategic: ['سطح برتر در نقش «%s»؛ مناسب مرجع فنی واحد و هدایت و آموزش سایر کارشناسان.', 'کارشناس ارشد، مرجع فنی و سرپرست واحد'],
  },
}

export function bandFor(percent: number | null): (typeof MATURITY_BAND_DEFS)[number] | null {
  if (percent == null) return null
  return MATURITY_BAND_DEFS.find((b) => percent >= b.min && percent <= b.max) ?? null
}

export interface MaturityInterpretation {
  bandKey: MaturityBandKey | null
  bandLabel: string
  guidance: string
  suggestedPositions: string
  /** The candidate's own weakest areas (below 60%) — the part that differs between two candidates
   * of the same role and band. */
  focusAreas: string[]
  /** 'config' = an admin-editable comp_role_maturity_guidance row; 'template' = role-family fallback. */
  source: 'config' | 'template' | 'pending'
}

export function interpretMaturity(args: {
  jobRole: JobRole
  roleLabel: string
  overall: number | null
  domainScores: DomainScore[]
  guidanceRows: RoleMaturityGuidanceRow[]
  /** Optional competency-gap labels from the Competency Engine (critical first). */
  gapLabels?: string[]
  /** false while the result is still «در انتظار تکمیل» — no role recommendation is given then. */
  sufficient: boolean
}): MaturityInterpretation {
  const { jobRole, roleLabel, overall, domainScores, guidanceRows, gapLabels = [], sufficient } = args
  const band = bandFor(overall)
  const weakDomains = domainScores
    .filter((d) => d.percentScore != null && d.percentScore < 60)
    .sort((a, b) => (a.percentScore as number) - (b.percentScore as number))
    .map((d) => d.domain.title)
  const focusAreas = [...new Set([...gapLabels, ...weakDomains])].slice(0, 4)

  if (!band || !sufficient) {
    return {
      bandKey: band?.key ?? null,
      bandLabel: 'در انتظار تکمیل',
      guidance:
        overall == null
          ? 'هنوز امتیازی برای این متقاضی ثبت نشده است؛ تفسیر بلوغ پس از امتیازدهی داوران نمایش داده می‌شود.'
          : `امتیازدهی هنوز کامل نشده است؛ امتیاز فعلی (٪${overall.toLocaleString('fa-IR')}) موقت است و توصیه شغلی برای «${roleLabel}» پس از تکمیل ارزیابی صادر می‌شود.`,
      suggestedPositions: '—',
      focusAreas,
      source: 'pending',
    }
  }

  const row = guidanceRows.find((r) => r.jobRole === jobRole && r.band === band.key && r.guidance.trim())
  if (row) {
    return { bandKey: band.key, bandLabel: band.label, guidance: row.guidance, suggestedPositions: row.suggestedPositions || '—', focusAreas, source: 'config' }
  }
  const [g, p] = FAMILY_TEMPLATES[roleFamily(jobRole)][band.key]
  return {
    bandKey: band.key,
    bandLabel: band.label,
    guidance: g.replaceAll('%s', roleLabel),
    suggestedPositions: p.replaceAll('%s', roleLabel),
    focusAreas,
    source: 'template',
  }
}

// ---------------------------------------------------------------------------
// Result status («وضعیت») — never a grade from missing data.
// ---------------------------------------------------------------------------

export interface ResultStatus {
  state: 'pending' | 'provisional' | 'final'
  /** The grade label shown next to «وضعیت», or «در انتظار تکمیل». */
  label: string
  color: string
  /** One-line explanation under the label. */
  detail: string
  /** null while pending — a grade is only given once the data is sufficient. */
  recommendation: RoleRecommendation | null
  overall: number | null
  completionPercent: number
}

const PENDING_COLOR = '#94a3b8'

/**
 * The results page used to render a grade for any overall score it could compute — and
 * computeOverallPercent renormalizes over only the answered domains, so a candidate with a single
 * answered question at 4/5 showed «ب — توصیه‌شده» next to 0 of 23 questions scored; a candidate
 * with nothing scored at all got a grade computed from `overall ?? 0`. A grade is now given only
 * when at least 60% of the questions are scored AND every weighted area that has questions has at
 * least one score; otherwise the status is «در انتظار تکمیل» with the provisional score labeled as such.
 */
export function computeResultStatus(domainScores: DomainScore[], overall: number | null, completion: { answered: number; total: number; percent: number }): ResultStatus {
  if (overall == null || completion.answered === 0) {
    return {
      state: 'pending',
      label: 'در انتظار تکمیل',
      color: PENDING_COLOR,
      detail: completion.total === 0 ? 'هنوز سؤالی برای این ارزیابی انتخاب نشده است.' : 'هنوز هیچ امتیازی ثبت نشده است.',
      recommendation: null,
      overall: null,
      completionPercent: completion.percent,
    }
  }
  const weighted = domainScores.filter((d) => d.domain.weight > 0 && d.totalCount > 0)
  const uncovered = weighted.filter((d) => d.answeredCount === 0)
  if (completion.percent < 60 || uncovered.length > 0) {
    return {
      state: 'provisional',
      label: 'در انتظار تکمیل',
      color: PENDING_COLOR,
      detail:
        `${completion.answered.toLocaleString('fa-IR')} از ${completion.total.toLocaleString('fa-IR')} سؤال امتیازدهی شده` +
        (uncovered.length > 0 ? `؛ بدون امتیاز: ${uncovered.map((d) => d.domain.shortTitle).join('، ')}` : '') +
        ` — امتیاز فعلی ٪${overall.toLocaleString('fa-IR')} موقت است.`,
      recommendation: null,
      overall,
      completionPercent: completion.percent,
    }
  }
  const recommendation = recommendationForRole(overall, domainScores)
  return {
    state: 'final',
    label: ROLE_RECOMMENDATION_LABEL_FA[recommendation.grade],
    color: ROLE_RECOMMENDATION_COLOR[recommendation.grade],
    detail: recommendation.reason || `امتیاز کلی ٪${overall.toLocaleString('fa-IR')} — بدون نقص حیاتی در حوزه‌های ارزیابی‌شده.`,
    recommendation,
    overall,
    completionPercent: completion.percent,
  }
}
