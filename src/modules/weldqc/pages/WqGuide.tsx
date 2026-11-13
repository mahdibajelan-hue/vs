import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeft, BadgeCheck, CheckCircle2, CircleDashed, ClipboardList, Eye, FileImage, Flame, Gavel, KeyRound, ScanSearch, Signature, SlidersHorizontal, Sparkles, Wrench } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import type { WqTab } from '../WeldQcApp'
import '../../execution/components/outlook/outlook.css'

interface Step { n: number; color: string; icon: LucideIcon; title: string; who: string; why: string; how: string[]; go?: WqTab; goLabel?: string; done?: (s: ReturnType<typeof useWqStore.getState>) => boolean }

const STEPS: Step[] = [
  { n: 1, color: '#0ea5e9', icon: KeyRound, title: 'نقش‌ها را در «مدیریت کاربران» بدهید', who: 'مدیر سامانه',
    why: 'سطوح دسترسی و نقش‌ها مثل بقیهٔ ماژول‌ها فقط در «مدیریت کاربران» تعیین می‌شوند و هر نفر فقط پروژه‌هایی را می‌بیند که در «مدیریت اجرا» عضو آن است.',
    how: ['چهار نقش آماده است: «مفسر فیلم رادیوگرافی»، «بازرس NDT»، «مهندس ناظر جوش» و «مدیر کنترل کیفیت جوش».', 'یا سطح دسترسی ماژول را بدهید: «ثبت و ویرایش» = مفسر و مهندس جوش، «تأیید» = بازرس NDT، «مدیریت» = معیارهای پذیرش.', 'مدیر اجرای پروژه همهٔ کارها را انجام می‌دهد.'] },
  { n: 2, color: '#f97316', icon: ClipboardList, title: 'سرجوش و جوشکار از «مدیریت اجرا» می‌آید', who: 'پیمانکار — گزارش روزانه', go: 'joints', goLabel: 'دیدن سرجوش‌ها', done: (s) => s.welds.some((w) => w.welding),
    why: 'هیچ اطلاعاتی دوباره وارد نمی‌شود: شمارهٔ مقطع و سرجوش، لوله، قطر و ضخامت از فهرست مرکزی جوش‌ها، و جوشکار هر پاس (ریشه، گرم، پرکننده، نهایی) از فرم جوشکاری یا تای‌این همان سرجوش خوانده می‌شود.',
    how: ['در گزارش جوشکاری مهر جوشکار هر پاس را کامل بنویسید؛ عیب هر پاس به همان جوشکار نسبت داده می‌شود.', 'مشخصات جوشکاران (نام، کارت، گواهی) در «فهرست جوشکاران» ماژول صلاحیت است.', 'اگر ضخامت سرجوش در فهرست مرکزی نباشد، در پروندهٔ همان سرجوش یک بار وارد می‌شود.'] },
  { n: 3, color: '#22c55e', icon: Eye, title: 'بازرسی چشمی (VT)', who: 'مهندس ناظر جوش', go: 'joints', goLabel: 'رفتن به سرجوش‌ها', done: (s) => s.vts.length > 0,
    why: 'پیش از رادیوگرافی هر راند، ظاهر جوش بررسی و با عکس یا ویدئو مستند می‌شود.',
    how: ['در پروندهٔ سرجوش «ثبت VT» را بزنید، نتیجه و توضیح را بنویسید و در صورت نیاز عکس پیوست کنید.'] },
  { n: 4, color: '#8b5cf6', icon: FileImage, title: 'بارگذاری فیلم و بررسی کیفیت', who: 'مفسر فیلم', go: 'joints', goLabel: 'بارگذاری فیلم', done: (s) => s.films.some((f) => f.quality === 'accepted'),
    why: 'فقط فیلم‌هایی که کیفیتشان تأیید شده مبنای ارزیابی‌اند. فیلم ناخوانا یا «ریتیک» است (تکرار به درخواست کارفرما) یا «ریشوت» (تکرار به هزینهٔ پیمانکار رادیوگرافی).',
    how: ['تصویر اسکن‌شده یا دیجیتال فیلم را با شمارهٔ قطعه، IQI و دانسیته بارگذاری کنید (چند فایل با هم هم می‌شود).', 'فیلم‌ها در فضای خصوصی سامانه نگه داشته می‌شوند و فقط اعضای پروژه می‌بینند.', 'روی «بررسی کیفیت فیلم» بزنید و تأیید، ریتیک یا ریشوت را ثبت کنید.'] },
  { n: 5, color: '#ec4899', icon: ScanSearch, title: 'تفسیر فیلم و ثبت عیب', who: 'مفسر فیلم', go: 'joints', goLabel: 'رفتن به سرجوش‌ها', done: (s) => s.defects.length > 0,
    why: 'میز نور دیجیتال: بزرگ‌نمایی، روشنایی و کنتراست، نگاتیو و بهبود کنتراست محلی. عیب با کادر روی فیلم ثبت می‌شود و به سرجوش، راند، پاس و جوشکاران آن پاس وصل می‌شود.',
    how: ['اول «کالیبره»: روی یک طول معلوم (فاصلهٔ نشانه‌های سربی یا طول سیم IQI) خط بکشید و میلی‌متر واقعی را بنویسید.', 'با «کادر عیب» دور عیب بکشید؛ طول و موقعیت از مقیاس فیلم پر می‌شود. نوع، عمق و پاس را بررسی کنید.', '«نواحی مشکوک» نواحی پرکنتراست را با پردازش تصویر در خود مرورگر پیدا می‌کند؛ تشخیص قطعی نیست و هر مورد باید تأیید شود.'] },
  { n: 6, color: '#f59e0b', icon: Gavel, title: 'ارزیابی با معیارهای پذیرش', who: 'مفسر فیلم', go: 'criteria', goLabel: 'دیدن معیارها', done: (s) => s.evaluations.length > 0,
    why: 'طول تکی هر عیب با ضخامت دیواره، جمع طول عیوب هم‌نوع در بازهٔ مرجع، عمق بریدگی و ناهم‌ترازی سنجیده می‌شود و نتیجه «قابل قبول»، «تعمیر» یا «برش» است، همراه با پیشنهاد روش تعمیر.',
    how: ['«ارزیابی با قواعد پذیرش» نتیجه را پیش از ثبت نشان می‌دهد.', 'اعداد معیارها در «معیارهای پذیرش» یک‌جا قابل بازبینی است و برای همهٔ پروژه ذخیره می‌شود.'] },
  { n: 7, color: '#14b8a6', icon: Signature, title: 'تأیید نهایی بازرس NDT', who: 'بازرس NDT', go: 'dash', goLabel: 'کارهای منتظر من', done: (s) => s.evaluations.some((e) => e.signedAt),
    why: 'ارزیابی خودکار کمک‌تصمیم است؛ پرونده فقط با تأیید بازرس دارای صلاحیت پیش می‌رود. «قابل قبول» و «برش» پرونده را می‌بندند.',
    how: ['بازرس نظر موافق یا مخالف خود را ثبت می‌کند؛ نظرات ویرایش و حذف نمی‌شوند.', 'در راند سوم اگر نتیجه باز هم «تعمیر» باشد، بازرس آن را به «برش» تبدیل می‌کند.'] },
  { n: 8, color: '#ef4444', icon: Wrench, title: 'تعمیر و رادیوگرافی تکرار (RS)', who: 'مهندس ناظر جوش', go: 'repairs', goLabel: 'تحلیل تعمیرات', done: (s) => s.repairs.length > 0,
    why: 'حداکثر دو بار تعمیر مجاز است؛ هر تعمیر راند بعد (RS۱، RS۲) را باز می‌کند و تعمیر سوم یعنی برش کامل.',
    how: ['روش تعمیر، جوشکار تعمیر (از فهرست جوشکاران)، Repair WPS و تأییدکننده را ثبت کنید.', 'سپس فیلم RS بارگذاری و تفسیر می‌شود؛ موفقیت هر تعمیر در «تحلیل تعمیرات» دیده می‌شود.'] },
  { n: 9, color: '#a855f7', icon: Flame, title: 'گزارش جوشکاران', who: 'مدیر پروژه و مهندس جوش', go: 'welders', goLabel: 'گزارش جوشکاران',
    why: 'برای هر جوشکار: نرخ تعمیر در اولین رادیوگرافی، عیوب رایج‌تر، عیوب هر پاس، روند ماهانه و تعمیرهایی که خودش انجام داده.',
    how: ['بازهٔ تاریخ جوشکاری را انتخاب و روی هر جوشکار بزنید.', 'از همین گزارش برای آموزش هدفمند جوشکار یا بازنگری صلاحیت او استفاده کنید.'] },
]

