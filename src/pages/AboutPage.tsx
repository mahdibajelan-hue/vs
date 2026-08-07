import { MapPin, Layers, PenTool, BarChart3, ShieldCheck, Sparkles } from 'lucide-react'
import { LogoFull } from '../components/common/Logo'

const GOLD = '#c9a227'

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
        <div className="glass-panel rounded-2xl p-8 text-center relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1"
            style={{ background: `linear-gradient(90deg, var(--color-brand-500), ${GOLD})` }}
          />
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
            <p className="font-medium" style={{ color: GOLD }}>
              با PipePulse؛ نبض پروژه را ببینید، انحرافات را زودتر شناسایی کنید و پایان پروژه را پیش‌بینی کنید.
            </p>
          </div>

          <div className="mt-7 flex flex-col items-center gap-1.5 border-t pt-6" style={{ borderColor: 'var(--border-soft)' }}>
            <p style={{ fontFamily: "'Montserrat', sans-serif" }} className="text-3xl font-extrabold tracking-tight text-brand-300">
              PipePulse<sup className="text-sm align-super" style={{ color: 'var(--color-brand-400)' }}>™</sup>
            </p>
            <p style={{ fontFamily: "'Montserrat', sans-serif", letterSpacing: '0.22em', color: 'var(--color-brand-400)' }} className="text-[11px] font-bold">
              PIPING PROGRESS INTELLIGENCE
            </p>
            <p className="mt-3 text-xs text-muted">by</p>
            <img
              src={`${import.meta.env.BASE_URL}signature-mahdi.png`}
              alt="Mahdi Bajelan"
              className="h-28 w-auto"
              onError={(e) => {
                // Falls back to a styled text signature until signature-mahdi.png is uploaded to public/.
                e.currentTarget.style.display = 'none'
                e.currentTarget.nextElementSibling?.classList.remove('hidden')
              }}
            />
            <p style={{ fontFamily: "'Dancing Script', cursive" }} className="hidden text-4xl leading-none text-brand-300">
              Mahdi Bajelan
            </p>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-2.5 text-xs font-bold flex items-center gap-1.5">
            <Sparkles size={13} className="text-brand-400" /> امکانات کلیدی
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {FEATURES.map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-white/[0.03] p-2 text-xs">
                <Icon size={13} className="shrink-0 mt-0.5" style={{ color: i % 2 ? GOLD : 'var(--color-brand-400)' }} />
                <span className="text-secondary">{text}</span>
              </div>
            ))}
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
