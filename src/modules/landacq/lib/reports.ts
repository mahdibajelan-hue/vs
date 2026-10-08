import type { Activity, LandSettings, LinkedStatus, Parcel } from '../types'
import type { Analysis } from './kpis'
import { buildActions, criticalConstraints } from './kpis'
import { adviseFronts, conflictsOf, frontsOf, lastActionOf, READINESS_FA, type Front } from './plan'
import { fmtKmRange } from './dates'
import { faNum, fmtDateShort } from './fa'
import { LEVEL_LABEL, OWNERSHIP_LABEL, STAGE_LABEL } from './labels'
import { STATUS_LABEL } from './status'
import { currentStage } from './workflow'
import type { LandEvent } from '../types'

export type ReportKey = 'critical' | 'constraint' | 'upcoming' | 'last_action' | 'overdue' | 'ready' | 'recommended' | 'conflict'
export interface ReportRow {
  cells: string[]
  parcelId?: string
  /** Rows that deserve the red tint. */
  hot?: boolean
}
export interface Report {
  key: ReportKey
  title: string
  fa: string
  hint: string
  columns: string[]
  rows: ReportRow[]
}
export interface ReportCtx {
  rows: Analysis[]
  parcels: Parcel[]
  activities: Activity[]
  events: LandEvent[]
  linked: LinkedStatus[]
  today: string
  settings: Pick<LandSettings, 'bufferDays' | 'horizonDays'>
}

const km = (a: Analysis) => fmtKmRange(a.parcel.kmStart, a.parcel.kmEnd)
const where = (a: Analysis) => `${a.parcel.code} · ${km(a)}`
const day = (d: string | null | undefined) => (d ? fmtDateShort(d) : '—')
const num = (n: number) => faNum(Math.round(n))
const issueOf = (ctx: ReportCtx, a: Analysis) => {
  const l = ctx.linked.find((x) => x.parcelId === a.parcel.id && x.target === 'issue')
  return l ? `${l.linkedCode} (${l.linkedStatus})` : a.parcel.issueId ? 'ثبت شده' : '—'
}
const rangeOf = (f: Front) => fmtKmRange(f.kmStart, f.kmEnd)

