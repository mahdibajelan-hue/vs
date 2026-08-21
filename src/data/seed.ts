import type { ActivityKind, ActivitySchedule, IsoLine, Milestone, NewDailyLogInput, PlannedProgressPoint } from '../types'
import { generateSampleSvg, SAMPLE_LINES } from './sampleSvg'
import { makeId } from '../lib/id'
import { MILESTONE_COLOR_PALETTE } from '../lib/milestones'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function line(meta: (typeof SAMPLE_LINES)[number], status: IsoLine['status']): IsoLine {
  return {
    id: makeId('line'),
    svgElementId: meta.svgElementId,
    svgElementIds: [meta.svgElementId],
    size: meta.size,
    spec: meta.spec,
    service: meta.service,
    contractor: meta.contractor,
    plannedLength: meta.plannedLength,
    totalWelds: meta.totalWelds,
    fittingWeldCount: Math.round(meta.totalWelds * 0.25),
    status,
    createdAt: new Date().toISOString(),
  }
}

function sched(
  lineId: string,
  activity: ActivityKind,
  plannedStart: string,
  plannedEnd: string,
  actualStart: string | null,
  actualEnd: string | null,
  percentComplete: number,
): ActivitySchedule {
  return { id: makeId('sched'), lineId, activity, plannedStart, plannedEnd, actualStart, actualEnd, percentComplete }
}

