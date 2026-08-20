import type { CompetencyAnswers, CompetencyDomain, CompetencyDomainKey, CompetencyQuestion, DomainScore } from '../types'

/**
 * The fixed evaluation rubric for a gas transmission pipeline construction project manager
 * interview: 7 competency domains, 5 real interview questions each. This lives in code (not a DB
 * table) because it's a versioned assessment instrument, not user-entered data — every assessment
 * that uses it should be scored against the exact same rubric.
 */
export const COMPETENCY_DOMAINS: CompetencyDomain[] = [
  {
    key: 'technical',
    title: 'دانش فنی و مهندسی اجرای خط لوله',
    shortTitle: 'دانش فنی',
    description: 'استانداردهای اجرا، جوشکاری و NDT، لوله‌گذاری، پوشش و حفاظت کاتدی، عبور از موانع.',
  },
  {
    key: 'planning',
    title: 'برنامه‌ریزی، زمان‌بندی و کنترل پروژه',
    shortTitle: 'برنامه‌ریزی',
    description: 'تدوین و پایش برنامه زمان‌بندی، مسیر بحرانی، اندازه‌گیری پیشرفت، برنامه جبرانی.',
  },
  {
    key: 'hse',
    title: 'مدیریت HSE و ایمنی کار',
    shortTitle: 'HSE',
    description: 'فرهنگ ایمنی، مقررات کار در ارتفاع/فضای بسته/ترانشه، مدیریت حادثه، ارزیابی ریسک HSE.',
  },
  {
    key: 'quality',
    title: 'مدیریت کیفیت و بازرسی (QA/QC)',
    shortTitle: 'کیفیت',
    description: 'برنامه بازرسی و تست (ITP)، مدیریت مغایرت (NCR)، پوشش و هولیدی تست، هیدروتست.',
  },
  {
    key: 'risk',
    title: 'مدیریت ریسک، مسائل و تغییرات',
    shortTitle: 'ریسک',
    description: 'شناسایی و ارزیابی ریسک، مدیریت درخواست تغییر، اولویت‌بندی مسائل اجرایی.',
  },
  {
    key: 'contract',
    title: 'مدیریت قرارداد، پیمانکاران و تأمین‌کنندگان',
    shortTitle: 'قرارداد',
    description: 'ارزیابی عملکرد پیمانکار، انواع قراردادهای EPC، صورت‌وضعیت و ادعا، تأمین متریال بحرانی.',
  },
  {
    key: 'leadership',
    title: 'رهبری، ارتباطات و مدیریت ذی‌نفعان',
    shortTitle: 'رهبری',
    description: 'رهبری تیم‌های پراکنده، تعامل با ذی‌نفعان محلی و مالکان اراضی، گزارش‌دهی، حل تعارض.',
  },
]

