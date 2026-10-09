export type RmUserRole = 'project_manager' | 'risk_manager' | 'risk_owner' | 'team_member' | 'management'

export const RM_ROLES: RmUserRole[] = ['project_manager', 'risk_manager', 'risk_owner', 'team_member', 'management']

export const RM_ROLE_LABEL_FA: Record<RmUserRole, string> = {
  project_manager: 'مدیر پروژه',
  risk_manager: 'مدیر ریسک (PMO)',
  risk_owner: 'مالک ریسک',
  team_member: 'عضو تیم پروژه',
  management: 'مدیریت ارشد (فقط مشاهده)',
}

export const RM_ROLE_DESCRIPTION_FA: Record<RmUserRole, string> = {
  project_manager: 'دسترسی کامل به ریسک‌های پروژه، تایید، ارجاع به مقام بالاتر و گزارش‌ها',
  risk_manager: 'مدیریت ریسک‌ها، انجام بازبینی‌ها، پایش روند و تهیه گزارش',
  risk_owner: 'مشاهده ریسک‌های واگذارشده و به‌روزرسانی اقدامات کنترلی',
  team_member: 'ثبت ریسک، ارائه به‌روزرسانی و نظر',
  management: 'دسترسی فقط‌خواندنی به داشبورد و گزارش‌های مدیریتی',
}

/** Only project_manager/risk_manager may run formal reviews (new assessment snapshots) or delete risks. */
export function rmCanManage(role: RmUserRole | null | undefined): boolean {
  return role === 'project_manager' || role === 'risk_manager'
}

/** Everyone except the read-only "management" role may register risks, add actions and comment. */
export function rmCanEdit(role: RmUserRole | null | undefined): boolean {
  return role === 'project_manager' || role === 'risk_manager' || role === 'risk_owner' || role === 'team_member'
}

export type RmProjectStatus = 'active' | 'on_hold' | 'closed'

export const RM_PROJECT_STATUS_LABEL_FA: Record<RmProjectStatus, string> = {
  active: 'فعال',
  on_hold: 'متوقف‌شده',
  closed: 'بسته‌شده',
}

export interface RmProject {
  id: string
  name: string
  client: string
  projectManagerId: string | null
  startDate: string | null
  finishDate: string | null
  status: RmProjectStatus
  createdBy: string | null
  createdAt: string
}

/** Configurable (rm_categories); the union below is only the shipped default set, any admin-defined key is also valid. */
export type RmRiskCategory = string

export const RM_CATEGORIES: string[] = ['engineering', 'procurement', 'contractor', 'schedule', 'cost', 'land', 'permits', 'construction', 'quality', 'hse', 'logistics', 'hr', 'stakeholders', 'commissioning', 'legal', 'other']

export const RM_CATEGORY_LABEL_FA: Record<string, string> = {
  engineering: 'مهندسی و طراحی',
  procurement: 'تأمین کالا و تجهیزات',
  contractor: 'پیمانکاران و مدیریت قرارداد',
  schedule: 'زمان‌بندی و پیشرفت پروژه',
  cost: 'هزینه، بودجه و تأمین مالی',
  land: 'تملک، معارضین و آزادسازی مسیر',
  permits: 'مجوزها و هماهنگی‌های بین‌دستگاهی',
  construction: 'ساخت، نصب، جوشکاری و پوشش',
  quality: 'کنترل کیفیت و آزمون‌ها',
  hse: 'HSE و محیط زیست',
  logistics: 'لجستیک و حمل‌ونقل',
  hr: 'منابع انسانی و ظرفیت واحدها',
  stakeholders: 'ذی‌نفعان و تصمیمات مدیریتی',
  commissioning: 'پیش‌راه‌اندازی، راه‌اندازی و تحویل',
  legal: 'حقوقی، قانونی و حاکمیتی',
  other: 'سایر',
}

export type RmRiskType = 'threat' | 'opportunity'

export const RM_RISK_TYPE_LABEL_FA: Record<RmRiskType, string> = {
  threat: 'تهدید',
  opportunity: 'فرصت',
}

export type RmRiskStatus = 'open' | 'monitoring' | 'escalated' | 'closed' | 'realized'

export const RM_RISK_STATUSES: RmRiskStatus[] = ['open', 'monitoring', 'escalated', 'realized', 'closed']

export const RM_RISK_STATUS_LABEL_FA: Record<RmRiskStatus, string> = {
  open: 'باز',
  monitoring: 'در حال پایش',
  escalated: 'ارجاع‌شده به مقام بالاتر',
  closed: 'بسته‌شده',
  realized: 'تحقق‌یافته (تبدیل به مسئله)',
}

