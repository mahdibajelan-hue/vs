export type LineStatus = 'not_started' | 'in_progress' | 'testing' | 'completed'

export const STATUS_COLOR: Record<LineStatus, string> = {
  completed: '#2ecc71',
  in_progress: '#f1c40f',
  not_started: '#e74c3c',
  testing: '#3498db',
}

export const STATUS_LABEL_FA: Record<LineStatus, string> = {
  completed: 'تکمیل شده',
  in_progress: 'در حال اجرا',
  not_started: 'اجرا نشده',
  testing: 'در حال تست',
}

export interface IsoLine {
  id: string
  svgElementId: string
  size: string
  spec: string
  service: string
  contractor: string
  plannedLength: number
  totalWelds: number
  status: LineStatus
  createdAt: string
}

export interface DailyLog {
  id: string
  lineId: string
  date: string
  lengthDone: number
  weldCount: number
  weldPass: 'root' | 'hot' | 'fill' | 'cap' | 'ndt' | 'hydrotest'
  contractor: string
  notes: string
  delayReason: string
  createdAt: string
}

export interface PlannedProgressPoint {
  date: string
  plannedPercent: number
}

export interface Project {
  id: string
  name: string
  client: string
  location: string
  unit: string
  svgRaw: string | null
  svgFileName: string | null
  lines: IsoLine[]
  logs: DailyLog[]
  plannedCurve: PlannedProgressPoint[]
  createdAt: string
}

export type ThemeMode = 'dark' | 'light'
