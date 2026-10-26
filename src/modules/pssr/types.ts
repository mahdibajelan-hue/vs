export type PssrKind = 'pipeline' | 'station' | 'facility' | 'utility'
export type CheckStatus = 'pending' | 'ok' | 'fail' | 'na'
export type PunchCategory = 'A' | 'B' | 'C'
export type PunchStatus = 'open' | 'closed' | 'verified'

export interface PssrSystem { id: string; projectId: string; code: string; name: string; kind: PssrKind; kmFrom: number | null; kmTo: number | null; targetGasIn: string | null; note: string; createdAt: string }
export interface PssrTemplateItem { id: number; kind: PssrKind | 'all'; category: string; seq: number; title: string; mandatory: boolean; active: boolean }
export interface PssrCheck { id: string; systemId: string; category: string; seq: number; title: string; mandatory: boolean; status: CheckStatus; evidence: string; fileUrl: string | null; checkedBy: string | null; checkedAt: string | null }
export interface PssrMeeting { id: string; systemId: string; heldOn: string; attendees: string; notes: string; createdBy: string | null }
export interface PssrPunch { id: string; systemId: string; meetingId: string | null; category: PunchCategory; title: string; discipline: string; owner: string; dueDate: string | null; status: PunchStatus; raisedBy: string | null; raisedAt: string; closeNote: string; closedBy: string | null; closedAt: string | null; verifiedBy: string | null; verifiedAt: string | null }
/** one person of one sign step: step `seq` (label `roleLabel`) is done when any / all of its persons sign; a manual step
 * is a hand-signed form whose scan its persons confirm in the system */
export interface PssrSigner { id: string; projectId: string; seq: number; roleLabel: string; personLabel: string; signerEmail: string; rule: 'any' | 'all'; manual: boolean }
export interface PssrSignoff { id: string; systemId: string; seq: number; roleLabel: string; personLabel: string; decision: 'sign' | 'reject'; comment: string; signedBy: string; signedAt: string; manualSigner: string; manualSignedOn: string | null; fileUrl: string | null }
export type GasinStatus = 'draft' | 'approved' | 'in_progress' | 'completed' | 'aborted'
export interface GasinCheck { ok: boolean; value?: string; by?: string; at?: string }
export interface GasinPermit { id: string; systemId: string; ptwNo: string; plannedAt: string | null; checks: Record<string, GasinCheck>; status: GasinStatus; approvedBy: string | null; approvedAt: string | null; startedAt: string | null; completedAt: string | null; finalPressure: number | null; notes: string }
export type GasinLogKind = 'valve_open' | 'valve_close' | 'pressure' | 'purge' | 'leak_check' | 'hold' | 'incident' | 'note'
export interface GasinLog { id: string; permitId: string; at: string; kind: GasinLogKind; pressure: number | null; location: string; note: string; by: string }
export const GASIN_LOG_FA: Record<GasinLogKind, string> = { valve_open: 'باز شدن شیر', valve_close: 'بسته شدن شیر', pressure: 'قرائت فشار', purge: 'پاک‌سازی / تخلیه', leak_check: 'بازرسی نشتی', hold: 'توقف / نگه‌داشت', incident: 'رویداد ایمنی', note: 'یادداشت' }
export const GASIN_STATUS_FA: Record<GasinStatus, string> = { draft: 'پیش‌نویس مجوز', approved: 'مجوز صادر شد', in_progress: 'تزریق گاز در جریان', completed: 'تحت گاز', aborted: 'متوقف‌شده' }
/** the day-of-gas-in checklist: every item must be confirmed before the permit can be approved */
export const GASIN_CHECKS: { key: string; label: string; value?: string }[] = [
  { key: 'rfsu_onsite', label: 'گواهی RFSU و دستورالعمل تزریق گاز در محل موجود و تیم توجیه شده است' },
  { key: 'ptw', label: 'مجوز کار (PTW) صادر و شماره‌اش در بالای همین بخش ثبت شده است' },
  { key: 'loto', label: 'جداسازی‌ها و قفل‌وبرچسب (LOTO) بازدید و تأیید شده است' },
  { key: 'purge', label: 'پاک‌سازی با نیتروژن انجام و اکسیژن زیر حد مجاز است', value: 'قرائت O₂ (٪)' },
  { key: 'detectors', label: 'گازسنج‌های پرتابل کالیبره و در محل هستند' },
  { key: 'fire', label: 'تیم و تجهیزات آتش‌نشانی مستقر است' },
  { key: 'medical', label: 'آمبولانس و تیم امداد در محل است' },
  { key: 'dispatch', label: 'هماهنگی با دیسپچینگ و بهره‌بردار انجام شده است', value: 'نام هماهنگ‌کننده' },
  { key: 'comms', label: 'ارتباط رادیویی بین نقاط شیر و اتاق کنترل برقرار است' },
]

export const KIND_FA: Record<PssrKind, string> = { pipeline: 'خط لوله / قطعه', station: 'ایستگاه', facility: 'تأسیسات', utility: 'سرویس‌های جانبی' }
export const CHECK_FA: Record<CheckStatus, string> = { pending: 'بررسی نشده', ok: 'تأیید', fail: 'رد / ناقص', na: 'غیرقابل‌اعمال' }
export const PUNCH_CAT_FA: Record<PunchCategory, string> = { A: 'A — پیش از RFSU', B: 'B — پیش از تحویل موقت', C: 'C — بهبود' }
export const PUNCH_STATUS_FA: Record<PunchStatus, string> = { open: 'باز', closed: 'بسته شد (منتظر تأیید)', verified: 'تأییدشده' }

/** The RFSU sign chain until the project defines its own: contractor → consultant (one of their two representatives),
 * employer (project manager and HSE, both), then the operator's representative signs the paper form by hand and the
 * employer's project manager confirms it in the system. */
export const DEFAULT_SIGN_CHAIN: Omit<PssrSigner, 'id' | 'projectId'>[] = [
  { seq: 1, roleLabel: 'پیمانکار', personLabel: 'مدیر پروژهٔ پیمانکار', signerEmail: '', rule: 'any', manual: false },
  { seq: 1, roleLabel: 'پیمانکار', personLabel: 'سرپرست کارگاه', signerEmail: '', rule: 'any', manual: false },
  { seq: 2, roleLabel: 'مشاور', personLabel: 'مدیر پروژهٔ مشاور', signerEmail: '', rule: 'any', manual: false },
  { seq: 2, roleLabel: 'مشاور', personLabel: 'سرپرست نظارت', signerEmail: '', rule: 'any', manual: false },
  { seq: 3, roleLabel: 'کارفرما', personLabel: 'مدیر پروژهٔ کارفرما', signerEmail: '', rule: 'all', manual: false },
  { seq: 3, roleLabel: 'کارفرما', personLabel: 'مسئول HSE طرح', signerEmail: '', rule: 'all', manual: false },
  { seq: 4, roleLabel: 'نمایندهٔ بهره‌بردار (امضای دستی)', personLabel: 'مدیر پروژهٔ کارفرما', signerEmail: '', rule: 'any', manual: true },
]
