import { make, tone } from '../radar/industryIcons'

/**
 * Icons of the home page's organization-wide tools — the same family as the project menu's (radar/industryIcons.tsx):
 * the plainest picture of each title, on a 24-unit grid with a round stroke and one soft filled shape.
 */

/** مدیریت سبد پروژه‌ها — a portfolio case holding several projects' bars */
export const IcPortfolio = make('IcPortfolio', <>
  <rect x="2.5" y="7" width="19" height="13" rx="2.5" {...tone} />
  <rect x="2.5" y="7" width="19" height="13" rx="2.5" /><path d="M8.5 7V5.500a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V7" />
  <path d="M8 16.500v-2.500M12 16.500v-5.500M16 16.500v-4" />
</>)

/** گزارش هوشمند و تحلیل — a report with a chart, and the spark of the assistant */
export const IcSmartReport = make('IcSmartReport', <>
  <path d="M5 3h9l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" {...tone} />
  <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
  <path d="M8.5 17v-2.500M12 17v-5M15.5 17v-3.5" />
  <path d="M17.5 2.5 18.4 5l2.6.900-2.6.900-.9 2.7-.9-2.700L14 5.9 16.6 5z" fill="currentColor" fillOpacity=".3" />
</>)

/** برآورد پروژه‌ها — a calculator */
export const IcEstimate = make('IcEstimate', <>
  <rect x="7" y="5.5" width="10" height="4" rx="1" fill="currentColor" fillOpacity=".3" stroke="none" />
  <rect x="4.5" y="2.5" width="15" height="19" rx="2.5" /><rect x="7" y="5.5" width="10" height="4" rx="1" />
  <path d="M8 13.500h.01M12 13.500h.01M16 13.500h.01M8 17.500h.01M12 17.500h.01" strokeWidth="2.4" /><path d="M16 16.500v2" strokeWidth="2.4" />
</>)

/** مأموریت و بازدید پروژه — a route across the map to the site pin */
export const IcMission = make('IcMission', <>
  <path d="M17 12.500c-2.2-2.5-3.3-4.3-3.3-5.900a3.3 3.3 0 0 1 6.6 0c0 1.6-1.1 3.4-3.3 5.900z" {...tone} />
  <path d="M17 12.500c-2.2-2.5-3.3-4.3-3.3-5.900a3.3 3.3 0 0 1 6.6 0c0 1.6-1.1 3.4-3.3 5.900z" /><circle cx="17" cy="6.6" r="1" fill="currentColor" stroke="none" />
  <circle cx="5.5" cy="18.5" r="2" /><path d="M7.5 18.500H14a2.5 2.5 0 0 0 0-5h-3.500a2.5 2.5 0 0 1 0-5H11" strokeDasharray="2.4 2" />
</>)

/** حضور و غیاب دستگاه نظارت — a person, present and checked */
export const IcAttendance = make('IcAttendance', <>
  <circle cx="9.5" cy="7.5" r="3.7" {...tone} />
  <circle cx="9.5" cy="7.5" r="3.7" /><path d="M2.5 20.500v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 2.2.400" />
  <circle cx="17.5" cy="17.5" r="4.3" fill="currentColor" fillOpacity=".3" /><path d="m15.6 17.6 1.4 1.4 2.4-2.8" />
</>)

/** ارزیابی شایستگی عوامل فنی — a qualification medal */
export const IcCompetency = make('IcCompetency', <>
  <circle cx="12" cy="9" r="6" {...tone} />
  <circle cx="12" cy="9" r="6" /><path d="m8.5 14 -1.5 7.5 5-2.7 5 2.7-1.5-7.5" />
  <path d="m12 5.8 1 2.1 2.3.300-1.7 1.6.400 2.3-2-1.1-2 1.1.400-2.3-1.7-1.6 2.3-.300z" fill="currentColor" fillOpacity=".3" strokeWidth="1.3" />
</>)

/** مدیریت کاربران و داده‌های پایه — a user with a settings gear */
export const IcUsersAdmin = make('IcUsersAdmin', <>
  <circle cx="9" cy="7.5" r="3.7" {...tone} />
  <circle cx="9" cy="7.5" r="3.7" /><path d="M2 20.500v-1a6 6 0 0 1 6-6h2c.6 0 1.2.100 1.7.300" />
  <circle cx="17.5" cy="17.5" r="2.3" /><path d="M17.5 13.200v1.500M17.5 20.300v1.500M13.8 15.300l1.3.800M19.9 18.900l1.3.800M13.8 19.700l1.3-.800M19.9 16.100l1.3-.8" />
</>)
