/**
 * Radiographic acceptance of a girth weld by API Standard 1104 (Welding of Pipelines and Related Facilities), clause 9.3
 * — for pipe of outside diameter ≥ 60.3 mm (2⅜ in), i.e. every line pipe this module is used for.
 *
 * What API 1104 measures with: fixed lengths (25 mm, 50 mm, 13 mm …) in any continuous 300 mm (12 in) of weld, and —
 * for several imperfections — a share of the WELD LENGTH (8 %, 1/6), the weld length being the circumference π·OD. Only
 * porosity (25 % of the thinner wall) and undercut depth (12.5 % / 6 % of the wall, from clause 9.7) use the wall
 * thickness. The 300 mm window is never longer than the weld itself.
 *
 * Every number lives in `Api1104Criteria` and is editable per project («معیارهای پذیرش»): the edition and any company
 * specification in force decide. The engine is a decision aid; the NDT inspector signs every evaluation.
 * Not covered automatically (left to the interpreter): the porosity distribution charts (figures of clause 9.3.9) and
 * judgement of image density other than the «darker than the thinnest base metal» flag recorded on the defect.
 */

export type Code = 'IP' | 'IPD' | 'ICP' | 'IF' | 'IFD' | 'IC' | 'BT' | 'ESI' | 'ISI' | 'P' | 'CP' | 'HB' | 'C' | 'EU' | 'IU' | 'HL'
export type Verdict = 'accept' | 'repair' | 'cut_out'

export const CODES: Code[] = ['IP', 'IPD', 'ICP', 'IF', 'IFD', 'IC', 'BT', 'ESI', 'ISI', 'P', 'CP', 'HB', 'C', 'EU', 'IU', 'HL']
export const CODE_FA: Record<Code, string> = {
  IP: 'نفوذ ناقص ریشه (IP)', IPD: 'نفوذ ناقص به‌علت ناهم‌ترازی (IPD)', ICP: 'نفوذ ناقص عرضی (ICP)', IF: 'ذوب ناقص سطحی (IF)', IFD: 'ذوب ناقص بین‌پاسی / Cold lap (IFD)',
  IC: 'تقعر داخلی (IC)', BT: 'سوختگی (BT)', ESI: 'آخال سرباره کشیده (ESI)', ISI: 'آخال سرباره منفرد (ISI)', P: 'تخلخل منفرد / پراکنده (P)',
  CP: 'تخلخل خوشه‌ای (CP)', HB: 'تخلخل لوله‌ای ریشه — Hollow bead (HB)', C: 'ترک (C)', EU: 'بریدگی کنارهٔ خارجی (EU)', IU: 'بریدگی کنارهٔ داخلی (IU)', HL: 'ناهم‌ترازی لبه‌ها (Hi-Lo)',
}
/** the module's broad defect type each code belongs to (database column `defect_type`, colours, reports) */
export const CODE_TYPE: Record<Code, 'crack' | 'incomplete_fusion' | 'incomplete_penetration' | 'internal_undercut' | 'external_undercut' | 'porosity' | 'slag_inclusion' | 'burn_through' | 'hi_lo' | 'other'> = {
  IP: 'incomplete_penetration', IPD: 'incomplete_penetration', ICP: 'incomplete_penetration', IF: 'incomplete_fusion', IFD: 'incomplete_fusion', IC: 'other', BT: 'burn_through',
  ESI: 'slag_inclusion', ISI: 'slag_inclusion', P: 'porosity', CP: 'porosity', HB: 'porosity', C: 'crack', EU: 'external_undercut', IU: 'internal_undercut', HL: 'hi_lo',
}
/** the code of a defect recorded before codes existed */
export const codeOfType = (t: string): Code | '' => ({ incomplete_penetration: 'IP', incomplete_fusion: 'IF', slag_inclusion: 'ESI', porosity: 'P', crack: 'C', external_undercut: 'EU', internal_undercut: 'IU', burn_through: 'BT', hi_lo: 'HL' } as Record<string, Code>)[t] ?? ''
/** the pass a code usually belongs to (the interpreter may change it) — decides which welders it is charged to */
export const CODE_PASS: Record<Code, 'root' | 'hot' | 'fill' | 'cap'> = { IP: 'root', IPD: 'root', ICP: 'root', IF: 'root', IFD: 'fill', IC: 'root', BT: 'root', ESI: 'hot', ISI: 'fill', P: 'fill', CP: 'cap', HB: 'root', C: 'root', EU: 'cap', IU: 'root', HL: 'root' }
/** which measures the form asks for */
export const CODE_NEEDS: Record<Code, { width?: true; depth?: 'depth' | 'offset'; density?: true }> = {
  IP: {}, IPD: {}, ICP: {}, IF: {}, IFD: {}, IC: { density: true }, BT: { density: true }, ESI: { width: true }, ISI: { width: true }, P: {}, CP: { width: true }, HB: {}, C: { depth: 'depth' }, EU: { depth: 'depth' }, IU: { depth: 'depth' }, HL: { depth: 'offset' },
}

