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
