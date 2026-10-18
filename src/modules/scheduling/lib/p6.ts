import { descendants, parseXml, txt, type XNode } from './xml'
import type { ActType, ImportIssue, ParsedActivity, ParsedCalendar, ParsedSchedule, RelType } from './types'

/**
 * Primavera P6 import: XER (tab-separated tables) and PMXML (XML). Parsed from the documented table/element names; the result is checked against synthetic samples in the tests —
 * NOT yet against exports of a real P6 installation (see docs). Resources, cost accounts, activity codes/UDFs, expenses, steps and layouts are not carried over (reported in `unsupported`).
 */

const DAY_INDEX: Record<string, number> = { saturday: 0, sunday: 1, monday: 2, tuesday: 3, wednesday: 4, thursday: 5, friday: 6 }
const REL_XML: Record<string, RelType> = { 'finish to start': 'FS', 'start to start': 'SS', 'finish to finish': 'FF', 'start to finish': 'SF' }
const CONSTRAINT: Record<string, string> = {
  CS_MSOA: 'SNET', CS_MSOB: 'SNLT', CS_MEOA: 'FNET', CS_MEOB: 'FNLT', CS_MANDSTART: 'MSO', CS_MANDFIN: 'MFO', CS_ALAP: 'ALAP', CS_MSO: 'MSO', CS_MEO: 'MFO',
  'start on or after': 'SNET', 'start on or before': 'SNLT', 'finish on or after': 'FNET', 'finish on or before': 'FNLT', 'mandatory start': 'MSO', 'mandatory finish': 'MFO',
  'as late as possible': 'ALAP', 'start on': 'MSO', 'finish on': 'MFO',
}
const num = (v: string | undefined): number | null => { if (v == null || v.trim() === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null }
const dateOnly = (v: string | undefined): string | null => { const m = (v ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null }
/** PT80H0M0S → 80 hours */
const isoHours = (v: string): number | null => { const m = v.match(/^P(?:(\d+)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+)M)?/i); if (!m) return null; return (Number(m[1] ?? 0) * 8) + Number(m[2] ?? 0) + Number(m[3] ?? 0) / 60 }
const hours = (v: string | undefined): number | null => { if (v == null || v.trim() === '') return null; const n = num(v); return n ?? (/^P/i.test(v.trim()) ? isoHours(v.trim()) : null) }
const days = (h: number | null, hpd: number): number | null => (h == null ? null : Math.round((h / (hpd || 8)) * 100) / 100)
const excelSerialToIso = (n: number): string => new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10)

export function detectP6Format(text: string): 'xer' | 'xml' | null {
  const head = text.slice(0, 2000)
  if (/^\s*ERMHDR\b/.test(head)) return 'xer'
  if (/<\?xml|<APIBusinessObjects|<Project\b/i.test(head)) return 'xml'
  return null
}

// ───────────────────────── XER

interface XerTable { fields: string[]; rows: Record<string, string>[] }
export function parseXerTables(text: string): Map<string, XerTable> {
  const tables = new Map<string, XerTable>()
  let cur: XerTable | null = null
  for (const raw of text.split(/\r?\n/)) {
    if (!raw) continue
    const cells = raw.split('\t')
    const tag = cells[0]
    if (tag === '%T') { cur = { fields: [], rows: [] }; tables.set(cells[1]?.trim() ?? '', cur) }
    else if (tag === '%F' && cur) cur.fields = cells.slice(1).map((c) => c.trim())
    else if (tag === '%R' && cur) { const r: Record<string, string> = {}; cur.fields.forEach((f, i) => { r[f] = (cells[i + 1] ?? '').trim() }); cur.rows.push(r) }
  }
  return tables
}

/** content between the parenthesis that opens at `open` and its match */
function balanced(s: string, open: number): string {
  let d = 0
  for (let i = open; i < s.length; i++) { if (s[i] === '(') d++; else if (s[i] === ')') { d--; if (d === 0) return s.slice(open + 1, i) } }
  return s.slice(open + 1)
}
const blockAfter = (s: string, marker: string): string | null => { const i = s.indexOf(marker); return i < 0 ? null : balanced(s, i + marker.length - 1) }

