import type {
  ActivitySchedule,
  ApprovalStatus,
  DailyLog,
  IsoLine,
  LineStatus,
  Milestone,
  PlannedProgressPoint,
  Project,
  ReportConfig,
  Risk,
} from '../types'
import { defaultReportConfig } from './reportConfig'
import { createDefaultMilestones } from './milestones'

export interface ProjectSummary {
  id: string
  name: string
  client: string
  location: string
  unit: string
  createdAt: string
}

interface ProjectRow {
  id: string
  name: string
  client: string
  location: string
  unit: string
  svg_raw: string | null
  svg_file_name: string | null
  schedules: ActivitySchedule[]
  milestones: Milestone[]
  risks: Risk[]
  report_config: ReportConfig
  planned_curve: PlannedProgressPoint[]
  created_by: string | null
  created_at: string
}

interface LineRow {
  id: string
  project_id: string
  svg_element_id: string
  svg_element_ids: string[]
  size: string
  spec: string
  service: string
  contractor: string
  planned_length: number
  total_welds: number
  status: string
  created_at: string
}

interface LogRow {
  id: string
  project_id: string
  line_id: string
  date: string
  length_done: number
  weld_count: number
  weld_pass: string
  contractor: string
  notes: string
  delay_reason: string
  approval_status: string
  reviewed_by: string | null
  review_note: string
  created_at: string
}

export function projectSummaryFromRow(r: Pick<ProjectRow, 'id' | 'name' | 'client' | 'location' | 'unit' | 'created_at'>): ProjectSummary {
  return { id: r.id, name: r.name, client: r.client, location: r.location, unit: r.unit, createdAt: r.created_at }
}

export function projectFromRow(r: ProjectRow, lines: LineRow[], logs: LogRow[]): Project {
  return {
    id: r.id,
    name: r.name,
    client: r.client,
    location: r.location,
    unit: r.unit,
    svgRaw: r.svg_raw,
    svgFileName: r.svg_file_name,
    lines: lines.map(lineFromRow),
    logs: logs.map(logFromRow),
    plannedCurve: r.planned_curve ?? [],
    schedules: r.schedules ?? [],
    milestones: r.milestones?.length ? r.milestones : createDefaultMilestones(),
    risks: r.risks ?? [],
    reportConfig: r.report_config?.template ? r.report_config : defaultReportConfig(),
    createdAt: r.created_at,
  }
}

export function lineFromRow(r: LineRow): IsoLine {
  return {
    id: r.id,
    svgElementId: r.svg_element_id,
    svgElementIds: r.svg_element_ids?.length ? r.svg_element_ids : [r.svg_element_id],
    size: r.size,
    spec: r.spec,
    service: r.service,
    contractor: r.contractor,
    plannedLength: Number(r.planned_length),
    totalWelds: r.total_welds,
    status: r.status as LineStatus,
    createdAt: r.created_at,
  }
}

export function lineToRow(projectId: string, l: Partial<IsoLine>) {
  const row: Record<string, unknown> = { project_id: projectId }
  if (l.svgElementId !== undefined) row.svg_element_id = l.svgElementId
  if (l.svgElementIds !== undefined) row.svg_element_ids = l.svgElementIds
  if (l.size !== undefined) row.size = l.size
  if (l.spec !== undefined) row.spec = l.spec
  if (l.service !== undefined) row.service = l.service
  if (l.contractor !== undefined) row.contractor = l.contractor
  if (l.plannedLength !== undefined) row.planned_length = l.plannedLength
  if (l.totalWelds !== undefined) row.total_welds = l.totalWelds
  if (l.status !== undefined) row.status = l.status
  return row
}

export function logFromRow(r: LogRow): DailyLog {
  return {
    id: r.id,
    lineId: r.line_id,
    date: r.date,
    lengthDone: Number(r.length_done),
    weldCount: r.weld_count,
    weldPass: r.weld_pass as DailyLog['weldPass'],
    contractor: r.contractor,
    notes: r.notes,
    delayReason: r.delay_reason,
    approvalStatus: r.approval_status as ApprovalStatus,
    reviewedBy: r.reviewed_by,
    reviewNote: r.review_note,
    createdAt: r.created_at,
  }
}

export function logToRow(projectId: string, l: Partial<DailyLog>) {
  const row: Record<string, unknown> = { project_id: projectId }
  if (l.lineId !== undefined) row.line_id = l.lineId
  if (l.date !== undefined) row.date = l.date
  if (l.lengthDone !== undefined) row.length_done = l.lengthDone
  if (l.weldCount !== undefined) row.weld_count = l.weldCount
  if (l.weldPass !== undefined) row.weld_pass = l.weldPass
  if (l.contractor !== undefined) row.contractor = l.contractor
  if (l.notes !== undefined) row.notes = l.notes
  if (l.delayReason !== undefined) row.delay_reason = l.delayReason
  if (l.approvalStatus !== undefined) row.approval_status = l.approvalStatus
  if (l.reviewedBy !== undefined) row.reviewed_by = l.reviewedBy
  if (l.reviewNote !== undefined) row.review_note = l.reviewNote
  return row
}