export interface Api1104Criteria {
  windowMm: number
  pct8: number
  ip: { single: number; agg: number }
  ipd: { single: number; agg: number }
  icp: { single: number; agg: number }
  if: { single: number; agg: number }
  ifd: { single: number; agg: number }
  bt: { maxDim: number; sumAgg: number }
  esi: { length: number; agg: number; width: number }
  isi: { agg: number; width: number; maxCount: number }
  p: { pore: number; porePctT: number }
  cp: { dia: number; agg: number; pore: number }
  hb: { single: number; agg: number; big: number; spacing: number }
  crack: { crater: number; repairPctW: number }
  undercut: { agg: number; fracW: number; depthMm: number; depthPctT: number }
  hiLo: { offset: number }
  ai: { agg: number }
  maxRepairs: number
}

/** API 1104 (22nd ed., 2021) clause 9.3 values in millimetres; the inch figures are the standard's own */
export const API1104_DEFAULT: Api1104Criteria = {
  windowMm: 300, pct8: 8,
  ip: { single: 25, agg: 25 }, ipd: { single: 50, agg: 75 }, icp: { single: 50, agg: 50 },
  if: { single: 25, agg: 25 }, ifd: { single: 50, agg: 50 },
  bt: { maxDim: 6, sumAgg: 13 },
  esi: { length: 50, agg: 50, width: 1.6 }, isi: { agg: 13, width: 3, maxCount: 4 },
  p: { pore: 3, porePctT: 25 }, cp: { dia: 13, agg: 13, pore: 2 }, hb: { single: 13, agg: 50, big: 6, spacing: 50 },
  crack: { crater: 4, repairPctW: 8 },
  undercut: { agg: 50, fracW: 6, depthMm: 0.8, depthPctT: 12.5 },
  hiLo: { offset: 3 },
  ai: { agg: 50 },
  maxRepairs: 2,
}

export interface Joint { odMm: number; thkMm: number }
export interface DefectIn { id: string; code: Code; lengthMm: number; widthMm?: number | null; depthMm?: number | null; positionMm: number; densityOver?: boolean }
export interface Finding { id: string; verdict: Verdict; reasons: string[] }
export interface Result {
  overall: Verdict
  findings: Finding[]
  weldLengthMm: number
  windowMm: number
  /** the limits that applied to this weld, for the screen and the report */
  limits: { label: string; value: string }[]
  note: string
}

const f1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString('fa-IR')
const mm = (x: number) => `${f1(x)} mm`

/** defects (by start position along the circumference) that fall inside any window starting at a defect: groups to test */
function windows(ds: DefectIn[], W: number, win: number): DefectIn[][] {
  const out: DefectIn[][] = []
  const sorted = [...ds].sort((a, b) => a.positionMm - b.positionMm)
  for (const s of sorted) {
    const g = sorted.filter((d) => { const off = (((d.positionMm - s.positionMm) % W) + W) % W; return off <= win })
    out.push(g)
  }
  return out
}

