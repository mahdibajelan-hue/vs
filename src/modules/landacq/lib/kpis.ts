import type { Activity, LandSettings, Parcel } from '../types'
import { addDays, diffDays } from './dates'
import { criticality, ownerCountOf, type Criticality } from './scoring'
import { ACTION_RANK, earlyAction, type EarlyAction } from './schedule'
import { displayStatus, type DisplayStatus } from './status'
import { heuristicPredictor, type DelayForecast, DELAY_HIGHLIGHT_THRESHOLD } from './forecast'
import { currentStage, isReleased, isStarted, overdueStages, stageProgress } from './workflow'
import { STAGE_LABEL } from './labels'

/** Everything derived for one parcel, computed once per render pass. */
export interface Analysis {
  parcel: Parcel
  crit: Criticality
  status: DisplayStatus
  early: EarlyAction
  forecast: DelayForecast
  released: boolean
  progress: number
  length: number
}

export function analyze(parcels: Parcel[], activities: Activity[], today: string, settings: Pick<LandSettings, 'bufferDays' | 'horizonDays'>): Analysis[] {
  return parcels
    .map((parcel) => {
      const crit = criticality(parcel)
      return {
        parcel,
        crit,
        status: displayStatus(parcel, crit),
        early: earlyAction(parcel, activities, today, settings),
        forecast: heuristicPredictor.predict(parcel, { activities, today, settings }),
        released: isReleased(parcel),
        progress: stageProgress(parcel),
        length: Math.max(0, parcel.kmEnd - parcel.kmStart),
      }
    })
    .sort((a, b) => a.parcel.kmStart - b.parcel.kmStart)
}

export interface Kpis {
  totalKm: number
  releasedKm: number
  acquiringKm: number
  riskKm: number
  parcelCount: number
  criticalCount: number
  ownerCount: number
  disputeCount: number
  /** Length-weighted workflow progress, 0..100 */
  progressPct: number
  releasedPct: number
  overdueActions: number
  /** Not released parcels whose first activity arrives within the next X days. */
  impactingSoon: number
  actionRequired: number
  delayExpected: number
}

export function computeKpis(rows: Analysis[], totalKm: number, today: string, settings: Pick<LandSettings, 'horizonDays'>): Kpis {
  const sum = (f: (r: Analysis) => boolean) => rows.filter(f).reduce((n, r) => n + r.length, 0)
  const covered = rows.reduce((n, r) => n + r.length, 0)
  const weighted = covered > 0 ? rows.reduce((n, r) => n + r.progress * r.length, 0) / covered : 0
  return {
    totalKm,
    releasedKm: sum((r) => r.released),
    acquiringKm: sum((r) => r.status === 'acquiring'),
    riskKm: sum((r) => !r.released && (r.crit.level === 'high' || r.crit.level === 'critical')),
    parcelCount: rows.length,
    criticalCount: rows.filter((r) => !r.released && r.crit.level === 'critical').length,
    ownerCount: rows.reduce((n, r) => n + ownerCountOf(r.parcel), 0),
    disputeCount: rows.filter((r) => !r.released && (r.parcel.acquisitionRoute === 'dispute' || r.parcel.disputeProbability >= 50 || r.parcel.owners.some((o) => o.agreement === 'refused' || o.agreement === 'legal'))).length,
    progressPct: Math.round(weighted * 100),
    releasedPct: totalKm > 0 ? Math.round((sum((r) => r.released) / totalKm) * 100) : 0,
    overdueActions: rows.reduce((n, r) => n + overdueStages(r.parcel, today).length, 0),
    impactingSoon: rows.filter((r) => !r.released && r.early.needBy != null && r.early.daysToNeedBy != null && r.early.daysToNeedBy <= settings.horizonDays).length,
    actionRequired: rows.filter((r) => r.early.state === 'action_required').length,
    delayExpected: rows.filter((r) => r.early.state === 'delay_expected').length,
  }
}

/** Km totals per display status — drives the stacked bar of the dashboard. */
export function lengthByStatus(rows: Analysis[]): Record<DisplayStatus, number> {
  const out: Record<DisplayStatus, number> = { released: 0, acquiring: 0, risk: 0, critical: 0, natural: 0, governmental: 0, review: 0 }
  for (const r of rows) out[r.status] += r.length
  return out
}

/**
 * Critical Land Constraints: land that will hold the project up — ordered by how soon that happens, then by score.
 * A parcel qualifies when an action is required / a delay is expected, or when it is high/critical and an activity will reach it.
 */
export function criticalConstraints(rows: Analysis[]): Analysis[] {
  return rows
    .filter((r) => !r.released && (r.early.state === 'action_required' || r.early.state === 'delay_expected' || ((r.crit.level === 'critical' || r.crit.level === 'high') && r.early.needBy != null) || r.forecast.probability >= DELAY_HIGHLIGHT_THRESHOLD))
    .sort((a, b) => ACTION_RANK[a.early.state] - ACTION_RANK[b.early.state] || (a.early.needBy ?? '9999').localeCompare(b.early.needBy ?? '9999') || b.crit.score - a.crit.score)
}

export type ActionKind = 'start_acquisition' | 'early_action' | 'overdue_stage' | 'upcoming_stage'
export interface ActionItem {
  id: string
  parcelId: string
  kind: ActionKind
  title: string
  /** The date the action is due (or was due). */
  due: string
  /** Negative = already late. */
  daysFromToday: number
  severity: 'critical' | 'high' | 'medium' | 'low'
}

/** Upcoming + overdue actions across the route, soonest first. */
export function buildActions(rows: Analysis[], today: string, settings: Pick<LandSettings, 'horizonDays'>): ActionItem[] {
  const out: ActionItem[] = []
  for (const r of rows) {
    if (r.released) continue
    const p = r.parcel
    const where = `${p.code || 'قطعه'}`
    if (r.early.state === 'action_required' && r.early.startBy) {
      out.push({ id: `${p.id}:start`, parcelId: p.id, kind: 'start_acquisition', title: `${where}: شروع تحصیل ضروری است`, due: r.early.startBy, daysFromToday: diffDays(r.early.startBy, today), severity: 'critical' })
    } else if (((r.early.state === 'start_soon' && !isStarted(p)) || r.early.state === 'delay_expected') && r.early.startBy) {
      out.push({ id: `${p.id}:early`, parcelId: p.id, kind: 'early_action', title: `${where}: ${r.early.state === 'delay_expected' ? 'تأخیر پیش‌بینی می‌شود — تسریع تحصیل' : 'آغاز تحصیل تا این تاریخ'}`, due: r.early.startBy, daysFromToday: diffDays(r.early.startBy, today), severity: r.early.state === 'delay_expected' ? 'high' : 'medium' })
    }
    for (const s of overdueStages(p, today)) {
      out.push({ id: `${p.id}:od:${s.key}`, parcelId: p.id, kind: 'overdue_stage', title: `${where}: «${STAGE_LABEL[s.key]}» معوق`, due: s.plannedDate!, daysFromToday: diffDays(s.plannedDate!, today), severity: diffDays(today, s.plannedDate!) > 30 ? 'high' : 'medium' })
    }
    const cur = currentStage(p)
    if (cur?.plannedDate && cur.plannedDate >= today && cur.plannedDate <= addDays(today, settings.horizonDays)) {
      out.push({ id: `${p.id}:next:${cur.key}`, parcelId: p.id, kind: 'upcoming_stage', title: `${where}: «${STAGE_LABEL[cur.key]}»`, due: cur.plannedDate, daysFromToday: diffDays(cur.plannedDate, today), severity: 'low' })
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due))
}
