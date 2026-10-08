/** Project Lifecycle & Control Tower — domain types.
 *
 * The three-level hierarchy (Portfolio -> Program/«طرح» -> Project) is NOT redefined here: it
 * comes from the shared masterdata module (Portfolio, Program, MasterProject) and every type
 * below hangs off `masterProjectId`. Actions likewise stay in the existing rasta_actions table
 * (see LifecycleAction) rather than gaining a second, competing definition.
 */

/* ---------------------------------------------------------------- lifecycle */

export type StageKey =
  | 'idea'
  | 'pre_project'
  | 'initiation'
  | 'planning'
  | 'engineering'
  | 'procurement'
  | 'execution'
  | 'commissioning'
  | 'handover'
  | 'close_out'
  | 'lessons_learned'

/** The default 11-stage lifecycle. Templates may define a different sequence — this is only the
 * out-of-the-box one, and `stage_key` is a free text column precisely so a template can add its
 * own stages without a migration. */
export const DEFAULT_STAGE_ORDER: StageKey[] = [
  'idea', 'pre_project', 'initiation', 'planning', 'engineering', 'procurement',
  'execution', 'commissioning', 'handover', 'close_out', 'lessons_learned',
]

export const STAGE_LABEL_FA: Record<StageKey, string> = {
  idea: 'ایده',
  pre_project: 'پیش‌پروژه',
  initiation: 'آغازین',
  planning: 'برنامه‌ریزی',
  engineering: 'مهندسی و طراحی',
  procurement: 'تدارکات',
  execution: 'اجرا',
  commissioning: 'راه‌اندازی',
  handover: 'تحویل',
  close_out: 'اختتام',
  lessons_learned: 'درس‌آموخته‌ها',
}

export const STAGE_LABEL_EN: Record<StageKey, string> = {
  idea: 'IDEA',
  pre_project: 'PRE-PROJECT',
  initiation: 'INITIATION',
  planning: 'PLANNING',
  engineering: 'ENGINEERING / DESIGN',
  procurement: 'PROCUREMENT',
  execution: 'EXECUTION',
  commissioning: 'COMMISSIONING',
  handover: 'HANDOVER',
  close_out: 'CLOSE-OUT',
  lessons_learned: 'LESSONS LEARNED',
}

export type StageStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped'

export const STAGE_STATUS_LABEL_FA: Record<StageStatus, string> = {
  not_started: 'شروع‌نشده',
  in_progress: 'در حال انجام',
  completed: 'تکمیل‌شده',
  skipped: 'رد شده',
}

/* --------------------------------------------------------------------- gate */

export type GateStatus = 'not_started' | 'in_progress' | 'ready' | 'approved' | 'rejected' | 'blocked'

export const GATE_STATUS_LABEL_FA: Record<GateStatus, string> = {
  not_started: 'شروع‌نشده',
  in_progress: 'در حال بررسی',
  ready: 'آماده تصویب',
  approved: 'تصویب‌شده',
  rejected: 'رد شده',
  blocked: 'مسدود',
}

export interface ProjectGate {
  id: string
  projectId: string
  stageKey: string
  name: string
  gateOwnerId: string | null
  readinessThreshold: number
  status: GateStatus
  approvalDate: string | null
  approvedBy: string | null
  comments: string
  overrideBy: string | null
  overrideReason: string
  overrideAt: string | null
}

/* ---------------------------------------------------------------- checklist */

export type ChecklistStatus = 'not_started' | 'in_progress' | 'completed' | 'waived'

export const CHECKLIST_STATUS_LABEL_FA: Record<ChecklistStatus, string> = {
  not_started: 'شروع‌نشده',
  in_progress: 'در حال انجام',
  completed: 'تکمیل‌شده',
  waived: 'صرف‌نظر شده',
}

/** Pre-project categories from the spec; `general` covers every other stage's items. */
export type ChecklistCategory =
  | 'strategic' | 'technical' | 'commercial' | 'risk' | 'stakeholder' | 'governance' | 'general'

