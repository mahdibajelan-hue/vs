import { parseDate, parsePredecessors, type Cell } from '../../execution/lib/engine/scheduleImport'
import { WorkCalendar, DEFAULT_CALENDAR } from './calendar'
import type { ActType, ImportIssue, ParsedActivity, ParsedRelation, ParsedSchedule } from './types'

export type Grid = Cell[][]
export type FieldKey = 'code' | 'name' | 'wbs' | 'type' | 'duration' | 'remaining' | 'start' | 'finish' | 'actualStart' | 'actualFinish' | 'pct' | 'predecessors' | 'calendar' | 'owner' | 'cost'
export interface FieldDef { key: FieldKey; label: string; required?: boolean; hint: string; aliases: string[] }

export const EXCEL_FIELDS: FieldDef[] = [
  { key: 'code', label: 'کد فعالیت', required: true, hint: 'شناسهٔ یکتای فعالیت؛ پایهٔ تطبیق نسخه‌ها و اتصال‌هاست.', aliases: ['activity id', 'id', 'task id', 'code', 'activity code', 'کد', 'کد فعالیت', 'شناسه', 'شناسه فعالیت'] },
  { key: 'name', label: 'نام فعالیت', required: true, hint: 'عنوان فعالیت.', aliases: ['activity name', 'task name', 'name', 'description', 'نام', 'نام فعالیت', 'شرح', 'شرح فعالیت', 'عنوان'] },
  { key: 'wbs', label: 'WBS', hint: 'کد یا مسیر ساختار شکست کار (برای گروه‌بندی در گانت).', aliases: ['wbs', 'wbs code', 'wbs name', 'ساختار شکست', 'wbs path'] },
  { key: 'type', label: 'نوع', hint: '«نقطه عطف» یا «Milestone» برای نقاط عطف؛ در غیر این صورت فعالیت.', aliases: ['type', 'activity type', 'task type', 'نوع', 'نوع فعالیت'] },
  { key: 'duration', label: 'مدت (روز کاری)', hint: 'مدت اولیه به روز کاری. اگر خالی باشد از تاریخ‌های شروع و پایان محاسبه می‌شود.', aliases: ['duration', 'original duration', 'planned duration', 'orig dur', 'مدت', 'مدت اولیه', 'مدت (روز)', 'duration (days)'] },
  { key: 'remaining', label: 'مدت باقی‌مانده', hint: 'مدت باقی‌ماندهٔ فعالیت‌های در حال انجام (اختیاری).', aliases: ['remaining duration', 'remaining', 'rem dur', 'مدت باقیمانده', 'مدت باقی‌مانده'] },
  { key: 'start', label: 'شروع برنامه‌ای', hint: 'تاریخ شروع در این نسخه از برنامه (میلادی یا شمسی).', aliases: ['start', 'start date', 'planned start', 'early start', 'شروع', 'تاریخ شروع', 'شروع برنامه‌ای', 'شروع برنامه ای'] },
  { key: 'finish', label: 'پایان برنامه‌ای', hint: 'تاریخ پایان در این نسخه از برنامه.', aliases: ['finish', 'finish date', 'end', 'end date', 'planned finish', 'early finish', 'پایان', 'تاریخ پایان', 'پایان برنامه‌ای', 'پایان برنامه ای'] },
  { key: 'actualStart', label: 'شروع واقعی', hint: 'فقط برای فعالیت‌هایی که شروع شده‌اند.', aliases: ['actual start', 'act start', 'شروع واقعی'] },
  { key: 'actualFinish', label: 'پایان واقعی', hint: 'فقط برای فعالیت‌های تمام‌شده.', aliases: ['actual finish', 'act finish', 'actual end', 'پایان واقعی'] },
  { key: 'pct', label: 'درصد پیشرفت', hint: 'درصد پیشرفت ثبت‌شده در فایل. توجه: پیشرفت تأییدشده از ماژول اجرا می‌آید، نه از این ستون.', aliases: ['% complete', 'percent complete', 'physical % complete', 'pct', 'progress', 'درصد پیشرفت', 'پیشرفت'] },
  { key: 'predecessors', label: 'پیش‌نیازها', hint: 'مثل «A100FS+2» یا «A100;A110SS». نوع پیش‌فرض FS و تأخیر بر حسب روز کاری است.', aliases: ['predecessors', 'predecessor', 'preds', 'پیش‌نیاز', 'پیشنیاز', 'پیش نیازها', 'پیشنیازها', 'قبلی'] },
  { key: 'calendar', label: 'تقویم', hint: 'نام تقویم کاری (اختیاری؛ محاسبات روی تقویم پیش‌فرض پروژه انجام می‌شود).', aliases: ['calendar', 'calendar name', 'تقویم'] },
  { key: 'owner', label: 'مسئول', hint: 'مسئول یا مالک فعالیت (اختیاری).', aliases: ['responsible', 'owner', 'resp', 'مسئول', 'مالک'] },
  { key: 'cost', label: 'بودجه / هزینه', hint: 'بودجهٔ فعالیت (ریال) برای وزن‌دهی پیشرفت و تحلیل هزینه (اختیاری).', aliases: ['cost', 'budget', 'budgeted cost', 'هزینه', 'بودجه', 'مبلغ'] },
]

