/**
 * Acceptance rules for radiographic defects of a girth weld, and the repair advice that goes with each verdict.
 *
 * The numbers follow the general shape of the pipeline-welding acceptance criteria (single length against the wall
 * thickness t, aggregate length of like defects in a 300 mm reference window, undercut depth, Hi-Lo offset). They are
 * a decision aid: the NDT inspector (Level II/III) signs every evaluation, and the project's QC manager must check each
 * threshold against the standard and the project specification in force — they are all editable in «معیارهای پذیرش».
 */

export type DefectType = 'crack' | 'incomplete_fusion' | 'incomplete_penetration' | 'internal_undercut' | 'external_undercut' | 'porosity' | 'slag_inclusion' | 'burn_through' | 'hi_lo' | 'other'
export type Verdict = 'accept' | 'repair' | 'cut_out'
export type Pass = 'root' | 'hot' | 'fill' | 'cap'

export const DEFECT_TYPES: DefectType[] = ['crack', 'incomplete_penetration', 'incomplete_fusion', 'slag_inclusion', 'porosity', 'internal_undercut', 'external_undercut', 'burn_through', 'hi_lo', 'other']
export const DEFECT_FA: Record<DefectType, string> = {
  crack: 'ترک', incomplete_fusion: 'ذوب ناقص (IF)', incomplete_penetration: 'نفوذ ناقص (IP)', internal_undercut: 'بریدگی کناره داخلی (IU)',
  external_undercut: 'بریدگی کناره خارجی (EU)', porosity: 'تخلخل (P)', slag_inclusion: 'آخال سرباره (SI)', burn_through: 'سوختگی (BT)', hi_lo: 'عدم هم‌ترازی (Hi-Lo)', other: 'سایر',
}
export const DEFECT_CODE: Record<DefectType, string> = { crack: 'C', incomplete_fusion: 'IF', incomplete_penetration: 'IP', internal_undercut: 'IU', external_undercut: 'EU', porosity: 'P', slag_inclusion: 'SI', burn_through: 'BT', hi_lo: 'HL', other: 'O' }
export const DEFECT_COLOR: Record<DefectType, string> = {
  crack: '#ef4444', incomplete_penetration: '#f97316', incomplete_fusion: '#f59e0b', slag_inclusion: '#a16207', porosity: '#0ea5e9',
  internal_undercut: '#8b5cf6', external_undercut: '#d946ef', burn_through: '#e11d48', hi_lo: '#14b8a6', other: '#64748b',
}
export const VERDICT_FA: Record<Verdict, string> = { accept: 'قابل قبول', repair: 'نیاز به تعمیر', cut_out: 'نیاز به برش' }
export const PASS_FA: Record<Pass, string> = { root: 'ریشه (Root)', hot: 'گرم (Hot)', fill: 'پرکننده (Fill)', cap: 'نهایی (Cap)' }

/**
 * The pass a defect type usually belongs to, so it is charged to the welders who made that pass. Root-side defects
 * (incomplete penetration, internal undercut, burn-through, Hi-Lo) → root; external undercut → cap; the rest are
 * between passes (fill) unless the interpreter picks another pass.
 */
export const DEFAULT_PASS: Record<DefectType, Pass> = {
  incomplete_penetration: 'root', internal_undercut: 'root', burn_through: 'root', hi_lo: 'root', crack: 'root',
  external_undercut: 'cap', incomplete_fusion: 'fill', slag_inclusion: 'fill', porosity: 'fill', other: 'fill',
}

export interface Criteria {
  windowMm: number
  crater: { allow: boolean; maxLenMm: number; maxDepthMm: number }
  linear: Record<'incomplete_penetration' | 'incomplete_fusion' | 'slag_inclusion', { singleT: number; singleCapMm: number }>
  aggregate: { tFactor: number; capMm: number }
  porosity: { singleDiaMm: number; clusterT: number; clusterCapMm: number }
  undercut: { maxDepthMm: number; maxDepthPctT: number; maxLenMm: number }
  burnThrough: { maxDiaMm: number }
  hiLo: { maxPctT: number }
  maxRepairs: number
}

export const DEFAULT_CRITERIA: Criteria = {
  windowMm: 300,
  crater: { allow: true, maxLenMm: 5, maxDepthMm: 1 },
  linear: { incomplete_penetration: { singleT: 1, singleCapMm: 19 }, incomplete_fusion: { singleT: 1, singleCapMm: 19 }, slag_inclusion: { singleT: 1, singleCapMm: 19 } },
  aggregate: { tFactor: 2, capMm: 25 },
  porosity: { singleDiaMm: 3.2, clusterT: 1, clusterCapMm: 19 },
  undercut: { maxDepthMm: 0.8, maxDepthPctT: 12.5, maxLenMm: 50 },
  burnThrough: { maxDiaMm: 3.2 },
  hiLo: { maxPctT: 15 },
  maxRepairs: 2,
}