export const COMPETENCY_QUESTIONS: CompetencyQuestion[] = [
  // دانش فنی و مهندسی
  { key: 'technical-1', domain: 'technical', text: 'آشنایی و تجربه شما با استانداردهای API 1104 و ASME B31.8 و الزامات جوشکاری خطوط لوله انتقال گاز چگونه است؟' },
  { key: 'technical-2', domain: 'technical', text: 'تجربه عملی خود در نظارت بر عملیات لوله‌گذاری (Lowering-in)، خاک‌ریزی و حفاظت کاتدی را شرح دهید.' },
  { key: 'technical-3', domain: 'technical', text: 'چگونه کیفیت جوش و نتایج رادیوگرافی (RT) را در سایت کنترل و پیگیری می‌کنید؟' },
  { key: 'technical-4', domain: 'technical', text: 'با روش‌های عبور از موانع (رودخانه، جاده، راه‌آهن — از جمله HDD) چه آشنایی دارید؟' },
  { key: 'technical-5', domain: 'technical', text: 'یک چالش فنی واقعی در اجرای خط لوله که با آن مواجه شده‌اید و روش حل آن را توضیح دهید.' },
  // برنامه‌ریزی
  { key: 'planning-1', domain: 'planning', text: 'چگونه برنامه زمان‌بندی مبنا (Baseline) یک پروژه خط لوله را تدوین و پایش می‌کنید؟' },
  { key: 'planning-2', domain: 'planning', text: 'روش شما برای شناسایی و مدیریت مسیر بحرانی (Critical Path) چیست؟' },
  { key: 'planning-3', domain: 'planning', text: 'چگونه پیشرفت فیزیکی پروژه را اندازه‌گیری و با برنامه مقایسه می‌کنید؟' },
  { key: 'planning-4', domain: 'planning', text: 'در صورت تأخیر در یک بخش از پروژه، چه اقداماتی برای جبران (Recovery Plan) انجام می‌دهید؟' },
  { key: 'planning-5', domain: 'planning', text: 'تجربه شما در مدیریت هم‌زمان چند جبهه کاری (Spread) در طول مسیر خط لوله چیست؟' },
  // HSE
  { key: 'hse-1', domain: 'hse', text: 'چگونه فرهنگ ایمنی را در بین پیمانکاران و کارگران سایت نهادینه می‌کنید؟' },
  { key: 'hse-2', domain: 'hse', text: 'با مقررات HSE مرتبط با کار در ارتفاع، فضای بسته و کار در ترانشه چه آشنایی دارید؟' },
  { key: 'hse-3', domain: 'hse', text: 'نحوه واکنش شما به وقوع یک حادثه (Incident) در سایت و فرآیند گزارش‌دهی آن چگونه است؟' },
  { key: 'hse-4', domain: 'hse', text: 'چگونه پیش از شروع فعالیت‌های پرخطر، ارزیابی ریسک HSE (JSA) انجام می‌دهید؟' },
  { key: 'hse-5', domain: 'hse', text: 'یک شاخص کلیدی HSE که برای پایش عملکرد ایمنی پروژه استفاده می‌کنید را نام ببرید و توضیح دهید.' },
  // کیفیت
  { key: 'quality-1', domain: 'quality', text: 'برنامه بازرسی و تست (ITP) را چگونه برای پروژه خط لوله طراحی و اجرا می‌کنید؟' },
  { key: 'quality-2', domain: 'quality', text: 'نحوه مدیریت مغایرت‌ها (NCR) و پیگیری اقدامات اصلاحی چگونه است؟' },
  { key: 'quality-3', domain: 'quality', text: 'چگونه از انطباق پوشش لوله (Coating) و تست هولیدی (Holiday Test) اطمینان حاصل می‌کنید؟' },
  { key: 'quality-4', domain: 'quality', text: 'تجربه شما در مدیریت هیدروتست خط لوله و مستندسازی آن چیست؟' },
  { key: 'quality-5', domain: 'quality', text: 'چگونه با مهندس کیفیت کارفرما و بازرسان شخص ثالث تعامل و هماهنگی می‌کنید؟' },
  // ریسک
  { key: 'risk-1', domain: 'risk', text: 'فرآیند شناسایی و ارزیابی ریسک‌های پروژه را چگونه انجام می‌دهید؟' },
  { key: 'risk-2', domain: 'risk', text: 'یک ریسک بحرانی که در پروژه‌ای پیش‌بینی و مدیریت کرده‌اید را با جزئیات مثال بزنید.' },
  { key: 'risk-3', domain: 'risk', text: 'نحوه مدیریت درخواست‌های تغییر (Change Order) و تأثیر آن بر هزینه و زمان‌بندی چگونه است؟' },
  { key: 'risk-4', domain: 'risk', text: 'چگونه مسائل اجرایی بین‌بخشی را اولویت‌بندی و پیگیری می‌کنید؟' },
  { key: 'risk-5', domain: 'risk', text: 'تجربه شما در مدیریت پروژه تحت شرایط غیرمنتظره (بحران، کمبود متریال، تحریم) چیست؟' },
  // قرارداد
  { key: 'contract-1', domain: 'contract', text: 'چگونه عملکرد پیمانکاران اجرایی را ارزیابی و مدیریت می‌کنید؟' },
  { key: 'contract-2', domain: 'contract', text: 'با انواع قراردادهای EPC، EPCC یا پیمان مدیریت چه آشنایی و تجربه‌ای دارید؟' },
  { key: 'contract-3', domain: 'contract', text: 'نحوه مدیریت صورت‌وضعیت‌ها و ادعاهای پیمانکار (Claims) چگونه است؟' },
  { key: 'contract-4', domain: 'contract', text: 'چگونه از تأمین به‌موقع متریال بحرانی (لوله، اتصالات، شیرآلات) اطمینان حاصل می‌کنید؟' },
  { key: 'contract-5', domain: 'contract', text: 'یک تجربه از مذاکره یا حل اختلاف با پیمانکار را شرح دهید.' },
  // رهبری
  { key: 'leadership-1', domain: 'leadership', text: 'سبک رهبری شما در مدیریت تیم‌های چندنفره و پراکنده در طول مسیر خط لوله چگونه است؟' },
  { key: 'leadership-2', domain: 'leadership', text: 'چگونه با ذی‌نفعان محلی، مالکان اراضی و مجوزهای حریم (ROW) تعامل می‌کنید؟' },
  { key: 'leadership-3', domain: 'leadership', text: 'نحوه گزارش‌دهی پیشرفت پروژه به مدیریت ارشد و کارفرما چگونه است؟' },
  { key: 'leadership-4', domain: 'leadership', text: 'یک موقعیت دشوار در مدیریت تعارض بین اعضای تیم را چگونه حل کرده‌اید؟' },
  { key: 'leadership-5', domain: 'leadership', text: 'چگونه انگیزه و عملکرد تیم پروژه را در شرایط سخت (دورافتادگی، آب‌وهوا) حفظ می‌کنید؟' },
]

