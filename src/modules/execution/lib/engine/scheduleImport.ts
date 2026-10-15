import { jalaliToIso } from '../../../../lib/jalali'

export type Cell = string | number | boolean | null | undefined
export interface ScheduleRow { rowIndex: number; code: string; name: string; start: string | null; finish: string | null; predecessors: string; pctComplete: number | null; qty: number | null; wbs: string }
export interface ScheduleParse { rows: ScheduleRow[]; issues: { row: number; message: string }[]; mapping: Record<string, string> }
const ALIASES: Record<keyof Omit<ScheduleRow, 'rowIndex'>, string[]> = {
  code: ['activity id', 'id', 'task id', 'کد', 'کد فعالیت', 'شناسه', 'شماره ردیف', 'ردیف', 'item no', 'شماره فهرست', 'wbs code'],
  name: ['activity name', 'task name', 'name', 'نام', 'نام فعالیت', 'شرح', 'شرح فعالیت', 'عنوان'],
  start: ['start', 'start date', 'planned start', 'early start', 'شروع', 'تاریخ شروع', 'شروع برنامه‌ای'],
  finish: ['finish', 'finish date', 'end', 'planned finish', 'early finish', 'پایان', 'تاریخ پایان', 'پایان برنامه‌ای'],
  predecessors: ['predecessors', 'predecessor', 'پیش‌نیاز', 'پیشنیاز', 'پیشنیازها', 'قبلی'],
  pctComplete: ['% complete', 'percent complete', 'physical % complete', 'درصد پیشرفت', 'پیشرفت'],
  qty: ['quantity', 'qty', 'مقدار', 'حجم'],
  wbs: ['wbs', 'wbs code', 'ساختار شکست', 'wbs name'],
}
const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌‏]/g, ' ').replace(/\s+/g, ' ').trim()
const fa2en = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))

/** ISO date from an Excel serial, an ISO string, dd/mm/yyyy or a Jalali yyyy/mm/dd (year 13xx/14xx). */
export function parseDate(v: Cell): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') { if (v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10); return null }
  const s = fa2en(String(v)).trim().replace(/[T ].*$/, '')
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) { const y = +m[1], mo = +m[2], d = +m[3]; if (mo < 1 || mo > 12 || d < 1 || d > 31) return null; return y < 1700 ? jalaliToIso(y, mo, d) : `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (m) { const d = +m[1], mo = +m[2], y = +m[3]; if (mo < 1 || mo > 12 || d < 1 || d > 31) return null; return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
  return null
}

export function parseScheduleGrid(grid: Cell[][]): ScheduleParse {
  const issues: ScheduleParse['issues'] = []
  let hi = -1
  const mapping: Record<string, string> = {}
  let cols: Partial<Record<keyof typeof ALIASES, number>> = {}
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const found: Partial<Record<keyof typeof ALIASES, number>> = {}
    grid[r].forEach((c, i) => { const n = norm(c); for (const k of Object.keys(ALIASES) as (keyof typeof ALIASES)[]) if (found[k] == null && ALIASES[k].includes(n)) found[k] = i })
    if (found.name != null && (found.start != null || found.finish != null)) { hi = r; cols = found; for (const k of Object.keys(found)) mapping[k] = String(grid[r][found[k as keyof typeof ALIASES]!]); break }
  }
  if (hi < 0) return { rows: [], issues: [{ row: 0, message: 'ردیف عنوان ستون‌ها (نام فعالیت + تاریخ شروع/پایان) پیدا نشد.' }], mapping }
  const rows: ScheduleRow[] = []
  for (let r = hi + 1; r < grid.length; r++) {
    const g = grid[r], at = (k: keyof typeof ALIASES) => (cols[k] != null ? g[cols[k]!] : undefined)
    const name = String(at('name') ?? '').trim()
    if (!name && !String(at('code') ?? '').trim()) continue
    const start = parseDate(at('start')), finish = parseDate(at('finish'))
    if (at('start') != null && at('start') !== '' && !start) issues.push({ row: r + 1, message: `تاریخ شروع «${at('start')}» قابل خواندن نیست.` })
    if (at('finish') != null && at('finish') !== '' && !finish) issues.push({ row: r + 1, message: `تاریخ پایان «${at('finish')}» قابل خواندن نیست.` })
    if (start && finish && start > finish) issues.push({ row: r + 1, message: 'تاریخ شروع بعد از پایان است.' })
    const pctRaw = at('pctComplete'); let pct: number | null = null
    if (pctRaw != null && pctRaw !== '') { const n = Number(fa2en(String(pctRaw)).replace('%', '')); if (Number.isFinite(n)) pct = n > 1 ? n / 100 : n }
    const q = at('qty'); const qn = q != null && q !== '' ? Number(fa2en(String(q)).replace(/,/g, '')) : null
    rows.push({ rowIndex: r + 1, code: String(at('code') ?? '').trim(), name, start, finish, predecessors: String(at('predecessors') ?? '').trim(), pctComplete: pct, qty: qn != null && Number.isFinite(qn) ? qn : null, wbs: String(at('wbs') ?? '').trim() })
  }
  return { rows, issues, mapping }
}

export interface Dep { predCode: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag: number }
/** «12FS+2d», «12SS», «12;14», «12 FS-1» → dependencies (default FS, lag in days). */
export function parsePredecessors(s: string): Dep[] {
  return fa2en(s).split(/[;,،\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = x.match(/^(.+?)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*d?$/i)
    if (!m) return { predCode: x, type: 'FS' as const, lag: 0 }
    return { predCode: m[1].trim(), type: ((m[2] ?? 'FS').toUpperCase() as Dep['type']), lag: m[3] ? Number(m[3].replace(/\s/g, '')) : 0 }
  })
}

export interface MatchResult { matched: { row: ScheduleRow; activityId: string; by: 'code' | 'title' }[]; unmatched: ScheduleRow[]; ambiguous: { row: ScheduleRow; candidates: string[] }[] }
/** Match imported rows to the project's activities by item/row number first, then by exact normalised title; anything else needs a person to map it. */
export function matchActivities(rows: ScheduleRow[], acts: { id: string; itemNo: string; rowNo: string; title: string }[]): MatchResult {
  const byCode = new Map<string, string[]>(), byTitle = new Map<string, string[]>()
  for (const a of acts) { for (const c of [a.itemNo, a.rowNo]) if (c) { const k = norm(c); byCode.set(k, [...(byCode.get(k) ?? []), a.id]) } const t = norm(a.title); byTitle.set(t, [...(byTitle.get(t) ?? []), a.id]) }
  const res: MatchResult = { matched: [], unmatched: [], ambiguous: [] }
  for (const row of rows) {
    const c = row.code ? byCode.get(norm(row.code)) : undefined
    if (c?.length === 1) { res.matched.push({ row, activityId: c[0], by: 'code' }); continue }
    if (c && c.length > 1) { res.ambiguous.push({ row, candidates: c }); continue }
    const t = byTitle.get(norm(row.name))
    if (t?.length === 1) res.matched.push({ row, activityId: t[0], by: 'title' })
    else if (t && t.length > 1) res.ambiguous.push({ row, candidates: t })
    else res.unmatched.push(row)
  }
  return res
}
