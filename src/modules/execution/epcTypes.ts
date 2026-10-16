import type { PrereqKind, PrereqStatus } from './lib/engine/readiness'

export type EmployerStep = 'off' | 'advisory' | 'binding'
export const EMPLOYER_STEP_LABEL_FA: Record<EmployerStep, string> = { off: 'غیرفعال (گردش کار پیمانکار ← نظارت)', advisory: 'مشورتی (مقدار کارفرما نمایش داده می‌شود ولی تجمعی بر پایهٔ تأیید نظارت است)', binding: 'الزام‌آور (مقدار کارفرما مبنای تجمعی است؛ تا تأیید او ردیف در تجمعی لحاظ نمی‌شود)' }

export interface PartyBrand { name: string; /** data URL, ≤ 150 KB, png/jpeg/webp/svg */ logo: string }
export interface Parties { employer: PartyBrand; consultant: PartyBrand; contractor: PartyBrand }
/** Project identity used by approved technical forms (defined once; every form of the project reads it). The official title and parties' names/logos come from the project and the letterhead above. */
export interface FormIdentity { contractNo: string; lineNo: string; diameterIn: string; kmFrom: string; kmTo: string; pipeGrade: string; pipeStandard: string }
export const EMPTY_IDENTITY: FormIdentity = { contractNo: '', lineNo: '', diameterIn: '', kmFrom: '', kmTo: '', pipeGrade: '', pipeStandard: '' }
export const EMPTY_PARTIES: Parties = { employer: { name: '', logo: '' }, consultant: { name: '', logo: '' }, contractor: { name: '', logo: '' } }
export const LOGO_MAX_BYTES = 150 * 1024
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

export interface LegalText { body: string; status: 'draft' | 'legal_approved'; version: number; scope: 'project' | 'default' }

export interface CrewLogRow { id: string; reportId: string; activityId: string | null; crewName: string; composition: Record<string, number>; usefulHours: number; idleHours: number; outputQty: number; conditions: Record<string, unknown>; note: string }
export type EngStatus = 'required' | 'in_preparation' | 'issued' | 'pending_approval' | 'approved' | 'restricted' | 'superseded'
export interface EngDocRow {
  id: string; projectId: string; docNo: string; title: string; discipline: string; rev: string; contract: string; preparer: string; approver: string; weight: number; critical: boolean
  status: EngStatus; restrictionNote: string; dueDate: string | null; issuedDate: string | null
  plannedPrepared: string | null; plannedApproved: string | null; actualPrepared: string | null; actualApproved: string | null; note: string
  /** MDL register fields: document type (REP/DWG/…), phase (DP1 detail design / PP1 procurement), target issue purpose (IFA/IFI/POI), price the weight derives from */
  category: string; phase: string; targetIssue: string; price: number
}
export const ENG_STATUS_LABEL_FA: Record<EngStatus, string> = { required: 'شروع‌نشده', in_preparation: 'در حال تهیه', issued: 'تهیه‌شده/صادرشده', pending_approval: 'در انتظار تأیید', approved: 'تأییدشده', restricted: 'تأیید با محدودیت اجرایی', superseded: 'منسوخ' }
export interface DocLinkRow { id: string; projectId: string; docId: string; activityId: string; front: string; contract: string; needKind: 'start' | 'continue'; needDate: string | null; minStatus: 'issued' | 'approved'; allowRestricted: boolean; altActivityId: string | null; note: string }
export interface PrereqRow { id: string; projectId: string; activityId: string; kind: PrereqKind; title: string; refType: string; refId: string | null; status: PrereqStatus; neededDate: string | null; readyDate: string | null; note: string }
export const PREREQ_KIND_LABEL_FA: Record<PrereqKind, string> = { drawing: 'نقشه/مدرک مهندسی', material: 'مصالح', equipment: 'تجهیز/ماشین‌آلات', permit: 'مجوز', land: 'زمین/جبهه', inspection: 'بازرسی/تأییدیه', manpower: 'نیروی انسانی', other: 'سایر' }
export interface DepRow { id: string; projectId: string; predId: string; succId: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag: number }
export interface LookaheadRow { id: string; projectId: string; weekStart: string; activityId: string; front: string; responsible: string; plannedQty: number; resources: Record<string, unknown>; committed: boolean; achievedQty: number | null; deviationCause: string; recoveryPlan: string; note: string }
export interface MeasurementRow { id: string; projectId: string; activityId: string; periodKey: string; measured: number; billed: number; paid: number; certificateId: string | null; note: string }
export interface VersionRow { id: number; reportId: string; version: number; status: string; snapshot: Record<string, unknown>; actor: string | null; at: string }
export interface FormProposalRow { id: string; projectId: string; formKey: string; title: string; definition: Record<string, unknown>; reason: string; status: 'proposed' | 'approved' | 'rejected'; proposedBy: string | null; decidedBy: string | null; decisionNote: string }
export interface FormTemplateRow { id: string; formKey: string; version: number; title: string; code: string; revision: string; status: 'draft' | 'approved' | 'retired'; layout: import('./forms/gridTypes').GridTemplate; bindings: import('./forms/gridTypes').CellBinding[]; sourceFile: string; sourceSha256: string; approvedAt: string | null }
export interface ReportLinkRow { id: string; projectId: string; lineId: string; techReportId: string }
export interface ScheduleImportRow { id: string; projectId: string; fileName: string; summary: Record<string, unknown>; importedAt: string }