export const SCORE_LABELS_FA: Record<number, string> = {
  1: 'ضعیف',
  2: 'قابل قبول',
  3: 'متوسط',
  4: 'خوب',
  5: 'عالی',
}

export function questionsForDomain(domain: CompetencyDomainKey): CompetencyQuestion[] {
  return COMPETENCY_QUESTIONS.filter((q) => q.domain === domain)
}

export function computeDomainScores(answers: CompetencyAnswers): DomainScore[] {
  return COMPETENCY_DOMAINS.map((domain) => {
    const questions = questionsForDomain(domain.key)
    const scores = questions.map((q) => answers[q.key]?.score).filter((s): s is number => typeof s === 'number')
    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
    return {
      domain,
      answeredCount: scores.length,
      totalCount: questions.length,
      averageScore,
      percentScore: averageScore != null ? Math.round((averageScore / 5) * 100) : null,
    }
  })
}

export function computeOverallPercent(domainScores: DomainScore[]): number | null {
  const scored = domainScores.filter((d) => d.percentScore != null).map((d) => d.percentScore as number)
  if (scored.length === 0) return null
  return Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
}

export function computeCompletion(answers: CompetencyAnswers): { answered: number; total: number; percent: number } {
  const total = COMPETENCY_QUESTIONS.length
  const answered = COMPETENCY_QUESTIONS.filter((q) => typeof answers[q.key]?.score === 'number').length
  return { answered, total, percent: total === 0 ? 0 : Math.round((answered / total) * 100) }
}

/** A simple, honest overall rating label from the overall percent — not a hiring recommendation, just a plain-language read of the number. */
export function overallRatingLabel(percent: number | null): string {
  if (percent == null) return '—'
  if (percent >= 85) return 'عالی'
  if (percent >= 70) return 'خوب'
  if (percent >= 50) return 'متوسط'
  return 'نیازمند توسعه'
}
