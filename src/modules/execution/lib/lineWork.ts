import { registerKey, type Pipe } from './registers'
import type { JointRec, StrungPipe } from './sections'

/**
 * The line workbench («میز کار خط»): site work entered on a picture of the line — strings from the depot, bends on a
 * pipe, fit-ups between pipes, welders on a joint — and written as rows of that day's site minute of the form
 * (stringing, bending, fit-up, welding), which then goes round its signatures like any minute. This file holds the
 * pure parts: what the line looks like from the records, and the rows each act adds.
 */
interface LineLite { id: string; reportId: string; status: string; detail: Record<string, unknown> }
interface ReportLite { id: string; formKey: string; reportDate: string; front: string; status: string; data: Record<string, unknown> | null; reportNo?: string }

const formMap = (reports: ReportLite[]) => new Map(reports.map((r) => [r.id, r.formKey]))
const live = (lines: LineLite[]) => lines.filter((l) => l.status !== 'rejected')

/** every strung pipe with its chainage (from the stringing rows), its facts from the register */
export function strungPipes(lines: LineLite[], reports: ReportLite[], pipes: Pipe[]): StrungPipe[] {
  const formOf = formMap(reports), reg = new Map(pipes.map((p) => [p.key, p])), byKey = new Map<string, StrungPipe>()
  for (const l of live(lines)) {
    if (formOf.get(l.reportId) !== 'string') continue
    const key = registerKey(l.detail.pipeNo), km = Number(l.detail.km)
    if (!key || !Number.isFinite(km) || km <= 0) continue
    const p = reg.get(key)
    byKey.set(key, { key, raw: p?.raw ?? String(l.detail.pipeNo), km, lengthM: Number(l.detail.lengthM) || p?.lengthM || 12, thkIn: p?.wtIn ?? (Number(l.detail.thkIn) || null), odIn: p?.odIn ?? null })
  }
  return [...byKey.values()]
}

/** the fit-ups made (with their weld / radiography / coating state); `extra` = rows of a record being written */
export function jointRecords(lines: LineLite[], reports: ReportLite[], exclude?: string, extra: Record<string, unknown>[] = []): JointRec[] {
  const formOf = formMap(reports), ls = live(lines)
  const k = (sec: unknown, no: unknown) => `${registerKey(sec)}|${registerKey(no)}`
  const welded = new Set<string>(), rtOk = new Set<string>(), rtRep = new Set<string>(), coated = new Set<string>()
  for (const l of ls) {
    const f = formOf.get(l.reportId), d = l.detail, key = k(d.sec, d.weldNo ?? d.jointNo)
    if (f === 'welding') welded.add(key)
    else if (f === 'rt_report') (d.result === 'acc' ? rtOk : rtRep).add(key)
    else if (f === 'fj_coating' && d.result !== 'rej') coated.add(key)
  }
  const rec = (d: Record<string, unknown>, mine: boolean): JointRec => { const key = k(d.sec, d.jointNo); return { before: registerKey(d.pipeNo2), after: registerKey(d.pipeNo), sec: String(d.sec ?? ''), no: String(d.jointNo ?? ''), mine, welded: welded.has(key), rtOk: rtOk.has(key), rtRep: rtRep.has(key) && !rtOk.has(key), coated: coated.has(key) } }
  return [...ls.filter((l) => l.reportId !== exclude && formOf.get(l.reportId) === 'fitup').map((l) => rec(l.detail, false)), ...extra.filter((d) => d.jointNo || d.pipeNo).map((d) => rec(d, true))]
}

/** the bends made, by pipe: their two directions (for the mark on the pipe) */
export function bendsByPipe(lines: LineLite[], reports: ReportLite[]): Map<string, { lr: string; so: string; result: string }> {
  const formOf = formMap(reports), out = new Map<string, { lr: string; so: string; result: string }>()
  for (const l of live(lines)) if (formOf.get(l.reportId) === 'bend') { const key = registerKey(l.detail.pipeNo); if (key) out.set(key, { lr: String(l.detail.dirLR ?? ''), so: String(l.detail.dirSO ?? ''), result: String(l.detail.result ?? '') }) }
  return out
}

