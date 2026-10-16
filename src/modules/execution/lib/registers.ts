import { normN1, weldKey } from './welds'

/** Identity registers: the welder and the pipe are the only things typed as free identifiers; every form row afterwards refers to them by key. Pure helpers, no database. */
export const registerKey = normN1

/** form fields that hold a welder's stamp / ID (a cell may hold several, e.g. «A12 / B3») */
export const WELDER_FIELDS = ['stampRoot', 'stampHot', 'stampFill', 'stampCap', 'stampRootC', 'stampHotC', 'stampFillC', 'stampCapC', 'stamp', 'wid1', 'wid2', 'wid3', 'wid4']
export const isWelderField = (k: string) => WELDER_FIELDS.includes(k)
export const isPipeField = (k: string) => k === 'pipeNo'

export type { PersonSig, Welder, WelderQual } from '../../competency/lib/personnel'
import type { Welder, WelderQual } from '../../competency/lib/personnel'
export interface Pipe { id: string; projectId: string; key: string; raw: string; entryDate: string; heatNo: string; odIn: number | null; wtIn: number | null; lengthM: number | null; grade: string; coating: string; supplier: string; wayBill: string; materialId: string | null; entryLineId: string | null; /** the warehouse receipt (MRS) the pipe arrived with */ receiptId: string | null; status: 'in_stock' | 'rejected' | 'scrapped'; note: string }

/** «A12/B3», «A12 , B3», «A12 و B3» → ['A12','B3'] (N1-normalised) */
export const splitStamps = (v: unknown): string[] => String(v ?? '').split(/[\/,،;+\n]|\s+و\s+/).map((x) => registerKey(x)).filter(Boolean)

export interface CellCheck { unknown: string[]; blocked: string[] }
/** unknown = not in the register; blocked = in the register but suspended / left */
export function checkWelderCell(value: unknown, welders: Welder[]): CellCheck {
  const by = new Map(welders.map((w) => [w.key, w])), out: CellCheck = { unknown: [], blocked: [] }
  for (const t of splitStamps(value)) { const w = by.get(t); if (!w) out.unknown.push(t); else if (w.status !== 'active') out.blocked.push(t) }
  return out
}
export function checkPipeCell(value: unknown, pipes: Pipe[]): { unknown: boolean; bad: boolean } {
  const k = registerKey(value); if (!k) return { unknown: false, bad: false }
  const p = pipes.find((x) => x.key === k)
  return { unknown: !p, bad: !!p && p.status !== 'in_stock' }
}

/** Why a qualification does not cover a weld (empty = it does). Ranges left empty mean «no limit». */
export function qualProblems(q: WelderQual, ctx: { date: string; thk?: number | null; dia?: number | null; process?: string }): string[] {
  const why: string[] = []
  if (q.status === 'revoked') why.push('لغو شده')
  if (q.issueDate && ctx.date < q.issueDate) why.push('هنوز صادر نشده')
  if (q.expiryDate && ctx.date > q.expiryDate) why.push('منقضی')
  if (ctx.thk != null && ((q.thkMin != null && ctx.thk < q.thkMin) || (q.thkMax != null && ctx.thk > q.thkMax))) why.push('خارج از محدودهٔ ضخامت')
  if (ctx.dia != null && ((q.diaMin != null && ctx.dia < q.diaMin) || (q.diaMax != null && ctx.dia > q.diaMax))) why.push('خارج از محدودهٔ قطر')
  if (ctx.process && q.process && !q.process.toUpperCase().split(/[\/,\s]+/).includes(ctx.process.toUpperCase())) why.push('فرایند متفاوت')
  return why
}
/** a welder is qualified when at least one of his qualifications has no problem for the weld */
export function welderQualified(quals: WelderQual[], ctx: Parameters<typeof qualProblems>[1]): { ok: boolean; reasons: string[] } {
  if (!quals.length) return { ok: false, reasons: ['صلاحیتی ثبت نشده'] }
  const all = quals.map((q) => qualProblems(q, ctx))
  return all.some((r) => r.length === 0) ? { ok: true, reasons: [] } : { ok: false, reasons: [...new Set(all.flat())] }
}

/** facts of the pipe register that a form row of `formKey` may be offered (only EMPTY fields are filled; the register stays the source) */
export function pipeFillPatch(formKey: string, columns: ReadonlySet<string>, detail: Record<string, unknown>, pipe: Pipe): Record<string, string> {
  const empty = (k: string) => { const v = detail[k]; return v == null || String(v).trim() === '' || String(v).trim() === '0' }
  const out: Record<string, string> = {}
  const put = (keys: string[], v: number | null) => { if (v == null) return; const k = keys.find((x) => columns.has(x)); if (k && empty(k)) out[k] = String(v) }
  put(['sizeIn', 'odIn', 'diaIn'], pipe.odIn); put(['thkIn'], pipe.wtIn)
  if (['string', 'bend'].includes(formKey)) put(['lengthM'], pipe.lengthM) // pipe-level forms only: on joint forms «lengthM» is a joint fact kept by the weld record
  return out
}

