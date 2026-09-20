import type { CompetencyAnswers, CompetencyDomain, CompetencyDomainKey, CompetencyQuestion, DomainScore } from '../types'

/**
 * The 8 weighted competency domains (weights sum to 100) shared by every job position's rubric —
 * this taxonomy stays a versioned constant in code. The interview QUESTIONS under each domain are
 * no longer hardcoded here: they're the growable, admin-managed comp_questions bank (schema.sql /
 * useCompetencyStore.questions), scoped per job position — every function below that used to read
 * the old hardcoded COMPETENCY_QUESTIONS constant now takes the caller's already position-filtered
 * question list as a parameter instead (see questionsForPosition).
 */
export const COMPETENCY_DOMAINS: CompetencyDomain[] = [
  {
    key: 'governance',
    title: 'راهبری پروژه و مدیریت قرارداد',
    shortTitle: 'راهبری و قرارداد',
    weight: 12,
    description: 'یکپارچه‌سازی اهداف زمان/هزینه/کیفیت/HSE، ساختار سازمانی و RACI، حل اختلاف قراردادی، هم‌راستایی تصمیمات کارگاه با قرارداد.',
    excellentAnswerHint:
      'اشاره به Project Execution Plan، WBS، RACI، Delegation of Authority، مدیریت مکاتبات قراردادی و داشبورد تصمیمات باز.',
  },
  {
    key: 'planning',
    title: 'برنامه‌ریزی، پیشرفت و بازیابی تأخیر',
    shortTitle: 'برنامه‌ریزی',
    weight: 15,
    description: 'مبنای برنامه زمان‌بندی Level 3/4، تفکیک علت از اثر در تأخیر، وزن‌دهی پیشرفت فیزیکی، شاخص‌های پایش هفتگی.',
    excellentAnswerHint:
      'تشریح منطق مسیر بحرانی، نگاه‌به‌جلو ۲ تا ۶ هفته‌ای، S-Curve، Productivity Rate، SPI، تحلیل محدودیت‌ها و تفکیک پیشرفت واقعی از پیشرفت اعلامی.',
  },
  {
    key: 'cost',
    title: 'مدیریت هزینه، خرید و منابع',
    shortTitle: 'هزینه و تدارکات',
    weight: 12,
    description: 'اتصال بودجه به WBS/CBS، مدیریت نوسان قیمت، Expediting اقلام Long Lead، نمونه کاهش هزینه با اثر کمی.',
    excellentAnswerHint:
      'استفاده از Cost Forecast، Commitments، Cash Flow، Earned Value، تحلیل بهره‌وری ماشین‌آلات، مدیریت موجودی و گزارش انحراف هزینه.',
  },
  {
    key: 'hse',
    title: 'HSE، مدیریت ریسک و آمادگی اضطراری',
    shortTitle: 'HSE و ریسک ایمنی',
    weight: 18,
    description: 'شناسایی و رتبه‌بندی ریسک HSE، کنترل عملیات هم‌زمان (SIMOPS)، واکنش به Near Miss، اطمینان از رفتار ایمن واقعی پیمانکار.',
    excellentAnswerHint:
      'اشاره به HAZID/JSA، Permit to Work، SIMOPS، Toolbox Talk، Stop Work Authority، Leading Indicators، بررسی ریشه‌ای حادثه و بستن اقدام اصلاحی.',
  },
  {
    key: 'quality',
    title: 'کیفیت، جوشکاری و یکپارچگی خط',
    shortTitle: 'کیفیت و جوش',
    weight: 15,
    description: 'کنترل WPS/PQR و صلاحیت جوشکاران، مدیریت نرخ Repair، نقش در کنترل کیفیت NDT/پوشش/هیدروتست، Hold Point های حیاتی.',
    excellentAnswerHint:
      'تحلیل Repair Rate بر اساس نوع جوش/جوشکار/جبهه/شیفت/قطر و روند زمانی؛ اشاره به ITP، NCR، CAPA، Weld Map/Weld Book و مدارک As-Built.',
  },
  {
    key: 'changeRisk',
    title: 'مدیریت ریسک، تغییرات و Claims',
    shortTitle: 'ریسک و تغییرات',
    weight: 10,
    description: 'به‌روز نگه‌داشتن Risk Register، فرآیند Change Control، دفاع مستند از یک Claim، مستندسازی پیشگیرانه از روز اول.',
    excellentAnswerHint:
      'وجود Change Request، تحلیل اثر زمان/هزینه/ریسک، ثبت Notice، مکاتبات به‌موقع، برنامه زمان‌بندی مبنا و مستندات روزانه کارگاه.',
  },
  {
    key: 'stakeholder',
    title: 'مدیریت ذی‌نفعان و رهبری تیم',
    shortTitle: 'رهبری و ذی‌نفعان',
    weight: 10,
    description: 'اولویت‌گذاری میان ذی‌نفعان، حل تعارض تولید/کیفیت، پاسخگو نگه‌داشتن پیمانکاران، انتقال سریع تصمیم و درس‌آموخته میان جبهه‌ها.',
    excellentAnswerHint:
      'برنامه ارتباطات، جلسات کوتاه تصمیم‌محور، Action Tracker، Escalation Matrix، جانشین‌پروری و شاخص‌های عملکرد تیمی.',
  },
  {
    key: 'execution',
    title: 'دانش اجرایی خط لوله و راه‌اندازی',
    shortTitle: 'دانش اجرایی',
    weight: 8,
    description: 'توالی اجرایی از تحویل مسیر تا تحویل مکانیکی، تفاوت اجرا در تقاطع‌ها، مدیریت Interface با ایستگاه/CP/SCADA، شرایط Mechanical Completion.',
    excellentAnswerHint:
      'درک روشن از ROW، مجوزها، عبورهای خاص، Tie-in، Punch List، سیستم Turnover، As-Built، تست‌های تکمیلی و انتقال مالکیت مدارک به بهره‌برداری.',
  },
]

