import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeft, CheckCircle2, CircleDashed, CircleDot, ClipboardList, CloudSunRain, Hourglass, Link2, ListChecks, Sparkles, Tractor, Users, Wand2 } from 'lucide-react'
import type { OutlookCtx, SetupKey } from '../../lib/useOutlook'

export interface GuideStep { n: number; setup?: SetupKey; go: string; color: string; icon: LucideIcon; title: string; short: string; why: string; how: string[] }

/** The road from an empty project to a trustworthy finish date. `go` is a view of this section, or «tab:sub» elsewhere in the module. */
export const GUIDE_STEPS: GuideStep[] = [
  { n: 1, setup: 'reports', go: 'daily:work', color: '#0ea5e9', icon: ClipboardList, title: 'گزارش روزانهٔ کامل ثبت کنید', short: 'گزارش روزانه',
    why: 'همهٔ اعداد این بخش از گزارش‌های روزانهٔ کارکرد یاد گرفته می‌شود؛ هر روز گزارش بیشتر، پیش‌بینی دقیق‌تر.',
    how: ['مقدار انجام‌شدهٔ هر فعالیت را در گزارش کارکرد وارد کنید تا نظارت تأیید کند.', 'جدول منابع را به تفکیک بخش کاری پر کنید: تعداد فعال هر نفر و ماشین و ساعت کار ماشین‌ها.', 'وضعیت هوا و زمین را هر روز با یک لمس ثبت کنید.', 'از ۱۰ روز گزارش بررسی‌شده به بعد پیش‌بینی قابل اتکا می‌شود.'] },
  { n: 2, setup: 'crews', go: 'setup', color: '#f97316', icon: Users, title: 'ترکیب هر اکیپ را تعریف کنید', short: 'ترکیب اکیپ‌ها',
    why: 'اکیپ مجموعه‌ای از ماشین و نفر است؛ یک ماشین یا نفر اضافه تا اکیپ کامل نشود کارکردی اضافه نمی‌کند.',
    how: ['در «تعاریف و تنظیمات» برای هر بخش کاری بنویسید یک اکیپ کامل چند واحد از هر قلم دارد.', 'مثال جوشکاری: ۱ سایدبوم + ۳ دستگاه جوش + ۳ جوشکار + ۳ کمک‌جوشکار.', 'سامانه هر روز تعداد اکیپ کامل را از جدول منابع می‌شمارد.'] },
  { n: 3, setup: 'links', go: 'setup', color: '#eab308', icon: Link2, title: 'هر فعالیت را به اکیپ خودش وصل کنید', short: 'اتصال فعالیت‌ها',
    why: 'سایدبوم اکیپ ریسه با سایدبوم جوشکاری فرق دارد؛ هر فعالیت فقط با منابع اکیپ خودش سنجیده می‌شود.',
    how: ['پیشنهاد اولیه از کلمات عنوان و فصل فهرست‌بها ساخته شده و با برچسب «پیشنهادی» مشخص است.', 'پیشنهادهای درست را یک‌جا تأیید و موارد نادرست را اصلاح کنید.', 'ردیف‌های اضافه‌بها اکیپ ردیف اصلی خود را می‌گیرند.'] },
  { n: 4, setup: 'climate', go: 'setup', color: '#22c55e', icon: CloudSunRain, title: 'اقلیم محل پروژه را تعیین کنید', short: 'اقلیم',
    why: 'روزهای بارانی، برفی و گردوغبار کارکرد را کم می‌کنند؛ تقویم جوی هر ماه از اقلیم و هوای ثبت‌شدهٔ پروژه ساخته می‌شود.',
    how: ['یکی از چهار اقلیم را انتخاب کنید؛ برای همهٔ کاربران پروژه ذخیره می‌شود.', 'هرچه هوای روزهای بیشتری ثبت شود، سهم سابقهٔ خود پروژه بیشتر می‌شود.'] },
  { n: 5, setup: 'civil', go: 'setup', color: '#a16207', icon: Tractor, title: 'بخش‌های سیویل را مشخص کنید', short: 'ماشین‌آلات سیویل',
    why: 'کارکرد مسیرسازی و حفاری کانال را ماشین‌ها تعیین می‌کنند؛ بهره‌وری آن‌ها بر حسب کارکرد در هر ساعت ماشین سنجیده می‌شود.',
    how: ['بخش‌های حفاری، مسیرسازی و خاکریزی خودکار تشخیص داده می‌شوند؛ در تنظیمات می‌توانید اصلاح کنید.', 'ساعت کار ماشین را در جدول منابع ثبت کنید؛ اگر ثبت نشود ساعت کار مفید گزارش یا ساعت کار روزانهٔ تنظیمات به کار می‌رود.'] },
  { n: 6, go: 'dash', color: '#8b5cf6', icon: Hourglass, title: 'روزشمار و تاریخ اتمام را بخوانید', short: 'داشبورد',
    why: 'داشبورد تاریخ اتمام پیش‌بینی‌شده، روزهای باقی‌مانده و بازهٔ ۸۰٪ را در برابر پایان برنامه‌ای نشان می‌دهد.',
    how: ['رنگ قاب: سبز = زودتر یا طبق برنامه، کهربایی = تا ۳۰ روز دیرتر، قرمز = بیش از ۳۰ روز دیرتر.', 'نوار زیر تاریخ، بازهٔ ۸۰٪ پیش‌بینی را با پرچم پایان برنامه‌ای مقایسه می‌کند.', 'اگر برخی فعالیت‌ها تاریخ نداشته باشند، تاریخ با برچسب «کمینه» نمایش داده می‌شود.'] },
  { n: 7, go: 'dash', color: '#ec4899', icon: Wand2, title: 'با سناریو جبران کنید', short: 'سناریو',
    why: 'افزودن اکیپ کامل به گلوگاه، تاریخ اتمام را جلو می‌برد؛ افزودن به اکیپی که زودتر تمام می‌کند فقط سرعت ماهانه را بالا می‌برد.',
    how: ['با + و − اکیپ کامل اضافه یا کم کنید؛ اثرش روی روزشمار و نمودار بلافاصله دیده می‌شود.', 'اکیپی که «پایان کارها»یش از همه دیرتر است، گلوگاه پروژه است.', 'سناریو چیزی را ذخیره یا تغییر نمی‌دهد.'] },
  { n: 8, go: 'acts', color: '#14b8a6', icon: ListChecks, title: 'فعالیت‌ها و عوامل اثرگذار را بررسی کنید', short: 'فعالیت‌ها',
    why: 'هر فعالیت جداگانه و با واحد خودش مدل می‌شود: کارکرد هر اکیپ کامل، اثر هوا و زمین، و دقت پیش‌بینی روی گذشته.',
    how: ['ستون «پایان پیش‌بینی» بازهٔ ۸۰٪ و مبنای هر عدد را می‌گوید (کارکرد خودش، نوبت اکیپ یا برنامه).', 'روی هر ردیف بزنید تا عوامل اثرگذار آن را ببینید.'] },
]