export function WqGuide({ onGo }: { onGo: (t: WqTab) => void }) {
  const st = useWqStore()
  const measured = STEPS.filter((s) => s.done), done = measured.filter((s) => s.done!(st)).length
  const r = 34, C = 2 * Math.PI * r
  return (
    <div className="olg wq-guide">
      <header className="olg-hero">
        <div className="olg-hero-txt">
          <span className="olg-kicker"><Sparkles size={14} aria-hidden /> راهنمای گام‌به‌گام</span>
          <h2>از فیلم رادیوگرافی تا گزارش جوشکار</h2>
          <p>این ماژول پروندهٔ کیفی هر سرجوش را می‌سازد: فیلم، تفسیر، عیب، ارزیابی، تأیید بازرس و تعمیر. سرجوش و جوشکار از «مدیریت اجرا» و «صلاحیت» خوانده می‌شود و دوباره وارد نمی‌شود. وضعیت هر گام از داده‌های همین پروژه خوانده می‌شود.</p>
        </div>
        <div className="olg-ring" role="img" aria-label={`${done} از ${measured.length} گام در این پروژه انجام شده`}>
          <svg viewBox="0 0 80 80" aria-hidden><circle cx="40" cy="40" r={r} className="olg-ring-track" /><circle cx="40" cy="40" r={r} className="olg-ring-fill" strokeDasharray={`${C * (done / measured.length)} ${C}`} transform="rotate(-90 40 40)" /></svg>
          <b>{done.toLocaleString('fa-IR')}<small>/{measured.length.toLocaleString('fa-IR')}</small></b><span>گام انجام شده</span>
        </div>
      </header>
      <ol className="olg-steps">
        {STEPS.map((s, k) => {
          const I = s.icon, state = s.done ? (s.done(st) ? 'done' : 'todo') : 'info'
          return (
            <li key={s.n} className={`olg-step is-${state}`} style={{ '--c': s.color, '--i': k } as CSSProperties}>
              <span className="olg-num" aria-hidden>{s.n.toLocaleString('fa-IR')}</span>
              <div className="olg-body">
                <div className="olg-title"><span className="olg-ico"><I size={18} aria-hidden /></span><h3>{s.title}</h3>
                  {state !== 'info' && <span className={`olg-state is-${state}`}>{state === 'done' ? <CheckCircle2 size={14} aria-hidden /> : <CircleDashed size={14} aria-hidden />}{state === 'done' ? 'در این پروژه انجام شده' : 'هنوز انجام نشده'}</span>}
                </div>
                <p className="wq-who"><BadgeCheck size={13} aria-hidden /> {s.who}</p>
                <p className="olg-why">{s.why}</p>
                <ul>{s.how.map((h) => <li key={h}>{h}</li>)}</ul>
                {s.go && <button type="button" className="olg-go" onClick={() => onGo(s.go!)}>{s.goLabel} <ArrowLeft size={14} aria-hidden /></button>}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="ps-meta"><SlidersHorizontal size={12} aria-hidden /> ارزیابی خودکار و نواحی مشکوک کمک‌تصمیم‌اند؛ تصمیم نهایی با بازرس NDT دارای صلاحیت است.</p>
    </div>
  )
}