export function buildSeedProject(): {
  svgRaw: string
  lines: IsoLine[]
  logs: NewDailyLogInput[]
  plannedCurve: PlannedProgressPoint[]
  schedules: ActivitySchedule[]
  milestones: Milestone[]
} {
  const svgRaw = generateSampleSvg()

  const lines: IsoLine[] = [
    line(SAMPLE_LINES[0], 'in_progress'), // L-1001 6"
    line(SAMPLE_LINES[1], 'in_progress'), // L-1002 4"
    line(SAMPLE_LINES[2], 'testing'), // L-1003 8"
    line(SAMPLE_LINES[3], 'not_started'), // L-1004 2"
    line(SAMPLE_LINES[4], 'in_progress'), // L-1005 10"
    line(SAMPLE_LINES[5], 'completed'), // L-1006 3"
    line(SAMPLE_LINES[6], 'completed'), // L-1007 12" main
    line(SAMPLE_LINES[7], 'in_progress'), // L-1008 4"
  ]

  const byElementId = new Map(lines.map((l) => [l.svgElementId, l]))
  const idOf = (elementId: string) => byElementId.get(elementId)!.id

  const rawLogs: Omit<NewDailyLogInput, 'approvalStatus' | 'reviewedBy' | 'reviewNote'>[] = [
    // L-1001-6-A1A (in progress ~60%)
    { lineId: idOf('L-1001-6-A1A'), date: daysAgo(24), lengthDone: 12, weldCount: 4, activity: 'welding', contractor: 'پیمانکار الف', notes: 'شروع اسپول‌های اولیه', delayReason: '' },
    { lineId: idOf('L-1001-6-A1A'), date: daysAgo(17), lengthDone: 10, weldCount: 3, activity: 'welding', contractor: 'پیمانکار الف', notes: '', delayReason: '' },
    { lineId: idOf('L-1001-6-A1A'), date: daysAgo(9), lengthDone: 8, weldCount: 3, activity: 'welding', contractor: 'پیمانکار الف', notes: '', delayReason: 'عدم تامین شیرآلات ۶ اینچ' },

    // L-1002-4-B2B (in progress, slow ~35%)
    { lineId: idOf('L-1002-4-B2B'), date: daysAgo(20), lengthDone: 6, weldCount: 2, activity: 'welding', contractor: 'پیمانکار الف', notes: '', delayReason: '' },
    { lineId: idOf('L-1002-4-B2B'), date: daysAgo(6), lengthDone: 4, weldCount: 1, activity: 'welding', contractor: 'پیمانکار الف', notes: '', delayReason: 'تاخیر در تامین نیروی جوشکار' },

    // L-1003-8-A1A (testing - full length/weld + hydrotest log)
    { lineId: idOf('L-1003-8-A1A'), date: daysAgo(28), lengthDone: 20, weldCount: 7, activity: 'welding', contractor: 'پیمانکار ب', notes: '', delayReason: '' },
    { lineId: idOf('L-1003-8-A1A'), date: daysAgo(22), lengthDone: 18, weldCount: 6, activity: 'welding', contractor: 'پیمانکار ب', notes: '', delayReason: '' },
    { lineId: idOf('L-1003-8-A1A'), date: daysAgo(15), lengthDone: 17, weldCount: 5, activity: 'welding', contractor: 'پیمانکار ب', notes: 'اتمام جوشکاری', delayReason: '' },
    { lineId: idOf('L-1003-8-A1A'), date: daysAgo(4), lengthDone: 0, weldCount: 0, activity: 'hydrotest', contractor: 'پیمانکار ب', notes: 'تست هیدرواستاتیک در حال انجام', delayReason: '' },

    // L-1005-10-A1A (in progress ~55%)
    { lineId: idOf('L-1005-10-A1A'), date: daysAgo(26), lengthDone: 14, weldCount: 5, activity: 'welding', contractor: 'پیمانکار الف', notes: '', delayReason: '' },
    { lineId: idOf('L-1005-10-A1A'), date: daysAgo(18), lengthDone: 12, weldCount: 4, activity: 'welding', contractor: 'پیمانکار الف', notes: '', delayReason: '' },
    { lineId: idOf('L-1005-10-A1A'), date: daysAgo(10), lengthDone: 9, weldCount: 3, activity: 'welding', contractor: 'پیمانکار الف', notes: '', delayReason: '' },
    { lineId: idOf('L-1005-10-A1A'), date: daysAgo(3), lengthDone: 0, weldCount: 0, activity: 'ndt', contractor: 'پیمانکار الف', notes: 'رادیوگرافی جوش‌های اصلی', delayReason: '' },

    // L-1006-3-B2B (completed 100%)
    { lineId: idOf('L-1006-3-B2B'), date: daysAgo(29), lengthDone: 10, weldCount: 3, activity: 'welding', contractor: 'پیمانکار ج', notes: '', delayReason: '' },
    { lineId: idOf('L-1006-3-B2B'), date: daysAgo(25), lengthDone: 6, weldCount: 2, activity: 'welding', contractor: 'پیمانکار ج', notes: '', delayReason: '' },
    { lineId: idOf('L-1006-3-B2B'), date: daysAgo(21), lengthDone: 5, weldCount: 2, activity: 'welding', contractor: 'پیمانکار ج', notes: 'تکمیل و تست شد', delayReason: '' },

    // L-1007-12-A1A (completed main line 100%)
    { lineId: idOf('L-1007-12-A1A'), date: daysAgo(30), lengthDone: 20, weldCount: 7, activity: 'welding', contractor: 'پیمانکار الف', notes: 'خط اصلی - شروع', delayReason: '' },
    { lineId: idOf('L-1007-12-A1A'), date: daysAgo(24), lengthDone: 18, weldCount: 6, activity: 'welding', contractor: 'پیمانکار الف', notes: '', delayReason: '' },
    { lineId: idOf('L-1007-12-A1A'), date: daysAgo(19), lengthDone: 17, weldCount: 6, activity: 'welding', contractor: 'پیمانکار الف', notes: '', delayReason: '' },
    { lineId: idOf('L-1007-12-A1A'), date: daysAgo(12), lengthDone: 16, weldCount: 5, activity: 'hydrotest', contractor: 'پیمانکار الف', notes: 'تست هیدرواستاتیک با موفقیت انجام شد', delayReason: '' },

    // L-1008-4-C1C (in progress ~30%)
    { lineId: idOf('L-1008-4-C1C'), date: daysAgo(14), lengthDone: 6, weldCount: 2, activity: 'welding', contractor: 'پیمانکار ج', notes: '', delayReason: '' },
    { lineId: idOf('L-1008-4-C1C'), date: daysAgo(5), lengthDone: 4, weldCount: 1, activity: 'welding', contractor: 'پیمانکار ج', notes: '', delayReason: 'باران و توقف کار' },
  ]

  // Most recent couple of entries are shown as still awaiting the consultant's review.
  const pendingIndexes = new Set([2, rawLogs.length - 1])
  const logs: NewDailyLogInput[] = rawLogs.map((l, i) => ({
    ...l,
    approvalStatus: pendingIndexes.has(i) ? 'pending' : 'approved',
    // No real reviewer profile id exists at seed-generation time — reviewed_by is a uuid FK, not free text.
    reviewedBy: null,
    reviewNote: '',
  }))

  const plannedCurve: PlannedProgressPoint[] = [
    { date: daysAgo(30), plannedPercent: 5 },
    { date: daysAgo(25), plannedPercent: 15 },
    { date: daysAgo(20), plannedPercent: 28 },
    { date: daysAgo(15), plannedPercent: 42 },
    { date: daysAgo(10), plannedPercent: 58 },
    { date: daysAgo(5), plannedPercent: 74 },
    { date: daysAgo(0), plannedPercent: 88 },
    { date: daysAgo(-10), plannedPercent: 100 },
  ]

  const schedules: ActivitySchedule[] = [
    // L-1001-6-A1A — welding in progress, ndt/coating upcoming
    sched(idOf('L-1001-6-A1A'), 'welding', daysAgo(25), daysAgo(-2), daysAgo(24), null, 70),
    sched(idOf('L-1001-6-A1A'), 'ndt', daysAgo(-3), daysAgo(-8), null, null, 0),
    sched(idOf('L-1001-6-A1A'), 'coating', daysAgo(-10), daysAgo(-16), null, null, 0),

    // L-1002-4-B2B — welding behind schedule
    sched(idOf('L-1002-4-B2B'), 'welding', daysAgo(22), daysAgo(2), daysAgo(20), null, 35),

    // L-1003-8-A1A — welding done on time, ndt in progress, coating upcoming
    sched(idOf('L-1003-8-A1A'), 'welding', daysAgo(30), daysAgo(14), daysAgo(28), daysAgo(15), 100),
    sched(idOf('L-1003-8-A1A'), 'ndt', daysAgo(6), daysAgo(-1), daysAgo(4), null, 60),
    sched(idOf('L-1003-8-A1A'), 'coating', daysAgo(-5), daysAgo(-12), null, null, 0),

    // L-1004-2-C1C — not started, planned for later
    sched(idOf('L-1004-2-C1C'), 'welding', daysAgo(-5), daysAgo(-15), null, null, 0),

    // L-1005-10-A1A — welding overdue, ndt upcoming
    sched(idOf('L-1005-10-A1A'), 'welding', daysAgo(28), daysAgo(1), daysAgo(26), null, 57),
    sched(idOf('L-1005-10-A1A'), 'ndt', daysAgo(-2), daysAgo(-9), null, null, 0),

    // L-1006-3-B2B — fully completed, on time
    sched(idOf('L-1006-3-B2B'), 'welding', daysAgo(29), daysAgo(22), daysAgo(29), daysAgo(21), 100),
    sched(idOf('L-1006-3-B2B'), 'ndt', daysAgo(21), daysAgo(18), daysAgo(20), daysAgo(17), 100),
    sched(idOf('L-1006-3-B2B'), 'coating', daysAgo(17), daysAgo(14), daysAgo(16), daysAgo(13), 100),

    // L-1007-12-A1A — main line, fully completed
    sched(idOf('L-1007-12-A1A'), 'welding', daysAgo(30), daysAgo(20), daysAgo(30), daysAgo(19), 100),
    sched(idOf('L-1007-12-A1A'), 'ndt', daysAgo(19), daysAgo(14), daysAgo(18), daysAgo(13), 100),
    sched(idOf('L-1007-12-A1A'), 'coating', daysAgo(13), daysAgo(8), daysAgo(12), daysAgo(9), 100),

    // L-1008-4-C1C — welding delayed by weather
    sched(idOf('L-1008-4-C1C'), 'welding', daysAgo(16), daysAgo(3), daysAgo(14), null, 30),
  ]

  const milestoneData: [string, number][] = [
    ['اتمام طراحی', 100],
    ['اتمام خرید کالا', 90],
    ['اتمام جوشکاری', 65],
    ['اتمام رادیوگرافی', 40],
    ['راه‌اندازی و تحویل', 10],
  ]
  const milestones: Milestone[] = milestoneData.map(([label, percentComplete], i) => ({
    id: makeId('mile'),
    label,
    percentComplete,
    color: MILESTONE_COLOR_PALETTE[i % MILESTONE_COLOR_PALETTE.length],
  }))

  return { svgRaw, lines, logs, plannedCurve, schedules, milestones }
}
