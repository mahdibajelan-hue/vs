import type { ModuleKey } from '../../store/useModuleStore'

export type InboxSource = 'execution' | 'material' | 'issues' | 'risk' | 'change' | 'missions' | 'finance' | 'scheduling'
export type InboxKind =
  | 'review' | 'fix' | 'gap' | 'delay_assess' | 'delay_notice'
  | 'sign' | 'discrepancy' | 'change' | 'txn' | 'stage' | 'stage_fix'
  | 'verify' | 'extension' | 'task'
  | 'risk_action' | 'acceptance'
  | 'change_step'
  | 'mission_decide' | 'mission_mine'
  | 'fin_certify' | 'fin_claim' | 'fin_retention' | 'fin_guarantee' | 'fin_pay'
  | 'sch_review' | 'sch_approve' | 'sch_fix' | 'sch_eot'

/** One thing that waits for the signed-in person, as computed by the database function inbox_my_items(). */
export interface InboxItem {
  key: string
  source: InboxSource
  kind: InboxKind
  projectId: string | null
  projectName: string
  title: string
  sub: string
  due: string | null
  since: string
  urgent: boolean
  refId: string
  extra: Record<string, unknown>
}

export type InboxGroup = 'decide' | 'do' | 'fix'
export const GROUP_LABEL_FA: Record<InboxGroup, string> = { decide: 'تصمیم و تأیید', do: 'کار من', fix: 'اصلاح و پیگیری' }
export const SOURCE_LABEL_FA: Record<InboxSource, string> = { execution: 'مدیریت اجرا', material: 'کنترل متریال', issues: 'موانع و اقدامات', risk: 'مدیریت ریسک', change: 'مدیریت تغییرات', missions: 'مأموریت‌ها', finance: 'مالی و قرارداد', scheduling: 'برنامه‌ریزی و کنترل زمان' }
export const SOURCE_MODULE: Record<InboxSource, ModuleKey> = { execution: 'execution', material: 'material', issues: 'issues', risk: 'risk', change: 'change', missions: 'missions', finance: 'finance', scheduling: 'scheduling' }

export type ActionTone = 'good' | 'bad' | 'warn' | 'plain'
export interface ActionInput { note: string; progress?: number; refNo?: string; refDate?: string }
export interface ActionDef {
  key: string
  label: string
  tone: ActionTone
  /** whether the person must / may write a comment (opinion) with this action */
  note: 'none' | 'opt' | 'req'
  /** extra input the action needs */
  field?: 'progress' | 'ref'
  /** returns an error message, or null on success */
  run: (item: InboxItem, input: ActionInput) => Promise<string | null>
}
/** Pure description of every kind (no database access), shared by the list, the filters and the actions. */
export const KIND_META: Record<InboxKind, { label: string; group: InboxGroup }> = {
  review: { label: 'بررسی گزارش اجرا', group: 'decide' },
  fix: { label: 'گزارش برگشتی', group: 'fix' },
  gap: { label: 'کسری گزارش', group: 'do' },
  delay_assess: { label: 'ارزیابی مسئولیت تأخیر', group: 'decide' },
  delay_notice: { label: 'اخطار کتبی تأخیر', group: 'do' },
  sign: { label: 'امضای مجوز خروج کالا', group: 'decide' },
  discrepancy: { label: 'مغایرت متریال', group: 'do' },
  change: { label: 'درخواست اصلاح مشخصهٔ کالا', group: 'decide' },
  txn: { label: 'ضایعات یا تعدیل موجودی', group: 'decide' },
  stage: { label: 'تأیید مرحلهٔ تأمین', group: 'decide' },
  stage_fix: { label: 'مرحلهٔ ردشده', group: 'fix' },
  verify: { label: 'تأیید اتمام اقدام', group: 'decide' },
  extension: { label: 'درخواست تمدید مهلت', group: 'decide' },
  task: { label: 'اقدام من', group: 'do' },
  risk_action: { label: 'اقدام پاسخ به ریسک', group: 'do' },
  acceptance: { label: 'پذیرش ریسک', group: 'decide' },
  change_step: { label: 'تصمیم در درخواست تغییر', group: 'decide' },
  mission_decide: { label: 'تأیید مأموریت', group: 'decide' },
  mission_mine: { label: 'مأموریت من', group: 'fix' },
  fin_certify: { label: 'تأیید کارکرد صورت‌وضعیت', group: 'decide' },
  fin_claim: { label: 'تصمیم دربارهٔ کلایم', group: 'decide' },
  fin_retention: { label: 'آزادسازی حسن انجام کار', group: 'do' },
  fin_guarantee: { label: 'انقضای ضمانت‌نامه', group: 'do' },
  fin_pay: { label: 'صورت‌وضعیت پرداخت‌نشده', group: 'do' },
  sch_review: { label: 'بررسی به‌روزرسانی برنامه', group: 'decide' },
  sch_approve: { label: 'تأیید نسخهٔ برنامه', group: 'decide' },
  sch_fix: { label: 'برنامهٔ برگشتی', group: 'fix' },
  sch_eot: { label: 'تصمیم دربارهٔ تمدید زمان', group: 'decide' },
}

export interface KindDef {
  label: string
  group: InboxGroup
  /** Short hint shown in the detail pane — what the person is being asked to do. */
  ask: string
  actions: (item: InboxItem) => ActionDef[]
}
