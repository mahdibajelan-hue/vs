import { Mail } from 'lucide-react'

const DEV_EMAIL = 'bajelanmahdi6900@gmail.com'

/** The "about" copy, set as a quiet footnote directly under the hero tagline (no box, no heading)
 * — system blurb, developer credit + contact, motto and the signature, all in a thin, faded type
 * so it reads as a colophon beneath the wordmark rather than competing with the login card. */
export function AboutNote() {
  return (
    <div className="hub-fade-in flex max-w-md flex-col items-center gap-3 text-center font-light text-zinc-500 md:items-end md:text-left" style={{ animationDelay: '200ms' }}>
      <p className="text-[12.5px] leading-7 md:text-justify md:[text-align-last:left]">
        از رادار هوشمند پروژه، ریسک، مسائل، مالی و قرارداد تا ارزیابی شایستگی، شخصیت و توسعه نیروی انسانی، همه در یک سامانه واحد و متصل به
        هم.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] md:justify-end">
        <span>
          توسعه‌دهنده: <span className="text-zinc-400">مهدی باجلان</span>
        </span>
        <span className="hidden text-zinc-700 sm:inline">|</span>
        <a href={`mailto:${DEV_EMAIL}`} className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-300" dir="ltr">
          <Mail size={11} /> {DEV_EMAIL}
        </a>
      </div>

      <p dir="ltr" className="text-[11px] tracking-wide text-zinc-600">
        From Data to Insight. From Insight to Action.
      </p>

      <img
        src={`${import.meta.env.BASE_URL}signature-mahdi.png`}
        alt="Mahdi Bajelan — Software Engineer"
        className="mt-1 h-24 w-auto self-center opacity-80 sm:h-28"
        onError={(e) => {
          // Falls back to a styled text signature if signature-mahdi.png is ever missing from public/.
          e.currentTarget.style.display = 'none'
          e.currentTarget.nextElementSibling?.classList.remove('hidden')
        }}
      />
      <p style={{ fontFamily: "'Dancing Script', cursive" }} className="hidden self-center text-3xl leading-none text-[#c9a227]/80">
        Mahdi Bajelan
      </p>
    </div>
  )
}