/** Asked last, on purpose — a single realistic crisis scenario that surfaces nearly every competency at once. Scored and noted separately from the 8 weighted domains, never silently blended into their average. */
export const CAPSTONE_QUESTION = {
  text: 'پروژه خط انتقال ۴۲ اینچ شما ۱۲ درصد از برنامه عقب است. نرخ Repair جوش از حد هدف بالاتر رفته، بخشی از لوله‌های موردنیاز با تأخیر می‌رسند، معارض محلی مسیر یک Spread را متوقف کرده و کارفرما بر حفظ تاریخ بهره‌برداری تأکید دارد. برنامه اقدام شما برای ۷۲ ساعت اول، دو هفته بعد و یک ماه بعد چیست؟',
  hint: 'پاسخ قوی باید شامل تفکیک فوری HSE و کیفیت از فشار زمان، تشکیل اتاق کنترل بحران، تحلیل مسیر بحرانی، کنترل علت Repair Rate، برنامه جایگزین برای جبهه‌های کاری، پیگیری خرید و حمل، مدیریت معارض، گزارش شفاف به کارفرما و تدوین Recovery Plan باشد. مدیری که فقط «افزایش شیفت و نیروی انسانی» را پیشنهاد می‌کند، بدون تحلیل محدودیت‌ها و کیفیت، نباید نمره بالایی بگیرد.',
}

/**
 * Curated list of PM courses/certifications worth recommending to a project manager candidate on
 * gas transmission pipeline work. ProfileForm offers these as autocomplete suggestions in the
 * certifications section (candidates can still type anything else); a certification whose title
 * exactly matches one of these is flagged as "recommended" so the count can guide the lead's manual
 * pmTrainingScore judgment on the qualification scorecard.
 */
export const RECOMMENDED_PM_COURSES: string[] = [
  'مدیریت پروژه حرفه‌ای (PMP)',
  'زمان‌بندی و کنترل پروژه با Primavera P6',
  'مدیریت ریسک پروژه (PMI-RMP)',
  'مدیریت ایمنی، بهداشت و محیط‌زیست (HSE) در پروژه‌های عمرانی و نفت‌وگاز',
  'مدیریت قراردادهای EPC و فیدیک (FIDIC)',
  'مدیریت کیفیت پروژه (QA/QC)',
  'مدیریت هزینه و بودجه پروژه (Cost Control)',
  'مدیریت تدارکات و زنجیره تأمین پروژه',
  'مدیریت ذی‌نفعان و ارتباطات پروژه',
  'دوره تخصصی احداث خطوط لوله انتقال گاز',
]

