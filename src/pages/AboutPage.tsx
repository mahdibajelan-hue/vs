import { Mail, MapPin, Layers, PenTool, BarChart3, ShieldCheck, Sparkles } from 'lucide-react'
import { LogoFull } from '../components/common/Logo'

const DESIGNER_NAME = 'مهدی باجلان'
const DESIGNER_EMAIL = 'bajelanmahdi6900@gmail.com'

const FEATURES = [
  { icon: Layers, text: 'آپلود هوشمند SVG با استخراج خودکار خطوط لوله' },
  { icon: PenTool, text: 'طراح نقشه شماتیک با کتابخانه علائم شیرآلات و اتصالات' },
  { icon: BarChart3, text: 'گزارش‌های تحلیلی S-Curve، جوشکاری و کارکرد روزانه' },
  { icon: ShieldCheck, text: 'داشبورد مدیریتی تک‌صفحه‌ای قابل چاپ و خروجی PDF/Excel' },
]

export function AboutPage() {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="glass-panel rounded-2xl p-8 text-center">
          <LogoFull width={220} className="mx-auto mb-4" />
          <h1 className="mb-2 text-xl font-extrabold">سامانه پایش پیشرفت ایزومتریک لوله‌کشی</h1>
          <p className="text-sm text-secondary leading-7">
            نرم‌افزاری برای مدیریت و پایش روزانه پیشرفت نقشه‌های ایزومتریک لوله‌کشی در پروژه‌های گاز و پتروشیمی — از
            ثبت کارکرد روزانه تا گزارش‌های مدیریتی و خروجی حرفه‌ای.
          </p>
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
            مهدی باجلان توسعه‌دهنده نرم‌افزار است و روی ساخت ابزارهای وب کاربردی برای صنایع نفت، گاز و پتروشیمی تمرکز
            دارد. این سامانه از دل نیاز واقعی پیمانکاران و مشاوران پروژه‌های لوله‌کشی برای جایگزین‌کردن گزارش‌های
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
            داده‌های این سامانه به‌صورت محلی در همان مرورگر شما ذخیره می‌شوند (Local Browser Storage) و به هیچ سروری
            ارسال نمی‌شوند.
          </p>
        </div>
      </div>
    </div>
  )
}
