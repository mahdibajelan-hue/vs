/**
 * Maps common Postgres/PostgREST/network error strings to a plain Persian explanation instead
 * of surfacing the raw driver message (constraint names, table names, RLS policy text) to the
 * end user. Falls back to a generic retry message for anything unrecognized — never shows the
 * raw string, since it may leak schema details and is rarely actionable for a non-technical user.
 */
const KNOWN_PATTERNS: [RegExp, string][] = [
  [/row-level security policy/i, 'شما دسترسی لازم برای انجام این عملیات را ندارید'],
  [/permission denied/i, 'شما دسترسی لازم برای انجام این عملیات را ندارید'],
  [/violates foreign key constraint/i, 'این مورد به رکورد دیگری وابسته است و نمی‌توان آن را حذف یا ثبت کرد'],
  [/duplicate key value violates unique constraint/i, 'این مقدار تکراری است — موردی مشابه از قبل ثبت شده'],
  [/violates check constraint|invalid input value for enum/i, 'مقدار وارد شده معتبر نیست'],
  [/violates not-null constraint/i, 'یک یا چند فیلد الزامی خالی است'],
  // PGRST204 / 42703 — the client is asking for a column the database doesn't have, which in
  // practice means supabase/schema.sql hasn't been (fully) applied to this project yet. Worth
  // naming explicitly: the generic "try again" message would send the user in circles.
  [/could not find the .* column|schema cache|column .* does not exist/i, 'ساختار پایگاه داده به‌روز نیست — فایل supabase/schema.sql را دوباره روی پروژه اجرا کنید'],
  [/failed to fetch|networkerror|network request failed|load failed/i, 'ارتباط با سرور برقرار نشد — اتصال اینترنت خود را بررسی و دوباره تلاش کنید'],
  [/jwt expired|invalid token|invalid jwt/i, 'نشست شما منقضی شده — لطفاً دوباره وارد شوید'],
  [/timeout/i, 'زمان پاسخ سرور به پایان رسید — دوباره تلاش کنید'],
]

export function friendlyErrorMessage(error: { message?: string } | null | undefined): string {
  const raw = error?.message ?? ''
  for (const [pattern, message] of KNOWN_PATTERNS) {
    if (pattern.test(raw)) return message
  }
  return 'خطایی غیرمنتظره رخ داد — لطفاً دوباره تلاش کنید'
}