/** the saved criteria of a project laid over the defaults (a missing or broken value keeps the default) */
export function mergeCriteria(saved: unknown): Criteria {
  const out = JSON.parse(JSON.stringify(DEFAULT_CRITERIA)) as Criteria
  const walk = (dst: Record<string, unknown>, src: unknown) => {
    if (!src || typeof src !== 'object') return
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (!(k in dst)) continue
      const d = dst[k]
      if (d && typeof d === 'object') walk(d as Record<string, unknown>, v)
      else if (typeof d === 'number' && typeof v === 'number' && Number.isFinite(v) && v >= 0) dst[k] = v
      else if (typeof d === 'boolean' && typeof v === 'boolean') dst[k] = v
    }
  }
  walk(out as unknown as Record<string, unknown>, saved)
  return out
}

export interface DefectInput { id: string; type: DefectType; lengthMm: number; depthMm: number; positionMm: number }
export interface DefectVerdict { id: string; verdict: Verdict; reason: string; advice: string }
export interface Evaluation { overall: Verdict; verdicts: DefectVerdict[]; note: string; limits: { singleMm: number; aggregateMm: number; undercutDepthMm: number; hiLoMm: number } }

const r1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString('fa-IR')
const r2 = (x: number) => (Math.round(x * 100) / 100).toLocaleString('fa-IR')
const AGG_TYPES = new Set<DefectType>(['incomplete_penetration', 'incomplete_fusion', 'slag_inclusion', 'porosity', 'burn_through'])

function single(d: DefectInput, t: number, c: Criteria): { verdict: Verdict; reason: string } {
  switch (d.type) {
    case 'crack':
      if (c.crater.allow && d.lengthMm <= c.crater.maxLenMm && d.depthMm <= c.crater.maxDepthMm) return { verdict: 'repair', reason: 'ترک کریتر کم‌عمق — قابل بررسی برای تعمیر موضعی با تأیید بازرس' }
      return { verdict: 'cut_out', reason: 'هر ترک (جز کریتر بسیار سطحی) غیرقابل قبول است' }
    case 'incomplete_penetration': case 'incomplete_fusion': case 'slag_inclusion': {
      const k = c.linear[d.type], max = Math.min(k.singleT * t, k.singleCapMm)
      return d.lengthMm <= max ? { verdict: 'accept', reason: `طول ${r1(d.lengthMm)} mm در حد مجاز تکی (${r1(max)} mm)` } : { verdict: 'repair', reason: `طول ${r1(d.lengthMm)} mm بیش از حد مجاز تکی (${r1(max)} mm)` }
    }
    case 'porosity': {
      const max = Math.min(c.porosity.clusterT * t, c.porosity.clusterCapMm)
      return d.lengthMm <= max ? { verdict: 'accept', reason: `تخلخل ${r1(d.lengthMm)} mm در حد مجاز (${r1(max)} mm)` } : { verdict: 'repair', reason: `تخلخل ${r1(d.lengthMm)} mm بیش از حد مجاز (${r1(max)} mm)` }
    }
    case 'internal_undercut': case 'external_undercut': {
      const max = Math.min(c.undercut.maxDepthMm, (c.undercut.maxDepthPctT / 100) * t)
      return d.depthMm <= max && d.lengthMm <= c.undercut.maxLenMm ? { verdict: 'accept', reason: `عمق ${r2(d.depthMm)} mm و طول ${r1(d.lengthMm)} mm در حد مجاز` } : { verdict: 'repair', reason: `عمق یا طول بریدگی بیش از حد مجاز (عمق ≤ ${r2(max)} mm، طول ≤ ${r1(c.undercut.maxLenMm)} mm)` }
    }
    case 'burn_through':
      return d.lengthMm <= c.burnThrough.maxDiaMm ? { verdict: 'repair', reason: 'سوختگی کوچک — تعمیر با گوژینگ و جوش مجدد' } : { verdict: 'cut_out', reason: `سوختگی بزرگ‌تر از ${r1(c.burnThrough.maxDiaMm)} mm — برش و جوش مجدد کامل` }
    case 'hi_lo': {
      const max = (c.hiLo.maxPctT / 100) * t
      return d.depthMm <= max ? { verdict: 'accept', reason: `ناهم‌ترازی ${r2(d.depthMm)} mm در حد مجاز (${r2(max)} mm)` } : { verdict: 'repair', reason: `ناهم‌ترازی ${r2(d.depthMm)} mm بیش از حد مجاز (${r2(max)} mm)` }
    }
    default:
      return { verdict: 'repair', reason: 'نوع عیب نامشخص — بررسی دستی بازرس لازم است' }
  }
}