/** P6 calendar data (XER clndr_data): working weekdays and exception dates, best effort. day numbers there are 1 = Sunday … 7 = Saturday */
export function parseXerCalendarData(data: string): { workDays: number[]; holidays: string[]; ok: boolean } {
  const dow = blockAfter(data, '(0||DaysOfWeek()(')
  if (dow == null) return { workDays: [], holidays: [], ok: false }
  const toOurs = (n: number) => (n === 7 ? 0 : n) // Saturday 7 → 0, Sunday 1 → 1 … Friday 6 → 6
  const workDays: number[] = []
  for (let n = 1; n <= 7; n++) {
    const b = blockAfter(dow, `(0||${n}()(`)
    if (b != null && b.includes('(s|')) workDays.push(toOurs(n))
  }
  const holidays: string[] = []
  const ex = blockAfter(data, '(0||Exceptions()(')
  if (ex) { const re = /\(0\|\|\d+\(d\|(\d+)\)\(([^)]*)\)/g; let m: RegExpExecArray | null; while ((m = re.exec(ex))) if (!m[2].includes('s|')) holidays.push(excelSerialToIso(Number(m[1]))) }
  return { workDays: workDays.sort((a, b) => a - b), holidays, ok: true }
}

const XER_TYPE: Record<string, ActType> = { TT_Task: 'task', TT_Rsrc: 'task', TT_Mile: 'milestone', TT_FinMile: 'milestone', TT_LOE: 'loe', TT_WBS: 'summary' }
const XER_REL: Record<string, RelType> = { PR_FS: 'FS', PR_SS: 'SS', PR_FF: 'FF', PR_SF: 'SF' }

