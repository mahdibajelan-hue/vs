import type { ComponentType, ReactNode, SVGProps } from 'react'

/**
 * Icons of the project menu. Each one is the plainest picture of its module's title — a warning triangle for risk, a
 * calendar with a clock for scheduling, a hard hat for execution — so a module can be told from its icon alone when the
 * menu rests as a strip. Drawn on lucide's 24-unit grid with the same round 1.8 stroke, plus one soft filled shape
 * (the duotone layer, in the icon's own colour) that gives each a body at small sizes.
 */
export type IconProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & { size?: number | string; strokeWidth?: number | string }
export type NavIcon = ComponentType<IconProps>

function make(name: string, body: ReactNode): NavIcon {
  const Icon = ({ size = 24, strokeWidth = 1.8, ...rest }: IconProps) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>{body}</svg>
  )
  Icon.displayName = name
  return Icon
}

/** the duotone layer: a soft fill in the icon's own colour, no outline */
const tone = { fill: 'currentColor', fillOpacity: 0.2, stroke: 'none' } as const

/** رادار پروژه — a radar scope with its sweep and a contact */
export const IcRadar = make('IcRadar', <>
  <path d="M12 12 18.4 5.6A9 9 0 0 1 21 12z" {...tone} />
  <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" opacity=".55" />
  <path d="M12 12 18.4 5.6" /><circle cx="15.6" cy="15" r="1.3" fill="currentColor" stroke="none" />
</>)

/** داشبورد پروژه — a board of tiles */
export const IcDashboard = make('IcDashboard', <>
  <rect x="3" y="3" width="8" height="10" rx="2" {...tone} /><rect x="13" y="11" width="8" height="10" rx="2" {...tone} />
  <rect x="3" y="3" width="8" height="10" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" />
  <rect x="13" y="11" width="8" height="10" rx="2" /><rect x="3" y="16" width="8" height="5" rx="2" />
</>)

/** مرکز سلامت پروژه — a heart with a pulse across it */
export const IcHealth = make('IcHealth', <>
  <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.500c0 2.3 1.5 4 3 5.5l7 7z" {...tone} />
  <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.500c0 2.3 1.5 4 3 5.500l7 7z" />
  <path d="M3.2 12h5.300l1-2 2 4.5 2-7 1.5 4.500h5.8" />
</>)

/** چرخهٔ عمر (Stage-Gate) — a cycle, with a gate (the diamond of a decision) at its centre */
export const IcLifecycle = make('IcLifecycle', <>
  <path d="M3 12a9 9 0 0 1 15.5-6.200L21 8" /><path d="M21 3v5h-5" />
  <path d="M21 12a9 9 0 0 1-15.5 6.200L3 16" /><path d="M3 21v-5h5" />
  <path d="m12 8.3 3.7 3.7-3.7 3.700L8.3 12z" fill="currentColor" fillOpacity=".3" />
</>)

/** برنامه‌ریزی و کنترل زمان — a calendar with a clock */
export const IcSchedule = make('IcSchedule', <>
  <path d="M3 9.500h18V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" {...tone} />
  <path d="M21 10.500V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h5.5" /><path d="M3 9.500h18M8 2v4M16 2v4" />
  <circle cx="17" cy="17" r="5" /><path d="M17 14.800V17l1.6 1.1" />
</>)

/** پیشرفت مهندسی — a drafting compass drawing an arc */
export const IcEngineering = make('IcEngineering', <>
  <circle cx="12" cy="5" r="2" fill="currentColor" fillOpacity=".3" />
  <path d="M11.1 6.8 6.5 20M12.9 6.8 17.5 20" /><path d="M9.2 12.500h5.6" />
  <path d="M3.5 14.500a9.5 9.5 0 0 0 17 0" opacity=".6" />
</>)

/** کنترل و تأمین کالا — a packed crate */
export const IcGoods = make('IcGoods', <>
  <path d="m3 8 9-5 9 5-9 5z" {...tone} />
  <path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /><path d="m7.5 5.5 9 5v3" />
</>)

/** مدیریت اجرا — a site hard hat */
export const IcConstruction = make('IcConstruction', <>
  <path d="M4 15v-3a8 8 0 0 1 16 0v3z" {...tone} />
  <rect x="2" y="15" width="20" height="4" rx="1" /><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" />
  <path d="M4 15v-3a8 8 0 0 1 6-7.700M14 4.300A8 8 0 0 1 20 12v3" />
</>)

/** کنترل کیفیت — an inspector's magnifier with a pass mark */
export const IcQuality = make('IcQuality', <>
  <circle cx="10.5" cy="10.5" r="7" {...tone} />
  <circle cx="10.5" cy="10.5" r="7" /><path d="m21 21-5.5-5.5" /><path d="m7.4 10.7 2.2 2.2 3.9-4.3" />
</>)

/** آزمایش‌ها (هیدروتست) — a pressure gauge and a drop of water */
export const IcHydrotest = make('IcHydrotest', <>
  <circle cx="10" cy="10" r="7" /><path d="m10 10 3-3" /><circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
  <path d="M5.5 10h1M10 5.500v1M14.5 10h-1" opacity=".6" />
  <path d="M18.7 14.500c-1.5 1.9-2.2 3.1-2.2 4a2.2 2.2 0 0 0 4.4 0c0-.9-.7-2.1-2.2-4z" fill="currentColor" fillOpacity=".3" />
</>)

