export type PssrKind = 'pipeline' | 'station' | 'facility' | 'utility'
export type CheckStatus = 'pending' | 'ok' | 'fail' | 'na'
export type PunchCategory = 'A' | 'B' | 'C'
export type PunchStatus = 'open' | 'closed' | 'verified'

export interface PssrSystem { id: string; projectId: string; code: string; name: string; kind: PssrKind; kmFrom: number | null; kmTo: number | null; targetGasIn: string | null; note: string; createdAt: string }
export interface PssrTemplateItem { id: number; kind: PssrKind | 'all'; category: string; seq: number; title: string; mandatory: boolean; active: boolean }
export interface PssrCheck { id: string; systemId: string; category: string; seq: number; title: string; mandatory: boolean; status: CheckStatus; evidence: string; fileUrl: string | null; checkedBy: string | null; checkedAt: string | null }
export interface PssrMeeting { id: string; systemId: string; heldOn: string; attendees: string; notes: string; createdBy: string | null }
export interface PssrPunch { id: string; systemId: string; meetingId: string | null; category: PunchCategory; title: string; discipline: string; owner: string; dueDate: string | null; status: PunchStatus; raisedBy: string | null; raisedAt: string; closeNote: string; closedBy: string | null; closedAt: string | null; verifiedBy: string | null; verifiedAt: string | null }
export interface PssrSigner { id: string; projectId: string; seq: number; roleLabel: string; signerEmail: string }
export interface PssrSignoff { id: string; systemId: string; seq: number; roleLabel: string; decision: 'sign' | 'reject'; comment: string; signedBy: string; signedAt: string }

export const KIND_FA: Record<PssrKind, string> = { pipeline: 'خط لوله / قطعه', station: 'ایستگاه', facility: 'تأسیسات', utility: 'سرویس‌های جانبی' }
export const CHECK_FA: Record<CheckStatus, string> = { pending: 'بررسی نشده', ok: 'تأیید', fail: 'رد / ناقص', na: 'غیرقابل‌اعمال' }
export const PUNCH_CAT_FA: Record<PunchCategory, string> = { A: 'A — پیش از RFSU', B: 'B — پیش از تحویل موقت', C: 'C — بهبود' }
export const PUNCH_STATUS_FA: Record<PunchStatus, string> = { open: 'باز', closed: 'بسته شد (منتظر تأیید)', verified: 'تأییدشده' }

/** Default RFSU sign chain until the project defines its own (settings). */
export const DEFAULT_SIGN_CHAIN = ['نمایندهٔ پیمانکار', 'مهندس ناظر', 'نمایندهٔ بهره‌بردار', 'مسئول HSE', 'مجری طرح']
