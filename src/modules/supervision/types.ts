/** حضور و غیاب دستگاه نظارت — supervisors / employer representatives, their days, meals and rented vehicles. */

export type SvSide = 'supervision' | 'employer'
/** present & mission are working days; rest = the monthly rest allowance; sick = medical leave (excused); absent = unexcused. */
export type SvStatus = 'present' | 'mission' | 'rest' | 'sick' | 'absent'
export type SvVehicleStatus = 'present' | 'absent' | 'repair'
export type SvVehicleKind = 'sedan' | 'pickup' | 'suv' | 'van' | 'minibus' | 'other'
export type SvSource = 'manual' | 'clock'

export interface SvSettings {
  dutyDays: number
  standardHours: number
  overtimeMin: number
  overtimeMax: number
  vehicleHours: number
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
}

export interface SvVehicle {
  id: string
  projectId: string
  title: string
  plate: string
  kind: SvVehicleKind
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
}

export interface SvVehicleDay {
  vehicleId: string
  day: string
  status: SvVehicleStatus
  hours: number
  km: number | null
  source: SvSource
  note: string
}
