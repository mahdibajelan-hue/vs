import type { PrereqKind, PrereqStatus } from './lib/engine/readiness'

export type EmployerStep = 'off' | 'advisory' | 'binding'
export const EMPLOYER_STEP_LABEL_FA: Record<EmployerStep, string> = { off: 'غیرفعال (گردش کار پیمانکار ← نظارت)', advisory: 'مشورتی (مقدار کارفرما نمایش داده می‌شود ولی تجمعی بر پایهٔ تأیید نظارت است)', binding: 'الزام‌آور (مقدار کارفرما مبنای تجمعی است؛ تا تأیید او ردیف در تجمعی لحاظ نمی‌شود)' }

export interface PartyBrand { name: string; /** data URL, ≤ 150 KB, png/jpeg/webp/svg */ logo: string }
export interface Parties { employer: PartyBrand; consultant: PartyBrand; contractor: PartyBrand }
export const EMPTY_PARTIES: Parties = { employer: { name: '', logo: '' }, consultant: { name: '', logo: '' }, contractor: { name: '', logo: '' } }
export const LOGO_MAX_BYTES = 150 * 1024
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

export interface LegalText { body: string; status: 'draft' | 'legal_approved'; version: number; scope: 'project' | 'default' }

export interface CrewLogRow { id: string; reportId: string; activityId: string | null; crewName: string; composition: Record<string, number>; usefulHours: number; idleHours: number; outputQty: number; conditions: Record<string, unknown>; note: string }
export interface EngDocRow { id: string; projectId: string; docNo: string; title: string; discipline: string; rev: string; status: 'required' | 'issued' | 'pending_approval' | 'approved' | 'restricted' | 'superseded'; restrictionNote: string; dueDate: string | null; issuedDate: string | null }
export const ENG_STATUS_LABEL_FA: Record<EngDocRow['status'], string> = { required: 'موردنیاز', issued: 'صادرشده', pending_approval: 'در انتظار تأیید', approved: 'تأییدشده', restricted: 'دارای محدودیت اجرایی', superseded: 'منسوخ' }
export interface PrereqRow { id: string; projectId: string; activityId: string; kind: PrereqKind; title: string; refType: string; refId: string | null; status: PrereqStatus; neededDate: string | null; readyDate: string | null; note: string }
export const PREREQ_KIND_LABEL_FA: Record<PrereqKind, string> = { drawing: 'نقشه/مدرک مهندسی', material: 'مصالح', equipment: 'تجهیز/ماشین‌آلات', permit: 'مجوز', land: 'زمین/جبهه', inspection: 'بازرسی/تأییدیه', manpower: 'نیروی انسانی', other: 'سایر' }
export interface DepRow { id: string; projectId: string; predId: string; succId: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag: number }
export interface LookaheadRow { id: string; projectId: string; weekStart: string; activityId: string; front: string; responsible: string; plannedQty: number; resources: Record<string, unknown>; committed: boolean; achievedQty: number | null; deviationCause: string; recoveryPlan: string; note: string }
export interface MeasurementRow { id: string; projectId: string; activityId: string; periodKey: string; measured: number; billed: number; paid: number; certificateId: string | null; note: string }
export interface VersionRow { id: number; reportId: string; version: number; status: string; snapshot: Record<string, unknown>; actor: string | null; at: string }
export interface FormProposalRow { id: string; projectId: string; formKey: string; title: string; definition: Record<string, unknown>; reason: string; status: 'proposed' | 'approved' | 'rejected'; proposedBy: string | null; decidedBy: string | null; decisionNote: string }
export interface ScheduleImportRow { id: string; projectId: string; fileName: string; summary: Record<string, unknown>; importedAt: string }

/** EPC settings kept inside ex_settings.values_json (extends ExSettings without touching its type). */
export interface EpcSettings {
  employerStep: EmployerStep
  parties: Parties
  productivity: { windowDays: number; weighting: 'all' | 'wma' | 'sma'; smaDays: number; outlierSigma: number; assumedElasticity: number; extraShiftEfficiency: number; shiftHours: number; crewDayCost: number | null; laborKeys: string[] }
  thresholds: import('./lib/engine/alerts').AlertThresholds
}
