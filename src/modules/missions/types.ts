/**
 * Mission & Visit Debrief module (schema.sql Section 61).
 *
 * Product flow:  Mission → Visit → Intelligent Interview → Evidence → Project Insight →
 *                Issue/Risk Discovery → Action → Management Decision → Final Report.
 *
 * This module is a Discovery & Intelligence layer: Issues and Risks it finds are only PROPOSED here and,
 * once a manager approves them, handed to the system of record (im_issues / rm_risks / rasta_actions).
 * The id of the owning record is stored back on the finding; its live status is read, never copied.
 */

export type MissionStatus =
  | 'draft'
  | 'pending_approval'
  | 'returned'
  | 'rejected'
  | 'ticketing'
  | 'approved'
  | 'debrief'
  | 'report_review'
  | 'revision_requested'
  | 'ready_for_claim'
  | 'claimed'
  | 'cancelled'

export const MISSION_STATUS_LABEL: Record<MissionStatus, string> = {
  draft: 'پیش‌نویس',
  pending_approval: 'در انتظار تأیید مجری طرح',
  returned: 'برگشت‌خورده برای اصلاح',
  rejected: 'ردشده',
  ticketing: 'در انتظار صدور بلیط (امور اداری)',
  approved: 'تأییدشده — آماده اعزام',
  debrief: 'در حال گزارش‌گیری',
  report_review: 'گزارش در انتظار تأیید مجری طرح',
  revision_requested: 'گزارش نیازمند اصلاح',
  ready_for_claim: 'در انتظار تأیید کلیم (امور اداری)',
  claimed: 'کلیم مأموریت تأیید شد',
  cancelled: 'لغوشده',
}

/** Short tone per status, used for pills. */
export type Tone = 'neutral' | 'info' | 'warn' | 'bad' | 'good' | 'accent'
export const MISSION_STATUS_TONE: Record<MissionStatus, Tone> = {
  draft: 'neutral',
  pending_approval: 'warn',
  returned: 'warn',
  rejected: 'bad',
  ticketing: 'warn',
  approved: 'info',
  debrief: 'accent',
  report_review: 'warn',
  revision_requested: 'warn',
  ready_for_claim: 'warn',
  claimed: 'good',
  cancelled: 'neutral',
}

export type VisitType =
  | 'progress_review'
  | 'engineering'
  | 'procurement_expediting'
  | 'construction_supervision'
  | 'hse_audit'
  | 'quality_audit'
  | 'coordination_meeting'
  | 'client_meeting'
  | 'commissioning'
  | 'other'

export const VISIT_TYPE_LABEL: Record<VisitType, string> = {
  progress_review: 'بازدید پیشرفت پروژه',
  engineering: 'بازدید مهندسی و طراحی',
  procurement_expediting: 'پیگیری خرید و تأمین (Expediting)',
  construction_supervision: 'نظارت بر ساخت و اجرا',
  hse_audit: 'ممیزی / بازدید HSE',
  quality_audit: 'ممیزی / بازدید کیفیت',
  coordination_meeting: 'جلسه هماهنگی',
  client_meeting: 'ملاقات با کارفرما',
  commissioning: 'پیش‌راه‌اندازی و راه‌اندازی',
  other: 'سایر',
}

export interface Visitee {
  name: string
  org: string
  role: string
}

export type Priority = 'low' | 'medium' | 'high' | 'critical'
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'کم', medium: 'متوسط', high: 'زیاد', critical: 'بحرانی' }

/** Flight ticket details recorded by Administrative Affairs when the ticket is issued. */
export interface TicketInfo {
  airline?: string
  flightNo?: string
  route?: string
  departAt?: string
  returnAt?: string
  pnr?: string
  cost?: string
  note?: string
}

export interface Mission {
  id: string
  code: string
  requesterId: string
  requesterName: string
  requesterPosition: string
  masterProjectId: string
  projectName: string
  destination: string
  locationDetail: string
  startDate: string
  endDate: string
  visitType: VisitType
  visitees: Visitee[]
  topicsOfInterest: string
  expectedOutput: string
  /** Flight ticket needed? (false → the request skips Administrative Affairs ticketing) */
  needsTicket: boolean
  originCity: string
  ticketNote: string
  ticket: TicketInfo
  ticketIssuedAt: string | null
  adminComment: string
  approverId: string | null
  approverName: string
  status: MissionStatus
  managerComment: string
  qualityScore: number | null
  submittedAt: string | null
  approvedAt: string | null
  debriefStartedAt: string | null
  reportSubmittedAt: string | null
  finalApprovedAt: string | null
  claimedAt: string | null
  createdAt: string
}

export type ObjectiveStatus = 'pending' | 'achieved' | 'partial' | 'not_achieved' | 'follow_up'
export const OBJECTIVE_STATUS_LABEL: Record<ObjectiveStatus, string> = {
  pending: 'بررسی‌نشده',
  achieved: 'محقق شد',
  partial: 'تحقق نسبی',
  not_achieved: 'محقق نشد',
  follow_up: 'نیازمند پیگیری',
}
export const OBJECTIVE_STATUS_TONE: Record<ObjectiveStatus, Tone> = {
  pending: 'neutral',
  achieved: 'good',
  partial: 'warn',
  not_achieved: 'bad',
  follow_up: 'warn',
}