export function evaluate(joint: Joint, defects: DefectIn[], c: Api1104Criteria = API1104_DEFAULT): Result {
  const W = Math.PI * joint.odMm
  const win = Math.min(c.windowMm, W)
  const t = joint.thkMm
  const pct = (W * c.pct8) / 100
  const reasons = new Map<string, string[]>(defects.map((d) => [d.id, []]))
  const cut = new Set<string>()
  const flag = (ids: string[] | DefectIn[], why: string) => { for (const x of ids) { const id = typeof x === 'string' ? x : x.id; reasons.get(id)?.push(why) } }
  const of = (...codes: Code[]) => defects.filter((d) => codes.includes(d.code))
  const sum = (ds: DefectIn[]) => ds.reduce((s, d) => s + d.lengthMm, 0)
  const aggRule = (ds: DefectIn[], limit: number, label: string, clause: string) => {
    if (ds.length < 2) return
    const done = new Set<string>()
    for (const g of windows(ds, W, win)) {
      const L = sum(g)
      if (L > limit && g.length > 1) { const key = g.map((d) => d.id).sort().join(); if (done.has(key)) continue; done.add(key); flag(g, `مجموع طول ${label} در ${mm(win)} پیوسته ${mm(L)} است و از ${mm(limit)} بیشتر است (بند ${clause})`) }
    }
  }
  const totalRule = (ds: DefectIn[], limit: number, label: string, clause: string) => { const L = sum(ds); if (ds.length && L > limit) flag(ds, `مجموع طول ${label} در کل جوش ${mm(L)} و بیش از ${mm(limit)} (${f1(c.pct8)}٪ طول جوش ${mm(W)}) است (بند ${clause})`) }

  // IP / IPD / ICP / IF / IFD — single and aggregate (9.3.1–9.3.5)
  const linear: [Code, { single: number; agg: number }, string, boolean][] = [['IP', c.ip, '9.3.1', W < c.windowMm], ['IPD', c.ipd, '9.3.2', false], ['ICP', c.icp, '9.3.3', false], ['IF', c.if, '9.3.4', true], ['IFD', c.ifd, '9.3.5', true]]
  for (const [code, lim, clause, pct8] of linear) {
    const ds = of(code)
    for (const d of ds) if (d.lengthMm > lim.single) flag([d], `طول ${mm(d.lengthMm)} بیش از حد مجاز تکی ${code} (${mm(lim.single)}) است (بند ${clause})`)
    aggRule(ds, lim.agg, `نشانه‌های ${code}`, clause)
    if (pct8) totalRule(ds, pct, `نشانه‌های ${code}`, clause)
  }
  // IC — any length if not darker than the thinnest base metal; otherwise judged as burn-through (9.3.6)
  // BT (9.3.7)
  const btLike = [...of('BT'), ...of('IC').filter((d) => d.densityOver)]
  for (const d of btLike) {
    const dim = Math.max(d.lengthMm, d.widthMm ?? 0)
    if (d.densityOver && dim > c.bt.maxDim) flag([d], `${d.code === 'IC' ? 'تقعر داخلی تیره‌تر از فلز پایه، به‌عنوان سوختگی:' : 'سوختگی'} بیشترین بُعد ${mm(dim)} بیش از ${mm(c.bt.maxDim)} و تیره‌تر از نازک‌ترین فلز پایه (بند 9.3.7)`)
    else if (d.densityOver && dim > t) flag([d], `بیشترین بُعد سوختگی ${mm(dim)} بیش از ضخامت دیواره (${mm(t)}) و تیره‌تر از فلز پایه (بند 9.3.7)`)
  }
  const btDark = btLike.filter((d) => d.densityOver)
  if (btDark.length > 1) for (const g of windows(btDark, W, win)) { const L = g.reduce((s, d) => s + Math.max(d.lengthMm, d.widthMm ?? 0), 0); if (g.length > 1 && L > c.bt.sumAgg) flag(g, `مجموع ابعاد سوختگی‌های تیره در ${mm(win)} برابر ${mm(L)} و بیش از ${mm(c.bt.sumAgg)} (بند 9.3.7)`) }
  // slag (9.3.8)
  const esi = of('ESI'), isi = of('ISI')
  for (const d of esi) {
    if (d.lengthMm > c.esi.length) flag([d], `طول آخال کشیده ${mm(d.lengthMm)} بیش از ${mm(c.esi.length)} (بند 9.3.8)`)
    if ((d.widthMm ?? 0) > c.esi.width) flag([d], `عرض آخال کشیده ${mm(d.widthMm ?? 0)} بیش از ${mm(c.esi.width)} (بند 9.3.8)`)
  }
  aggRule(esi, c.esi.agg, 'آخال‌های کشیده', '9.3.8')
  for (const d of isi) if ((d.widthMm ?? 0) > c.isi.width) flag([d], `عرض آخال منفرد ${mm(d.widthMm ?? 0)} بیش از ${mm(c.isi.width)} (بند 9.3.8)`)
  aggRule(isi, c.isi.agg, 'آخال‌های منفرد', '9.3.8')
  if (isi.length > c.isi.maxCount) for (const g of windows(isi, W, win)) { const wide = g.filter((d) => (d.widthMm ?? 0) >= c.isi.width - 0.2); if (wide.length > c.isi.maxCount) flag(wide, `بیش از ${f1(c.isi.maxCount)} آخال منفرد با عرض حدود ${mm(c.isi.width)} در ${mm(win)} (بند 9.3.8)`) }
  totalRule([...esi, ...isi], pct, 'آخال‌ها (ESI + ISI)', '9.3.8')
  // porosity (9.3.9)
  const poreMax = Math.min(c.p.pore, (c.p.porePctT / 100) * t)
  for (const d of of('P')) if (Math.max(d.lengthMm, d.widthMm ?? 0) > poreMax) flag([d], `قطر حفره ${mm(Math.max(d.lengthMm, d.widthMm ?? 0))} بیش از ${mm(poreMax)} (کمترِ ${mm(c.p.pore)} و ${f1(c.p.porePctT)}٪ ضخامت) (بند 9.3.9.2)`)
  const cp = of('CP')
  for (const d of cp) {
    if (d.lengthMm > c.cp.dia) flag([d], `قطر خوشهٔ تخلخل ${mm(d.lengthMm)} بیش از ${mm(c.cp.dia)} (بند 9.3.9.3)`)
    if ((d.widthMm ?? 0) > c.cp.pore) flag([d], `بزرگ‌ترین حفرهٔ خوشه ${mm(d.widthMm ?? 0)} بیش از ${mm(c.cp.pore)} (بند 9.3.9.3)`)
  }
  aggRule(cp, c.cp.agg, 'خوشه‌های تخلخل', '9.3.9.3')
  const hb = of('HB')
  for (const d of hb) if (d.lengthMm > c.hb.single) flag([d], `طول hollow bead ${mm(d.lengthMm)} بیش از ${mm(c.hb.single)} (بند 9.3.9.4)`)
  aggRule(hb, c.hb.agg, 'hollow bead', '9.3.9.4')
  const bigHb = hb.filter((d) => d.lengthMm > c.hb.big).sort((a, b) => a.positionMm - b.positionMm)
  for (let i = 1; i < bigHb.length; i++) if (bigHb[i].positionMm - bigHb[i - 1].positionMm < c.hb.spacing) flag([bigHb[i - 1], bigHb[i]], `دو hollow bead بزرگ‌تر از ${mm(c.hb.big)} با فاصلهٔ کمتر از ${mm(c.hb.spacing)} (بند 9.3.9.4)`)
  totalRule(hb, pct, 'hollow bead', '9.3.9.4')
  // cracks (9.3.10) — a crack beyond a shallow crater / star crack is repairable only while short (clause 10, company approval)
  for (const d of of('C')) {
    if (d.lengthMm <= c.crack.crater) continue
    if (d.lengthMm < (W * c.crack.repairPctW) / 100) flag([d], `ترک ${mm(d.lengthMm)} (بیش از ترک کریتر ${mm(c.crack.crater)}) — تعمیر فقط با مجوز کارفرما و طول کمتر از ${f1(c.crack.repairPctW)}٪ طول جوش (بند 9.3.10 و 10)`)
    else { flag([d], `ترک ${mm(d.lengthMm)} بیش از ${f1(c.crack.repairPctW)}٪ طول جوش (${mm((W * c.crack.repairPctW) / 100)}) — برش کامل (بند 9.3.10 و 10)`); cut.add(d.id) }
  }
  // undercut (9.3.11, depth by 9.7)
  const uc = of('EU', 'IU')
  const depthMax = Math.min(c.undercut.depthMm, (c.undercut.depthPctT / 100) * t)
  for (const d of uc) if ((d.depthMm ?? 0) > depthMax) flag([d], `عمق بریدگی ${mm(d.depthMm ?? 0)} بیش از ${mm(depthMax)} (کمترِ ${mm(c.undercut.depthMm)} و ${f1(c.undercut.depthPctT)}٪ ضخامت) (بند 9.7)`)
  aggRule(uc, c.undercut.agg, 'بریدگی‌های کناره (EU + IU)', '9.3.11')
  if (uc.length && sum(uc) > W / c.undercut.fracW) flag(uc, `مجموع طول بریدگی‌ها ${mm(sum(uc))} بیش از ۱/${f1(c.undercut.fracW)} طول جوش (${mm(W / c.undercut.fracW)}) (بند 9.3.11)`)
  // Hi-Lo (alignment, 7.2)
  for (const d of of('HL')) if ((d.depthMm ?? 0) > c.hiLo.offset) flag([d], `ناهم‌ترازی ${mm(d.depthMm ?? 0)} بیش از ${mm(c.hiLo.offset)} (بند 7.2)`)
  // accumulation of imperfections, all but IPD and undercut (9.3.12)
  const acc = defects.filter((d) => !['IPD', 'EU', 'IU', 'HL', 'IC'].includes(d.code) && !(d.code === 'C' && d.lengthMm <= c.crack.crater))
  aggRule(acc, c.ai.agg, 'همهٔ نشانه‌ها (تجمع ناپیوستگی‌ها)', '9.3.12')
  totalRule(acc, pct, 'همهٔ نشانه‌ها (تجمع ناپیوستگی‌ها)', '9.3.12')

  const findings: Finding[] = defects.map((d) => { const r = [...new Set(reasons.get(d.id) ?? [])]; return { id: d.id, verdict: cut.has(d.id) ? 'cut_out' : r.length ? 'repair' : 'accept', reasons: r.length ? r : [acceptReason(d, c, t, poreMax)] } })
  const overall: Verdict = findings.some((x) => x.verdict === 'cut_out') ? 'cut_out' : findings.some((x) => x.verdict === 'repair') ? 'repair' : 'accept'
  return {
    overall, findings, weldLengthMm: W, windowMm: win,
    limits: [
      { label: 'طول جوش (π × OD)', value: mm(W) }, { label: 'بازهٔ مرجع', value: mm(win) }, { label: `${f1(c.pct8)}٪ طول جوش`, value: mm(pct) },
      { label: 'IP / IF تکی و در بازه', value: `${mm(c.ip.single)} / ${mm(c.ip.agg)}` }, { label: 'آخال کشیده: طول / عرض', value: `${mm(c.esi.length)} / ${mm(c.esi.width)}` },
      { label: 'حفرهٔ منفرد', value: mm(poreMax) }, { label: 'بریدگی: در بازه / عمق', value: `${mm(c.undercut.agg)} / ${mm(depthMax)}` }, { label: 'تجمع ناپیوستگی‌ها در بازه', value: mm(c.ai.agg) },
    ],
    note: 'ارزیابی طبق بند 9.3 استاندارد API 1104 (نسخهٔ پیش‌فرض: ویرایش ۲۲). کمک‌تصمیم است و بازرس NDT دارای صلاحیت تأیید نهایی می‌کند. توزیع تخلخل (شکل‌های بند 9.3.9) با نمودار استاندارد توسط مفسر بررسی می‌شود.',
  }
}