/** Fixed 0-5 maturity scoring guide shown to every interviewer at the top of the scoring page. */
export const SCORE_GUIDE: { score: number; level: string; criteria: string }[] = [
  { score: 0, level: 'فاقد شواهد', criteria: 'پاسخ ندارد، تجربه مرتبط ندارد یا پاسخ فنی/مدیریتی نادرست است' },
  { score: 1, level: 'واکنشی', criteria: 'مسئله را پس از وقوع و بدون روش مشخص پیگیری می‌کند' },
  { score: 2, level: 'پایه', criteria: 'با روش‌های متعارف آشناست، ولی نمونه اجرایی، شاخص یا نتیجه قابل‌سنجش ندارد' },
  { score: 3, level: 'کنترل‌شده', criteria: 'فرآیند، مسئولیت، ابزار و نمونه واقعی از کنترل موضوع ارائه می‌دهد' },
  { score: 4, level: 'پیش‌نگر', criteria: 'ریسک را زودتر تشخیص می‌دهد، شاخص هشداردهنده دارد و اقدام پیشگیرانه انجام می‌دهد' },
  { score: 5, level: 'بهینه‌ساز', criteria: 'سیستم قابل‌تکرار ایجاد کرده، نتایج کمی ارائه می‌دهد و درس‌آموخته‌ها را به پروژه/سازمان منتقل کرده است' },
]

export const SCORE_LABELS_FA: Record<number, string> = {
  0: 'فاقد شواهد',
  1: 'واکنشی',
  2: 'پایه',
  3: 'کنترل‌شده',
  4: 'پیش‌نگر',
  5: 'بهینه‌ساز',
}

/** Red-to-green tier color per 0-5 score, used to make the score buttons read at a glance. */
export const SCORE_COLOR: Record<number, string> = {
  0: '#f87171',
  1: '#fb923c',
  2: '#fbbf24',
  3: '#a78bfa',
  4: '#38bdf8',
  5: '#34d399',
}

/** Overall-maturity interpretation bands (0-100 weighted score) with hiring/role guidance. */
export const MATURITY_BANDS: { min: number; max: number; label: string; guidance: string; suggestedPositions: string }[] = [
  {
    min: 0,
    max: 39,
    label: 'پرریسک',
    guidance: 'برای نقش مدیر پروژه مناسب نیست یا به راهنمایی و پشتیبانی فشرده (Mentoring) نیاز دارد',
    suggestedPositions: 'دستیار مدیر پروژه (Deputy PM) تحت نظارت مستقیم مدیر ارشد؛ عدم واگذاری مسئولیت مستقل جبهه کاری',
  },
  {
    min: 40,
    max: 59,
    label: 'پایه',
    guidance: 'مناسب نقش محدودتر یا پروژه با نظارت نزدیک',
    suggestedPositions: 'مدیر پروژه در پروژه‌های کوچک یا زیرمجموعه یک مدیر پروژه ارشد؛ مسئول یک جبهه کاری (Spread) واحد',
  },
  {
    min: 60,
    max: 74,
    label: 'قابل‌قبول',
    guidance: 'توان مدیریت پروژه با پیچیدگی متوسط',
    suggestedPositions: 'مدیر پروژه خط لوله با پیچیدگی متوسط و تک‌پیمانکار',
  },
  {
    min: 75,
    max: 84,
    label: 'توانمند',
    guidance: 'مناسب پروژه طراحی-تأمین-ساخت (EPC) خط انتقال با کنترل مستقل',
    suggestedPositions: 'مدیر پروژه طراحی-تأمین-ساخت (EPC) خط انتقال گاز با کنترل مستقل و چندپیمانکاری محدود',
  },
  {
    min: 85,
    max: 100,
    label: 'راهبردی',
    guidance: 'توان راهبری پروژه پیچیده، چندپیمانکاری و بحران‌محور',
    suggestedPositions: 'مدیر پروژه/برنامه راهبردی؛ راهبری چند پروژه یا چندپیمانکاری بزرگ و مدیریت بحران',
  },
]

