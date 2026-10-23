/** حضور و غیاب دستگاه نظارت — supervisors / employer representatives, their days, meals and rented vehicles. */

export type SvSide = 'supervision' | 'employer'
/** present & mission are working days; rest = the monthly rest allowance; sick = medical leave (excused); absent = unexcused. */
export type SvStatus = 'present' | 'mission' | 'rest' | 'sick' | 'absent'
export type SvVehicleStatus = 'present' | 'absent' | 'repair'
export type SvVehicleKind = 'sedan' | 'pickup' | 'suv' | 'van' | 'minibus' | 'other'
export type SvGearbox = 'manual' | 'automatic'
export type SvOwnership = 'rented' | 'company'
export type SvSource = 'manual' | 'clock'

export interface SvSettings {
  dutyDays: number
  standardHours: number
  overtimeMin: number
  overtimeMax: number
  vehicleHours: number
  /** days back (besides today) that can be recorded without a written reason */
  entryGraceDays: number
}

export interface SvPerson {
  id: string
  projectId: string
  fullName: string
  side: SvSide
  roleTitle: string
  nationalId: string
  mobile: string
  cardNo: string
  /** null = the project's overtime ceiling */
  overtimeCap: number | null
  mealBreakfast: boolean
  mealLunch: boolean
  mealDinner: boolean
  /** usual working hours, e.g. 07:00–15:00, or 19:00–07:00 for a night shift (null = not set: a day counts the standard 8 hours) */
  shiftStart: string | null
  shiftEnd: string | null
  startDate: string | null
  endDate: string | null
  active: boolean
  note: string
}

/** Meals given to a temporary guest (visitor) on one day, as counts. */
export interface SvGuestMeal {
  id: string
  day: string
  guestName: string
  organization: string
  host: string
  breakfast: number
  lunch: number
  dinner: number
  note: string
  lateReason?: string
}

export interface SvVehicle {
  id: string
  projectId: string
  title: string
  plate: string
  kind: SvVehicleKind
  /** model year as written on the papers (e.g. 1401 or 2022) */
  modelYear: number | null
  /** engine size in cc */
  engineCc: number | null
  gearbox: SvGearbox | null
  ownership: SvOwnership
  lessor: string
  driver: string
  personId: string | null
  cardNo: string
  startDate: string | null
  endDate: string | null
  active: boolean
  note: string
}

export interface SvAttendance {
  personId: string
  day: string
  status: SvStatus
  checkIn: string | null
  checkOut: string | null
  hours: number
  overtime: number
  breakfast: boolean
  lunch: boolean
  dinner: boolean
  source: SvSource
  note: string
  /** why the day was written after the entry window (server-enforced) */
  lateReason?: string
  /** server time of the first entry / last change (set by a trigger, not the browser) */
  createdAt?: string
  updatedAt?: string
}

/** Monthly sign-off: open → prepared (تهیه، سرپرست نظارت) → approved (تأیید، مدیر پروژهٔ کارفرما). Anything but open locks the month's days.
 *  'reviewed' is a retired middle step kept only for old rows. */
export type SvSignoffStatus = 'open' | 'prepared' | 'reviewed' | 'approved'
export type SvSignStep = Exclude<SvSignoffStatus, 'open'>

export interface SvSignoff {
  month: string
  status: SvSignoffStatus
  from: string
  to: string
}

/** Report totals frozen into a signature, to show when the figures changed after signing. */
export interface SvSnapshot {
  people: number
  worked: number
  required: number
  shortfall: number
  hours: number
  overtime: number
  breakfast: number
  lunch: number
  dinner: number
  vehicleDays: number
  vehicleHours: number
}

export interface SvSignature {
  id: string
  month: string
  step: SvSignStep
  userId: string
  signerName: string
  signerTitle: string
  image: string
  note: string
  snapshot: Partial<SvSnapshot>
  signedAt: string
  revokedAt: string | null
  revokeReason: string | null
}

export interface SvVehicleDay {
  vehicleId: string
  day: string
  status: SvVehicleStatus
  hours: number
  km: number | null
  source: SvSource
  note: string
  lateReason?: string
  createdAt?: string
  updatedAt?: string
}
