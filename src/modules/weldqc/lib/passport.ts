import type { Coating, Evaluation, Film, QcWeld, Repair, StrungPipe, Vt } from '../repo'

/** natural order of weld numbers («W-9» before «W-10») */
export const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
const norm = (v: string) => v.trim().toUpperCase().replace(/\s+/g, '')
export interface Ends { a: string; b: string; aLen: number | null; bLen: number | null; aThkIn: number | null; bThkIn: number | null; strung: string }
/**
 * The two pipes a weld joins. The welding report names one pipe per weld (the pipe being added); the other end is the
 * pipe of the weld before it in the same section. Length and wall of each come from the stringing reports.
 */
export function pipeEnds(welds: Pick<QcWeld, 'id' | 'sec' | 'weld' | 'pipe'>[], strung: StrungPipe[]): Map<string, Ends> {
  const spec = new Map(strung.map((p) => [norm(p.pipeNo), p]))
  const out = new Map<string, Ends>(), bySec = new Map<string, typeof welds>()
  for (const w of welds) { const x = bySec.get(w.sec) ?? []; x.push(w); bySec.set(w.sec, x) }
  for (const list of bySec.values()) {
    const sorted = [...list].sort((p, q) => natural(p.weld, q.weld))
    sorted.forEach((w, i) => {
      const b = w.pipe?.trim() ?? '', a = i > 0 ? sorted[i - 1].pipe?.trim() ?? '' : ''
      const sa = spec.get(norm(a)), sb = spec.get(norm(b))
      out.set(w.id, { a, b, aLen: sa?.lengthM ?? null, bLen: sb?.lengthM ?? null, aThkIn: sa?.thkIn ?? null, bThkIn: sb?.thkIn ?? null, strung: sb ? `${sb.reportNo}` : '' })
    })
  }
  return out
}

/** the dated steps of one weld, in order — what happened, when, by whom */
export interface Step { key: string; label: string; date: string; by: string; note: string }
export function timeline(x: { weld: QcWeld; vts: Vt[]; films: Film[]; evals: Evaluation[]; repairs: Repair[]; coatings: Coating[]; closedAt: string | null; finalFa: string; nameOf: (k: string) => string }): Step[] {
  const { weld: w } = x, s: Step[] = []
  const add = (key: string, label: string, date: string | null | undefined, by = '', note = '') => { if (date) s.push({ key, label, date: date.slice(0, 10), by, note }) }
  add('fitup', 'فیت‌آپ', w.fitup?.date, '', w.fitup?.reportNo ?? '')
  add('weld', w.welding?.tieIn ? 'جوشکاری (تای‌این)' : 'جوشکاری', w.welding?.date, '', w.welding?.reportNo ?? '')
  for (const v of x.vts) add(`vt${v.id}`, `بازرسی چشمی${v.round ? ` (پس از تعمیر ${v.round})` : ''}`, v.at, v.byName, v.result === 'accept' ? 'قابل قبول' : 'رد')
  add('rtreq', 'درخواست رادیوگرافی', w.rtRequest?.date, '', w.rtRequest?.reqNo ?? '')
  for (const r of [0, 1, 2]) {
    const fs = x.films.filter((f) => f.round === r)
    if (fs.length) { const d = fs.map((f) => f.shotAt ?? f.createdAt).sort()[0]; add(`rt${r}`, r ? `رادیوگرافی پس از تعمیر (RS${r})` : 'رادیوگرافی (RT)', d, fs[0].uploadedName, `${fs.length} فیلم`) }
    const e = [...x.evals].reverse().find((v) => v.round === r)
    if (e) { add(`ev${r}`, `تفسیر و ارزیابی${r ? ` RS${r}` : ''}`, e.evaluatedAt, e.evaluatedName, e.overall === 'accept' ? 'قابل قبول' : e.overall === 'repair' ? 'نیاز به تعمیر' : 'برش'); add(`sg${r}`, `تأیید بازرس NDT${r ? ` RS${r}` : ''}`, e.signedAt, e.signedName) }
    const rp = x.repairs.find((v) => v.round === r)
    if (rp) add(`rp${r}`, `تعمیر جوش ${r === 0 ? 'اول' : 'دوم'}`, rp.createdAt, `${rp.performedBy}${x.nameOf(rp.performedBy) !== rp.performedBy ? ` — ${x.nameOf(rp.performedBy)}` : ''}`, rp.method)
  }
  add('fj', 'اجرای پوشش سرجوش', w.coat.fj?.date, '', w.coat.fj?.reportNo ?? '')
  add('bond', 'آزمون پوشش سرجوش', w.coat.bond?.date, '', w.coat.bond?.reportNo ?? '')
  for (const c of x.coatings.filter((v) => !v.removed)) add(`c${c.id}`, c.kind === 'application' ? 'اجرای پوشش' : c.kind === 'repair' ? 'تعمیر پوشش' : `بازرسی پوشش${c.random ? ' (تصادفی)' : ''}`, c.at, c.kind === 'inspection' ? c.createdName : `${c.applicatorKey}${x.nameOf(c.applicatorKey) !== c.applicatorKey ? ` — ${x.nameOf(c.applicatorKey)}` : ''}`, c.result === 'pass' ? 'قبول' : c.result === 'fail' ? 'مردود' : c.result === 'repair' ? 'نیاز به تعمیر' : '')
  add('closed', 'بسته شدن پروندهٔ رادیوگرافی', x.closedAt, '', x.finalFa)
  return s.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Weld numbers proposed from the stringing order: the pipes of each front in the order they were strung, one weld between
 * two neighbours. `perSection` welds make a section; the number is prefix + running number padded to `digits`.
 */
export interface NumberRule { sectionStart: number; perSection: number; prefix: string; digits: number; weldStart: number; restart: boolean }
export const NUMBER_RULE_DEFAULT: NumberRule = { sectionStart: 1, perSection: 100, prefix: 'W-', digits: 3, weldStart: 1, restart: true }
export interface Proposed { sec: string; weld: string; a: string; b: string; aLen: number | null; bLen: number | null; thkIn: number | null; front: string }
export function proposeWelds(strung: StrungPipe[], rule: NumberRule): Proposed[] {
  const out: Proposed[] = [], fronts = [...new Set(strung.map((p) => p.front))]
  let sec = rule.sectionStart, n = rule.weldStart, inSec = 0
  for (const f of fronts) {
    const list = strung.filter((p) => p.front === f)
    for (let i = 1; i < list.length; i++) {
      if (inSec >= Math.max(1, rule.perSection)) { sec++; inSec = 0; if (rule.restart) n = rule.weldStart }
      out.push({ sec: String(sec), weld: `${rule.prefix}${String(n).padStart(rule.digits, '0')}`, a: list[i - 1].pipeNo, b: list[i].pipeNo, aLen: list[i - 1].lengthM, bLen: list[i].lengthM, thkIn: list[i].thkIn, front: f })
      n++; inSec++
    }
  }
  return out
}