export const RM_RISK_STATUS_COLOR: Record<RmRiskStatus, string> = {
  open: '#e74c3c',
  monitoring: '#f1c40f',
  escalated: '#c026d3',
  closed: '#2ecc71',
  realized: '#a855f7',
}

export type RmResponseStrategy = 'avoid' | 'mitigate' | 'transfer' | 'accept' | 'escalate' | 'exploit' | 'enhance' | 'share'

export const RM_RESPONSE_STRATEGIES: RmResponseStrategy[] = ['avoid', 'mitigate', 'transfer', 'accept', 'escalate', 'exploit', 'enhance', 'share']

/** Threat strategies (spec #4) — 'accept' and 'escalate' are shared with Opportunity. */
export const RM_THREAT_STRATEGIES: RmResponseStrategy[] = ['avoid', 'mitigate', 'transfer', 'accept', 'escalate']
/** Opportunity strategies (spec #5). */
export const RM_OPPORTUNITY_STRATEGIES: RmResponseStrategy[] = ['exploit', 'enhance', 'share', 'accept', 'escalate']

export function strategiesForRiskType(riskType: RmRiskType): RmResponseStrategy[] {
  return riskType === 'threat' ? RM_THREAT_STRATEGIES : RM_OPPORTUNITY_STRATEGIES
}

export const RM_RESPONSE_STRATEGY_LABEL_FA: Record<RmResponseStrategy, string> = {
  avoid: 'اجتناب (Avoid)',
  mitigate: 'کاهش (Mitigate)',
  transfer: 'انتقال (Transfer)',
  accept: 'پذیرش (Accept)',
  escalate: 'ارجاع به مقام بالاتر (Escalate)',
  exploit: 'بهره‌برداری (Exploit)',
  enhance: 'تقویت (Enhance)',
  share: 'اشتراک‌گذاری (Share)',
}

export const RM_RESPONSE_STRATEGY_DESCRIPTION_FA: Record<RmResponseStrategy, string> = {
  avoid: 'حذف تهدید با تغییر برنامه، محدوده، مسیر، طراحی یا روش اجرا',
  mitigate: 'کاهش احتمال و/یا شدت پیامد',
  transfer: 'انتقال مالکیت یا اثر مالی به شخص ثالث (بیمه، قرارداد، ضمانت‌نامه، پیمانکاری فرعی)',
  accept: 'پذیرش آگاهانه ریسک بدون اقدام پیشگیرانه، با برنامه اقتضایی اختیاری',
  escalate: 'ارجاع ریسک به سطح بالاتر سازمانی، خارج از اختیار یا کنترل سطح فعلی پروژه',
  exploit: 'اقدام برای تضمین وقوع فرصت',
  enhance: 'افزایش احتمال و/یا پیامد مثبت',
  share: 'تخصیص مالکیت فرصت به یک شریک یا شخص ثالث که بهتر می‌تواند از آن بهره‌برداری کند',
}

export type RmProjectPhase = 'engineering' | 'procurement' | 'construction' | 'commissioning'

export const RM_PROJECT_PHASES: RmProjectPhase[] = ['engineering', 'procurement', 'construction', 'commissioning']

export const RM_PROJECT_PHASE_LABEL_FA: Record<RmProjectPhase, string> = {
  engineering: 'مهندسی',
  procurement: 'تامین کالا',
  construction: 'ساخت و نصب',
  commissioning: 'راه‌اندازی',
}

export type RmTrend = 'improving' | 'stable' | 'worsening'

export const RM_TREND_LABEL_FA: Record<RmTrend, string> = {
  improving: 'رو به بهبود',
  stable: 'ثابت',
  worsening: 'رو به وخامت',
}

export const RM_TREND_COLOR: Record<RmTrend, string> = {
  improving: '#2ecc71',
  stable: '#94a3b8',
  worsening: '#e74c3c',
}

/** Three-tier organizational routing for Escalation Management (spec #15) — not simply a status. */
export type RmEscalationLevel = 'project_team' | 'project_manager' | 'management'

export const RM_ESCALATION_LEVELS: RmEscalationLevel[] = ['project_team', 'project_manager', 'management']

export const RM_ESCALATION_LEVEL_LABEL_FA: Record<RmEscalationLevel, string> = {
  project_team: 'تیم پروژه',
  project_manager: 'مدیر پروژه',
  management: 'مدیریت / کمیته راهبری',
}