function acceptReason(d: DefectIn, c: Api1104Criteria, t: number, poreMax: number): string {
  switch (d.code) {
    case 'IC': return d.densityOver ? 'در حد مجاز سوختگی' : 'تقعر داخلی تیره‌تر از فلز پایه نیست؛ با هر طول قابل قبول (بند 9.3.6)'
    case 'C': return `ترک کریتر / ستاره‌ای کم‌عمق تا ${mm(c.crack.crater)} قابل قبول (بند 9.3.10)`
    case 'P': return `حفره در حد مجاز (${mm(poreMax)})`
    case 'EU': case 'IU': return `عمق و طول بریدگی در حد مجاز (t = ${mm(t)})`
    default: return `${mm(d.lengthMm)} در حدود بند 9.3 برای ${d.code}`
  }
}

/** repair advice for a rejected indication (procedure-level; the qualified repair WPS governs) */
export function adviceFor(code: Code, verdict: Verdict): string {
  if (verdict === 'accept') return 'قابل قبول؛ تعمیر لازم نیست.'
  if (verdict === 'cut_out') return 'برش کامل سرجوش و جوشکاری مجدد طبق WPS اصلی (بند 10 API 1104).'
  const m: Partial<Record<Code, string>> = {
    IP: 'سنگ‌زنی از بیرون تا ریشه و فلز سالم، پاس ریشهٔ مجدد با کنترل گپ و آمپر، سپس RT.', IPD: 'ناهم‌ترازی لبه‌ها عامل است؛ سنگ‌زنی ناحیه و جوش ریشهٔ مجدد طبق Repair WPS، کنترل ترازبندی در جوش‌های بعدی.',
    ICP: 'سنگ‌زنی تا فلز سالم در محل تلاقی پاس‌ها و جوش مجدد.', IF: 'سنگ‌زنی موضعی تا فلز سالم، جوش مجدد با زاویهٔ الکترود و حرارت ورودی مناسب.',
    IFD: 'برداشتن لایهٔ ذوب‌نشده (Cold lap) با سنگ و جوش مجدد پاس‌های پرکننده؛ تمیزکاری بین‌پاسی.', IC: 'سنگ‌زنی ناحیه و بازسازی ریشه.',
    BT: 'گوژینگ ناحیهٔ سوخته تا فلز سالم و بازسازی ریشه با آمپر کمتر.', ESI: 'سنگ‌زنی تا حذف کامل سرباره و جوش مجدد؛ تمیزکاری Wagon track در پاس گرم.',
    ISI: 'سنگ‌زنی موضعی آخال‌ها و جوش مجدد.', P: 'سنگ‌زنی ناحیهٔ متخلخل؛ رطوبت الکترود، تمیزی لبه‌ها و باد را کنترل کنید.',
    CP: 'سنگ‌زنی خوشهٔ تخلخل در پاس نهایی و جوش مجدد پاس کپ.', HB: 'سنگ‌زنی ریشه تا حذف تخلخل لوله‌ای و جوش ریشهٔ مجدد؛ سرعت جوشکاری و آمپر ریشه را بازبینی کنید.',
    C: 'برداشتن کامل ترک با سنگ و تأیید با PT/MT، جوش مجدد طبق Repair WPS با مجوز کارفرما.', EU: 'سنگ‌زنی و پاس ترمیمی روی بریدگی؛ کنترل زاویه و سرعت در پاس کپ.',
    IU: 'در صورت دسترسی ترمیم از داخل، وگرنه سنگ‌زنی و جوش ریشهٔ مجدد.', HL: 'برش و ترازبندی مجدد لوله‌ها اگر جوش تکمیل شده؛ پیش از تکمیل، اصلاح ترازبندی.',
  }
  return m[code] ?? 'بررسی موردی توسط مهندس جوش و بازرس NDT.'
}