/** Active questions belonging to one job position, sorted domain-by-domain then by sortOrder — the actual list every scoring screen iterates over. */
export function questionsForPosition(questions: CompetencyQuestion[], jobPositionId: string | null): CompetencyQuestion[] {
  return questions
    .filter((q) => q.jobPositionId === jobPositionId && q.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function questionsForDomain(questions: CompetencyQuestion[], domain: CompetencyDomainKey): CompetencyQuestion[] {
  return questions.filter((q) => q.domain === domain)
}

/** Domain maturity = average of that domain's answered question scores, converted to a 0-100 percentage. An unanswered domain plots as 0 on the radar chart but is excluded from the weighted overall score below. `questions` should already be filtered to the assessment's own job position (questionsForPosition). */
export function computeDomainScores(questions: CompetencyQuestion[], answers: CompetencyAnswers): DomainScore[] {
  return COMPETENCY_DOMAINS.map((domain) => {
    const domainQuestions = questionsForDomain(questions, domain.key)
    const scores = domainQuestions.map((q) => answers[q.key]?.score).filter((s): s is number => typeof s === 'number')
    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
    return {
      domain,
      answeredCount: scores.length,
      totalCount: domainQuestions.length,
      averageScore,
      percentScore: averageScore != null ? Math.round((averageScore / 5) * 100) : null,
    }
  })
}

/** Weighted overall score = sum(domain maturity % x domain weight), renormalized over only the domains that have at least one answer (so a still-empty domain doesn't drag the score toward 0 mid-interview). */
export function computeOverallPercent(domainScores: DomainScore[]): number | null {
  const scored = domainScores.filter((d) => d.percentScore != null)
  if (scored.length === 0) return null
  const totalWeight = scored.reduce((sum, d) => sum + d.domain.weight, 0)
  if (totalWeight === 0) return null
  const weightedSum = scored.reduce((sum, d) => sum + (d.percentScore as number) * d.domain.weight, 0)
  return Math.round(weightedSum / totalWeight)
}

export function computeCompletion(questions: CompetencyQuestion[], answers: CompetencyAnswers): { answered: number; total: number; percent: number } {
  const total = questions.length
  const answered = questions.filter((q) => typeof answers[q.key]?.score === 'number').length
  return { answered, total, percent: total === 0 ? 0 : Math.round((answered / total) * 100) }
}

export function maturityBand(percent: number | null): { label: string; guidance: string; suggestedPositions: string } {
  if (percent == null) return { label: '—', guidance: 'هنوز امتیازدهی نشده است.', suggestedPositions: '—' }
  const band = MATURITY_BANDS.find((b) => percent >= b.min && percent <= b.max)
  return band ? { label: band.label, guidance: band.guidance, suggestedPositions: band.suggestedPositions } : { label: '—', guidance: '', suggestedPositions: '—' }
}

/** Domain-level strengths/weaknesses called out for the results page — a domain scoring 85+ is a clear strength, below 40 (once answered) is a clear development area. */
export function domainFlags(domainScores: DomainScore[]): { strengths: DomainScore[]; weaknesses: DomainScore[] } {
  const answered = domainScores.filter((d) => d.percentScore != null)
  return {
    strengths: answered.filter((d) => (d.percentScore as number) >= 85),
    weaknesses: answered.filter((d) => (d.percentScore as number) < 40),
  }
}

/** Tiered color for a 0-100 score — used on the results/public-results pages so domain bars and score chips read at a glance instead of every value looking identically purple. */
export function tierColor(percent: number | null): string {
  if (percent == null) return '#6b7280'
  if (percent >= 80) return '#34d399'
  if (percent >= 60) return '#a78bfa'
  if (percent >= 40) return '#fbbf24'
  return '#f87171'
}

/** @deprecated kept for the short on-card label; prefer maturityBand for the full guidance text. */
export function overallRatingLabel(percent: number | null): string {
  return maturityBand(percent).label
}
