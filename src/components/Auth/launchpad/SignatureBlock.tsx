/** Carried over from the old split login screen's intro panel (same tagline, broken-line motif
 * and signature image/fallback) — now living on the unified launchpad instead, since that screen
 * no longer exists as a separate step. */
export function SignatureBlock() {
  return (
    <div className="hub-fade-in relative z-10 mx-auto flex max-w-4xl flex-col items-center gap-2.5 px-6 pb-8 pt-2 text-center sm:px-10" style={{ animationDelay: '460ms' }}>
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
  )
}
