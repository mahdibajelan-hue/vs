import type {
  Activity, AuditEntry, ChecklistCategory, ChecklistItem, ChecklistStatus, EarlyWarning,
  GateStatus, HealthDimension, HealthScore, HealthStatus, HealthTrend, LifecycleAction,
  LifecycleTemplate, Milestone, MilestoneForecastPoint, MilestoneStatus, MilestoneType,
  ProjectGate, ProjectLifecycle, ProjectStage, StageStatus, TemplateChecklistItem, TemplateStage,
  WarningSeverity,
} from '../types'

/* Row shapes mirror supabase/schema.sql section 21 one-for-one; each `*FromRow` is the single
 * place snake_case becomes camelCase for this module. */

export interface PlcLifecycleRow {
  project_id: string
  template_id: string | null
  current_stage_key: string
  stage_entered_at: string | null
  health_override: string | null
  health_override_reason: string
  health_override_by: string | null
  health_override_at: string | null
}

export function lifecycleFromRow(r: PlcLifecycleRow): ProjectLifecycle {
  return {
    projectId: r.project_id,
    templateId: r.template_id,
    currentStageKey: r.current_stage_key,
    stageEnteredAt: r.stage_entered_at,
    healthOverride: (r.health_override as HealthStatus | null) ?? null,
    healthOverrideReason: r.health_override_reason ?? '',
    healthOverrideBy: r.health_override_by,
    healthOverrideAt: r.health_override_at,
  }
}

export interface PlcStageRow {
  id: string
  project_id: string
  stage_key: string
  name_fa: string
  sequence: number
  status: string
  planned_start: string | null
  planned_finish: string | null
  actual_start: string | null
  actual_finish: string | null
  forecast_finish: string | null
  progress: number
}

export function stageFromRow(r: PlcStageRow): ProjectStage {
  return {
    id: r.id,
    projectId: r.project_id,
    stageKey: r.stage_key,
    nameFa: r.name_fa,
    sequence: r.sequence,
    status: r.status as StageStatus,
    plannedStart: r.planned_start,
    plannedFinish: r.planned_finish,
    actualStart: r.actual_start,
    actualFinish: r.actual_finish,
    forecastFinish: r.forecast_finish,
    progress: r.progress,
  }
}

export interface PlcGateRow {
  id: string
  project_id: string
  stage_key: string
  name: string
  gate_owner_id: string | null
  readiness_threshold: number
  status: string
  approval_date: string | null
  approved_by: string | null
  comments: string
  override_by: string | null
  override_reason: string
  override_at: string | null
}

export function gateFromRow(r: PlcGateRow): ProjectGate {
  return {
    id: r.id,
    projectId: r.project_id,
    stageKey: r.stage_key,
    name: r.name,
    gateOwnerId: r.gate_owner_id,
    readinessThreshold: r.readiness_threshold,
    status: r.status as GateStatus,
    approvalDate: r.approval_date,
    approvedBy: r.approved_by,
    comments: r.comments ?? '',
    overrideBy: r.override_by,
    overrideReason: r.override_reason ?? '',
    overrideAt: r.override_at,
  }
}

export interface PlcChecklistRow {
  id: string
  project_id: string
  stage_key: string
  category: string
  title: string
  is_mandatory: boolean
  requires_document: boolean
  requires_approval: boolean
  responsible_id: string | null
  due_date: string | null
  status: string
  completion_date: string | null
  evidence_url: string
  evidence_label: string
  comment: string
  guidance: string
  sequence: number
}

export function checklistFromRow(r: PlcChecklistRow): ChecklistItem {
  return {
    id: r.id,
    projectId: r.project_id,
    stageKey: r.stage_key,
    category: r.category as ChecklistCategory,
    title: r.title,
    isMandatory: r.is_mandatory,
    requiresDocument: r.requires_document,
    requiresApproval: r.requires_approval,
    responsibleId: r.responsible_id,
    dueDate: r.due_date,
    status: r.status as ChecklistStatus,
    completionDate: r.completion_date,
    evidenceUrl: r.evidence_url ?? '',
    evidenceLabel: r.evidence_label ?? '',
    comment: r.comment ?? '',
    guidance: r.guidance ?? '',
    sequence: r.sequence,
  }
}

export interface PlcMilestoneRow {
  id: string
  project_id: string
  name: string
  milestone_type: string
  stage_key: string
  baseline_date: string | null
  forecast_date: string | null
  actual_date: string | null
  is_critical: boolean
  owner_id: string | null
  depends_on_id: string | null
  status: string
  evidence_url: string
  evidence_label: string
  comments: string
}

export function milestoneFromRow(r: PlcMilestoneRow): Milestone {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    milestoneType: r.milestone_type as MilestoneType,
    stageKey: r.stage_key ?? '',
    baselineDate: r.baseline_date,
    forecastDate: r.forecast_date,
    actualDate: r.actual_date,
    isCritical: r.is_critical,
    ownerId: r.owner_id,
    dependsOnId: r.depends_on_id,
    status: r.status as MilestoneStatus,
    evidenceUrl: r.evidence_url ?? '',
    evidenceLabel: r.evidence_label ?? '',
    comments: r.comments ?? '',
  }
}

export interface PlcForecastHistoryRow {
  id: string
  milestone_id: string
  forecast_date: string | null
  variance_days: number
  note: string
  recorded_at: string
}

export function forecastPointFromRow(r: PlcForecastHistoryRow): MilestoneForecastPoint {
  return {
    id: r.id,
    milestoneId: r.milestone_id,
    forecastDate: r.forecast_date,
    varianceDays: r.variance_days,
    note: r.note ?? '',
    recordedAt: r.recorded_at,
  }
}

