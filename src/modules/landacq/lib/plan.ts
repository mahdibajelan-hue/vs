import type { Activity, DocMeta, LandEvent, LandSettings, Parcel } from '../types'
import type { Analysis } from './kpis'
import { addDays, diffDays } from './dates'
import { activityDateAt, frontKm } from './schedule'
import { isStarted } from './workflow'
import { describeEvent } from './events'
import { STAGE_LABEL } from './labels'

// ------------------------------------------------------------------------------------------------ last action
export interface LastAction {
  date: string
  text: string
}

/**
 * The most recent thing done on a parcel: a finished workflow step, a registered document, or (when the database keeps one) a
 * logged event — whichever is newest. Nothing is typed in twice; it is read from what the team already recorded.
 */
export function lastActionOf(p: Parcel, events: LandEvent[] = [], today = '9999-12-31'): LastAction | null {
  const c: LastAction[] = []
  for (const s of p.stages) if (s.status === 'done' && s.actualDate && s.actualDate <= today) c.push({ date: s.actualDate, text: `«${STAGE_LABEL[s.key]}» انجام شد` })
  for (const d of p.docs as DocMeta[]) if (d.docDate && d.docDate <= today) c.push({ date: d.docDate, text: `${d.docType || 'سند'}${d.docNumber ? ` ${d.docNumber}` : ''} ثبت شد` })
  for (const e of events) if (e.parcelId === p.id && e.kind !== 'parcel_created') c.push({ date: e.at.slice(0, 10), text: describeEvent(e) })
  return c.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
}

// ------------------------------------------------------------------------------------------------ readiness
/** Ready: free to build. Restricted: not yet free but on track to be before the work arrives. Not ready: will not be free in time. Critical: needs action now. */
export type Readiness = 'ready' | 'restricted' | 'not_ready' | 'critical'
export const READINESS_LABEL: Record<Readiness, string> = { ready: 'Ready', restricted: 'Restricted', not_ready: 'Not Ready', critical: 'Critical' }
export const READINESS_FA: Record<Readiness, string> = { ready: 'آماده اجرا', restricted: 'مشروط', not_ready: 'آماده نیست', critical: 'بحرانی' }
export const READINESS_COLOR: Record<Readiness, string> = { ready: '#22c55e', restricted: '#eab308', not_ready: '#f97316', critical: '#ef4444' }
export const READINESS_ORDER: Readiness[] = ['ready', 'restricted', 'not_ready', 'critical']
export const READINESS_HINT: Record<Readiness, string> = {
  ready: 'زمین آزاد است و جبهه می‌تواند کار کند.',
  restricted: 'زمین هنوز آزاد نشده، اما با روند فعلی پیش از رسیدن جبهه آزاد می‌شود؛ اجرا مشروط به ادامهٔ روند است.',
  not_ready: 'با روند فعلی زمین دیرتر از نیاز برنامه آزاد می‌شود یا تحصیلش هنوز شروع نشده.',
  critical: 'باید همین حالا اقدام شود: زمان شروع تحصیل گذشته، توقف دادگاهی یا Criticality بحرانی.',
}

export function readinessOf(a: Analysis): Readiness {
  if (a.released) return 'ready'
  if (a.stay || a.crit.level === 'critical' || a.early.state === 'action_required') return 'critical'
  if (a.early.state === 'delay_expected') return 'not_ready'
  if (a.early.state === 'unscheduled' && !isStarted(a.parcel)) return 'not_ready'
  return 'restricted'
}

// ------------------------------------------------------------------------------------------------ release plan
export interface PlanRow {
  a: Analysis
  rank: number
  readiness: Readiness
  /** Land Lead Time: working days of acquisition still ahead plus the safety margin. */
  leadDays: number
  startBy: string | null
  needBy: string | null
}