/** The eight management reports, computed from the same analysis the rest of the module shows. */
export function buildReports(ctx: ReportCtx): Report[] {
  const { rows, today, settings } = ctx
  const unreleased = rows.filter((r) => !r.released)
  const fronts = frontsOf(rows, today)
  const advice = adviseFronts(fronts, ctx.activities, today)

  const critical = unreleased.filter((r) => r.crit.level === 'critical' || r.stay || r.early.state === 'action_required').sort((a, b) => b.crit.score - a.crit.score)
  const constraints = criticalConstraints(rows)
  const risk = (days: number, from: number) => unreleased.filter((r) => r.early.daysToNeedBy != null && r.early.daysToNeedBy > from && r.early.daysToNeedBy <= days && (r.early.state === 'delay_expected' || r.early.state === 'start_soon' || r.early.state === 'action_required' || r.crit.level === 'high' || r.crit.level === 'critical'))
  const buckets: [string, Analysis[]][] = [['تا ۳۰ روز', risk(30, -9999)], ['۳۱ تا ۶۰ روز', risk(60, 30)], ['۶۱ تا ۹۰ روز', risk(90, 60)]]
  const overdue = buildActions(rows, today, settings).filter((x) => x.daysFromToday < 0 && x.kind !== 'upcoming_stage')
  const readyFronts = fronts.filter((f) => f.readiness === 'ready').sort((a, b) => b.length - a.length)
  const conflicts = conflictsOf(rows)

  return [
    {
      key: 'critical', title: 'Critical Land Report', fa: 'نقاط بحرانی تملک', hint: 'قطعه‌هایی که Criticality بحرانی دارند، متوقف دادگاهی‌اند یا زمان شروع تحصیلشان گذشته است.',
      columns: ['قطعه', 'مالکیت', 'Criticality', 'مرحلهٔ فعلی', 'نیاز اجرایی', 'مسئله'],
      rows: critical.map((r) => ({ parcelId: r.parcel.id, hot: true, cells: [where(r), OWNERSHIP_LABEL[r.parcel.ownershipClass], `${LEVEL_LABEL[r.crit.level]} (${faNum(r.crit.score)})`, currentStage(r.parcel) ? STAGE_LABEL[currentStage(r.parcel)!.key] : '—', day(r.early.needBy), issueOf(ctx, r)] })),
    },
    {
      key: 'constraint', title: 'Land Constraint Report', fa: 'جبهه‌های دارای مانع تملکی', hint: 'قطعه‌هایی که فعالیت اجرایی را متوقف یا دیر می‌کنند، به ترتیب فوریت.',
      columns: ['قطعه', 'فعالیت اثرپذیر', 'نیاز اجرایی', 'آزادسازی پیش‌بینی', 'تأخیر (روز)', 'وضعیت', 'مسئله'],
      rows: constraints.map((r) => ({ parcelId: r.parcel.id, hot: r.early.state === 'action_required', cells: [where(r), r.early.impacts[0]?.activity.name ?? '—', day(r.early.needBy), day(r.early.projectedRelease), num(r.early.delayDays), STATUS_LABEL[r.status], issueOf(ctx, r)] })),
    },
    {
      key: 'upcoming', title: 'Upcoming Land Risk', fa: 'ریسک تملک ۳۰ / ۶۰ / ۹۰ روز آینده', hint: 'قطعه‌های آزادنشده‌ای که فعالیت اجرایی در این بازه‌ها به آن‌ها می‌رسد و ریسک تأخیر دارند.',
      columns: ['بازه', 'قطعه', 'نیاز اجرایی', 'روز مانده', 'احتمال تأخیر', 'Criticality'],
      rows: buckets.flatMap(([label, list]) => list.sort((a, b) => (a.early.daysToNeedBy ?? 0) - (b.early.daysToNeedBy ?? 0)).map((r) => ({ parcelId: r.parcel.id, cells: [label, where(r), day(r.early.needBy), num(r.early.daysToNeedBy ?? 0), `${faNum(r.forecast.probability)}٪`, LEVEL_LABEL[r.crit.level]] }))),
    },
    {
      key: 'last_action', title: 'Last Action Report', fa: 'آخرین اقدام هر قطعه', hint: 'آخرین کار ثبت‌شده برای هر قطعه، از مراحل انجام‌شده، اسناد و رویدادها.',
      columns: ['قطعه', 'آخرین اقدام', 'تاریخ', 'مرحلهٔ جاری', 'اقدام بعدی'],
      rows: rows.map((r) => { const la = lastActionOf(r.parcel, ctx.events, today); const cur = currentStage(r.parcel); return { parcelId: r.parcel.id, cells: [where(r), la?.text ?? 'اقدامی ثبت نشده', day(la?.date), r.released ? 'آزاد' : cur ? STAGE_LABEL[cur.key] : '—', r.released ? '—' : cur ? `انجام «${STAGE_LABEL[cur.key]}»${cur.plannedDate ? ` تا ${day(cur.plannedDate)}` : ''}` : '—'], hot: !la && !r.released } }),
    },
    {
      key: 'overdue', title: 'Overdue Actions', fa: 'اقدام‌های عقب‌افتاده', hint: 'مراحل و مواعد قانونی که از برنامه عقب‌اند.',
      columns: ['اقدام', 'موعد', 'تأخیر (روز)', 'اهمیت'],
      rows: overdue.sort((a, b) => a.daysFromToday - b.daysFromToday).map((x) => ({ parcelId: x.parcelId, hot: x.severity === 'critical', cells: [x.title, day(x.due), num(-x.daysFromToday), x.severity === 'critical' ? 'بحرانی' : x.severity === 'high' ? 'زیاد' : 'متوسط'] })),
    },
    {
      key: 'ready', title: 'Ready Construction Fronts', fa: 'جبهه‌های آماده اجرا', hint: 'بازه‌های پیوسته‌ای که زمینشان آزاد است و کار می‌توان در آن‌ها شروع یا ادامه داد.',
      columns: ['جبهه', 'بازه', 'طول (km)', 'تعداد قطعه'],
      rows: readyFronts.map((f) => ({ cells: [f.id, rangeOf(f), faNum(+f.length.toFixed(1)), num(f.parcels.length)] })),
    },
    {
      key: 'recommended', title: 'Recommended Fronts', fa: 'جبهه‌های پیشنهادی', hint: 'وقتی فعالیتی به بازهٔ آزادنشده می‌رسد، جبهه‌های آماده‌ای که می‌تواند موقتاً در آن‌ها کار کند.',
      columns: ['فعالیت', 'مانع پیش رو', 'رسیدن فعالیت', 'توقف احتمالی (روز)', 'جبهه‌های جایگزین'],
      rows: advice.map((x) => ({ hot: x.idleDays > 30, cells: [x.activity.name, `${x.blocked.id} · ${rangeOf(x.blocked)} (${READINESS_FA[x.blocked.readiness]})`, day(x.arrival), num(x.idleDays), x.alternatives.map((f) => `${f.id} · ${rangeOf(f)} · ${faNum(+f.length.toFixed(1))} km`).join('؛ ') || 'جبهه‌ٔ آماده‌ای پیش رو نیست'] })),
    },
    {
      key: 'conflict', title: 'Land vs Schedule Conflict', fa: 'مغایرت برنامه آزادسازی با برنامه پیمانکار', hint: 'جاهایی که زمین دیرتر از شروع فعالیت پیمانکار آزاد می‌شود.',
      columns: ['قطعه', 'فعالیت', 'شروع فعالیت', 'آزادسازی پیش‌بینی', 'مغایرت (روز)', 'مسئله'],
      rows: conflicts.map((c) => ({ parcelId: c.a.parcel.id, hot: c.gapDays > 60, cells: [where(c.a), c.activity.name, day(c.needBy), day(c.release), num(c.gapDays), issueOf(ctx, c.a)] })),
    },
  ]
}

/** Excel-friendly CSV (UTF-8 with BOM so Persian text opens correctly). */
export function toCsv(r: Report): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return `﻿${[r.columns, ...r.rows.map((x) => x.cells)].map((l) => l.map(esc).join(',')).join('\r\n')}`
}