/** where the strung line ends today: the next pipe is laid from here */
export function lineEndKm(pipes: StrungPipe[]): number | null {
  let end: number | null = null
  for (const p of pipes) { const e = p.km + p.lengthM / 1000; if (end == null || e > end) end = e }
  return end == null ? null : Math.round(end * 1000) / 1000
}

/** the site minute a day's work goes to: the one of that form, day and front — open for entry or not */
export function dayReport<R extends ReportLite>(reports: R[], formKey: string, date: string, front: string): R | undefined {
  return reports.find((r) => r.formKey === formKey && r.reportDate === date && (r.front ?? '') === (front ?? ''))
}
export const OPEN_FOR_ENTRY = ['draft', 'returned', 'incomplete']
/** the header a new day's minute starts with: the last minute of the form (machine, WPS, pipe spec …), never the date-bound fields */
export function carriedHeader(reports: ReportLite[], formKey: string, front: string): Record<string, unknown> {
  const last = reports.filter((r) => r.formKey === formKey && (r.front ?? '') === (front ?? '')).sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0] ?? reports.filter((r) => r.formKey === formKey).sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0]
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(last?.data ?? {})) if (!['seed', 'uitest', 'reqNo', 'depot'].includes(k) && typeof v !== 'object') out[k] = v
  return out
}

/* ── bending ───────────────────────────────────────────────────────────────────────────── */
export interface BendInput { plan: '' | 'IPR' | 'IPL'; planDeg: number | null; profile: '' | 'SB' | 'OB'; profileDeg: number | null; ovalPct: number | null; ovalMm: number | null; result: 'acc' | 'rej' }
const deg = (dir: string, d: number | null) => (dir && d != null && d > 0 ? `${dir} ${Math.round(d * 10) / 10}°` : '')
export function bendRow(p: StrungPipe, b: BendInput): Record<string, unknown> {
  return { km: p.km, pipeNo: p.raw, ...(p.odIn != null ? { diaIn: p.odIn } : {}), lengthM: p.lengthM, ...(p.thkIn != null ? { wtMm: Math.round(p.thkIn * 2540) / 100 } : {}),
    dirLR: deg(b.plan, b.planDeg), dirSO: deg(b.profile, b.profileDeg), ...(b.ovalPct != null ? { ovalPct: b.ovalPct } : {}), ...(b.ovalMm != null ? { ovalMm: b.ovalMm } : {}), result: b.result }
}

/* ── welding ───────────────────────────────────────────────────────────────────────────── */
/** the eight stamp cells of the welding sheet: four passes, on the R and the C side */
export const PASSES = [{ k: 'Root', fa: 'ریشه' }, { k: 'Hot', fa: 'گرم' }, { k: 'Fill', fa: 'پرکن' }, { k: 'Cap', fa: 'روکش' }] as const
export const SIDES = [{ k: '', fa: 'سمت R' }, { k: 'C', fa: 'سمت C' }] as const
export const stampField = (pass: string, side: string) => `stamp${pass}${side}`
export type Stamps = Record<string, string>
/** one welding row per joint: the joint, the pipe after it with its facts, the welders' stamps and the visual check */
export function weldRow(j: JointRec, after: StrungPipe | undefined, stamps: Stamps, vt: 'acc' | 'rej' | ''): Record<string, unknown> {
  const row: Record<string, unknown> = { sec: j.sec, weldNo: j.no, pipeNo: after?.raw ?? j.after }
  if (after) { row.lengthM = after.lengthM; if (after.thkIn != null) row.thkIn = after.thkIn; if (after.odIn != null) row.sizeIn = after.odIn }
  for (const [f, v] of Object.entries(stamps)) if (v) row[f] = v
  if (vt) row.vt = vt
  return row
}