export const CHECKLIST_CATEGORY_LABEL_FA: Record<ChecklistCategory, string> = {
  strategic: 'راهبردی',
  technical: 'فنی',
  commercial: 'بازرگانی',
  risk: 'ریسک',
  stakeholder: 'ذی‌نفعان',
  governance: 'حاکمیت',
  general: 'عمومی',
}

export const PRE_PROJECT_CATEGORIES: ChecklistCategory[] = [
  'strategic', 'technical', 'commercial', 'risk', 'stakeholder', 'governance',
]

export interface ChecklistItem {
  id: string
  projectId: string
  stageKey: string
  category: ChecklistCategory
  title: string
  isMandatory: boolean
  requiresDocument: boolean
  requiresApproval: boolean
  responsibleId: string | null
  dueDate: string | null
  status: ChecklistStatus
  completionDate: string | null
  evidenceUrl: string
  evidenceLabel: string
  comment: string
  guidance: string
  sequence: number
}

/** An item is overdue when it has a due date in the past and is not finished — derived rather
 * than stored, so it can never go stale relative to today's date. */
export function isChecklistOverdue(item: ChecklistItem, today = new Date().toISOString().slice(0, 10)): boolean {
  if (item.status === 'completed' || item.status === 'waived') return false
  return !!item.dueDate && item.dueDate < today
}

/* --------------------------------------------------------------- milestones */

export type MilestoneStatus = 'achieved' | 'on_track' | 'at_risk' | 'delayed' | 'blocked'

export const MILESTONE_STATUS_LABEL_FA: Record<MilestoneStatus, string> = {
  achieved: 'محقق‌شده',
  on_track: 'در مسیر',
  at_risk: 'در معرض تأخیر',
  delayed: 'تأخیرکرده',
  blocked: 'مسدود',
}

export type MilestoneType = 'contractual' | 'project' | 'gate' | 'payment' | 'regulatory' | 'external'

export const MILESTONE_TYPE_LABEL_FA: Record<MilestoneType, string> = {
  contractual: 'قراردادی',
  project: 'پروژه‌ای',
  gate: 'گیت',
  payment: 'پرداخت',
  regulatory: 'قانونی/مجوز',
  external: 'خارجی',
}

export interface Milestone {
  id: string
  projectId: string
  name: string
  milestoneType: MilestoneType
  stageKey: string
  baselineDate: string | null
  forecastDate: string | null
  actualDate: string | null
  isCritical: boolean
  ownerId: string | null
  dependsOnId: string | null
  status: MilestoneStatus
  evidenceUrl: string
  evidenceLabel: string
  comments: string
}

export interface MilestoneForecastPoint {
  id: string
  milestoneId: string
  forecastDate: string | null
  varianceDays: number
  note: string
  recordedAt: string
}

/* --------------------------------------------------------------- activities */

export interface Activity {
  id: string
  projectId: string
  wbsCode: string
  name: string
  stageKey: string
  baselineStart: string | null
  baselineFinish: string | null
  forecastStart: string | null
  forecastFinish: string | null
  actualStart: string | null
  actualFinish: string | null
  progress: number
  ownerId: string | null
  isCritical: boolean
  dependsOnId: string | null
  status: StageStatus | 'on_hold'
  sequence: number
}

export interface ProjectStage {
  id: string
  projectId: string
  stageKey: string
  nameFa: string
  sequence: number
  status: StageStatus
  plannedStart: string | null
  plannedFinish: string | null
  actualStart: string | null
  actualFinish: string | null
  forecastFinish: string | null
  progress: number
}

/* ------------------------------------------------------------------- health */

export type HealthStatus = 'green' | 'yellow' | 'red' | 'black'

export const HEALTH_STATUS_LABEL_FA: Record<HealthStatus, string> = {
  green: 'سالم',
  yellow: 'در معرض ریسک',
  red: 'بحرانی',
  black: 'مسدود',
}

