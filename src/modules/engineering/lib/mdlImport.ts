/** Parser for the Master Document List (MDL/CBS) workbook: one row per document with number, title, discipline, doc type, target issue purpose (IFA/IFI/POI), price and weight factor (W.F). Section rows and repeated rows are skipped. */
export interface MdlDoc { docNo: string; title: string; discipline: string; category: string; phase: string; targetIssue: string; price: number; weight: number; line: number }
export interface MdlResult { docs: MdlDoc[]; duplicates: string[]; sections: number; weightSum: number; priceSum: number; warnings: string[] }

const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()
const key = (v: unknown) => norm(v).toLowerCase().replace(/[^a-z0-9.]/g, '')
import { canonDiscipline } from './disciplines'

export function isMdlLayout(rows: unknown[][]): boolean {
  return rows.slice(0, 12).some((r) => r.some((c) => key(c) === 'documentno.') && r.some((c) => key(c) === 'documenttitle'))
}

export function parseMdl(rows: unknown[][]): MdlResult {
  const hi = rows.findIndex((r) => r.some((c) => key(c) === 'documentno.'))
  const out: MdlResult = { docs: [], duplicates: [], sections: 0, weightSum: 0, priceSum: 0, warnings: [] }
  if (hi < 0) { out.warnings.push('ردیف عنوان ستون‌ها (Document No.) پیدا نشد.'); return out }
  const head = rows[hi].map(key)
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h.startsWith(n)))
  const c = { no: col('documentno.'), title: col('documenttitle'), disc: col('discipline'), cat: col('category'), phase: col('phaseno'), tgt: col('finalstatus'), price: col('pricerial'), wf: col('w.f') }
  if (c.no < 0 || c.title < 0) { out.warnings.push('ستون‌های شمارهٔ سند و عنوان لازم است.'); return out }
  const seen = new Set<string>()
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i], no = norm(r[c.no])
    if (!no) { if (norm(r[c.title])) out.sections++; continue }
    if (seen.has(no)) { out.duplicates.push(no); continue }
    seen.add(no)
    const disc = norm(r[c.disc]), price = Number(r[c.price]) || 0, wf = Number(r[c.wf]) || 0
    const parts = no.split('-')
    out.docs.push({ docNo: no, title: norm(r[c.title]), discipline: canonDiscipline(disc, no), category: c.cat >= 0 && norm(r[c.cat]) ? norm(r[c.cat]) : parts[parts.length - 2] ?? '', phase: norm(r[c.phase]) || parts[1] || '', targetIssue: norm(r[c.tgt]), price, weight: Math.round(wf * 100 * 1e6) / 1e6, line: i + 1 })
    out.weightSum += wf * 100; out.priceSum += price
  }
  if (out.docs.length && Math.abs(out.weightSum - 100) > 5) out.warnings.push(`مجموع وزن‌ها ${out.weightSum.toFixed(2)}٪ است (تکرارها کنار گذاشته شدند)؛ در محاسبه نرمال می‌شود.`)
  if (!c.wf) out.warnings.push('ستون وزن (W.F) پیدا نشد.')
  return out
}