export function OutlookGuide({ ctx, onGo }: { ctx: OutlookCtx; onGo: (go: string) => void }) {
  const st = new Map(ctx.setup.map((s) => [s.key, s]))
  const done = ctx.setup.filter((s) => s.state === 'done').length, total = ctx.setup.length
  const r = 34, C = 2 * Math.PI * r, f = done / total
  return (
    <div className="olg">
      <header className="olg-hero">
        <div className="olg-hero-txt">
          <span className="olg-kicker"><Sparkles size={14} aria-hidden /> راهنمای گام‌به‌گام</span>
          <h2>از گزارش روزانه تا تاریخ اتمام قابل اتکا</h2>
          <p>این بخش کارکرد آیندهٔ هر فعالیت و تاریخ اتمام پروژه را از گزارش‌های روزانه پیش‌بینی می‌کند. گام‌های ۱ تا ۵ را یک بار انجام دهید؛ وضعیت هر گام از داده‌های همین پروژه خوانده می‌شود.</p>
        </div>
        <div className="olg-ring" role="img" aria-label={`${done} از ${total} گام راه‌اندازی انجام شده`}>
          <svg viewBox="0 0 80 80" aria-hidden><circle cx="40" cy="40" r={r} className="olg-ring-track" /><circle cx="40" cy="40" r={r} className="olg-ring-fill" strokeDasharray={`${C * f} ${C}`} transform="rotate(-90 40 40)" /></svg>
          <b>{done.toLocaleString('fa-IR')}<small>/{total.toLocaleString('fa-IR')}</small></b><span>گام راه‌اندازی</span>
        </div>
      </header>
      <ol className="olg-steps">
        {GUIDE_STEPS.map((s, k) => {
          const S = s.setup ? st.get(s.setup) : undefined, I = s.icon
          const state = S?.state ?? 'info'
          const Mark = state === 'done' ? CheckCircle2 : state === 'partial' ? CircleDot : state === 'todo' ? CircleDashed : null
          return (
            <li key={s.n} className={`olg-step is-${state}`} style={{ '--c': s.color, '--i': k } as CSSProperties}>
              <span className="olg-num" aria-hidden>{s.n.toLocaleString('fa-IR')}</span>
              <div className="olg-body">
                <div className="olg-title"><span className="olg-ico"><I size={18} aria-hidden /></span><h3>{s.title}</h3>
                  {Mark && <span className={`olg-state is-${state}`}><Mark size={14} aria-hidden />{state === 'done' ? 'انجام شده' : state === 'partial' ? 'نیمه‌کاره' : 'انجام نشده'}{S?.note ? ` · ${S.note}` : ''}</span>}
                </div>
                <p className="olg-why">{s.why}</p>
                <ul>{s.how.map((h) => <li key={h}>{h}</li>)}</ul>
                <button type="button" className="olg-go" onClick={() => onGo(s.go)}>{s.go.includes(':') ? 'رفتن به گزارش روزانه' : s.go === 'setup' ? 'رفتن به تعاریف و تنظیمات' : s.go === 'acts' ? 'رفتن به فعالیت‌ها' : 'رفتن به داشبورد'} <ArrowLeft size={14} aria-hidden /></button>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
