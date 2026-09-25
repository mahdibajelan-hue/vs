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

export const FARIN_NAME_FA = 'فرین'
export const FARIN_TAGLINE_FA = 'راهکار جامع مدیریت پروژه و توسعه نیروی انسانی'

/**
 * Platform-level brand mark for فرین (FARIN) itself — the whole platform, as opposed to PipePulse
 * or any other single module. The source artwork's wordmark is black-on-transparent, so on the
 * platform's dark surfaces only the teal/gold icon is used as an image and the name is set as live
 * text instead.
 */
export function FarinMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}farin-mark.webp`}
      alt={`لوگوی ${FARIN_NAME_FA}`}
      className={`object-contain ${className}`}
      style={{ height: size, width: 'auto' }}
    />
  )
}