export interface Objective {
  id: string
  missionId: string
  position: number
  title: string
  /** Measurable success criterion ("معیار تحقق"). */
  measure: string
  /** Interview topic this objective maps to — drives which topics are mandatory. */
  topicKey: string
  priority: Priority
  status: ObjectiveStatus
  resultNote: string
}

export type FindingKind = 'issue' | 'risk' | 'action' | 'commitment' | 'decision' | 'progress' | 'observation'
export const FINDING_KIND_LABEL: Record<FindingKind, string> = {
  issue: 'مسئله (Issue)',
  risk: 'ریسک (Risk)',
  action: 'اقدام (Action)',
  commitment: 'تعهد (Commitment)',
  decision: 'تصمیم (Decision)',
  progress: 'پیشرفت',
  observation: 'مشاهده',
}
export const FINDING_KIND_SHORT: Record<FindingKind, string> = {
  issue: 'Issue',
  risk: 'Risk',
  action: 'Action',
  commitment: 'تعهد',
  decision: 'تصمیم',
  progress: 'پیشرفت',
  observation: 'مشاهده',
}

export type FindingApproval = 'proposed' | 'approved' | 'rejected'
export type TransferTarget = 'issue' | 'risk' | 'action'

/** Slots captured for a finding — the engine asks follow-ups until the important ones are filled. */
export interface FindingDetails {
  cause?: string
  status?: string
  impact?: string
  party?: string
  newDate?: string
  needAction?: string
  probability?: string
  mitigation?: string
  trigger?: string
  [k: string]: string | undefined
}

export interface Finding {
  id: string
  missionId: string
  kind: FindingKind
  topicKey: string
  title: string
  description: string
  details: FindingDetails
  severity: Priority
  ownerText: string
  ownerId: string | null
  dueDate: string | null
  objectiveId: string | null
  confidence: number
  userConfirmed: boolean
  approval: FindingApproval
  managerNote: string
  transferredTo: TransferTarget | null
  transferredId: string | null
  transferredAt: string | null
  createdAt: string
}

/** Live view of a transferred finding, read from the owning system. */
export interface LinkedStatus {
  findingId: string
  target: TransferTarget
  linkedId: string
  linkedCode: string
  linkedStatus: string
}

export type EvidenceKind = 'photo' | 'file' | 'minutes' | 'letter' | 'technical' | 'note' | 'voice'
export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  photo: 'عکس',
  file: 'فایل',
  minutes: 'صورتجلسه',
  letter: 'نامه',
  technical: 'مستند فنی',
  note: 'توضیح متنی',
  voice: 'پیام صوتی',
}

export interface Evidence {
  id: string
  missionId: string
  findingId: string | null
  objectiveId: string | null
  topicKey: string
  kind: EvidenceKind
  title: string
  note: string
  filePath: string | null
  mime: string
  sizeBytes: number
  createdAt: string
}

export interface Turn {
  id: string
  missionId: string
  seq: number
  topicKey: string
  role: 'assistant' | 'user' | 'system'
  kind: 'main' | 'followup' | 'system' | 'answer'
  text: string
  inputMode: 'text' | 'voice'
  meta: Record<string, unknown>
  createdAt: string
}

export type InterviewStatus = 'active' | 'summary' | 'completed'

export interface Interview {
  id: string
  missionId: string
  status: InterviewStatus
  state: InterviewState
  provider: string
  summaryConfirmedAt: string | null
}

/** Everything the engine needs to resume an interview — serialisable, stored as jsonb. */
export interface InterviewState {
  /** Ordered topic plan computed from the mission (project type, visit type, objectives). */
  plan: string[]
  /** Per-topic progress. */
  topics: Record<string, TopicProgress>
  /** Topic currently being discussed. */
  current: string | null
  /** The pending question the user must answer next. */
  pending: PendingQuestion | null
  /** Running counter of questions asked (for the progress meter). */
  asked: number
}

export interface TopicProgress {
  /** ids of main questions already asked */
  mainAsked: string[]
  /** number of follow-ups asked in this topic */
  followUps: number
  /** "open" until the engine decides the topic is covered, or the user skips it. */
  state: 'open' | 'complete' | 'skipped'
  /** Short Persian note on why the topic closed ("اطلاعات کافی دریافت شد"). */
  closedReason?: string
  /** Coverage 0-1 of the information this topic needs. */
  coverage: number
  /** The user's own words for this topic, concatenated — feeds summaries and the report. */
  notes: string[]
  /** Extracted numbers, e.g. planned / actual progress. */
  metrics: Record<string, number>
  /** How many «what is still missing» rounds were asked after the topic's batch answer (max 2). */
  gapRounds?: number
}

