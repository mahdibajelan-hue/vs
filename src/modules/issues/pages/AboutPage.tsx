import { CalendarClock, Gauge, MapPin, ShieldCheck, Sparkles, Workflow } from 'lucide-react'

const FEATURES = [
  { icon: Workflow, text: 'ثبت مشکل با تعیین مسئول انجام و مسئول تایید و مهلت مشخص' },
  { icon: CalendarClock, text: 'رینگ شمارش‌معکوس مهلت روی هر مشکل، با هشدار خودکار تاخیر' },
  { icon: Gauge, text: 'داشبورد مدیریتی با شاخص‌های کلیدی، توزیع وضعیت و اولویت' },
  { icon: ShieldCheck, text: 'گردش کار تایید دو مرحله‌ای: شروع اقدام → ارسال برای تایید → تایید یا رد نهایی' },
]

export function AboutPage() {
  return (
    <div>
      <div className="im-card" style={{ padding: 32, textAlign: 'center', position: 'relative', overflow: 'hidden', marginBottom: 14 }}>
        <div
          style={{
            position: 'absolute',
            insetInline: 0,
            top: 0,
            height: 3,
            background: 'linear-gradient(90deg, transparent, var(--im-amber), var(--im-coral), transparent)',
          }}
        />
        <div className="im-brand-mark" style={{ width: 64, height: 64, fontSize: 26, margin: '0 auto 16px' }}>
          ر
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>درباره ما</h1>
        <div style={{ fontSize: 13.5, color: 'var(--im-muted-2)', lineHeight: 2, textAlign: 'justify', maxWidth: 640, margin: '0 auto' }}>
          <p style={{ marginBottom: 12 }}>
            رصد یک سامانه‌ی سبک برای پیگیری مشکلات و موانع اجرایی پروژه است؛ برای هر مشکل، مسئول انجام، مسئول تایید و
            مهلت اقدام تعریف می‌شود و روند آن از ثبت تا تایید نهایی به‌صورت شفاف پیگیری می‌گردد.
          </p>
          <p style={{ marginBottom: 12 }}>
            با رصد کردن رینگ شمارش‌معکوس هر مورد، گزارش خودکار تاخیرها و شاخص‌های کلیدی داشبورد، تیم پروژه می‌تواند
            مشکلات را زودتر شناسایی، اولویت‌بندی و حل کند — پیش از آنکه به ریسک واقعی برنامه تبدیل شوند.
          </p>
          <p style={{ fontWeight: 600, color: 'var(--im-amber)' }}>با رصد؛ هیچ مشکلی گم نمی‌شود و هیچ مهلتی بی‌صدا نمی‌گذرد.</p>
        </div>

        <div style={{ marginTop: 28, paddingTop: 24, borderTop: '1px solid var(--im-line)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <p style={{ fontWeight: 800, fontSize: 26, color: 'var(--im-amber)' }}>رصد</p>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--im-coral)' }}>PROJECT ISSUE TRACKING</p>
          <p style={{ marginTop: 12, fontSize: 12, color: 'var(--im-muted)' }}>by</p>
          <p style={{ fontFamily: "'Dancing Script', cursive", fontSize: 30, color: 'var(--im-amber)', lineHeight: 1 }}>Mahdi Bajelan</p>
        </div>
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 12, fontWeight: 800, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={13} style={{ color: 'var(--im-amber)' }} /> امکانات کلیدی
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {FEATURES.map(({ icon: Icon, text }, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 10, background: 'var(--im-panel-2)', padding: 10, fontSize: 12 }}>
              <Icon size={13} style={{ flexShrink: 0, marginTop: 2, color: i % 2 ? 'var(--im-coral)' : 'var(--im-amber)' }} />
              <span style={{ color: 'var(--im-muted-2)' }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="im-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, color: 'var(--im-muted)', lineHeight: 1.9 }}>
        <MapPin size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <p>داده‌های این سامانه به‌صورت ابری (Supabase) ذخیره می‌شوند و فقط بین اعضای دعوت‌شده هر پروژه به اشتراک گذاشته می‌شوند.</p>
      </div>
    </div>
  )
}
