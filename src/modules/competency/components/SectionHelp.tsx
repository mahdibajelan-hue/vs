import { useEffect, useRef, useState } from 'react'
import { HelpCircle, X } from 'lucide-react'
import type { CompetencySection } from './CompetencySidebarShell'

/** One short guide per section: what it is for, what to do, what happens next. */
const GUIDE: Record<CompetencySection, { title: string; what: string; steps: string[] }> = {
  dashboard: { title: 'داشبورد', what: 'فهرست متقاضیان و وضعیت هر ارزیابی در یک نگاه.', steps: ['با «ارزیابی جدید» متقاضی تازه ثبت کنید.', 'روی نام هر متقاضی بزنید تا مراحل ارزیابی او باز شود.', 'فیلتر و جست‌وجو برای یافتن سریع پرونده‌هاست.'] },
  profile: { title: 'مشخصات', what: 'اطلاعات هویتی، سوابق کاری، تحصیلی و مدارک متقاضی.', steps: ['مشخصات را خودتان وارد کنید یا لینک خودتکمیلی را برای متقاضی بفرستید.', 'پس از ثبت سوابق، تیک سبز کنار این مرحله ظاهر می‌شود.', 'سوابق به‌عنوان یکی از منابع شواهد در نتیجه نهایی وارد می‌شوند.'] },
  documents: { title: 'بارگذاری مدارک', what: 'مدارک تحصیلی، گواهینامه‌ها و رزومه متقاضی.', steps: ['هر مدرک را در ردیف خودش بارگذاری یا بررسی کنید.', 'مدرک مشکوک را علامت بزنید تا در گزارش بیاید.', 'بارگذاری مدارک اختیاری است ولی اعتبار شواهد را بالا می‌برد.'] },
  panel: { title: 'پنل مصاحبه‌گران و طرح ارزیابی', what: 'تعیین داوران و انتخاب اینکه این متقاضی چه آزمون‌هایی بدهد.', steps: ['داوران را اضافه و مسئول ارزیابی را مشخص کنید.', 'طراح ارزیابی تعیین می‌کند شخصیت، آزمون تستی و ارزیابی فنی لازم است یا نه.', 'آزمونی که در طرح نیست از محاسبهٔ نتیجه کنار می‌رود.'] },
  personality: { title: 'ارزیابی شخصیت و رفتاری', what: 'آزمون آنلاین شخصیت که اثرانگشت رفتاری متقاضی را می‌سازد.', steps: ['لینک آزمون را برای متقاضی بفرستید.', 'پس از پایان، نتیجه همین‌جا و در گزارش نهایی می‌آید.', 'اعتبار پاسخ‌ها (سازگاری) هم بررسی می‌شود.'] },
  mcq: { title: 'آزمون تستی آنلاین', what: 'آزمون چندگزینه‌ای فنی که به‌صورت آنلاین گرفته می‌شود.', steps: ['طراح آزمون را از بانک سؤال می‌سازد و لینک آن را می‌فرستد.', 'نمره بلافاصله پس از ثبت محاسبه می‌شود.', 'نتیجهٔ ریز سؤال‌ها فقط برای مدیر ماژول قابل مشاهده است.'] },
  questions: { title: 'ارزیابی فنی تخصصی (مصاحبه)', what: 'مصاحبه حضوری؛ هر داور برای هر سؤال از ۰ تا ۵ امتیاز می‌دهد.', steps: ['راهنمای امتیازدهی ۰ تا ۵ را هنگام مصاحبه ببینید.', 'هر داور برگهٔ مستقل خود را ثبت و نهایی می‌کند.', 'نتیجهٔ کلی تا پایان مصاحبه و نهایی‌شدن همهٔ برگه‌ها نمایش داده نمی‌شود.'] },
  results: { title: 'نتیجه', what: 'گزارش کامل ارزیابی؛ فقط بعد از پایان مصاحبه.', steps: ['شاخص اصلی «آمادگی برای شغل» است؛ ۱۰۰ فقط با شواهد کامل و قوی می‌آید.', 'بخش شکاف شایستگی می‌گوید کدام الزام شغل برآورده نشده.', 'با «تأیید نهایی» ارزیابی بسته و گزارش قابل چاپ می‌شود.'] },
  aiAnalysis: { title: 'تحلیل جامع هوش مصنوعی', what: 'جمع‌بندی متنی از شخصیت، فنی و تناسب شغلی.', steps: ['پس از تکمیل مصاحبه تحلیل را تولید کنید.', 'با تغییر امتیازها تحلیل قدیمی علامت «کهنه» می‌گیرد؛ دوباره تولید کنید.', 'این تحلیل کمک تصمیم است، نه جایگزین قضاوت داوران.'] },
  idp: { title: 'برنامه توسعه فردی', what: 'برنامهٔ رشد بر پایهٔ شکاف‌های شایستگی متقاضی.', steps: ['از شکاف‌ها اهداف توسعه‌ای بسازید.', 'مسئول پیگیری و موعد هر هدف را تعیین کنید.', 'پیشرفت اقدامات را بعداً به‌روز کنید.'] },
  questionBank: { title: 'بانک سؤالات', what: 'سؤال‌های فنی و شخصیتی که ارزیابی‌ها از آن‌ها ساخته می‌شود.', steps: ['سؤال جدید اضافه یا ویرایش کنید؛ پاسخ مرجع به داور کمک می‌کند.', 'سؤال‌های استفاده‌شده با ارزیابی‌های جاری تغییر نمی‌کنند.', 'تحلیل سؤال (دشواری/تمایز) در همین‌جا دیده می‌شود.'] },
  reports: { title: 'گزارش‌ها', what: 'گزارش‌های تجمیعی همهٔ ارزیابی‌ها.', steps: ['بازهٔ زمانی و شغل را انتخاب کنید.', 'خروجی را چاپ یا ذخیره کنید.'] },
  settings: { title: 'تنظیمات', what: 'نقش‌ها، طراحان ارزیابی، طرح‌های آماده و قواعد ماژول.', steps: ['مدیران ماژول و طراحان ارزیابی را مشخص کنید.', 'طرح‌های (blueprint) آماده می‌توانند هنگام ثبت متقاضی اعمال شوند.'] },
  personnel: { title: 'صلاحیت جوشکاران و عایق‌کاران', what: 'ثبت، آزمون و صدور کارت صلاحیت برای جوشکار و عایق‌کار هر پروژه.', steps: ['فرد را با نشانه، نام و کد ملی ثبت کنید.', 'نتیجهٔ آزمون را با دو امضا نهایی کنید.', 'کارت با دو امضای دیگر صادر می‌شود؛ روی کارت کلیک کنید تا پشتش را ببینید.', 'ماژول اجرا فقط افراد دارای کارت معتبر را می‌خواند.'] },
  personalityReports: { title: 'گزارش‌های شخصیت', what: 'نمای تجمیعی نتایج آزمون شخصیت.', steps: ['بر اساس شغل یا بازه فیلتر کنید.'] },
  talent: { title: 'بانک استعداد و تناسب شغلی', what: 'مقایسهٔ متقاضیان ارزیابی‌شده با الزامات هر شغل.', steps: ['شغل هدف یا «بهترین تناسب» را انتخاب کنید.', 'با فیلتر سطح شایستگی، گزینه‌های مناسب را کوتاه کنید.'] },
  myTasks: { title: 'کارهای من', what: 'کارهایی که منتظر شماست: امتیازدهی، بررسی، امضا.', steps: ['از بالا به پایین انجام دهید؛ فوری‌ترین‌ها اول آمده‌اند.', 'با انجام هر کار از فهرست خارج می‌شود.'] },
  inservice: { title: 'ارزیابی حین کار', what: 'ارزیابی سه‌ماهه (۳۶۰ درجه) کارکنان در حال کار.', steps: ['دوره و ارزیاب‌ها را تعیین کنید.', 'هر ارزیاب فرم خود را پر می‌کند و نتیجه جمع‌بندی می‌شود.'] },
  discipline: { title: 'تصمیمات انضباطی', what: 'ثبت تصمیم‌های انضباطی مرتبط با نتیجهٔ ارزیابی حین کار.', steps: ['پرونده را باز و تصمیم و دلیل آن را ثبت کنید.', 'تصمیم‌ها سابقهٔ ثبت‌شده دارند و قابل حذف نیستند.'] },
}