/** One labelled line of a batch answer template. */
export interface TemplateField {
  label: string
  /** Shown in the question text under the label. */
  hint?: string
  optional?: boolean
  /** Kept in the topic notes (and quoted in the report) but never mined for findings — e.g. a free suggestion. */
  noteOnly?: boolean
  /** When set, the (numeric) value is stored as this topic metric (e.g. planned / actual progress). */
  metric?: string
}

/** A repeating group of lines in a template (decisions, actions, one block per objective). */
export interface TemplateEntries {
  /** «مصوبه», «اقدام» … → «مصوبه ۱», «مصوبه ۲» */
  item: string
  count: number
  kind: FindingKind
  /** Field labels after the title line: who is responsible and by when. */
  ownerLabel: string
  dueLabel: string
  /** Extra free-text field per entry (optional), e.g. the decision's context. */
  noteLabel?: string
}

export interface PendingLayout {
  fields: TemplateField[]
  entries?: TemplateEntries
  /** One block per mission objective (id + title) — the objective-review topic. */
  objectives?: { id: string; title: string; measure: string }[]
  /** Gap round: what is being re-asked. */
  gap?: {
    fields: string[]
    findings: { key: string; title: string; slots: string[] }[]
    objectives: string[]
  }
}

export interface PendingQuestion {
  id: string
  topicKey: string
  /** main = the topic's one batch question, gap = the consolidated «still missing» round, followup = legacy single question. */
  kind: 'main' | 'followup' | 'gap'
  text: string
  /** Pre-filled answer template shown in the answer box (batch and gap questions). */
  template?: string
  layout?: PendingLayout
  /** For follow-ups: which finding and which slot this question is trying to fill. */
  findingKey?: string
  slot?: string
  hint?: string
  /** Quick-reply suggestions to speed up answering on mobile. */
  quick?: string[]
}

export interface ReportSection {
  key: string
  title: string
  /** Paragraph text (Persian). */
  body: string
  bullets?: string[]
}

export interface ReportContent {
  generatedAt: string
  generatedBy: string
  executiveSummary: string
  overallStatus: 'on_track' | 'attention' | 'critical'
  progress: { planned: number | null; actual: number | null }
  sections: ReportSection[]
  objectives: { id: string; title: string; status: ObjectiveStatus; note: string }[]
  recommendations: string[]
  counts: Record<FindingKind, number>
}

export interface QualityCriterion {
  key: string
  label: string
  weight: number
  /** 0-100 */
  score: number
  hint: string
  /** topic to jump to when fixing */
  topicKey?: string
}

/** The preparer's signature, frozen onto the report when it is submitted (later profile changes never alter it). */
export interface ReportSignature {
  /** PNG data URL */
  image: string
  name: string
  position: string
  signedAt: string
}

export interface Report {
  id: string
  missionId: string
  version: number
  status: 'draft' | 'submitted' | 'approved' | 'returned'
  content: ReportContent
  qualityScore: number | null
  qualityBreakdown: QualityCriterion[]
  generatedBy: string
  createdAt: string
  submittedAt: string | null
  signature?: ReportSignature | null
}

export interface MissionEvent {
  id: string
  missionId: string
  actorId: string | null
  actorName: string
  event: string
  comment: string
  detail: Record<string, unknown>
  createdAt: string
}

export interface PersonRef {
  id: string
  name: string
  position: string
}

export interface ProjectRef {
  id: string
  name: string
  code: string
  projectType: string
}

/** Everything the UI needs to know about a mission at once. */
export interface MissionBundle {
  mission: Mission
  objectives: Objective[]
  findings: Finding[]
  evidence: Evidence[]
  turns: Turn[]
  interview: Interview | null
  report: Report | null
  events: MissionEvent[]
  linked: LinkedStatus[]
}

export type WorkflowAction =
  | 'submit_request'
  | 'approve_request'
  | 'return_request'
  | 'reject_request'
  | 'start_debrief'
  | 'submit_report'
  | 'return_report'
  | 'approve_report'
  | 'issue_ticket'
  | 'return_ticket'
  | 'approve_claim'
  | 'cancel'

export const EVENT_LABEL: Record<string, string> = {
  created: 'ثبت درخواست',
  submit_request: 'ارسال برای تأیید',
  approve_request: 'تأیید درخواست توسط مجری طرح',
  return_request: 'برگشت درخواست برای اصلاح',
  reject_request: 'رد درخواست',
  start_debrief: 'شروع گزارش‌گیری',
  submit_report: 'ارسال گزارش برای مجری طرح',
  return_report: 'برگشت گزارش برای اصلاح',
  approve_report: 'تأیید نهایی گزارش توسط مجری طرح',
  issue_ticket: 'صدور بلیط هواپیما',
  return_ticket: 'برگشت درخواست توسط امور اداری',
  approve_claim: 'تأیید کلیم مأموریت',
  cancel: 'لغو مأموریت',
  transfer_issue: 'انتقال به مدیریت Issue',
  transfer_risk: 'انتقال به مدیریت ریسک',
  transfer_action: 'انتقال به مدیریت اقدامات',
}