export function parseXer(text: string): ParsedSchedule {
  const issues: ImportIssue[] = []
  const unsupported = new Set<string>()
  const t = parseXerTables(text)
  const out: ParsedSchedule = { format: 'p6_xer', projectName: '', dataDate: null, activities: [], relations: [], calendars: [], issues, unsupported: [] }
  const task = t.get('TASK'), proj = t.get('PROJECT')
  if (!task || !task.rows.length) { issues.push({ level: 'error', message: 'جدول TASK در فایل XER پیدا نشد یا خالی است.' }); return out }
  const projects = proj?.rows ?? []
  if (projects.length > 1) issues.push({ level: 'warning', message: `فایل ${projects.length} پروژه دارد؛ فعالیت‌های همهٔ پروژه‌ها وارد می‌شوند. برای نتیجهٔ بهتر یک پروژه را جداگانه خروجی بگیرید.` })
  out.projectName = projects[0]?.proj_short_name ?? ''
  out.dataDate = dateOnly(projects[0]?.last_recalc_date) ?? dateOnly(projects[0]?.plan_start_date)
  for (const name of ['RSRC', 'TASKRSRC', 'ACTVCODE', 'TASKACTV', 'UDFVALUE', 'TASKPROC', 'PROJCOST', 'RSRCRATE']) if ((t.get(name)?.rows.length ?? 0) > 0) unsupported.add(name === 'RSRC' || name === 'TASKRSRC' || name === 'RSRCRATE' ? 'منابع (Resources) و تخصیص آن‌ها' : name === 'ACTVCODE' || name === 'TASKACTV' ? 'کدهای فعالیت (Activity Codes)' : name === 'UDFVALUE' ? 'فیلدهای تعریف‌شده توسط کاربر (UDF)' : name === 'TASKPROC' ? 'گام‌های فعالیت (Steps)' : 'هزینه‌ها')

  // calendars
  const calById = new Map<string, ParsedCalendar>()
  for (const r of t.get('CALENDAR')?.rows ?? []) {
    const cd = parseXerCalendarData(r.clndr_data ?? '')
    const hpd = num(r.day_hr_cnt) ?? 8
    if (!cd.ok) issues.push({ level: 'warning', message: `تقویم «${r.clndr_name}» قابل خواندن کامل نبود؛ هفتهٔ کاری استاندارد جایگزین شد.` })
    const c: ParsedCalendar = { sourceId: r.clndr_id, code: r.clndr_id, name: r.clndr_name ?? '', workDays: cd.workDays.length ? cd.workDays : [0, 1, 2, 3, 4], hoursPerDay: hpd, holidays: cd.holidays, isDefault: false }
    calById.set(r.clndr_id, c)
  }
  const defCal = projects[0]?.clndr_id
  if (defCal && calById.has(defCal)) calById.get(defCal)!.isDefault = true
  else if (calById.size) [...calById.values()][0].isDefault = true
  out.calendars = [...calById.values()]

  // WBS
  const wbs = new Map<string, { name: string; code: string; parent: string }>()
  for (const r of t.get('PROJWBS')?.rows ?? []) wbs.set(r.wbs_id, { name: r.wbs_name || r.wbs_short_name, code: r.wbs_short_name, parent: r.parent_wbs_id })
  const wbsPath = (id: string): string => { const p: string[] = []; let cur = wbs.get(id), g = 0; while (cur && g++ < 30) { p.unshift(cur.name); cur = cur.parent ? wbs.get(cur.parent) : undefined } return p.join(' / ') }

  const idToCode = new Map<string, string>()
  const seen = new Set<string>()
  for (const r of task.rows) {
    const type = XER_TYPE[r.task_type] ?? 'task'
    if (type === 'summary') continue
    const code = r.task_code || r.task_id
    if (seen.has(code)) { issues.push({ level: 'warning', code, message: `کد فعالیت «${code}» تکراری است؛ ردیف دوم نادیده گرفته شد.` }); continue }
    seen.add(code)
    idToCode.set(r.task_id, code)
    const hpd = calById.get(r.clndr_id)?.hoursPerDay ?? 8
    const cType = CONSTRAINT[r.cstr_type] ?? ''
    if (r.cstr_type && !cType) unsupported.add(`قید ${r.cstr_type}`)
    const pct = r.complete_pct_type === 'CP_Phys' ? num(r.phys_complete_pct) : r.complete_pct_type === 'CP_Units' ? num(r.phys_complete_pct) : null
    const a: ParsedActivity = {
      code, sourceId: r.task_id, name: r.task_name ?? '', wbsCode: wbs.get(r.wbs_id)?.code ?? '', wbsPath: wbsPath(r.wbs_id), type,
      calendarSourceId: r.clndr_id ?? '', origDuration: type === 'milestone' ? 0 : (days(hours(r.target_drtn_hr_cnt), hpd) ?? 0), remDuration: days(hours(r.remain_drtn_hr_cnt), hpd),
      plannedStart: dateOnly(r.target_start_date) ?? dateOnly(r.early_start_date), plannedFinish: dateOnly(r.target_end_date) ?? dateOnly(r.early_end_date),
      actualStart: dateOnly(r.act_start_date), actualFinish: dateOnly(r.act_end_date), pctComplete: pct, constraintType: cType, constraintDate: dateOnly(r.cstr_date), budgetCost: 0, owner: '',
    }
    if (a.actualFinish && a.pctComplete == null) a.pctComplete = 100
    out.activities.push(a)
  }
  let skipped = 0
  for (const r of t.get('TASKPRED')?.rows ?? []) {
    const p = idToCode.get(r.pred_task_id), s = idToCode.get(r.task_id)
    if (!p || !s) { skipped++; continue }
    const type = XER_REL[r.pred_type]
    if (!type) { issues.push({ level: 'warning', message: `نوع رابطهٔ ${r.pred_type} پشتیبانی نمی‌شود؛ رابطهٔ ${p} → ${s} نادیده گرفته شد.` }); continue }
    const cal = calById.get(task.rows.find((x) => x.task_id === r.task_id)?.clndr_id ?? '')
    out.relations.push({ predCode: p, succCode: s, type, lag: days(hours(r.lag_hr_cnt), cal?.hoursPerDay ?? 8) ?? 0 })
  }
  if (skipped) issues.push({ level: 'info', message: `${skipped} رابطه به فعالیت‌های خارج از فهرست وارد‌شده اشاره دارد و رد شد.` })
  out.unsupported = [...unsupported]
  return out
}

