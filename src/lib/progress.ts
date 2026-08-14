import { ACTIVITY_KINDS, type ActivityKind, type DailyLog, type IsoLine, type LineStatus, type Project } from '../types'

/** Rejected entries never count toward progress; pending entries still count (provisionally) until reviewed. */
export function isCountedLog(log: DailyLog): boolean {
  return log.approvalStatus !== 'rejected'
}

/**
 * The furthest stage (weld -> NDT -> coating -> hydrotest, per ACTIVITY_KINDS' order) that has at
 * least one counted log against this line — used to color a line by "what work has been done"
 * (e.g. in the 3D model viewer) rather than by its overall percent. Null if nothing logged yet.
 */
export function furthestCompletedActivity(lineId: string, logs: DailyLog[]): ActivityKind | null {
  const done = new Set(logs.filter((l) => l.lineId === lineId && isCountedLog(l)).map((l) => l.activity))
  let furthest: ActivityKind | null = null
  for (const activity of ACTIVITY_KINDS) {
    if (done.has(activity)) furthest = activity
  }
  return furthest
}

export interface LineProgress {
  lineId: string
  lengthDone: number
  weldsDone: number
  percent: number
  status: LineStatus
  lastActivity: string | null
  hasHydrotest: boolean
}

export function computeLineProgress(line: IsoLine, logs: DailyLog[]): LineProgress {
  const lineLogs = logs.filter((l) => l.lineId === line.id && isCountedLog(l))
  const lengthDone = round1(lineLogs.reduce((sum, l) => sum + (l.lengthDone || 0), 0))
  const weldsDone = lineLogs.reduce((sum, l) => sum + (l.weldCount || 0), 0)
  const hasHydrotest = lineLogs.some((l) => l.activity === 'hydrotest')
  const percentByLength = line.plannedLength > 0 ? (lengthDone / line.plannedLength) * 100 : 0
  const percentByWeld = line.totalWelds > 0 ? (weldsDone / line.totalWelds) * 100 : 0
  const percent = Math.min(
    100,
    round1(line.plannedLength > 0 || line.totalWelds > 0
      ? (percentByLength + percentByWeld) / (line.plannedLength > 0 && line.totalWelds > 0 ? 2 : 1)
      : 0),
  )

  let status: LineStatus = line.status
  if (lineLogs.length === 0 && status !== 'completed') {
    status = 'not_started'
  } else if (hasHydrotest && percent < 100) {
    status = 'testing'
  } else if (percent >= 100) {
    status = 'completed'
  } else if (lineLogs.length > 0) {
    status = 'in_progress'
  }

  const lastActivity = lineLogs.length
    ? lineLogs.reduce((latest, l) => (l.date > latest ? l.date : latest), lineLogs[0].date)
    : null

  return { lineId: line.id, lengthDone, weldsDone, percent, status, lastActivity, hasHydrotest }
}

export function computeAllProgress(project: Project): Map<string, LineProgress> {
  const map = new Map<string, LineProgress>()
  for (const line of project.lines) {
    map.set(line.id, computeLineProgress(line, project.logs))
  }
  return map
}

export interface ProjectKpis {
  totalPlannedLength: number
  totalLengthDone: number
  totalPlannedWelds: number
  totalWeldsDone: number
  overallPercent: number
  lineCount: number
  completedLines: number
  inProgressLines: number
  notStartedLines: number
  testingLines: number
}

export function computeProjectKpis(project: Project): ProjectKpis {
  const progressMap = computeAllProgress(project)
  const totalPlannedLength = round1(project.lines.reduce((s, l) => s + l.plannedLength, 0))
  const totalLengthDone = round1(
    [...progressMap.values()].reduce((s, p) => s + p.lengthDone, 0),
  )
  const totalPlannedWelds = project.lines.reduce((s, l) => s + l.totalWelds, 0)
  const totalWeldsDone = [...progressMap.values()].reduce((s, p) => s + p.weldsDone, 0)

  const weightedPercent = project.lines.length
    ? project.lines.reduce((sum, line) => {
        const p = progressMap.get(line.id)!
        const weight = line.plannedLength || 1
        return sum + p.percent * weight
      }, 0) / (totalPlannedLength || project.lines.length)
    : 0

  let completedLines = 0
  let inProgressLines = 0
  let notStartedLines = 0
  let testingLines = 0
  for (const p of progressMap.values()) {
    if (p.status === 'completed') completedLines++
    else if (p.status === 'testing') testingLines++
    else if (p.status === 'in_progress') inProgressLines++
    else notStartedLines++
  }

  return {
    totalPlannedLength,
    totalLengthDone,
    totalPlannedWelds,
    totalWeldsDone,
    overallPercent: round1(weightedPercent),
    lineCount: project.lines.length,
    completedLines,
    inProgressLines,
    notStartedLines,
    testingLines,
  }
}

export interface SCurvePoint {
  date: string
  plannedPercent: number
  actualPercent: number
}

export function computeSCurve(project: Project): SCurvePoint[] {
  const totalPlannedLength = project.lines.reduce((s, l) => s + l.plannedLength, 0) || 1

  const logsByDate = new Map<string, number>()
  for (const log of project.logs) {
    if (!isCountedLog(log)) continue
    logsByDate.set(log.date, (logsByDate.get(log.date) || 0) + (log.lengthDone || 0))
  }

  const allDates = new Set<string>([
    ...project.plannedCurve.map((p) => p.date),
    ...logsByDate.keys(),
  ])
  const sortedDates = [...allDates].sort()

  let cumulativeActual = 0
  const plannedMap = new Map(project.plannedCurve.map((p) => [p.date, p.plannedPercent]))
  let lastPlanned = 0

  return sortedDates.map((date) => {
    cumulativeActual += logsByDate.get(date) || 0
    const actualPercent = round1(Math.min(100, (cumulativeActual / totalPlannedLength) * 100))
    if (plannedMap.has(date)) lastPlanned = plannedMap.get(date)!
    return { date, plannedPercent: round1(lastPlanned), actualPercent }
  })
}

export interface WeldsBySize {
  size: string
  count: number
}

export function computeWeldsBySize(project: Project): WeldsBySize[] {
  const map = new Map<string, number>()
  for (const line of project.lines) {
    const lineLogs = project.logs.filter((l) => l.lineId === line.id && isCountedLog(l))
    const welds = lineLogs.reduce((s, l) => s + (l.weldCount || 0), 0)
    map.set(line.size, (map.get(line.size) || 0) + welds)
  }
  return [...map.entries()]
    .map(([size, count]) => ({ size, count }))
    .sort((a, b) => sizeSortKey(a.size) - sizeSortKey(b.size))
}

function sizeSortKey(size: string): number {
  const n = parseFloat(size)
  return Number.isNaN(n) ? 999 : n
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