export const RM_ESCALATION_LEVEL_COLOR: Record<RmEscalationLevel, string> = {
  project_team: '#2ecc71',
  project_manager: '#f97316',
  management: '#e74c3c',
}

export type RmEscalationStatus = 'none' | 'recommended' | 'escalated' | 'decided'

export const RM_ESCALATION_STATUSES: RmEscalationStatus[] = ['none', 'recommended', 'escalated', 'decided']

export const RM_ESCALATION_STATUS_LABEL_FA: Record<RmEscalationStatus, string> = {
  none: 'بدون ارجاع',
  recommended: 'پیشنهاد ارجاع',
  escalated: 'ارجاع‌شده به مقام بالاتر',
  decided: 'تصمیم‌گیری‌شده',
}

/** Flexible key/value bag — shape depends on riskType + responseStrategy (spec #6). See lib/strategyFields.ts. */
export type RmStrategyDetails = Record<string, string>

export interface RmRisk {
  id: string
  projectId: string
  code: string
  title: string
  description: string
  category: RmRiskCategory
  riskType: RmRiskType
  ownerId: string | null
  identifiedDate: string
  status: RmRiskStatus
  responseStrategy: RmResponseStrategy
  strategyDetails: RmStrategyDetails
  projectPhase: RmProjectPhase | null
  timeToImpactDays: number | null
  initialProbability: number
  initialImpact: number
  initialScore: number

  // Escalation Management (spec #15-16) — independent of responseStrategy/status.
  escalationLevel: RmEscalationLevel | null
  escalatedTo: string
  escalationReason: string
  escalationDate: string | null
  requiredDecision: string
  escalationDecision: string
  escalationDecisionDate: string | null
  escalationStatus: RmEscalationStatus