/** ایستگاه‌ها (پایپینگ و جوشکاری) — a flanged pipe elbow, with a welding spark at the joint */
export const IcPiping = make('IcPiping', <>
  <path d="M5 6.500h6.500a6 6 0 0 1 6 6V19h-5v-6.500a1 1 0 0 0-1-1H5z" {...tone} />
  <path d="M5 6.500h6.500a6 6 0 0 1 6 6V19M5 11.500h6.500a1 1 0 0 1 1 1V19" /><path d="M5 4.500v9M10.5 19h9" />
  <path d="M19.5 2.500v4M17.5 4.500h4" />
</>)

/** آمادگی راه‌اندازی (PSSR) — a safety shield around the start button */
export const IcStartup = make('IcStartup', <>
  <path d="M12 3 19 6v5c0 4.6-3 8.2-7 10-4-1.8-7-5.4-7-10V6z" {...tone} />
  <path d="M12 3 19 6v5c0 4.6-3 8.2-7 10-4-1.8-7-5.4-7-10V6z" /><path d="M12 8v3.8" /><path d="M9.5 10a3.7 3.7 0 1 0 5 0" />
</>)

/** راهبرد و روش اجرا — a signpost: several ways, one chosen */
export const IcStrategy = make('IcStrategy', <>
  <path d="M12 4.500h6l2 2.2-2 2.300h-6z" {...tone} />
  <path d="M12 2.500V21M8.5 21h7" /><path d="M12 4.500h6l2 2.2-2 2.300h-6" /><path d="M12 11.500H6l-2 2.2 2 2.300h6" />
</>)

/** قراردادها و مالی — a signed contract and a coin */
export const IcContract = make('IcContract', <>
  <circle cx="17" cy="17" r="4.3" fill="currentColor" fillOpacity=".3" />
  <path d="M11 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6l5 5v2.5" /><path d="M13 3v5h5" /><path d="M8.5 12h3.500M8.5 15.500h2" />
  <circle cx="17" cy="17" r="4.3" /><path d="M17 15.200v3.6" />
</>)

/** تولید صورت‌وضعیت — a payment statement: a slip with its lines and a total */
export const IcStatement = make('IcStatement', <>
  <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.400L6 21z" {...tone} />
  <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.400L6 21z" /><path d="M9 7.500h6M9 11h6" /><path d="M12 15h3" />
</>)

/** مدیریت تغییرات — two arrows changing places */
export const IcChange = make('IcChange', <>
  <path d="M4 8h13.5" /><path d="m14 4.5 3.5 3.5-3.5 3.5" /><path d="M20 16H6.5" /><path d="M10 12.5 6.5 16l3.5 3.5" />
</>)

/** مدیریت ریسک — a warning sign */
export const IcRisk = make('IcRisk', <>
  <path d="M10.3 4 2.6 17.500a2 2 0 0 0 1.7 3h15.400a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z" {...tone} />
  <path d="M10.3 4 2.6 17.500a2 2 0 0 0 1.7 3h15.400a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z" /><path d="M12 9.500V14" />
  <circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none" />
</>)

/** موانع و اقدامات — a road barrier */
export const IcBarrier = make('IcBarrier', <>
  <rect x="2.5" y="8" width="19" height="6" rx="1.5" {...tone} />
  <rect x="2.5" y="8" width="19" height="6" rx="1.5" /><path d="m8 8-3 6M13 8l-3 6M18 8l-3 6" />
  <path d="M6.5 14v6.500M17.5 14v6.500M6.5 8V5M17.5 8V5" />
</>)

/** مدیریت ذینفعان — a group of people */
export const IcPeople = make('IcPeople', <>
  <circle cx="12" cy="8" r="3.2" {...tone} />
  <circle cx="12" cy="8" r="3.2" /><path d="M6.5 20v-.500a5.5 5.5 0 0 1 11 0v.5" />
  <circle cx="4.8" cy="10" r="2" opacity=".65" /><path d="M2 18c0-1.9 1-3.3 2.6-3.9" opacity=".65" />
  <circle cx="19.2" cy="10" r="2" opacity=".65" /><path d="M22 18c0-1.9-1-3.3-2.6-3.9" opacity=".65" />
</>)

/** تملک و آزادسازی اراضی — a parcel of land with a location pin */
export const IcLand = make('IcLand', <>
  <path d="M12 16.500c-3-3.4-4.5-5.9-4.5-8a4.5 4.5 0 0 1 9 0c0 2.1-1.5 4.6-4.5 8z" {...tone} />
  <path d="M7.3 13H6l-3.5 7.500h19L18 13h-1.3" />
  <path d="M12 16.500c-3-3.4-4.5-5.9-4.5-8a4.5 4.5 0 0 1 9 0c0 2.1-1.5 4.6-4.5 8z" /><circle cx="12" cy="8.5" r="1.5" />
</>)

/** PipePulse — a pipe with a pulse running through it */
export const IcPipePulse = make('IcPipePulse', <>
  <path d="M2 6.500h20M2 17.500h20" /><path d="M5 4.500v15M19 4.500v15" opacity=".6" />
  <path d="M7 12h2.300l1.4-3 2.2 6 1.4-3H17" />
</>)

/** دوقلوی دیجیتال — a 3D model inside a scan frame */
export const IcTwin = make('IcTwin', <>
  <path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3" opacity=".6" />
  <path d="m7 9.3 5-2.8 5 2.8-5 2.700z" fill="currentColor" fillOpacity=".3" stroke="none" />
  <path d="m12 6.5 5 2.800v5.400l-5 2.8-5-2.800V9.300z" /><path d="m7 9.3 5 2.7 5-2.700M12 12v5.5" />
</>)

/** صفحهٔ اصلی — a house */
export const IcHome = make('IcHome', <>
  <path d="M5 10.500V20h14v-9.500L12 4z" {...tone} />
  <path d="m3 11.5 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-5.500h4V20" />
</>)
