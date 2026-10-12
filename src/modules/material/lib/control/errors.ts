import { friendlyErrorMessage } from '../../../../lib/friendlyError'

/** Messages for the codes raised by the material-control functions and triggers. */
export const MATERIAL_ERROR_CODES: Record<string, string> = {
  not_allowed: 'نقش شما اجازهٔ این کار را ندارد', separation_of_duties: 'ثبت‌کننده نمی‌تواند همان مورد را تأیید کند', reason_required: 'نوشتن علت لازم است', resolution_required: 'نوشتن نتیجهٔ تعیین تکلیف لازم است',
  evidence_required: 'مدرک یا توضیح اثبات انجام کار لازم است', stage_locked: 'مرحلهٔ ارسال‌شده یا تأییدشده تغییر نمی‌کند', stage_not_applicable: 'این مرحله برای قلم غیرقابل‌اعمال است', already_submitted: 'مرحله در انتظار تأیید است',
  nothing_new_to_submit: 'مقدار جدیدی برای ارسال نیست', qty_exceeds_item: 'مقدار انجام‌شده از مقدار قلم بیشتر است', not_awaiting_decision: 'این مرحله در انتظار تصمیم نیست', insufficient_stock: 'موجودی قابل‌مصرف کافی نیست',
  qty_must_be_positive: 'مقدار باید بیشتر از صفر باشد', no_issue_mapping: 'این پروژه هنوز به ماژول مدیریت مسائل متصل نشده است', no_risk_mapping: 'این پروژه هنوز به ماژول مدیریت ریسک متصل نشده است', no_sources: 'حداقل یک قلم انتخاب کنید',
  not_pending: 'این مورد دیگر در انتظار تصمیم نیست', target_not_found: 'رکورد مقصد پیدا نشد', risk_not_linked: 'این ریسک از متریال ایجاد یا به آن وصل نشده است',
  stage_not_backed: 'این مرحله پشتوانهٔ ثبت‌شده ندارد: برای مراحل سفارش تا ارسال باید سفارش خرید و برای ورود به کارگاه باید رسید انبار ثبت شده باشد',
  double_order_blocked: 'این قلم قبلاً به‌اندازهٔ نیاز در بسته یا سفارش آمده است؛ برای سفارش مجدد «استثنا» را با ذکر علت ثبت کنید',
  signers_required: 'سرپرست کارگاه، سرپرست نظارت و انباردار باید مشخص شوند', previous_signature_missing: 'امضای مرحلهٔ قبلی هنوز ثبت نشده است', invalid_kind: 'نوع رکورد نامعتبر است',
}
export function explainMaterialError(error: { message: string }): string {
  const m = error.message ?? ''
  const hit = Object.keys(MATERIAL_ERROR_CODES).find((k) => m.includes(k))
  return hit ? MATERIAL_ERROR_CODES[hit] : friendlyErrorMessage(error)
}
