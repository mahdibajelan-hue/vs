/** Compact app mark (icon only) — used in tight spaces like the sidebar header and report title. */
export function Logo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}logo-icon.png`}
      alt="لوگوی سامانه پایش پیشرفت ایزومتریک لوله‌کشی"
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
      alt="IsoTrack — سامانه پایش پیشرفت ایزومتریک لوله‌کشی"
      width={width}
      className={`object-contain ${className}`}
      style={{ width, height: 'auto' }}
    />
  )
}