// ───────────────────────── PMXML

export function parseP6Xml(text: string): ParsedSchedule {
  const issues: ImportIssue[] = []
  const unsupported = new Set<string>()
  const out: ParsedSchedule = { format: 'p6_xml', projectName: '', dataDate: null, activities: [], relations: [], calendars: [], issues, unsupported: [] }
  let root: XNode
  try { root = parseXml(text) } catch (e) { issues.push({ level: 'error', message: (e as Error).message }); return out }
  const acts = descendants(root, 'Activity')
  if (!acts.length) { issues.push({ level: 'error', message: 'در فایل XML هیچ عنصر Activity پیدا نشد (فایل PMXML برنامهٔ پروژه نیست).' }); return out }
  const projects = descendants(root, 'Project')
  out.projectName = txt(projects[0], 'Name') || txt(projects[0], 'Id')
  out.dataDate = dateOnly(txt(projects[0], 'DataDate')) ?? dateOnly(txt(projects[0], 'LastSummarizedDate'))
  if (projects.length > 1) issues.push({ level: 'warning', message: `فایل ${projects.length} پروژه دارد؛ فعالیت‌های همهٔ آن‌ها وارد می‌شود.` })

  const calById = new Map<string, ParsedCalendar>()
  for (const c of descendants(root, 'Calendar')) {
    const id = txt(c, 'ObjectId'); if (!id) continue
    const hpd = num(txt(c, 'HoursPerDay')) ?? num(txt(c, 'DayHoursCount')) ?? 8
    const wd: number[] = []
    for (const d of descendants(c, 'StandardWorkHours')) {
      const name = txt(d, 'DayOfWeek').toLowerCase()
      if (name in DAY_INDEX && descendants(d, 'WorkTime').length > 0) wd.push(DAY_INDEX[name])
    }
    const hol = descendants(c, 'HolidayOrException').filter((h) => descendants(h, 'WorkTime').length === 0).map((h) => dateOnly(txt(h, 'Date'))).filter((x): x is string => !!x)
    calById.set(id, { sourceId: id, code: id, name: txt(c, 'Name'), workDays: wd.length ? [...new Set(wd)].sort((a, b) => a - b) : [0, 1, 2, 3, 4], hoursPerDay: hpd, holidays: hol, isDefault: false })
    if (!wd.length) issues.push({ level: 'warning', message: `تقویم «${txt(c, 'Name')}» هفتهٔ کاری مشخص نداشت؛ هفتهٔ استاندارد جایگزین شد.` })
  }
  const defId = txt(projects[0], 'DefaultCalendarObjectId')
  if (defId && calById.has(defId)) calById.get(defId)!.isDefault = true
  else if (calById.size) [...calById.values()][0].isDefault = true
  out.calendars = [...calById.values()]

  const wbs = new Map<string, { name: string; code: string; parent: string }>()
  for (const w of descendants(root, 'WBS')) wbs.set(txt(w, 'ObjectId'), { name: txt(w, 'Name'), code: txt(w, 'Code'), parent: txt(w, 'ParentObjectId') })
  const wbsPath = (id: string): string => { const p: string[] = []; let cur = wbs.get(id), g = 0; while (cur && g++ < 30) { p.unshift(cur.name); cur = cur.parent ? wbs.get(cur.parent) : undefined } return p.join(' / ') }

  const idToCode = new Map<string, string>()
  const seen = new Set<string>()
  for (const a of acts) {
    const objId = txt(a, 'ObjectId')
    const t = txt(a, 'Type').toLowerCase()
    const type: ActType = t.includes('milestone') ? 'milestone' : t.includes('level of effort') ? 'loe' : t.includes('wbs summary') ? 'summary' : 'task'
    if (type === 'summary') continue
    const code = txt(a, 'Id') || objId
    if (seen.has(code)) { issues.push({ level: 'warning', code, message: `کد فعالیت «${code}» تکراری است؛ مورد دوم نادیده گرفته شد.` }); continue }
    seen.add(code); idToCode.set(objId, code)
    const hpd = calById.get(txt(a, 'CalendarObjectId'))?.hoursPerDay ?? 8
    const ctype = txt(a, 'PrimaryConstraintType'), cmap = CONSTRAINT[ctype.toLowerCase()] ?? CONSTRAINT[ctype] ?? ''
    if (ctype && !cmap) unsupported.add(`قید ${ctype}`)
    const pctRaw = num(txt(a, 'PhysicalPercentComplete')) ?? num(txt(a, 'PercentComplete'))
    const act: ParsedActivity = {
      code, sourceId: objId, name: txt(a, 'Name'), wbsCode: wbs.get(txt(a, 'WBSObjectId'))?.code ?? '', wbsPath: wbsPath(txt(a, 'WBSObjectId')), type, calendarSourceId: txt(a, 'CalendarObjectId'),
      origDuration: type === 'milestone' ? 0 : (days(hours(txt(a, 'PlannedDuration')) ?? hours(txt(a, 'OriginalDuration')), hpd) ?? 0), remDuration: days(hours(txt(a, 'RemainingDuration')), hpd),
      plannedStart: dateOnly(txt(a, 'PlannedStartDate')) ?? dateOnly(txt(a, 'StartDate')), plannedFinish: dateOnly(txt(a, 'PlannedFinishDate')) ?? dateOnly(txt(a, 'FinishDate')),
      actualStart: dateOnly(txt(a, 'ActualStartDate')), actualFinish: dateOnly(txt(a, 'ActualFinishDate')), pctComplete: pctRaw,
      constraintType: cmap, constraintDate: dateOnly(txt(a, 'PrimaryConstraintDate')), budgetCost: 0, owner: '',
    }
    if (act.actualFinish && act.pctComplete == null) act.pctComplete = 100
    out.activities.push(act)
  }
  let skipped = 0
  for (const r of descendants(root, 'Relationship')) {
    const p = idToCode.get(txt(r, 'PredecessorActivityObjectId')), s = idToCode.get(txt(r, 'SuccessorActivityObjectId'))
    if (!p || !s) { skipped++; continue }
    const type = REL_XML[txt(r, 'Type').toLowerCase()]
    if (!type) { issues.push({ level: 'warning', message: `نوع رابطهٔ «${txt(r, 'Type')}» شناخته نشد؛ رابطهٔ ${p} → ${s} نادیده گرفته شد.` }); continue }
    out.relations.push({ predCode: p, succCode: s, type, lag: days(hours(txt(r, 'Lag')), 8) ?? 0 })
  }
  if (skipped) issues.push({ level: 'info', message: `${skipped} رابطه به فعالیت‌های خارج از فهرست وارد‌شده اشاره دارد و رد شد.` })
  for (const n of ['Resource', 'ResourceAssignment', 'ActivityCode', 'UDFType', 'CostAccount']) if (descendants(root, n).length) unsupported.add(n === 'Resource' || n === 'ResourceAssignment' ? 'منابع (Resources) و تخصیص آن‌ها' : n === 'ActivityCode' ? 'کدهای فعالیت (Activity Codes)' : n === 'UDFType' ? 'فیلدهای تعریف‌شده توسط کاربر (UDF)' : 'حساب‌های هزینه')
  out.unsupported = [...unsupported]
  return out
}

