import type {
  ActivityKind,
  ActivitySchedule,
  ApprovalStatus,
  DailyLog,
  Equipment3D,
  IsoLine,
  Joint,
  JointStatus,
  JointType,
  LineStatus,
  Milestone,
  PlacedEquipmentItem,
  PlannedProgressPoint,
  Project,
  ReportConfig,
  Spool,
} from '../types'
import { defaultReportConfig } from './reportConfig'
import { createDefaultMilestones } from './milestones'
import { sanitizeSvg } from './sanitizeSvg'

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
  model3d_path: string | null
  model3d_file_name: string | null
  schedules: ActivitySchedule[]
  equipment: PlacedEquipmentItem[] | null
  milestones: Milestone[]
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
  activity: string
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

interface JointRow {
  id: string
  project_id: string
  line_id: string
  sequence_number: number
  joint_type: string
  joint_number: string
  diameter: string
  thickness: string
  connected_equipment_id: string | null
  status: string
  completed_date: string | null
  notes: string
  position_x: number | string | null
  position_y: number | string | null
  position_z: number | string | null
  axis_x: number | string | null
  axis_y: number | string | null
  axis_z: number | string | null
  created_at: string
}

interface Equipment3DRow {
  id: string
  project_id: string
  tag: string
  description: string
  foundation_ready_date: string | null
  erected_date: string | null
  mesh_object_names: string[] | null
  notes: string
  created_at: string
}

interface SpoolRow {
  id: string
  project_id: string
  line_id: string
  start_joint_id: string | null
  end_joint_id: string | null
  mesh_object_names: string[] | null
  created_at: string
}

export function projectSummaryFromRow(r: Pick<ProjectRow, 'id' | 'name' | 'client' | 'location' | 'unit' | 'created_at'>): ProjectSummary {
  return { id: r.id, name: r.name, client: r.client, location: r.location, unit: r.unit, createdAt: r.created_at }
}

export function projectFromRow(
  r: ProjectRow,
  lines: LineRow[],
  logs: LogRow[],
  joints: JointRow[] = [],
  equipment3d: Equipment3DRow[] = [],
  spools: SpoolRow[] = [],
): Project {
  return {
    id: r.id,
    name: r.name,
    client: r.client,
    location: r.location,
    unit: r.unit,
    svgRaw: r.svg_raw ? sanitizeSvg(r.svg_raw) : r.svg_raw,
    svgFileName: r.svg_file_name,
    model3dPath: r.model3d_path,
    model3dFileName: r.model3d_file_name,
    lines: lines.map(lineFromRow),
    logs: logs.map(logFromRow),
    plannedCurve: r.planned_curve ?? [],
    schedules: r.schedules ?? [],
    equipment: r.equipment ?? [],
    joints: joints.map(jointFromRow),
    equipment3d: equipment3d.map(equipment3dFromRow),
    spools: spools.map(spoolFromRow),
    milestones: r.milestones?.length ? r.milestones : createDefaultMilestones(),
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
    activity: r.activity as ActivityKind,
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
  if (l.activity !== undefined) row.activity = l.activity
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

export function jointFromRow(r: JointRow): Joint {
  return {
    id: r.id,
    lineId: r.line_id,
    sequenceNumber: r.sequence_number,
    jointType: r.joint_type as JointType,
    jointNumber: r.joint_number,
    diameter: r.diameter,
    thickness: r.thickness,
    connectedEquipmentId: r.connected_equipment_id,
    status: r.status as JointStatus,
    completedDate: r.completed_date,
    notes: r.notes,
    position:
      r.position_x != null && r.position_y != null && r.position_z != null
        ? { x: Number(r.position_x), y: Number(r.position_y), z: Number(r.position_z) }
        : null,
    axis:
      r.axis_x != null && r.axis_y != null && r.axis_z != null
        ? { x: Number(r.axis_x), y: Number(r.axis_y), z: Number(r.axis_z) }
        : null,
    createdAt: r.created_at,
  }
}

export function jointToRow(projectId: string, j: Partial<Joint>) {
  const row: Record<string, unknown> = { project_id: projectId }
  if (j.lineId !== undefined) row.line_id = j.lineId
  if (j.sequenceNumber !== undefined) row.sequence_number = j.sequenceNumber
  if (j.jointType !== undefined) row.joint_type = j.jointType
  if (j.jointNumber !== undefined) row.joint_number = j.jointNumber
  if (j.diameter !== undefined) row.diameter = j.diameter
  if (j.thickness !== undefined) row.thickness = j.thickness
  if (j.connectedEquipmentId !== undefined) row.connected_equipment_id = j.connectedEquipmentId
  if (j.status !== undefined) row.status = j.status
  if (j.completedDate !== undefined) row.completed_date = j.completedDate
  if (j.notes !== undefined) row.notes = j.notes
  if (j.position !== undefined) {
    row.position_x = j.position?.x ?? null
    row.position_y = j.position?.y ?? null
    row.position_z = j.position?.z ?? null
  }
  if (j.axis !== undefined) {
    row.axis_x = j.axis?.x ?? null
    row.axis_y = j.axis?.y ?? null
    row.axis_z = j.axis?.z ?? null
  }
  return row
}

export function equipment3dFromRow(r: Equipment3DRow): Equipment3D {
  return {
    id: r.id,
    tag: r.tag,
    description: r.description,
    foundationReadyDate: r.foundation_ready_date,
    erectedDate: r.erected_date,
    meshObjectNames: r.mesh_object_names ?? [],
    notes: r.notes,
    createdAt: r.created_at,
  }
}

export function equipment3dToRow(projectId: string, e: Partial<Equipment3D>) {
  const row: Record<string, unknown> = { project_id: projectId }
  if (e.tag !== undefined) row.tag = e.tag
  if (e.description !== undefined) row.description = e.description
  if (e.foundationReadyDate !== undefined) row.foundation_ready_date = e.foundationReadyDate
  if (e.erectedDate !== undefined) row.erected_date = e.erectedDate
  if (e.meshObjectNames !== undefined) row.mesh_object_names = e.meshObjectNames
  if (e.notes !== undefined) row.notes = e.notes
  return row
}

export function spoolFromRow(r: SpoolRow): Spool {
  return {
    id: r.id,
    lineId: r.line_id,
    startJointId: r.start_joint_id,
    endJointId: r.end_joint_id,
    meshObjectNames: r.mesh_object_names ?? [],
    createdAt: r.created_at,
  }
}

export function spoolToRow(projectId: string, s: Partial<Spool>) {
  const row: Record<string, unknown> = { project_id: projectId }
  if (s.lineId !== undefined) row.line_id = s.lineId
  if (s.startJointId !== undefined) row.start_joint_id = s.startJointId
  if (s.endJointId !== undefined) row.end_joint_id = s.endJointId
  if (s.meshObjectNames !== undefined) row.mesh_object_names = s.meshObjectNames
  return row
}
