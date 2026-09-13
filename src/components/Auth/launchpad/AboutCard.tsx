import { Mail } from 'lucide-react'

const DEV_EMAIL = 'bajelanmahdi6900@gmail.com'

/** The one "درباره ما" box on the launchpad — system blurb, developer credit + contact, and the
 * tagline/signature that used to live in the old split login screen's intro panel. Built on the
 * same `hub-grid-card` shell as the module cards (border, hover-elevate, cursor spotlight) for a
 * consistent look, just not a button since nothing on it navigates except the mailto link. */
export function AboutCard() {
  return (
    <div
      className="hub-grid-card hub-fade-in mx-auto w-full max-w-lg rounded-2xl border p-6 text-center"
      style={{ borderColor: 'var(--border-soft)', animationDelay: '440ms' }}
    >
      <div className="hub-grid-card-glow" style={{ background: '#c9a227' }} />
      <div className="relative z-10">
        <p className="text-sm font-extrabold">درباره ما</p>
        <p className="eyebrow-en mt-0.5" dir="ltr">
          About Us
        </p>
        <p className="mt-3 text-[12.5px] leading-6 text-secondary">
          RASTA پلتفرم یکپارچه مدیریت و کنترل پروژه‌های EPC است — از رادار هوشمند پروژه تا ریسک، مسائل، مالی، قرارداد و تصمیم مدیریتی، همه در یک
          سامانه واحد و متصل به هم.
        </p>

        <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border-soft)' }}>
          <p className="text-xs text-secondary">
            توسعه‌دهنده: <span className="font-bold text-current">مهدی باجلان</span>
          </p>
          <a
            href={`mailto:${DEV_EMAIL}`}
            className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-brand-400"
            dir="ltr"
          >
            <Mail size={11} /> {DEV_EMAIL}
          </a>
        </div>

        <div className="mt-5 flex flex-col items-center gap-2.5">
          <p dir="ltr" className="text-xs font-medium tracking-wide text-secondary">
            From Data to Insight. From Insight to Action.
          </p>
          <div className="rasta-brokenline">
            <span className="rasta-brokenline-seg" />
            <span className="rasta-brokenline-dot" />
            <span className="rasta-brokenline-seg is-reverse" />
          </div>
          <img
            src={`${import.meta.env.BASE_URL}signature-mahdi.png`}
            alt="Mahdi Bajelan — Software Engineer"
            className="mt-0.5 h-16 w-auto sm:h-20"
            style={{ filter: 'drop-shadow(0 4px 20px rgba(201,162,39,0.4))' }}
            onError={(e) => {
              // Falls back to a styled text signature if signature-mahdi.png is ever missing from public/.
              e.currentTarget.style.display = 'none'
              e.currentTarget.nextElementSibling?.classList.remove('hidden')
            }}
          />
          <p style={{ fontFamily: "'Dancing Script', cursive", color: '#c9a227' }} className="hidden text-2xl font-bold leading-none">
            Mahdi Bajelan
          </p>
        </div>
      </div>
    </div>
  )
}
