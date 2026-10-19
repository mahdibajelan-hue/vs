/** Types of the scheduling & time-control module. Dates are ISO yyyy-mm-dd; durations are working days of the version's project calendar. */
export type RelType = 'FS' | 'SS' | 'FF' | 'SF'
export type ActType = 'task' | 'milestone' | 'summary' | 'loe'
export type VersionKind = 'initial' | 'baseline' | 'update' | 'scenario'
export type VersionSource = 'excel' | 'p6_xml' | 'p6_xer' | 'manual' | 'copy'

export const REL_LABEL_FA: Record<RelType, string> = { FS: 'پایان به شروع (FS)', SS: 'شروع به شروع (SS)', FF: 'پایان به پایان (FF)', SF: 'شروع به پایان (SF)' }
export const KIND_LABEL_FA: Record<VersionKind, string> = { initial: 'برنامه اولیه', baseline: 'خط مبنا', update: 'به‌روزرسانی', scenario: 'سناریو' }
export const SOURCE_LABEL_FA: Record<VersionSource, string> = { excel: 'Excel', p6_xml: 'P6 (XML)', p6_xer: 'P6 (XER)', manual: 'دستی', copy: 'کپی نسخه' }

export interface SchCalendar { id: string; code: string; name: string; workDays: number[]; hoursPerDay: number; holidays: string[]; isDefault: boolean; sourceId: string }

export interface SchActivity {
  id: string; uid: string; versionId: string
  code: string; sourceId: string; name: string; wbsCode: string; wbsPath: string; type: ActType; calendarId: string | null
  origDuration: number; remDuration: number | null
  plannedStart: string | null; plannedFinish: string | null; actualStart: string | null; actualFinish: string | null
  pctComplete: number | null; constraintType: string; constraintDate: string | null; budgetCost: number; owner: string; sort: number
}
export interface SchRelation { id: string; versionId: string; predId: string; succId: string; type: RelType; lag: number }

export interface SchVersion {
  id: string; projectId: string; label: string; kind: VersionKind; source: VersionSource; fileName: string; fileHash: string
  dataDate: string | null; projectStart: string | null; projectFinish: string | null
  status: 'draft' | 'approved' | 'superseded'; isBaseline: boolean; isCurrent: boolean; parentVersionId: string | null
  reviewStatus: 'none' | 'submitted' | 'endorsed' | 'returned'; approvedBy: string | null; approvedAt: string | null; mapping: Record<string, string>; summary: Record<string, unknown>; warnings: ImportIssue[]; note: string; createdBy: string | null; createdAt: string
}

export type LinkTarget = 'exec_activity' | 'eng_doc' | 'mtl_package' | 'risk' | 'issue' | 'land_parcel' | 'change_request'
export const LINK_LABEL_FA: Record<LinkTarget, string> = { exec_activity: 'فعالیت اجرایی', eng_doc: 'مدرک مهندسی', mtl_package: 'بستهٔ تأمین کالا', risk: 'ریسک', issue: 'مسئله', land_parcel: 'قطعهٔ زمین (تحصیل اراضی)', change_request: 'درخواست تغییر' }
export interface SchLink { id: string; projectId: string; activityUid: string; targetType: LinkTarget; targetId: string; needKind: 'start' | 'continue' | 'finish'; needDate: string | null; note: string }

export interface ImportIssue { level: 'error' | 'warning' | 'info'; row?: number; code?: string; message: string }

/** What a parser (Excel mapping, P6 XML, XER) hands over: activities and relations refer to each other by activity CODE; calendars by their source id. */
export interface ParsedActivity {
  code: string; sourceId: string; name: string; wbsCode: string; wbsPath: string; type: ActType; calendarSourceId: string
  origDuration: number; remDuration: number | null
  plannedStart: string | null; plannedFinish: string | null; actualStart: string | null; actualFinish: string | null
  pctComplete: number | null; constraintType: string; constraintDate: string | null; budgetCost: number; owner: string; row?: number
}
export interface ParsedRelation { predCode: string; succCode: string; type: RelType; lag: number }
export interface ParsedCalendar { sourceId: string; code: string; name: string; workDays: number[]; hoursPerDay: number; holidays: string[]; isDefault: boolean }
export interface ParsedSchedule {
  format: 'excel' | 'p6_xml' | 'p6_xer'
  projectName: string; dataDate: string | null
  activities: ParsedActivity[]; relations: ParsedRelation[]; calendars: ParsedCalendar[]
  issues: ImportIssue[]
  /** things in the source file the module could not carry over (reported, never silently dropped) */
  unsupported: string[]
}