/** Evaluates the defects of one round of one weld. t = wall thickness (mm). */
export function evaluateJoint(t: number, defects: DefectInput[], c: Criteria = DEFAULT_CRITERIA): Evaluation {
  const verdicts = new Map<string, DefectVerdict>()
  for (const d of defects) { const v = single(d, t, c); verdicts.set(d.id, { id: d.id, ...v, advice: '' }) }
  // aggregate length of like-kind defects inside each reference window along the weld
  const maxAgg = Math.min(c.aggregate.tFactor * t, c.aggregate.capMm)
  const rel = defects.filter((d) => AGG_TYPES.has(d.type)).sort((a, b) => a.positionMm - b.positionMm)
  for (let i = 0; i < rel.length; i++) {
    const group = [rel[i]]
    for (let j = i + 1; j < rel.length && rel[j].positionMm - rel[i].positionMm <= c.windowMm; j++) group.push(rel[j])
    const total = group.reduce((s, g) => s + g.lengthMm, 0)
    if (group.length > 1 && total > maxAgg) {
      const reason = `مجموع طول ${group.length.toLocaleString('fa-IR')} عیب در بازهٔ ${r1(c.windowMm)} mm برابر ${r1(total)} mm و بیش از حد تجمعی (${r1(maxAgg)} mm) است`
      for (const g of group) { const v = verdicts.get(g.id)!; if (v.verdict === 'accept') verdicts.set(g.id, { ...v, verdict: 'repair', reason }) }
    }
  }
  const list = defects.map((d) => { const v = verdicts.get(d.id)!; return { ...v, advice: suggestRepair(d.type, v.verdict) } })
  const overall: Verdict = list.some((v) => v.verdict === 'cut_out') ? 'cut_out' : list.some((v) => v.verdict === 'repair') ? 'repair' : 'accept'
  return {
    overall, verdicts: list,
    note: 'این ارزیابی کمک‌تصمیم است و باید توسط بازرس NDT دارای صلاحیت (Level II/III) بازبینی و تأیید نهایی شود.',
    limits: { singleMm: Math.min(t, 19), aggregateMm: maxAgg, undercutDepthMm: Math.min(c.undercut.maxDepthMm, (c.undercut.maxDepthPctT / 100) * t), hiLoMm: (c.hiLo.maxPctT / 100) * t },
  }
}

const REPAIR: Partial<Record<DefectType, { repair: string; cut_out: string }>> = {
  crack: { repair: 'ترک با سنگ‌زنی یا گوژینگ کاملاً برداشته شود، با PT/MT کنترل و طبق Repair WPS جوش مجدد شود؛ در صورت تکرار یا گستردگی، برش کامل.', cut_out: 'برش کامل درز و جوشکاری مجدد طبق WPS اصلی؛ به‌دلیل خطر رشد ترک.' },
  incomplete_penetration: { repair: 'سنگ‌زنی تا فلز سالم (از بیرون یا داخل)، پاس ریشهٔ مجدد با کنترل گپ و آمپر، و کنترل مجدد RT/UT.', cut_out: 'طول یا عمق عیب بیش از حد تعمیر است؛ برش کامل و جوش مجدد.' },
  incomplete_fusion: { repair: 'سنگ‌زنی موضعی تا فلز سالم و پاس‌های پرکنندهٔ مجدد با کنترل زاویهٔ الکترود و پیش‌گرمایش.', cut_out: 'گستردگی ذوب ناقص بیش از حد تعمیر؛ برش کامل.' },
  slag_inclusion: { repair: 'سنگ‌زنی تا حذف کامل سرباره، تمیزکاری بین‌پاسی بهتر و جوش مجدد ناحیه.', cut_out: 'آخال گسترده یا عمیق؛ برش کامل.' },
  porosity: { repair: 'سنگ‌زنی ناحیهٔ متخلخل، بررسی تمیزی لبه‌ها و رطوبت الکترود، سپس جوش مجدد.', cut_out: 'تخلخل گسترده یا خوشه‌ای؛ برش کامل.' },
  internal_undercut: { repair: 'پاس ترمیمی نازک روی بریدگی پس از تمیزکاری با سنگ.', cut_out: 'بریدگی عمیق و طولانی؛ برش کامل.' },
  external_undercut: { repair: 'پاس ترمیمی نازک پس از تمیزکاری با سنگ؛ کنترل زاویه و سرعت جوشکاری در پاس نهایی.', cut_out: 'بریدگی عمیق و طولانی؛ برش کامل.' },
  burn_through: { repair: 'گوژینگ ناحیهٔ سوخته تا فلز سالم و بازسازی ریشه با پاس‌های کنترل‌شده (آمپر پایین‌تر).', cut_out: 'سوختگی گسترده؛ برش کامل و جوش مجدد.' },
  hi_lo: { repair: 'در جوش تکمیل‌شده معمولاً برش لازم است؛ پیش از تکمیل پاس‌ها، اصلاح مکانیکی ترازبندی.', cut_out: 'ناهم‌ترازی بیش از حد؛ برش کامل و تنظیم مجدد لوله‌ها.' },
}
export function suggestRepair(type: DefectType, verdict: Verdict): string {
  if (verdict === 'accept') return 'عیب قابل قبول است؛ تعمیری لازم نیست.'
  return REPAIR[type]?.[verdict] ?? 'بررسی موردی توسط مهندس جوش و بازرس NDT برای تعیین روش تعمیر.'
}

/** wall thickness (mm) from the central weld register value — inches when it looks like one (< 3), else mm */
export function thicknessMm(v: string | number | null | undefined): number | null {
  const x = Number(String(v ?? '').replace('٫', '.').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(x) || x <= 0) return null
  return x < 3 ? Math.round(x * 25.4 * 100) / 100 : x
}