const fa2en = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
const norm = (v: unknown) => fa2en(String(v ?? '')).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌‏]/g, ' ').replace(/\s+/g, ' ').trim()
const str = (v: Cell) => (v == null ? '' : String(v).trim())

/** first row (within the top 25) that looks like a header: it names the activity and at least one more known column */
export function findHeaderRow(grid: Grid): number {
  let best = -1, bestScore = 0
  for (let r = 0; r < Math.min(grid.length, 25); r++) {
    const m = suggestMapping(grid[r].map(str))
    const hits = Object.values(m).filter((x) => x >= 0).length
    if ((m.name >= 0 || m.code >= 0) && hits >= 3 && hits > bestScore) { best = r; bestScore = hits }
  }
  return best
}

/** field → column index (-1 when no column looks right); every column is used at most once */
export function suggestMapping(headers: string[]): Record<FieldKey, number> {
  const out = {} as Record<FieldKey, number>
  const used = new Set<number>()
  const hs = headers.map(norm)
  for (const f of EXCEL_FIELDS) {
    let idx = hs.findIndex((h, i) => !used.has(i) && f.aliases.includes(h))
    if (idx < 0) idx = hs.findIndex((h, i) => !used.has(i) && h !== '' && f.aliases.some((a) => a.length > 3 && h.includes(a)))
    out[f.key] = idx
    if (idx >= 0) used.add(idx)
  }
  return out
}

const isMilestone = (t: string) => /milestone|نقطه\s*عطف|^ms$/i.test(t)

export interface ExcelOptions { defaultWorkDays?: number[] }

