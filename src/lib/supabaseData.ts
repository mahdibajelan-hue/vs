import type {
  ActivitySchedule,
  ApprovalStatus,
  DailyLog,
  IsoLine,
  LineStatus,
  Milestone,
  PlacedEquipmentItem,
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
  equipment: PlacedEquipmentItem[] | null
  milestones: Milestone[]
  risks: Risk[]
  report_config: ReportConfig
  planned_curve: PlannedProgressPoint[]
  schedule_owner_approved_at: string | null
  schedule_owner_approved_by: string | null
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
  fitting_weld_count: number
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
  contractor_length_done: number | null
  contractor_weld_count: number | null
  consultant_length_done: number | null
  consultant_weld_count: number | null
  owner_length_done: number | null
  owner_weld_count: number | null
  owner_reviewed_at: string | null
  owner_reviewed_by: string | null
  owner_note: string
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
    equipment: r.equipment ?? [],
    milestones: r.milestones?.length ? r.milestones : createDefaultMilestones(),
    risks: r.risks ?? [],
    reportConfig: r.report_config?.template ? r.report_config : defaultReportConfig(),
    scheduleApprovedAt: r.schedule_owner_approved_at ?? null,
    scheduleApprovedBy: r.schedule_owner_approved_by ?? null,
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
    fittingWeldCount: r.fitting_weld_count ?? 0,
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
  if (l.fittingWeldCount !== undefined) row.fitting_weld_count = l.fittingWeldCount
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
    contractorLengthDone: Number(r.contractor_length_done ?? r.length_done),
    contractorWeldCount: r.contractor_weld_count ?? r.weld_count,
    consultantLengthDone: r.consultant_length_done == null ? null : Number(r.consultant_length_done),
    consultantWeldCount: r.consultant_weld_count,
    ownerLengthDone: r.owner_length_done == null ? null : Number(r.owner_length_done),
    ownerWeldCount: r.owner_weld_count,
    ownerReviewedAt: r.owner_reviewed_at,
    ownerReviewedBy: r.owner_reviewed_by,
    ownerNote: r.owner_note,
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
  if (l.contractorLengthDone !== undefined) row.contractor_length_done = l.contractorLengthDone
  if (l.contractorWeldCount !== undefined) row.contractor_weld_count = l.contractorWeldCount
  if (l.consultantLengthDone !== undefined) row.consultant_length_done = l.consultantLengthDone
  if (l.consultantWeldCount !== undefined) row.consultant_weld_count = l.consultantWeldCount
  if (l.ownerLengthDone !== undefined) row.owner_length_done = l.ownerLengthDone
  if (l.ownerWeldCount !== undefined) row.owner_weld_count = l.ownerWeldCount
  if (l.ownerReviewedAt !== undefined) row.owner_reviewed_at = l.ownerReviewedAt
  if (l.ownerReviewedBy !== undefined) row.owner_reviewed_by = l.ownerReviewedBy
  if (l.ownerNote !== undefined) row.owner_note = l.ownerNote
  return row
}