/** EPC settings kept inside ex_settings.values_json (extends ExSettings without touching its type). */
export interface EpcSettings {
  employerStep: EmployerStep
  parties: Parties
  identity: FormIdentity
  productivity: { windowDays: number; weighting: 'all' | 'wma' | 'sma'; smaDays: number; outlierSigma: number; assumedElasticity: number; extraShiftEfficiency: number; shiftHours: number; crewDayCost: number | null; laborKeys: string[] }
  thresholds: import('./lib/engine/alerts').AlertThresholds
}

export interface QcFindingRow { id: string; projectId: string; techReportId: string | null; lineId: string | null; kind: 'defect' | 'nonconformity' | 'observation'; severity: 'low' | 'medium' | 'high'; status: 'open' | 'closed'; weldRef: string; note: string; createdAt: string; closedAt: string | null }

export interface FormEntryRow { id: string; projectId: string; templateId: string; entryDate: string; header: string[]; rows: string[][]; createdAt: string }

export interface WeldRow { id: string; projectId: string; sectionKey: string; weldKey: string; sectionRaw: string; weldRaw: string; pipeNo: string | null; status: 'auto' | 'confirmed' | 'merged' | 'orphan'; mergedInto: string | null; central: Partial<Record<'pipe' | 'size' | 'thk' | 'length' | 'bend', string>> }
export interface LineWeldRow { lineId: string; weldId: string; projectId: string; rawPipe: string }
export interface WeldConflictRow { id: string; projectId: string; weldId: string; kind: 'pipe' | 'size' | 'thickness' | 'front'; detail: string; status: 'open' | 'resolved' | 'dismissed' }
export interface WeldSuspectRow { projectId: string; n2: string; weldIds: string[]; raws: string[] }
export interface WeldMergeRow { id: string; projectId: string; fromWeld: string; intoWeld: string; reason: string; undoneAt: string | null }
export type NcrStatus = 'open' | 'dispositioned' | 'capa' | 'verifying' | 'closed' | 'void'
export interface NcrRow { id: string; projectId: string; code: string; findingId: string | null; weldId: string | null; weldRef: string; techReportId: string | null; kind: 'defect' | 'nonconformity' | 'observation'; severity: 'low' | 'medium' | 'high'; description: string; disposition: 'repair' | 'accept_deviation' | 'reject' | 'rework' | null; status: NcrStatus; ownerId: string | null; dueDate: string | null; rcaRequired: boolean; createdAt: string; closedAt: string | null }
export interface NcrEventRow { id: string; ncrId: string; at: string; by: string | null; kind: string; fromStatus: string | null; toStatus: string | null; note: string }
export interface NcrLinkRow { id: string; ncrId: string; targetType: 'issue' | 'risk'; targetId: string | null; status: 'linked' | 'pending' | 'failed' | 'broken'; error: string }

export interface RequiredFormRow { id: string; projectId: string; activityId: string; formKey: string; note: string }
export interface MappingApprovalRow { id: string; templateId: string; approvedAt: string; note: string; revokedAt: string | null }

export interface WeldHistoryRow { id: number; weldId: string; attr: 'pipe' | 'size' | 'thk' | 'length' | 'bend'; oldValue: string | null; newValue: string | null; source: 'form' | 'manual' | 'backfill'; note: string; at: string }
/** list columns of the archive (the frozen snapshot is fetched only when a record is opened) */
export interface ArchiveRow { id: string; projectId: string; reportId: string; version: number; formKey: string; formTitle: string; category: string; reportNo: string; reportDate: string; status: string; note: string; createdAt: string }

export interface StatementRow0 { id: string; projectId: string; no: number; periodFrom: string; periodTo: string; status: 'draft' | 'finalized'; note: string; finalizedAt: string | null }
export interface StatementLine { id: string; statementId: string; activityId: string; unitPrice: number; baseQty: number; sys: number; req: number | null; con: number | null; reqEdited: boolean; prevSys: number; prevReq: number; prevCon: number }

export type SignParty = 'contractor' | 'consultant' | 'supervision' | 'employer' | 'other'
export interface SignSlot { id: string; projectId: string; formKey: string; slotKey: string; label: string; party: SignParty; userId: string | null; sort: number; required: boolean; active: boolean }
export interface ReportSignature { id: string; reportId: string; slotKey: string; label: string; userId: string; userName: string; image: string; signedAt: string }