/** the saved criteria of a project laid over the defaults (a missing or broken value keeps the default) */
export function mergeApi(saved: unknown): Api1104Criteria {
  const out = JSON.parse(JSON.stringify(API1104_DEFAULT)) as Api1104Criteria
  const walk = (dst: Record<string, unknown>, src: unknown) => {
    if (!src || typeof src !== 'object') return
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (!(k in dst)) continue
      const d = dst[k]
      if (d && typeof d === 'object') walk(d as Record<string, unknown>, v)
      else if (typeof d === 'number' && typeof v === 'number' && Number.isFinite(v) && v >= 0) dst[k] = v
    }
  }
  walk(out as unknown as Record<string, unknown>, saved)
  return out
}

/** clock position (0–12) → quadrant 1 = 12–3, 2 = 3–6, 3 = 6–9, 4 = 9–12; and along-the-weld distance from 12 o'clock */
export const quadrantOf = (clock: number) => (Math.min(3, Math.floor((((clock % 12) + 12) % 12) / 3)) + 1) as 1 | 2 | 3 | 4
export const positionOfClock = (clock: number, odMm: number) => ((((clock % 12) + 12) % 12) / 12) * Math.PI * odMm
export const clockOfPosition = (pos: number, odMm: number) => (pos / (Math.PI * odMm)) * 12