/** The legal unit's proposed release plan: parcels in the order acquisition must begin. */
export function releasePlan(rows: Analysis[], settings: Pick<LandSettings, 'bufferDays'>): PlanRow[] {
  const key = (a: Analysis) => [a.released ? 1 : 0, a.early.startBy ?? a.early.needBy ?? '9999-12-31', -a.crit.score] as const
  return rows
    .map((a) => ({ a, readiness: readinessOf(a), leadDays: a.released ? 0 : a.early.remaining + settings.bufferDays, startBy: a.early.startBy, needBy: a.early.needBy }))
    .sort((x, y) => {
      const kx = key(x.a), ky = key(y.a)
      return kx[0] - ky[0] || kx[1].localeCompare(ky[1]) || kx[2] - ky[2]
    })
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

// ------------------------------------------------------------------------------------------------ construction fronts
export interface Front {
  id: string
  kmStart: number
  kmEnd: number
  length: number
  readiness: Readiness
  parcels: Analysis[]
  /** Earliest day a construction activity needs this stretch. */
  needBy: string | null
  /** When the last parcel of the stretch is expected to be free. */
  expectedRelease: string
  delayDays: number
}

/** Consecutive parcels of the same readiness form one front: the stretches a crew can (or cannot) work on. */
export function frontsOf(rows: Analysis[], today: string): Front[] {
  const out: Front[] = []
  for (const a of [...rows].sort((x, y) => x.parcel.kmStart - y.parcel.kmStart)) {
    const rd = readinessOf(a)
    const last = out[out.length - 1]
    if (last && last.readiness === rd && Math.abs(last.kmEnd - a.parcel.kmStart) < 0.01) {
      last.kmEnd = a.parcel.kmEnd
      last.length += a.length
      last.parcels.push(a)
    } else out.push({ id: '', kmStart: a.parcel.kmStart, kmEnd: a.parcel.kmEnd, length: a.length, readiness: rd, parcels: [a], needBy: null, expectedRelease: today, delayDays: 0 })
  }
  return out.map((f, i) => ({
    ...f,
    id: `F${i + 1}`,
    needBy: f.parcels.map((p) => p.early.needBy).filter((d): d is string => !!d).sort()[0] ?? null,
    expectedRelease: f.parcels.reduce((m, p) => (p.released ? m : p.early.projectedRelease > m ? p.early.projectedRelease : m), today),
    delayDays: Math.max(0, ...f.parcels.map((p) => p.early.delayDays)),
  }))
}

export interface FrontAdvice {
  activity: Activity
  /** Where the activity's front stands today. */
  atKm: number
  blocked: Front
  /** The day the activity reaches the blocked stretch … */
  arrival: string
  /** … and how long it would stand idle waiting for the land. */
  idleDays: number
  alternatives: Front[]
}

/** For each activity, the first stretch ahead of it that will not be free in time — and ready fronts it could work on meanwhile. */
export function adviseFronts(fronts: Front[], activities: Activity[], today: string): FrontAdvice[] {
  const out: FrontAdvice[] = []
  for (const act of activities) {
    const at = frontKm(act, today) ?? (today < act.startDate ? act.kmStart : null)
    if (at == null) continue
    const ahead = fronts.filter((f) => f.kmEnd > at && f.kmEnd > act.kmStart && f.kmStart < act.kmEnd)
    const blocked = ahead.find((f) => {
      if (f.readiness !== 'not_ready' && f.readiness !== 'critical') return false
      const arrival = activityDateAt(act, Math.max(at, f.kmStart, act.kmStart))
      return arrival < f.expectedRelease || f.readiness === 'critical'
    })
    if (!blocked) continue
    const arrival = activityDateAt(act, Math.max(at, blocked.kmStart, act.kmStart))
    const alternatives = ahead
      .filter((f) => f.readiness === 'ready' && f.length >= 0.5 && f.kmStart >= blocked.kmEnd - 0.01)
      .sort((x, y) => x.kmStart - y.kmStart)
      .slice(0, 2)
    out.push({ activity: act, atKm: at, blocked, arrival, idleDays: Math.max(0, diffDays(blocked.expectedRelease, arrival)), alternatives })
  }
  return out.sort((a, b) => b.idleDays - a.idleDays)
}

// ------------------------------------------------------------------------------------------------ conflicts
export interface Conflict {
  a: Analysis
  activity: Activity
  needBy: string
  release: string
  gapDays: number
}

/** Land vs schedule: parcels that will not be free by the day the contractor's first activity needs them. */
export function conflictsOf(rows: Analysis[]): Conflict[] {
  const out: Conflict[] = []
  for (const a of rows) {
    if (a.released || !a.early.needBy || a.early.delayDays <= 0) continue
    const first = a.early.impacts.find((i) => i.from === a.early.needBy) ?? a.early.impacts[0]
    if (first) out.push({ a, activity: first.activity, needBy: a.early.needBy, release: a.early.projectedRelease, gapDays: a.early.delayDays })
  }
  return out.sort((x, y) => x.needBy.localeCompare(y.needBy))
}

export const withinDays = (iso: string | null, today: string, days: number): boolean => iso != null && iso <= addDays(today, days)
