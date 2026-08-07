import { Mail, MapPin, Layers, PenTool, BarChart3, ShieldCheck, Sparkles } from 'lucide-react'
import { LogoFull } from '../components/common/Logo'

const DESIGNER_NAME = 'مهدی باجلان'
const DESIGNER_EMAIL = 'bajelanmahdi6900@gmail.com'

const FEATURES = [
  { icon: Layers, text: 'آپلود هوشمند SVG با استخراج خودکار خطوط لوله' },
  { icon: PenTool, text: 'طراحی نقشه شماتیک با کتابخانه علائم شیرآلات، اتصالات و تجهیزات' },
  { icon: BarChart3, text: 'گزارش‌های تحلیلی S-Curve، جوشکاری و کارکرد روزانه' },
  { icon: ShieldCheck, text: 'داشبورد مدیریتی تک‌صفحه‌ای قابل چاپ و خروجی PDF/Excel' },
]

export function AboutPage() {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="glass-panel rounded-2xl p-8 text-center">
          <LogoFull width={220} className="mx-auto mb-4" />
          <h1 className="mb-4 text-xl font-extrabold">درباره ما</h1>
          <div className="space-y-3 text-sm text-secondary leading-8 text-justify">
            <p>
              PipePulse یک راهکار هوشمند برای پایش و کنترل پیشرفت پروژه‌های پایپینگ است که با اتصال برنامه زمان‌بندی،
              وضعیت واقعی اجرا، ریسک‌ها و گزارش‌های پروژه، دیدی یکپارچه و بصری از عملکرد پروژه ارائه می‌دهد.
            </p>
            <p>
              این سامانه با پایش فعالیت‌ها در سطح Line، از جوشکاری و رادیوگرافی تا پوشش، امکان مقایسه برنامه و عملکرد
              واقعی، شناسایی انحرافات، پیش‌بینی زمان اتمام پروژه و تهیه گزارش‌های مدیریتی را فراهم می‌کند.
            </p>
            <p className="text-brand-300 font-medium">
              با PipePulse؛ نبض پروژه را ببینید، انحرافات را زودتر شناسایی کنید و پایان پروژه را پیش‌بینی کنید.
            </p>
          </div>

          <div className="mt-7 flex flex-col items-center gap-1 border-t pt-6" style={{ borderColor: 'var(--border-soft)' }}>
            <p style={{ fontFamily: "'Montserrat', sans-serif" }} className="text-3xl font-extrabold tracking-tight text-brand-300">
              PipePulse<sup className="text-sm align-super">™</sup>
            </p>
            <p style={{ fontFamily: "'Montserrat', sans-serif", letterSpacing: '0.22em' }} className="text-[11px] font-bold text-secondary">
              PIPING PROGRESS INTELLIGENCE
            </p>
            <p className="mt-2 text-xs text-muted">by</p>
            <p style={{ fontFamily: "'Dancing Script', cursive" }} className="text-2xl leading-none text-brand-300">
              Mahdi Bajelan
            </p>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <p className="mb-4 text-sm font-bold flex items-center gap-2">
            <Sparkles size={16} className="text-brand-400" /> امکانات کلیدی
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURES.map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-xl bg-white/[0.03] p-3 text-sm">
                <Icon size={16} className="text-brand-400 shrink-0 mt-0.5" />
                <span className="text-secondary">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <p className="mb-4 text-sm font-bold">درباره طراح</p>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white font-bold shrink-0">
              {DESIGNER_NAME.slice(0, 1)}
            </div>
            <div>
              <p className="font-bold">{DESIGNER_NAME}</p>
              <a
                href={`mailto:${DESIGNER_EMAIL}`}
                className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                <Mail size={13} /> {DESIGNER_EMAIL}
              </a>
            </div>
          </div>

          <p className="mt-4 text-sm text-secondary leading-7">
            این سامانه از دل نیاز واقعی پیمانکاران و مشاوران پروژه‌های لوله‌کشی برای جایگزین‌کردن گزارش‌های
            پراکنده اکسل و پیام‌رسان‌ها با یک ابزار یکپارچه، تصویری و قابل‌اعتماد شکل گرفته است. اولویت اصلی طراحی این
            سامانه، سادگی در استفاده روزمره، دقت داده‌ها، و رابط کاربری تمیز و بدون پیچیدگی‌های غیرضروری نرم‌افزارهای
            سازمانی سنگین بوده است.
          </p>

          <div className="mt-5 flex flex-col items-end gap-0.5 border-t pt-4" style={{ borderColor: 'var(--border-soft)' }}>
            <p style={{ fontFamily: "'Dancing Script', cursive" }} className="text-4xl leading-none text-brand-300">
              Mahdi Bajelan
            </p>
            <p style={{ fontFamily: "'Montserrat', sans-serif", letterSpacing: '0.2em' }} className="text-xs font-extrabold text-secondary">
              MAHDI BAJELAN
            </p>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6 text-xs text-muted leading-6 flex items-start gap-2.5">
          <MapPin size={14} className="shrink-0 mt-0.5" />
          <p>
            داده‌های این سامانه به‌صورت ابری (Supabase) ذخیره می‌شوند و فقط بین اعضای دعوت‌شده هر پروژه به اشتراک
            گذاشته می‌شوند.
          </p>
        </div>
      </div>
    </div>
  )
}
