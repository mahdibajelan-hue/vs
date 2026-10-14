/**
 * Reviewer-facing reading of an MCQ sitting: integrity events logged by the candidate page plus
 * "too good to be true" rules. Nothing here blocks or changes a score — it tells the reviewer when a
 * confirmatory in-person retest is warranted, because the score is used to pick supervisors.
 */
export interface McqIntegritySummary { counts: Partial<Record<string, number>>; awayMs: number; total: number }
export type IntegrityLevel = 'CLEAN' | 'REVIEW' | 'CONFIRM'
export interface IntegrityReading { level: IntegrityLevel; reasons: string[] }

export const INTEGRITY_KIND_LABEL_FA: Record<string, string> = {
  BLUR: 'خروج از پنجره', HIDDEN: 'رفتن به تب دیگر', COPY: 'کپی', PASTE: 'چسباندن', CONTEXT: 'منوی راست‌کلیک',
  FULLSCREEN_EXIT: 'خروج از تمام‌صفحه', RELOAD: 'بارگذاری مجدد صفحه', OFFLINE: 'قطع اتصال',
}

export function readIntegrity(input: { scorePercent: number | null; secondsPerQuestion: number | null; summary: McqIntegritySummary | null }): IntegrityReading {
  const reasons: string[] = []
  let rank = 0
  const bump = (l: IntegrityLevel) => { rank = Math.max(rank, l === 'CONFIRM' ? 2 : l === 'REVIEW' ? 1 : 0) }
  const s = input.summary
  const away = (s?.counts.BLUR ?? 0) + (s?.counts.HIDDEN ?? 0)
  if (away >= 3 || (s?.awayMs ?? 0) > 60_000) { reasons.push(`${away} بار خروج از صفحهٔ آزمون (مجموع ${Math.round((s?.awayMs ?? 0) / 1000)} ثانیه)`); bump('REVIEW') }
  if ((s?.counts.COPY ?? 0) > 0 || (s?.counts.PASTE ?? 0) > 0) { reasons.push('کپی یا چسباندن متن ثبت شده است'); bump('REVIEW') }
  if ((s?.counts.FULLSCREEN_EXIT ?? 0) > 1) { reasons.push('خروج مکرر از حالت تمام‌صفحه'); bump('REVIEW') }
  const high = (input.scorePercent ?? 0) >= 95
  if (high) { reasons.push('نمرهٔ ۹۵٪ یا بیشتر؛ برای تصمیم انتخاب ناظر، تأیید حضوری کوتاه توصیه می‌شود'); bump('REVIEW') }
  if (input.secondsPerQuestion != null && input.secondsPerQuestion < 8 && (input.scorePercent ?? 0) >= 80) { reasons.push('میانگین زمان هر سؤال بسیار کم است'); bump('REVIEW') }
  if (high && reasons.length >= 2) rank = 2
  return { level: (['CLEAN', 'REVIEW', 'CONFIRM'] as const)[rank], reasons }
}
