import { friendlyErrorMessage } from '../../../lib/friendlyError'

/** Messages for the codes raised by the execution-module functions and triggers. */
export const EXECUTION_ERROR_CODES: Record<string, string> = {
  not_allowed: 'نقش شما اجازهٔ این کار را ندارد', use_rpc: 'این تغییر فقط از مسیر ارسال یا بررسی ممکن است', report_locked: 'گزارش ارسال یا بررسی شده و قابل ویرایش نیست؛ ابتدا باید برای اصلاح بازگردانده شود',
  line_locked: 'ردیف تأییدشده تغییر نمی‌کند؛ بازگشایی گزارش با دستگاه نظارت است', bad_state: 'وضعیت فعلی گزارش این کار را اجازه نمی‌دهد', empty_report: 'گزارش خالی است؛ حداقل یک ردیف یا اطلاعات لازم است',
  exceeds_base: 'کارکرد تجمعی از مقدار مبنا بیشتر می‌شود: ردیف را اصلاح کنید یا ابتدا مقدار مبنا را با نسخهٔ مبنای جدید تغییر دهید', duplicate_line: 'این کارکرد (فعالیت، تاریخ، جبهه و محل یکسان) قبلاً در گزارش دیگری ثبت شده است؛ ثبت دوباره مجاز نیست',
  note_required: 'برای رد، بازگرداندن یا تأیید با مقدار کمتر از گزارش‌شده، ثبت علت لازم است', bad_decision: 'تصمیم نامعتبر است', weights_not_100: 'مجموع وزن‌ها در یک مبنا باید دقیقاً ۱۰۰ باشد', draft_exists: 'یک نسخهٔ مبنای پیش‌نویس باز است؛ ابتدا آن را تصویب یا لغو کنید',
  signature_required: 'امضاهای لازم پیمانکار (تهیه‌کننده / تأییدکننده) ثبت نشده یا با آخرین تغییر گزارش پاک شده‌اند؛ دوباره امضا کنید. اگر امضای نمونه در پروفایل خود ندارید، ابتدا آن را ثبت کنید',
  not_found: 'رکورد پیدا نشد', duplicate: 'این مورد قبلاً ثبت شده است',
}
export function explainExecutionError(error: { message: string }): string {
  const m = error.message ?? ''
  const hit = Object.keys(EXECUTION_ERROR_CODES).find((k) => m.includes(k))
  if (!hit) return friendlyErrorMessage(error)
  const tail = m.includes(`${hit}:`) ? ` (${m.slice(m.indexOf(`${hit}:`) + hit.length + 1).trim()})` : ''
  return EXECUTION_ERROR_CODES[hit] + tail
}