/** Turn a sheet into a parsed schedule using the chosen column mapping. Every problem becomes an issue with its row number; nothing is dropped silently. */
export function parseExcelGrid(grid: Grid, headerRow: number, mapping: Record<FieldKey, number>, opts: ExcelOptions = {}): ParsedSchedule {
  const issues: ImportIssue[] = []
  const out: ParsedSchedule = { format: 'excel', projectName: '', dataDate: null, activities: [], relations: [], calendars: [], issues, unsupported: [] }
  for (const f of EXCEL_FIELDS) if (f.required && (mapping[f.key] ?? -1) < 0) issues.push({ level: 'error', message: `ستون «${f.label}» نگاشت نشده است.` })
  if (issues.some((i) => i.level === 'error')) return out
  const cal = new WorkCalendar({ ...DEFAULT_CALENDAR, workDays: opts.defaultWorkDays?.length ? opts.defaultWorkDays : DEFAULT_CALENDAR.workDays }, '2000-01-01')
  const at = (g: Cell[], k: FieldKey): Cell => ((mapping[k] ?? -1) >= 0 ? g[mapping[k]] : undefined)
  const seen = new Map<string, number>()
  const rels: { row: number; succ: string; text: string }[] = []
  const dateOf = (g: Cell[], k: FieldKey, row: number, label: string): string | null => {
    const raw = at(g, k)
    if (raw == null || raw === '') return null
    const d = parseDate(raw)
    if (!d) issues.push({ level: 'error', row, message: `${label} «${str(raw)}» قابل خواندن نیست (میلادی، شمسی یا عدد اکسل).` })
    return d
  }
  const numOf = (g: Cell[], k: FieldKey, row: number, label: string): number | null => {
    const raw = at(g, k); if (raw == null || str(raw) === '') return null
    const n = Number(fa2en(str(raw)).replace(/[,٬%]/g, ''))
    if (!Number.isFinite(n) || n < 0) { issues.push({ level: 'error', row, message: `${label} «${str(raw)}» عدد معتبر نیست.` }); return null }
    return n
  }
  for (let r = headerRow + 1; r < grid.length; r++) {
    const g = grid[r], row = r + 1
    const code = str(at(g, 'code')), name = str(at(g, 'name'))
    if (!code && !name) continue
    if (!code) { issues.push({ level: 'error', row, message: 'کد فعالیت خالی است.' }); continue }
    if (seen.has(code)) { issues.push({ level: 'error', row, code, message: `کد «${code}» تکراری است (ردیف ${seen.get(code)}).` }); continue }
    seen.set(code, row)
    if (!name) issues.push({ level: 'warning', row, code, message: 'نام فعالیت خالی است.' })
    const typeText = str(at(g, 'type'))
    let dur = numOf(g, 'duration', row, 'مدت')
    const start = dateOf(g, 'start', row, 'تاریخ شروع'), finish = dateOf(g, 'finish', row, 'تاریخ پایان')
    const aStart = dateOf(g, 'actualStart', row, 'شروع واقعی'), aFinish = dateOf(g, 'actualFinish', row, 'پایان واقعی')
    if (start && finish && start > finish) issues.push({ level: 'error', row, code, message: 'تاریخ شروع بعد از تاریخ پایان است.' })
    if (aStart && aFinish && aStart > aFinish) issues.push({ level: 'error', row, code, message: 'شروع واقعی بعد از پایان واقعی است.' })
    let type: ActType = isMilestone(typeText) ? 'milestone' : 'task'
    if (dur == null) {
      if (start && finish) { dur = cal.idxOnOrBefore(finish) - cal.idxOnOrAfter(start) + 1; issues.push({ level: 'info', row, code, message: `مدت از تاریخ‌ها محاسبه شد (${dur} روز کاری).` }) }
      else { dur = 0; if (type !== 'milestone') issues.push({ level: 'warning', row, code, message: 'مدت و تاریخ‌ها خالی است؛ فعالیت با مدت صفر وارد شد.' }) }
    }
    if (dur === 0 && type === 'task' && start && finish && start === finish) type = 'milestone'
    let pct = numOf(g, 'pct', row, 'درصد پیشرفت')
    if (pct != null && pct > 0 && pct < 1) pct = Math.round(pct * 10000) / 100 // an Excel percent cell (0.35 = 35%)
    if (pct != null && pct > 100) { issues.push({ level: 'error', row, code, message: 'درصد پیشرفت بیشتر از ۱۰۰ است.' }); pct = null }
    if (aFinish && pct == null) pct = 100
    const a: ParsedActivity = {
      code, sourceId: code, name, wbsCode: str(at(g, 'wbs')), wbsPath: str(at(g, 'wbs')), type, calendarSourceId: str(at(g, 'calendar')),
      origDuration: type === 'milestone' ? 0 : dur, remDuration: numOf(g, 'remaining', row, 'مدت باقی‌مانده'),
      plannedStart: start, plannedFinish: finish, actualStart: aStart, actualFinish: aFinish, pctComplete: pct, constraintType: '', constraintDate: null,
      budgetCost: numOf(g, 'cost', row, 'بودجه') ?? 0, owner: str(at(g, 'owner')), row,
    }
    out.activities.push(a)
    const p = str(at(g, 'predecessors')); if (p) rels.push({ row, succ: code, text: p })
  }
  if (!out.activities.length) issues.push({ level: 'error', message: 'هیچ ردیف فعالیتی پیدا نشد.' })
  const codes = new Set(out.activities.map((a) => a.code))
  const seenRel = new Set<string>()
  for (const r of rels) {
    for (const d of parsePredecessors(r.text)) {
      if (!codes.has(d.predCode)) { issues.push({ level: 'error', row: r.row, code: r.succ, message: `پیش‌نیاز «${d.predCode}» در فهرست فعالیت‌ها نیست.` }); continue }
      if (d.predCode === r.succ) { issues.push({ level: 'error', row: r.row, code: r.succ, message: 'فعالیت پیش‌نیاز خودش است.' }); continue }
      const k = `${d.predCode}>${r.succ}:${d.type}`
      if (seenRel.has(k)) { issues.push({ level: 'warning', row: r.row, code: r.succ, message: `رابطهٔ تکراری ${d.predCode} → ${r.succ} نادیده گرفته شد.` }); continue }
      seenRel.add(k)
      out.relations.push({ predCode: d.predCode, succCode: r.succ, type: d.type, lag: d.lag } satisfies ParsedRelation)
    }
  }
  return out
}

/** sample rows of the downloadable template: a small valid schedule with every supported column */
export function templateGrid(): Cell[][] {
  const head = EXCEL_FIELDS.map((f) => f.label)
  return [
    head,
    ['A100', 'مهندسی تفصیلی', 'EN', 'فعالیت', 20, '', '2026-01-03', '2026-01-28', '', '', 0, '', '', 'مهندسی', 0],
    ['A200', 'تأمین لوله ۴۸ اینچ', 'PR', 'فعالیت', 60, '', '2026-01-29', '2026-04-14', '', '', 0, 'A100FS', '', 'تأمین', 0],
    ['A300', 'جوشکاری خط', 'CN', 'فعالیت', 45, '', '2026-04-15', '2026-06-10', '', '', 0, 'A200FS+2', '', 'اجرا', 0],
    ['M900', 'پایان اجرا', 'CN', 'نقطه عطف', 0, '', '2026-06-10', '2026-06-10', '', '', 0, 'A300FS', '', '', 0],
  ]
}