/** «؟» beside the page title: a short guide to the section the user is on. */
export function SectionHelp({ section }: { section: CompetencySection }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc) }
  }, [open])
  const g = GUIDE[section]; if (!g) return null
  return (
    <span ref={ref} className="no-print" style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={`راهنمای ${g.title}`} aria-expanded={open} title="راهنما"
        style={{ all: 'unset', cursor: 'pointer', display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: 11, color: '#a855f7', background: 'rgba(168,85,247,.14)' }}><HelpCircle size={15} aria-hidden /></button>
      {open && (
        <div role="dialog" aria-label={g.title} style={{ position: 'absolute', insetInlineStart: 0, top: 28, zIndex: 50, width: 'min(320px, 86vw)', padding: '12px 14px', borderRadius: 12, background: 'var(--im-surface, #111827)', border: '1px solid rgba(148,163,184,.3)', boxShadow: '0 14px 34px -12px rgba(0,0,0,.5)', fontSize: 12, lineHeight: 1.8, textAlign: 'start', fontWeight: 400 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><b style={{ fontSize: 13 }}>{g.title}</b><button type="button" onClick={() => setOpen(false)} aria-label="بستن" style={{ all: 'unset', cursor: 'pointer', opacity: 0.7 }}><X size={14} /></button></div>
          <p style={{ margin: '4px 0 6px' }}>{g.what}</p>
          <ul style={{ margin: 0, paddingInlineStart: 16, listStyle: 'disc' }}>{g.steps.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
    </span>
  )
}