export type HealthDimension =
  | 'schedule' | 'cost' | 'engineering' | 'procurement' | 'construction'
  | 'quality' | 'hse' | 'risk' | 'contract' | 'cashflow'

export const HEALTH_DIMENSIONS: HealthDimension[] = [
  'schedule', 'cost', 'engineering', 'procurement', 'construction',
  'quality', 'hse', 'risk', 'contract', 'cashflow',
]

export const HEALTH_DIMENSION_LABEL_FA: Record<HealthDimension, string> = {
  schedule: 'زمان‌بندی',
  cost: 'هزینه',
  engineering: 'مهندسی',
  procurement: 'تدارکات',
  construction: 'اجرا',
  quality: 'کیفیت',
  hse: 'HSE',
  risk: 'ریسک',
  contract: 'قرارداد',
  cashflow: 'جریان نقدی',
}

export type HealthTrend = 'improving' | 'flat' | 'worsening'

export interface HealthScore {
  id: string
  projectId: string
  dimension: HealthDimension
  score: number
  status: HealthStatus
  trend: HealthTrend
  explanation: string
  updatedAt: string
}

export interface ProjectLifecycle {
  projectId: string
  templateId: string | null
  currentStageKey: string
  stageEnteredAt: string | null
  healthOverride: HealthStatus | null
  healthOverrideReason: string
  healthOverrideBy: string | null
  healthOverrideAt: string | null
}

/* ---------------------------------------------------------------- warnings */

export type WarningSeverity = 'low' | 'medium' | 'high' | 'critical'

export const WARNING_SEVERITY_LABEL_FA: Record<WarningSeverity, string> = {
  low: 'کم',
  medium: 'متوسط',
  high: 'بالا',
  critical: 'بحرانی',
}

export const WARNING_SEVERITY_RANK: Record<WarningSeverity, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
}

export interface EarlyWarning {
  id: string
  projectId: string
  triggerKey: string
  severity: WarningSeverity
  title: string
  detail: string
  responsibleId: string | null
  requiredAction: string
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed'
  relatedMilestoneId: string | null
  detectedAt: string
}

/* ----------------------------------------------------------------- actions */

/** Mirrors the shared rasta_actions row (this module reads/writes the same table the Reporting
 * module's Decision Center uses — see schema section 21e). */
export interface LifecycleAction {
  id: string
  projectId: string
  title: string
  ownerId: string | null
  dueDate: string | null
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'not_started' | 'in_progress' | 'completed' | 'cancelled'
  source: 'risk' | 'issue' | 'decision' | 'management_report' | 'lifecycle' | 'milestone' | 'gate'
  relatedMilestoneId: string | null
  relatedGateId: string | null
  relatedRiskId: string | null
  relatedIssueId: string | null
  completionPct: number
  createdAt: string
  closedDate: string | null
}

export function isActionOverdue(a: LifecycleAction, today = new Date().toISOString().slice(0, 10)): boolean {
  if (a.status === 'completed' || a.status === 'cancelled') return false
  return !!a.dueDate && a.dueDate < today
}

/* ---------------------------------------------------------------- templates */

export interface LifecycleTemplate {
  id: string
  name: string
  description: string
  projectType: string
  isDefault: boolean
  isActive: boolean
}

export interface TemplateStage {
  id: string
  templateId: string
  stageKey: string
  nameFa: string
  nameEn: string
  sequence: number
  typicalDurationMonths: number | null
  gateName: string
  gateReadinessThreshold: number
}

export interface TemplateChecklistItem {
  id: string
  templateStageId: string
  category: ChecklistCategory
  title: string
  isMandatory: boolean
  requiresDocument: boolean
  requiresApproval: boolean
  guidance: string
  sequence: number
}

/* -------------------------------------------------------------- audit trail */

export interface AuditEntry {
  id: string
  projectId: string
  entityType: string
  entityId: string | null
  event: string
  field: string
  oldValue: string
  newValue: string
  reason: string
  changedBy: string | null
  changedAt: string
}
