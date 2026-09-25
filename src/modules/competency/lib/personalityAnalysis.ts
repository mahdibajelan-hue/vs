import type { CompetencyAssessment, DomainScore } from '../types'

/**
 * A grounded, rule-based narrative built strictly from this candidate's own recorded numbers — the
 * pattern of domain scores, how consistent it is, and a few concrete profile facts (experience,
 * certifications, capstone performance). Never invents a trait the data doesn't support; every
 * sentence traces back to a specific number already shown elsewhere on this page.
 */
export function generatePersonalityProfile(domainScores: DomainScore[], overall: number | null, assessment: CompetencyAssessment, isPM: boolean): string[] {
  const answered = domainScores.filter((d) => d.percentScore != null)
  if (answered.length === 0 || overall == null) {
    return ['برای تحلیل الگوی پاسخ‌ها، ابتدا باید امتیازدهی به سؤالات مصاحبه تکمیل شود.']
  }

  const sorted = [...answered].sort((a, b) => (b.percentScore as number) - (a.percentScore as number))
  const top = sorted[0]
  const bottom = sorted[sorted.length - 1]
  const scores = answered.map((d) => d.percentScore as number)
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length
  const stdev = Math.sqrt(variance)

  const paragraphs: string[] = []

  // Opening: overall tier + the two poles of the profile.
  const tierPhrase = overall >= 85 ? 'بسیار بالا' : overall >= 70 ? 'قابل‌قبول تا خوب' : overall >= 50 ? 'متوسط' : 'زیر سطح انتظار'
  if (top.domain.key === bottom.domain.key) {
    paragraphs.push(`با امتیاز کلی ٪${overall} (سطح ${tierPhrase})، پاسخ‌های این متقاضی در حوزه «${top.domain.title}» (٪${top.percentScore}) قابل ارزیابی بوده است.`)
  } else {
    paragraphs.push(
      `با امتیاز کلی ٪${overall} (سطح ${tierPhrase})، برجسته‌ترین نقطه قوت پاسخ‌های این متقاضی در حوزه «${top.domain.title}» (٪${top.percentScore}) دیده می‌شود، در حالی که حوزه «${bottom.domain.title}» (٪${bottom.percentScore}) نسبت به سایر حوزه‌ها ضعیف‌تر ظاهر شده است.`,
    )
  }

  // Consistency: how evenly the score is spread across domains — a real, computable signal.
  if (stdev < 10) {
    paragraphs.push('پراکندگی امتیازات میان حوزه‌های مختلف کم است؛ یعنی عملکرد این متقاضی در طول مصاحبه نسبتاً یکدست بوده و نقطه ضعف یا قوت افراطی مشاهده نشده است.')
  } else if (stdev > 22) {
    paragraphs.push(
      'پراکندگی قابل‌توجهی میان امتیاز حوزه‌های مختلف دیده می‌شود؛ این الگو معمولاً نشان‌دهنده تخصص عمیق در بخشی مشخص همراه با نیاز جدی به تقویت حوزه‌های ضعیف‌تر است، نه ضعف یکنواخت در کل مصاحبه.',
    )
  } else {
    paragraphs.push('امتیازات حوزه‌های مختلف در محدوده‌ای معقول و بدون افت یا اوج شدید قرار دارند.')
  }

  // Concrete profile facts, woven in only when they actually exist — never fabricated.
  const factSentences: string[] = []
  if (assessment.yearsExperienceTotal != null && assessment.yearsExperienceTotal > 0) {
    const pipelineNote =
      assessment.yearsExperiencePipeline != null && assessment.yearsExperiencePipeline > 0
        ? ` که ${assessment.yearsExperiencePipeline} سال آن مستقیماً در اجرای خطوط لوله بوده`
        : ''
    factSentences.push(`با ${assessment.yearsExperienceTotal} سال سابقه کاری${pipelineNote}، سطح تجربه عملی این متقاضی با کیفیت پاسخ‌های او در حوزه‌های تجربه‌محور همخوانی دارد.`)
  }
  if (assessment.certifications.length >= 3) {
    factSentences.push(`با ${assessment.certifications.length.toLocaleString('fa-IR')} گواهینامه/دوره ثبت‌شده در پروفایل، تمایل مشخصی به توسعه مستمر مهارت‌های حرفه‌ای دیده می‌شود.`)
  }
  if (isPM && assessment.capstoneScore != null) {
    factSentences.push(
      assessment.capstoneScore >= 4
        ? 'عملکرد او در سناریوی پایانی چندوجهی (که به‌طور هم‌زمان چند حوزه را درگیر می‌کند) قوی بوده — نشانه‌ای از توانایی تصمیم‌گیری یکپارچه تحت فشار.'
        : assessment.capstoneScore <= 2
          ? 'عملکرد او در سناریوی پایانی چندوجهی ضعیف‌تر از میانگین سایر پاسخ‌ها بوده — ممکن است در ترکیب هم‌زمان چند اولویت (زمان/کیفیت/ایمنی) تحت فشار به تمرین بیشتری نیاز داشته باشد.'
          : '',
    )
  }
  paragraphs.push(...factSentences.filter(Boolean))

  // Closing: a practical framing sentence, tied to the weakest domain (actionable, not vague).
  if (bottom.percentScore != null && bottom.percentScore < 60 && top.domain.key !== bottom.domain.key) {
    paragraphs.push(`در صورت پذیرش، برنامه توسعه اولیه بهتر است بر تقویت «${bottom.domain.title}» متمرکز شود تا از این نقطه، شکافی در عملکرد کلی ایجاد نشود.`)
  }

  return paragraphs
}
