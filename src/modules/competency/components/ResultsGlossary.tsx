import { useEffect, useRef, useState } from 'react'
import { BookOpen, X } from 'lucide-react'

const TERMS: { group: string; items: [string, string][] }[] = [
  { group: 'نمره‌ها و سطح‌ها', items: [
    ['آمادگی برای شغل', 'تنها شاخص نهایی تناسب با شغل (۰ تا ۱۰۰). از مقایسهٔ سطح واقعی با سطح الزامی هر شایستگی ساخته می‌شود؛ شایستگی‌های حیاتی دوبرابر وزن دارند، شواهد کم‌اطمینان و بخش‌های سنجیده‌نشده نمره را کم می‌کنند و شکاف حیاتی سقف ۵۹ می‌گذارد. ۱۰۰ فقط با شواهد کامل و قوی.'],
    ['سطح بلوغ (۰ تا ۵)', 'نمرهٔ داور به هر پاسخ: ۰ فاقد شواهد · ۱ واکنشی · ۲ پایه · ۳ کنترل‌شده · ۴ پیش‌نگر · ۵ بهینه‌ساز.'],
    ['سطح الزامی / سطح واقعی', 'سطحی که شغل از فرد می‌خواهد در برابر سطحی که شواهد ارزیابی نشان می‌دهد.'],
    ['شکاف (Gap)', 'فاصلهٔ سطح الزامی تا سطح واقعی؛ مثبت یعنی کمبود.'],
    ['شکاف حیاتی', 'کمبود در شایستگی‌ای که برای شغل حیاتی است؛ به‌تنهایی آمادگی را به زیر ۶۰ می‌رساند.'],
    ['شکاف توسعه‌ای', 'کمبود در شایستگی غیرحیاتی که با آموزش و تجربه قابل جبران است.'],
    ['نقطه قوت', 'شایستگی که با اطمینان کافی در حد یا بالاتر از الزام است. اگر اطمینان پایین باشد فقط «موقت» ثبت می‌شود.'],
  ] },
  { group: 'شواهد و اطمینان', items: [
    ['شواهد ناکافی', 'برای آن شایستگی داده‌ای جمع نشده است. «نامعلوم» است، نه «ضعیف»؛ اما بدون شواهد هم امتیاز کامل نمی‌گیرد.'],
    ['اطمینان شواهد', 'بالا / متوسط / پایین: به تعداد و تنوع منابع شاهد (مصاحبه، آزمون، سوابق) بستگی دارد. اطمینان کمتر، اثر کمتری روی نمرهٔ نهایی دارد.'],
    ['پوشش', 'چه سهمی از (وزن) الزامات شغل واقعاً سنجیده شده است.'],
    ['مطابق الزام / فراتر از انتظار', 'سطح واقعی به الزام رسیده یا از آن بالاتر است.'],
  ] },
  { group: 'مصاحبه و داوران', items: [
    ['برگهٔ داور', 'امتیازهای مستقل هر داور؛ نهایی‌شدن آن را قفل می‌کند. نتیجه تا نهایی‌شدن همهٔ برگه‌ها نمایش داده نمی‌شود.'],
    ['نمرهٔ رسمی', 'نمرهٔ نهایی هر سؤال که مسئول ارزیابی با توجه به نظر داوران ثبت می‌کند.'],
    ['واگرایی داوران', 'اختلاف زیاد بین امتیاز داوران برای یک سؤال؛ نشانهٔ نیاز به بازبینی.'],
    ['سناریوی جامع (Capstone)', 'مسئلهٔ ترکیبی انتهای مصاحبه که چند شایستگی را هم‌زمان می‌سنجد.'],
  ] },
  { group: 'شخصیت و رفتار', items: [
    ['Big Five (پنج عامل)', 'برون‌گرایی، موافق‌بودن، وظیفه‌شناسی، ثبات هیجانی و گشودگی؛ الگوی پایدار شخصیت، نه عملکرد.'],
    ['ابعاد رفتاری حرفه‌ای', 'رفتارهای کاری مرتبط با شغل (مثل مسئولیت‌پذیری، کار تیمی)؛ خط تیره روی نمودار، حداقل الزام شغل است.'],
    ['اثرانگشت رفتاری', 'نمای تلفیقی صفات و ابعاد رفتاری فرد.'],
    ['اعتبار پاسخ‌ها (Validity)', 'سنجش اینکه پاسخ‌ها صادقانه و سازگار بوده‌اند؛ اگر پایین باشد نتیجهٔ شخصیت با احتیاط خوانده شود.'],
  ] },
  { group: 'سایر', items: [
    ['آزمون تستی (MCQ)', 'آزمون چندگزینه‌ای فنی؛ درصد پاسخ درست.'],
    ['شاخص مشتق‌شده', 'عددی که از امتیازهای دیگر محاسبه شده و مستقیماً توسط داور داده نشده است.'],
    ['تحلیل هوشمند', 'جمع‌بندی متنی ساخته‌شده از همان داده‌ها؛ کمک تصمیم است و جایگزین قضاوت داوران نیست.'],
  ] },
]

/** One glossary for every term used in the interview result, opened from the results toolbar. */
export function ResultsGlossary() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <span ref={ref} className="no-print" style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="fx-sub flex min-h-10 items-center gap-1.5 px-3.5 py-2 text-xs font-bold transition-colors hover:brightness-110"><BookOpen size={14} /> راهنمای اصطلاحات</button>
      {open && (
        <div role="dialog" aria-label="راهنمای اصطلاحات نتیجه" style={{ position: 'absolute', insetInlineEnd: 0, top: 44, zIndex: 60, width: 'min(520px, 92vw)', maxHeight: '70vh', overflow: 'auto', padding: '14px 16px', borderRadius: 14, background: 'var(--bg-panel-solid, var(--im-panel, #fff))', color: 'var(--im-text, inherit)', border: '1px solid var(--im-line, rgba(148,163,184,.35))', boxShadow: '0 18px 40px -14px rgba(0,0,0,.45)', fontSize: 12, lineHeight: 1.85, textAlign: 'start' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ fontSize: 14 }}>راهنمای اصطلاحات نتیجهٔ ارزیابی</b><button type="button" onClick={() => setOpen(false)} aria-label="بستن" style={{ all: 'unset', cursor: 'pointer', opacity: 0.7 }}><X size={15} /></button></div>
          {TERMS.map((g) => (
            <section key={g.group} style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 800, color: '#a855f7', fontSize: 11.5, marginBottom: 2 }}>{g.group}</div>
              <dl style={{ margin: 0, display: 'grid', gap: 6 }}>{g.items.map(([t, d]) => <div key={t}><dt style={{ fontWeight: 700 }}>{t}</dt><dd style={{ margin: 0, opacity: 0.85 }}>{d}</dd></div>)}</dl>
            </section>
          ))}
        </div>
      )}
    </span>
  )
}
