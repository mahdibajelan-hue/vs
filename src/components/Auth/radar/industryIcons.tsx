import type { ComponentType, ReactNode, SVGProps } from 'react'

/**
 * Industrial line icons for the project menu — the world of a pipeline / refinery / petrochemical / oil-and-gas-well
 * construction project. Drawn on lucide's 24-unit grid with the same round 1.8 stroke, so they sit beside lucide icons
 * without looking foreign. Each picture says what the module does in the plant's own vocabulary: Stage-Gate is a
 * gate valve, obstacles are a spectacle blind, risk is a flare, the digital twin is a wellhead (Christmas tree).
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

/** رادار پروژه — a radar scope sweeping the site */
export const IcRadarScope = make('IcRadarScope', <>
  <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" opacity=".55" />
  <path d="M12 12 18.4 5.6" /><circle cx="15.6" cy="15" r="1.3" fill="currentColor" stroke="none" />
</>)

/** داشبورد پروژه — a control-room panel: a pressure dial and level bars */
export const IcControlPanel = make('IcControlPanel', <>
  <rect x="3" y="4" width="18" height="12" rx="2" /><circle cx="8.5" cy="10" r="2.8" /><path d="m8.5 10 1.7-1.5" />
  <path d="M14 13v-3M16.6 13V7.5M19 13v-2" /><path d="M12 16v3.5M8.5 19.5h7" />
</>)

/** مرکز سلامت — a pressure gauge with a heartbeat across its face */
export const IcPulseGauge = make('IcPulseGauge', <>
  <circle cx="12" cy="11" r="8.2" /><path d="M5.6 12h2.5l1.5-3 2 5.5 1.6-4.2 1 1.7h4.2" /><path d="M12 19.2v2.3M10 21.5h4" />
</>)

/** چرخهٔ عمر (Stage-Gate) — a gate valve on the line: each phase passes a gate */
export const IcGateValve = make('IcGateValve', <>
  <path d="M2 13h3M19 13h3" /><path d="M5 9.5 12 13l-7 3.5zM19 9.5 12 13l7 3.5z" /><path d="M12 13V6.5M9.3 6.5h5.4" />
</>)

/** برنامه‌ریزی و کنترل زمان — schedule bars and a milestone */
export const IcScheduleBars = make('IcScheduleBars', <>
  <path d="M4 4v16h16" opacity=".6" /><rect x="6.5" y="6" width="7" height="3" rx="1.5" /><rect x="9.5" y="11" width="8.5" height="3" rx="1.5" />
  <rect x="7" y="16" width="5" height="1.6" rx=".8" /><path d="m19.5 4.5 1.8 1.8-1.8 1.8-1.8-1.8z" />
</>)

/** پیشرفت مهندسی — a distillation column, the heart of a refinery design */
export const IcColumn = make('IcColumn', <>
  <rect x="9" y="3" width="6" height="16" rx="3" /><path d="M9 8.5h6M9 12h6M9 15.5h6" opacity=".7" />
  <path d="M15 6h3.5M5.5 14H9" /><path d="M10.3 19v2M13.7 19v2M7.5 21h9" />
</>)

/** کنترل و تأمین کالا — a stack of line pipe on the yard */
export const IcPipeStack = make('IcPipeStack', <>
  <circle cx="6.4" cy="16.6" r="2.8" /><circle cx="12" cy="16.6" r="2.8" /><circle cx="17.6" cy="16.6" r="2.8" />
  <circle cx="9.2" cy="11.8" r="2.8" /><circle cx="14.8" cy="11.8" r="2.8" /><circle cx="12" cy="7" r="2.8" />
  <path d="M2.5 20.6h19" opacity=".6" />
</>)

/** مدیریت اجرا — a construction crane lifting a spool */
export const IcCrane = make('IcCrane', <>
  <path d="M7 21V4M3 4h17M7 7.5 10.5 4" /><path d="M17 4v5" /><rect x="15" y="9" width="4" height="3" rx=".6" />
  <path d="M4 21h6" />
</>)

/** آزمایش‌ها — a hydrotest: water in the pipe, a pressure gauge on top */
export const IcHydroTest = make('IcHydroTest', <>
  <path d="M2 15h20M2 19.5h20" /><circle cx="14" cy="7" r="3.4" /><path d="m14 7 1.8-1.5M14 10.4V15" />
  <path d="M6 5.5c-1.3 1.7-1.9 2.8-1.9 3.6a1.9 1.9 0 0 0 3.8 0c0-.8-.6-1.9-1.9-3.6z" />
</>)

/** ایستگاه‌ها — station piping: a header with valved risers */
export const IcManifold = make('IcManifold', <>
  <path d="M3 7.5h18" /><path d="M6.5 7.5V18M12 7.5V18M17.5 7.5V18" /><path d="M5 12.5h3M10.5 12.5h3M16 12.5h3" />
  <path d="M2.5 20.5h19" opacity=".6" />
</>)