export type PipeStage = 'received' | 'permit' | 'strung' | 'bent' | 'welded'
export const PIPE_STAGE_FA: Record<PipeStage, string> = { received: 'در انبار', permit: 'مجوز خروج', strung: 'ریسه‌شده', bent: 'خم‌کاری', welded: 'در سرجوش' }
export const PIPE_STAGE_OF_FORM: Record<string, PipeStage> = { pipe_permit: 'permit', string: 'strung', bend: 'bent', fitup: 'welded', welding: 'welded', tie_in: 'welded' }
const ORDER: PipeStage[] = ['received', 'permit', 'strung', 'bent', 'welded']
/** per pipe key: the stages it appears in (dates) and the furthest one — derived from the rows, never typed */
export function pipeProgress(items: { pipe: unknown; stage: PipeStage; date: string }[]): Map<string, { stages: Partial<Record<PipeStage, string>>; last: PipeStage }> {
  const out = new Map<string, { stages: Partial<Record<PipeStage, string>>; last: PipeStage }>()
  for (const i of items) {
    const k = registerKey(i.pipe); if (!k) continue
    const e = out.get(k) ?? { stages: {}, last: 'received' as PipeStage }
    if (!e.stages[i.stage] || i.date < (e.stages[i.stage] as string)) e.stages[i.stage] = i.date
    if (ORDER.indexOf(i.stage) > ORDER.indexOf(e.last)) e.last = i.stage
    out.set(k, e)
  }
  return out
}

export interface WelderStat { welds: number; rtWelds: number; rtRepair: number }
/** per welder key: welds he took part in (welding / tie-in rows), welds that have an RT result and how many of those ever needed repair */
export function welderStats(lines: { formKey: string; detail: Record<string, unknown> }[]): Map<string, WelderStat> {
  const weldersOf = new Map<string, Set<string>>()
  for (const l of lines) {
    if (l.formKey !== 'welding' && l.formKey !== 'tie_in') continue
    const wk = weldKey(l.detail.sec, l.detail.weldNo ?? l.detail.jointNo); if (!wk) continue
    const s = weldersOf.get(wk) ?? new Set<string>()
    for (const f of WELDER_FIELDS) for (const t of splitStamps(l.detail[f])) s.add(t)
    weldersOf.set(wk, s)
  }
  const rt = new Map<string, boolean>() // weld → ever repaired
  for (const l of lines) { if (l.formKey !== 'rt_report') continue; const wk = weldKey(l.detail.sec, l.detail.weldNo ?? l.detail.jointNo); if (!wk) continue; rt.set(wk, (rt.get(wk) ?? false) || l.detail.result === 'rep') }
  const out = new Map<string, WelderStat>()
  for (const [wk, ws] of weldersOf) for (const w of ws) {
    const e = out.get(w) ?? { welds: 0, rtWelds: 0, rtRepair: 0 }
    e.welds++; if (rt.has(wk)) { e.rtWelds++; if (rt.get(wk)) e.rtRepair++ }
    out.set(w, e)
  }
  return out
}

/** a scanned / typed code: the welder number printed as the barcode, or the card number */
export function findByCode<T extends { key: string; cardNo: string; nationalId?: string }>(code: string, people: T[]): T | undefined {
  const k = registerKey(code); if (!k) return undefined
  return people.find((p) => p.key === k) ?? people.find((p) => p.cardNo && registerKey(p.cardNo) === k) ?? people.find((p) => p.nationalId && registerKey(p.nationalId) === k)
}

/** What a QR / barcode reader delivers: a card's payload «RASTA|<WC|WA>|<card no>|<stamp>» or a plain number. Returns the plain stamp when it is a card payload. */
export const QR_PREFIX = 'RASTA'
export const cardPayload = (cardNo: string, stamp: string) => `${QR_PREFIX}|WC|${cardNo}|${stamp}`
export function scanTokens(text: string): string[] {
  const t = text.trim(); if (!t) return []
  return t.startsWith(`${QR_PREFIX}|`) ? t.split('|').slice(2).reverse() : [t] // the stamp first, then the card number
}
/** value to put in a welder field when a scanner typed `text` (a card payload gives the stamp, anything else is kept) */
export const fromScan = (text: string): string => (text.trim().startsWith(`${QR_PREFIX}|`) ? scanTokens(text)[0] ?? text : text)

export const PIPE_COLS = '*'
type PipeRow = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export const mapPipe = (r: PipeRow): Pipe => ({ id: r.id, projectId: r.project_id, key: r.pipe_key, raw: r.pipe_raw, entryDate: r.entry_date, heatNo: r.heat_no ?? '', odIn: r.od_in == null ? null : Number(r.od_in), wtIn: r.wt_in == null ? null : Number(r.wt_in), lengthM: r.length_m == null ? null : Number(r.length_m), grade: r.grade ?? '', coating: r.coating ?? '', supplier: r.supplier ?? '', wayBill: r.way_bill ?? '', materialId: r.material_id, entryLineId: r.entry_line_id, receiptId: r.receipt_id ?? null, status: r.status, note: r.note ?? '' })
