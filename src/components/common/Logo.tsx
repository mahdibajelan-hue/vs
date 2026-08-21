/** Compact app mark (icon only) — used in tight spaces like the sidebar header and report title. */
export function Logo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}logo-icon.png`}
      alt="لوگوی PipePulse"
      width={size}
      height={size}
      className={`object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

/** Full brand lockup (icon + wordmark + tagline) — used on hero / front-door screens. */
export function LogoFull({ width = 220, className = '' }: { width?: number; className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}logo-full.png`}
      alt="PipePulse — Piping Progress Intelligence"
      width={width}
      className={`object-contain ${className}`}
      style={{ width, height: 'auto' }}
    />
  )
}

/**
 * Platform-level brand mark for RASTA itself (as opposed to PipePulse, one of its five modules)
 * — the same identity already used in the module hub's header, scaled up for a centered hero
 * spot. Built from CSS/text, not an image, so it never shows a broken-image icon and always
 * matches the current theme.
 */
export function RastaMark({ size = 64, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div
        className="flex items-center justify-center rounded-2xl border"
        style={{ width: size, height: size, borderColor: 'rgba(201,162,39,0.35)', background: 'rgba(201,162,39,0.08)' }}
      >
        <span className="rasta-wordmark" style={{ fontWeight: 800, fontSize: size * 0.46 }}>
          R
        </span>
      </div>
      <p className="rasta-wordmark mt-2" style={{ fontWeight: 800, fontSize: size * 0.34 }}>
        RASTA
      </p>
      <div className="rasta-brokenline mt-1">
        <span className="rasta-brokenline-seg" />
        <span className="rasta-brokenline-dot" />
        <span className="rasta-brokenline-seg is-reverse" />
      </div>
    </div>
  )
}