/** آمادگی راه‌اندازی (PSSR) — a safety shield around a valve */
export const IcSafetyValve = make('IcSafetyValve', <>
  <path d="M12 3 19 6v5c0 4.6-3 8.2-7 10-4-1.8-7-5.4-7-10V6z" /><path d="m8.8 11.6 3.2 1.6-3.2 1.6zM15.2 11.6 12 13.2l3.2 1.6z" />
  <path d="M12 13.2V9.4M10.5 9.4h3" />
</>)

/** قراردادها و مالی — an oil barrel and a coin */
export const IcBarrelCoin = make('IcBarrelCoin', <>
  <ellipse cx="10" cy="5" rx="5" ry="1.8" /><path d="M5 5v13c0 1 2.2 1.8 5 1.8M15 5v7" />
  <path d="M5 10.5c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" opacity=".7" /><circle cx="17.6" cy="17" r="3.6" /><path d="M17.6 15.4v3.2" />
</>)

/** تولید صورت‌وضعیت — a measured statement sheet */
export const IcStatement = make('IcStatement', <>
  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" />
  <path d="M8.5 9.5h3M8.5 13h7M8.5 16.5h7" />
</>)

/** مدیریت تغییرات — a re-route: the line leaves the old path at a tee */
export const IcReroute = make('IcReroute', <>
  <path d="M2 8.5h9" /><path d="M11 8.5h11" strokeDasharray="2 2.6" opacity=".6" />
  <path d="M11 8.5c4 0 6 2.5 6 6V21" /><path d="m14.4 18.4 2.6 2.6 2.6-2.6" />
</>)

/** مدیریت ریسک — a flare stack */
export const IcFlare = make('IcFlare', <>
  <path d="M12 21V12.5M9.3 21h5.4M12 16l-3.6 5M12 16l3.6 5" />
  <path d="M12 11c-2.1-1.4-2.6-3.6-1-6 .3 1.2 1 1.8 1.8 2.1.3-1.7 1-3.1 2.2-4.1.3 2.6 1.6 3.7 1.6 5.5A3 3 0 0 1 12 11z" />
</>)

/** موانع و اقدامات — a spectacle blind: the line is blocked until someone acts */
export const IcSpectacleBlind = make('IcSpectacleBlind', <>
  <circle cx="7" cy="12" r="4.2" /><circle cx="7" cy="12" r="1.6" /><path d="M11.2 12h1.6" />
  <circle cx="17" cy="12" r="4.2" fill="currentColor" fillOpacity=".22" />
</>)

/** مدیریت ذینفعان — two hard hats: the people around the job */
export const IcHardHats = make('IcHardHats', <>
  <path d="M12.6 11.2a4.4 4.4 0 0 1 8.8 0M11.9 11.2h10.2" opacity=".65" />
  <path d="M3 17.5a5 5 0 0 1 10 0M2 17.5h12M8 12.5v2.6" />
</>)

/** تملک و آزادسازی اراضی — a pipeline marker post on the right of way */
export const IcRowMarker = make('IcRowMarker', <>
  <path d="M16 19V8" /><path d="M14 5h4v3h-4z" /><path d="M2 19h20" /><path d="M2 22h20" strokeDasharray="2 2" opacity=".6" />
  <path d="M4 16l2-2.4M7.5 16l2-2.4" opacity=".7" />
</>)

/** PipePulse — a pig running through the line */
export const IcPig = make('IcPig', <>
  <path d="M2 7.5h20M2 16.5h20" /><rect x="5" y="9.5" width="7.5" height="5" rx="2.5" />
  <path d="M14 12h1.6l1-2.2 1.6 4.4 1-2.2H21" />
</>)

/** دوقلوی دیجیتال — a wellhead (Christmas tree) inside a scan frame */
export const IcWellhead = make('IcWellhead', <>
  <path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3" opacity=".6" />
  <path d="M12 18V6.5M10 6.5h4" /><path d="m9.8 11.4 2.2 1.1-2.2 1.1zM14.2 11.4 12 12.5l2.2 1.1z" />
  <path d="M12 9h4.5" /><path d="M9 18h6" />
</>)

/** صفحهٔ اصلی — the plant skyline: a tank, a column and a flare */
export const IcPlant = make('IcPlant', <>
  <path d="M2 21h20" /><path d="M3.5 21v-5c0-1 1.3-1.6 3-1.6s3 .6 3 1.6v5" /><path d="M11.5 21V6.5a1.5 1.5 0 0 1 3 0V21" />
  <path d="M18.5 21V10" /><path d="M18.5 8.4c-1-.8-1.1-1.9-.2-3.1.9 1 1.4 1.9 1.2 3.1z" />
</>)