  // ---- ERM v2 identity card
  cause: string
  riskEvent: string
  consequence: string
  source: RmSource
  sourceRefType: string | null
  sourceRefId: string | null
  sourceSnapshot: Record<string, unknown>
  externalSystem: string | null
  externalId: string | null
  syncStatus: string
  syncedAt: string | null
  subcategory: string | null
  discipline: string
  impactDims: Partial<Record<RmImpactDim, number>>
  impactTimeDays: number | null
  impactCost: number | null
  impactObjectives: string
  assumptions: string
  assessmentBasis: string
  kmFrom: number | null
  kmTo: number | null
  routeSegment: string
  station: string
  workFront: string
  contractor: string
  workPackage: string
  execStage: string
  monitorId: string | null
  approverId: string | null
  responseOwnerId: string | null
  reviewIntervalDays: number | null
  nextReviewDate: string | null
  reviewRequestedAt: string | null
  reviewRequestReason: string
  corporateRiskId: string | null
  realizedAt: string | null
  closedAt: string | null
  closedReason: string
  tags: string[]

  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type RmSource = 'manual' | 'mission_debrief' | 'issue' | 'import' | 'meeting' | 'api' | 'ai' | 'lifecycle' | 'kri'
export const RM_SOURCE_LABEL_FA: Record<RmSource, string> = {
  manual: 'ثبت دستی', mission_debrief: 'گزارش بازدید/مأموریت', issue: 'مدیریت مسائل', import: 'ورود از فایل', meeting: 'صورت‌جلسه', api: 'سامانهٔ خارجی', ai: 'پیشنهاد هوشمند', lifecycle: 'چرخهٔ عمر پروژه', kri: 'شاخص هشدار',
}

/** Impact dimensions (each 0–5; the risk's impact score is the worst dimension — never an average). */
export type RmImpactDim = 'time' | 'cost' | 'quality' | 'hse' | 'env' | 'legal' | 'objective'
export const RM_IMPACT_DIMS: RmImpactDim[] = ['time', 'cost', 'quality', 'hse', 'env', 'legal', 'objective']
export const RM_IMPACT_DIM_LABEL_FA: Record<RmImpactDim, string> = { time: 'زمان', cost: 'هزینه', quality: 'کیفیت', hse: 'ایمنی', env: 'محیط زیست', legal: 'الزامات قانونی', objective: 'اهداف فنی/عملیاتی' }

export interface RmRiskAssessment {
  id: string
  riskId: string
  reviewDate: string
  currentProbability: number
  currentImpact: number
  currentScore: number
  residualProbability: number
  residualImpact: number
  residualScore: number
  trend: RmTrend
  reviewerComment: string
  /** Snapshot of the risk's response strategy at review time (spec #11). */
  responseStrategy: RmResponseStrategy | null
  method: RmMethod
  basis: string
  impactDims: Partial<Record<RmImpactDim, number>>
  probabilityPct: number | null
  exposureCost: number | null
  kind: 'review' | 'post_action' | 'kri_triggered' | 'periodic'
  relatedActionIds: string[]
  approvedBy: string | null
  approvedAt: string | null
  createdBy: string | null
  createdAt: string
}

export type RmMethod = 'qualitative' | 'semi_quantitative' | 'quantitative'
export const RM_METHOD_LABEL_FA: Record<RmMethod, string> = { qualitative: 'کیفی', semi_quantitative: 'نیمه‌کمی', quantitative: 'کمی' }

export type RmActionStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'

export const RM_ACTION_STATUSES: RmActionStatus[] = ['not_started', 'in_progress', 'blocked', 'completed', 'cancelled']

export const RM_ACTION_STATUS_LABEL_FA: Record<RmActionStatus, string> = {
  not_started: 'شروع‌نشده',
  in_progress: 'در حال انجام',
  completed: 'تکمیل‌شده',
  blocked: 'مسدود',
  cancelled: 'لغو‌شده',
}

export type RmActionType = 'preventive' | 'mitigating' | 'corrective' | 'contingency'
export const RM_ACTION_TYPE_LABEL_FA: Record<RmActionType, string> = { preventive: 'پیشگیرانه', mitigating: 'کاهشی', corrective: 'اصلاحی', contingency: 'اقتضایی' }
export type RmEffectStatus = 'pending' | 'effective' | 'partial' | 'ineffective' | 'not_applicable'
export const RM_EFFECT_LABEL_FA: Record<RmEffectStatus, string> = { pending: 'بررسی نشده', effective: 'مؤثر', partial: 'اثر نسبی', ineffective: 'بی‌اثر', not_applicable: 'نامربوط' }

export interface RmRiskAction {
  id: string
  riskId: string
  description: string
  ownerId: string | null
  dueDate: string | null
  status: RmActionStatus
  completionPercentage: number
  actionType: RmActionType
  expectedOutput: string
  expectedEffect: string
  resources: string
  completionCriteria: string
  costEstimate: number | null
  benefitEstimate: number | null
  plannedStart: string | null
  parentActionId: string | null
  blockedReason: string
  blockedSince: string | null
  completedAt: string | null
  evidenceNote: string
  effectStatus: RmEffectStatus
  effectNote: string
  effectVerifiedBy: string | null
  effectVerifiedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface RmRiskHistoryEntry {
  id: string
  riskId: string
  userId: string | null
  activity: string
  previousValue: unknown
  newValue: unknown
  comment: string
  createdAt: string
}

// ---------------------------------------------------------------- ERM v2 extra entities
export interface RmControl {
  id: string; riskId: string; name: string; description: string
  controlType: 'preventive' | 'detective' | 'corrective' | 'contingency'
  ownerId: string | null; isCritical: boolean
  status: 'planned' | 'active' | 'inactive' | 'expired'
  effectiveness: 'not_tested' | 'effective' | 'partial' | 'ineffective'
  lastTestedAt: string | null; testIntervalDays: number | null; expiresOn: string | null; evidenceNote: string
  createdAt: string; updatedAt: string
}
export const RM_CONTROL_TYPE_LABEL_FA = { preventive: 'پیشگیرانه', detective: 'کشف‌کننده', corrective: 'اصلاحی', contingency: 'اقتضایی' } as const
export const RM_CONTROL_STATUS_LABEL_FA = { planned: 'برنامه‌ریزی‌شده', active: 'فعال', inactive: 'غیرفعال', expired: 'منقضی' } as const
export const RM_CONTROL_EFFECT_LABEL_FA = { not_tested: 'آزمون‌نشده', effective: 'مؤثر', partial: 'نسبی', ineffective: 'بی‌اثر' } as const

export interface RmContingency {
  id: string; riskId: string; triggerCondition: string; plan: string; ownerId: string | null; budget: number | null
  status: 'draft' | 'ready' | 'activated' | 'retired'; activatedAt: string | null; createdAt: string
}
export const RM_CONTINGENCY_STATUS_LABEL_FA = { draft: 'پیش‌نویس', ready: 'آماده', activated: 'فعال‌شده', retired: 'بازنشسته' } as const

export interface RmEvidence { id: string; riskId: string; kind: 'document' | 'photo' | 'letter' | 'report' | 'assumption' | 'calculation' | 'link' | 'other'; title: string; note: string; url: string; createdBy: string | null; createdAt: string }
export const RM_EVIDENCE_KIND_LABEL_FA = { document: 'مدرک', photo: 'عکس', letter: 'نامه', report: 'گزارش', assumption: 'فرض', calculation: 'محاسبه', link: 'پیوند', other: 'سایر' } as const

export type RmLinkRelation = 'related' | 'shared_cause' | 'depends_on' | 'duplicate_of' | 'derived_issue' | 'source' | 'mitigated_by' | 'aggregates'
export const RM_LINK_RELATION_LABEL_FA: Record<RmLinkRelation, string> = { related: 'مرتبط', shared_cause: 'علت مشترک', depends_on: 'وابسته به', duplicate_of: 'تکراری', derived_issue: 'مسئلهٔ ناشی از تحقق', source: 'منبع', mitigated_by: 'کاهش‌یافته با', aggregates: 'تجمیع‌کننده' }
export interface RmLink { id: string; riskId: string; targetType: 'risk' | 'issue' | 'mission' | 'finding' | 'external'; targetId: string; targetLabel: string; relation: RmLinkRelation; createdAt: string }

export interface RmCorporateRisk { id: string; code: string; title: string; description: string; category: string | null; ownerId: string | null; status: 'open' | 'monitoring' | 'closed'; correctivePlan: string; createdAt: string }

export interface RmAcceptance { id: string; riskId: string; requestedBy: string | null; requestedAt: string; residualScore: number; rationale: string; validUntil: string | null; status: 'requested' | 'approved' | 'rejected' | 'withdrawn' | 'expired'; decidedBy: string | null; decidedAt: string | null; decisionNote: string }
export const RM_ACCEPT_STATUS_LABEL_FA = { requested: 'در انتظار تصمیم', approved: 'تأییدشده', rejected: 'ردشده', withdrawn: 'پس‌گرفته', expired: 'منقضی' } as const

export type RmKriState = 'no_data' | 'normal' | 'warn' | 'critical'
export const RM_KRI_STATE_LABEL_FA: Record<RmKriState, string> = { no_data: 'بدون داده', normal: 'عادی', warn: 'هشدار', critical: 'بحرانی' }
export const RM_KRI_STATE_COLOR: Record<RmKriState, string> = { no_data: '#94a3b8', normal: '#22c55e', warn: '#f59e0b', critical: '#ef4444' }
export const RM_KRI_DOMAINS: { key: string; label: string }[] = [
  { key: 'engineering', label: 'مهندسی' }, { key: 'procurement', label: 'تأمین' }, { key: 'construction', label: 'اجرا' }, { key: 'land', label: 'آزادسازی مسیر' },
  { key: 'contract', label: 'قراردادها' }, { key: 'hse', label: 'HSE' }, { key: 'commissioning', label: 'راه‌اندازی' }, { key: 'general', label: 'عمومی' },
]
export interface RmKri {
  id: string; projectId: string; riskId: string | null; name: string; definition: string; unit: string; domain: string
  direction: 'higher_worse' | 'lower_worse'; baseline: number | null; warnThreshold: number; criticalThreshold: number; frequencyDays: number
  ownerId: string | null; dataSource: 'manual' | 'external'; externalSystem: string | null; externalKey: string | null; active: boolean
  currentValue: number | null; lastReadingAt: string | null; state: RmKriState; createdAt: string
}
export interface RmKriReading { id: number; kriId: string; value: number; readAt: string; source: 'manual' | 'api' | 'import'; note: string }
export interface RmKriEvent { id: number; kriId: string; fromState: RmKriState; toState: RmKriState; value: number | null; at: string }

export interface RmPolicy {
  id: string; projectId: string | null; appetiteMax: number; toleranceMax: number; escalationMin: number
  levelBounds: [number, number, number]; reviewDays: Record<'low' | 'medium' | 'high' | 'critical', number>; staleAssessmentDays: number
  scaleLabels: Record<string, string[]>; autoAcceptConfidence: number | null
}
export interface RmCategoryDef { key: string; labelFa: string; parentKey: string | null; sort: number; active: boolean }

export interface RmSuggestion { id: string; projectId: string; source: string; sourceRefType: string; sourceRefId: string; title: string; description: string; payload: Record<string, unknown>; confidence: number; status: 'pending' | 'accepted' | 'rejected'; createdRiskId: string | null; createdAt: string }

export interface RmNotifRule { key: string; name: string; description: string; kind: 'state' | 'event'; recipients: string[]; escalateTo: string[]; channels: string[]; thresholdHours: number; dedupeHours: number; isActive: boolean }
