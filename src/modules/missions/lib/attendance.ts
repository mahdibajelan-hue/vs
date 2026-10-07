import type { Evidence, Mission } from '../types'

/**
 * Attendance proof: a photo of the meeting or the site, taken during the mission. The browser reads the capture
 * time (EXIF) before compressing the picture; a photo taken within the mission dates (±1 day) is «verified»,
 * a photo whose file carries no date is «unverified», one taken on another day is «outside».
 */
export type AttendanceStatus = 'verified' | 'unverified' | 'outside' | 'none'

export interface Attendance {
  status: AttendanceStatus
  photos: number
  verified: number
  unverified: number
  outside: number
}

export const MAX_PHOTOS_PER_MISSION = 12

export function attendanceOf(evidence: Evidence[], mission: Pick<Mission, 'startDate' | 'endDate'>): Attendance {
  const from = new Date(`${mission.startDate}T00:00:00`).getTime() - 24 * 3600 * 1000
  const to = new Date(`${mission.endDate}T23:59:59`).getTime() + 24 * 3600 * 1000
  const photos = evidence.filter((e) => e.kind === 'photo')
  let verified = 0
  let unverified = 0
  let outside = 0
  for (const p of photos) {
    if (!p.capturedAt) unverified++
    else {
      const t = new Date(p.capturedAt).getTime()
      if (t >= from && t <= to) verified++
      else outside++
    }
  }
  const status: AttendanceStatus = verified ? 'verified' : unverified ? 'unverified' : outside ? 'outside' : 'none'
  return { status, photos: photos.length, verified, unverified, outside }
}

/** 0-100 for the quality score. */
export function attendanceScore(a: Attendance): number {
  return a.status === 'verified' ? 100 : a.status === 'unverified' ? 60 : a.status === 'outside' ? 30 : 0
}

export const ATTENDANCE_TEXT: Record<AttendanceStatus, string> = {
  verified: 'حضور شما با عکس تأیید شد.',
  unverified: 'عکس بارگذاری شده، ولی تاریخ گرفتن آن در فایل نیست؛ برای تأیید کامل، با دوربین همین‌جا عکس بگیرید.',
  outside: 'تاریخ عکس‌ها خارج از بازهٔ مأموریت است؛ یک عکس از خود جلسه یا بازدید بگیرید.',
  none: 'هنوز عکسی از جلسه یا بازدید بارگذاری نشده است؛ بدون آن امتیاز گزارش کم می‌شود.',
}