export interface PlcActivityRow {
  id: string
  project_id: string
  wbs_code: string
  name: string
  stage_key: string
  baseline_start: string | null
  baseline_finish: string | null
  forecast_start: string | null
  forecast_finish: string | null
  actual_start: string | null
  actual_finish: string | null
  progress: number
  owner_id: string | null
  is_critical: boolean
  depends_on_id: string | null
  status: string
  sequence: number
}

export function activityFromRow(r: PlcActivityRow): Activity {
  return {
    id: r.id,
    projectId: r.project_id,
    wbsCode: r.wbs_code ?? '',
    name: r.name,
    stageKey: r.stage_key ?? '',
    baselineStart: r.baseline_start,
    baselineFinish: r.baseline_finish,
    forecastStart: r.forecast_start,
    forecastFinish: r.forecast_finish,
    actualStart: r.actual_start,
    actualFinish: r.actual_finish,
    progress: r.progress,
    ownerId: r.owner_id,
    isCritical: r.is_critical,
    dependsOnId: r.depends_on_id,
    status: r.status as Activity['status'],
    sequence: r.sequence,
  }
}

export interface PlcHealthRow {
  id: string
  project_id: string
  dimension: string
  score: number
  status: string
  trend: string
  explanation: string
  updated_at: string
}

export function healthFromRow(r: PlcHealthRow): HealthScore {
  return {
    id: r.id,
    projectId: r.project_id,
    dimension: r.dimension as HealthDimension,
    score: r.score,
    status: r.status as HealthStatus,
    trend: r.trend as HealthTrend,
    explanation: r.explanation ?? '',
    updatedAt: r.updated_at,
  }
}

export interface PlcWarningRow {
  id: string
  project_id: string
  trigger_key: string
  severity: string
  title: string
  detail: string
  responsible_id: string | null
  required_action: string
  status: string
  related_milestone_id: string | null
  detected_at: string
}

export function warningFromRow(r: PlcWarningRow): EarlyWarning {
  return {
    id: r.id,
    projectId: r.project_id,
    triggerKey: r.trigger_key,
    severity: r.severity as WarningSeverity,
    title: r.title,
    detail: r.detail ?? '',
    responsibleId: r.responsible_id,
    requiredAction: r.required_action ?? '',
    status: r.status as EarlyWarning['status'],
    relatedMilestoneId: r.related_milestone_id,
    detectedAt: r.detected_at,
  }
}

export interface RastaActionRow {
  id: string
  master_project_id: string
  title: string
  owner_id: string | null
  due_date: string | null
  priority: string
  status: string
  source: string
  related_milestone_id: string | null
  related_gate_id: string | null
  related_risk_id: string | null
  related_issue_id: string | null
  completion_pct: number | null
  created_at: string
  closed_date: string | null
}

export function actionFromRow(r: RastaActionRow): LifecycleAction {
  return {
    id: r.id,
    projectId: r.master_project_id,
    title: r.title,
    ownerId: r.owner_id,
    dueDate: r.due_date,
    priority: r.priority as LifecycleAction['priority'],
    status: r.status as LifecycleAction['status'],
    source: r.source as LifecycleAction['source'],
    relatedMilestoneId: r.related_milestone_id ?? null,
    relatedGateId: r.related_gate_id ?? null,
    relatedRiskId: r.related_risk_id ?? null,
    relatedIssueId: r.related_issue_id ?? null,
    completionPct: r.completion_pct ?? 0,
    createdAt: r.created_at,
    closedDate: r.closed_date ?? null,
  }
}

export interface PlcTemplateRow {
  id: string
  name: string
  description: string
  project_type: string
  is_default: boolean
  is_active: boolean
}

export function templateFromRow(r: PlcTemplateRow): LifecycleTemplate {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    projectType: r.project_type ?? '',
    isDefault: r.is_default,
    isActive: r.is_active,
  }
}

export interface PlcTemplateStageRow {
  id: string
  template_id: string
  stage_key: string
  name_fa: string
  name_en: string
  sequence: number
  typical_duration_months: number | null
  gate_name: string
  gate_readiness_threshold: number
}

export function templateStageFromRow(r: PlcTemplateStageRow): TemplateStage {
  return {
    id: r.id,
    templateId: r.template_id,
    stageKey: r.stage_key,
    nameFa: r.name_fa,
    nameEn: r.name_en ?? '',
    sequence: r.sequence,
    typicalDurationMonths: r.typical_duration_months,
    gateName: r.gate_name ?? '',
    gateReadinessThreshold: r.gate_readiness_threshold,
  }
}

export interface PlcTemplateChecklistRow {
  id: string
  template_stage_id: string
  category: string
  title: string
  is_mandatory: boolean
  requires_document: boolean
  requires_approval: boolean
  guidance: string
  sequence: number
}

export function templateChecklistFromRow(r: PlcTemplateChecklistRow): TemplateChecklistItem {
  return {
    id: r.id,
    templateStageId: r.template_stage_id,
    category: r.category as ChecklistCategory,
    title: r.title,
    isMandatory: r.is_mandatory,
    requiresDocument: r.requires_document,
    requiresApproval: r.requires_approval,
    guidance: r.guidance ?? '',
    sequence: r.sequence,
  }
}

export interface PlcAuditRow {
  id: string
  project_id: string
  entity_type: string
  entity_id: string | null
  event: string
  field: string
  old_value: string
  new_value: string
  reason: string
  changed_by: string | null
  changed_at: string
}

export function auditFromRow(r: PlcAuditRow): AuditEntry {
  return {
    id: r.id,
    projectId: r.project_id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    event: r.event,
    field: r.field ?? '',
    oldValue: r.old_value ?? '',
    newValue: r.new_value ?? '',
    reason: r.reason ?? '',
    changedBy: r.changed_by,
    changedAt: r.changed_at,
  }
}
