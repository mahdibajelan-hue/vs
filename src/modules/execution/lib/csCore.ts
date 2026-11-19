/**
 * Compressor-station execution — pure calculations over the station registers (lines, spools, welds, equipment, test
 * packs). Piping is measured in inch-dia (ID): a butt weld on an 8" line is 8 ID. Earned values follow common station
 * practice and are the same everywhere they are shown (station dashboard, line table, test packs).
 */

export type SpoolStage = 'planned' | 'cut' | 'fitup' | 'welded' | 'ndt' | 'painted' | 'dispatched' | 'erected'
export type NdtResult = 'pending' | 'accept' | 'reject'
export type PackStatus = 'open' | 'ready' | 'tested' | 'reinstated'

export interface CsLine { id: string; projectId: string; lineNo: string; service: string; sizeIn: number; specClass: string; material: string; area: string; isoNo: string; designPressBar: number | null; ndtPct: number; testPackId: string | null; note: string; archived: boolean }
export interface CsSpool { id: string; projectId: string; lineId: string; spoolNo: string; isoNo: string; sizeIn: number | null; weightKg: number | null; area: string; stage: SpoolStage; stageDates: Partial<Record<SpoolStage, string>>; note: string; archived: boolean }
export interface CsWeld {
  id: string; projectId: string; lineId: string; spoolId: string | null; weldNo: string; location: 'shop' | 'field'; jointType: 'BW' | 'SW' | 'FW' | 'BR'
  sizeIn: number; thkMm: number | null; material: string; wps: string; welder: string; fitupDate: string | null; weldDate: string | null
  ndtMethod: string; ndtResult: NdtResult; ndtDate: string | null; ndtReport: string; repairCount: number; note: string; archived: boolean
}
export interface CsEquipment { id: string; projectId: string; tag: string; title: string; kind: string; area: string; weightT: number | null; steps: Record<string, string>; note: string; archived: boolean }
export interface CsTestPack { id: string; projectId: string; packNo: string; system: string; medium: 'hydro' | 'pneumatic' | 'service'; testPressBar: number | null; status: PackStatus; punchA: number; punchB: number; testDate: string | null; reinstatedDate: string | null; note: string; archived: boolean }

// ── spools ──────────────────────────────────────────────────────────────
export const SPOOL_STAGES: SpoolStage[] = ['planned', 'cut', 'fitup', 'welded', 'ndt', 'painted', 'dispatched', 'erected']
export const SPOOL_STAGE_FA: Record<SpoolStage, string> = { planned: 'برنامه‌ریزی‌شده', cut: 'برش', fitup: 'فیت‌آپ', welded: 'جوشکاری', ndt: 'آزمون غیرمخرب', painted: 'رنگ', dispatched: 'ارسال به سایت', erected: 'نصب در محل' }
/** cumulative earned share when a spool has reached the stage */
export const SPOOL_EARNED: Record<SpoolStage, number> = { planned: 0, cut: 0.1, fitup: 0.25, welded: 0.55, ndt: 0.7, painted: 0.85, dispatched: 0.9, erected: 1 }
export const spoolIndex = (s: SpoolStage) => SPOOL_STAGES.indexOf(s)

// ── welds ───────────────────────────────────────────────────────────────
export type WeldState = 'planned' | 'fitup' | 'welded' | 'accepted' | 'rejected'
export const WELD_STATE_FA: Record<WeldState, string> = { planned: 'برنامه‌ریزی‌شده', fitup: 'فیت‌آپ شده', welded: 'جوش‌شده، منتظر NDT', accepted: 'قبول NDT', rejected: 'رد NDT — نیازمند تعمیر' }
export function weldState(w: Pick<CsWeld, 'fitupDate' | 'weldDate' | 'ndtResult'>): WeldState {
  if (w.ndtResult === 'reject') return 'rejected'
  if (w.ndtResult === 'accept') return 'accepted'
  if (w.weldDate) return 'welded'
  if (w.fitupDate) return 'fitup'
  return 'planned'
}
/** earned share of a weld's inch-dia: fit-up 30%, welding 60%, NDT acceptance 10% (a weld whose line needs no NDT earns it when welded) */
export function weldEarned(w: Pick<CsWeld, 'fitupDate' | 'weldDate' | 'ndtResult'>, ndtRequired = true): number {
  if (w.ndtResult === 'reject') return w.fitupDate || w.weldDate ? 0.3 : 0 // a rejected weld keeps only its fit-up until repaired
  // in tenths so 0.3 + 0.6 is exactly 0.9
  let e = 0
  if (w.fitupDate || w.weldDate) e += 3
  if (w.weldDate) e += 6
  if (w.weldDate && (w.ndtResult === 'accept' || !ndtRequired)) e += 1
  return e / 10
}
export const inchDia = (w: Pick<CsWeld, 'sizeIn'>) => (w.sizeIn > 0 ? w.sizeIn : 0)

// ── equipment ───────────────────────────────────────────────────────────
export interface EqStep { key: string; fa: string; weight: number }
/** installation steps of a mechanical package; «foundation ready» is a prerequisite (civil), not earned here */
export const EQ_STEPS: EqStep[] = [
  { key: 'foundation', fa: 'آمادگی فونداسیون', weight: 0 },
  { key: 'set', fa: 'استقرار روی فونداسیون', weight: 40 },
  { key: 'level', fa: 'تراز و شیم‌گذاری', weight: 15 },
  { key: 'grout', fa: 'گروت‌ریزی', weight: 15 },
  { key: 'align', fa: 'هم‌محوری (الاینمنت)', weight: 20 },
  { key: 'piping', fa: 'اتصال لوله‌کشی', weight: 10 },
]
export const EQ_KINDS: Record<string, string> = {
  compressor: 'کمپرسور', driver: 'محرک (توربین / الکتروموتور)', cooler: 'کولر هوایی', scrubber: 'اسکرابر / جداکننده', filter: 'فیلتر',
  vessel: 'مخزن تحت فشار', pump: 'پمپ', generator: 'ژنراتور', skid: 'اسکید پکیج', tank: 'مخزن ذخیره', other: 'سایر',
}
export function equipmentEarned(e: Pick<CsEquipment, 'steps'>): number {
  const tot = EQ_STEPS.reduce((s, x) => s + x.weight, 0)
  return EQ_STEPS.reduce((s, x) => s + (e.steps[x.key] ? x.weight : 0), 0) / tot
}
/** the next step to record (steps are done in order; a later step without an earlier one is reported as a gap) */
export function equipmentNext(e: Pick<CsEquipment, 'steps'>): EqStep | null { return EQ_STEPS.find((x) => !e.steps[x.key]) ?? null }
export function equipmentGaps(e: Pick<CsEquipment, 'steps'>): string[] {
  const out: string[] = []
  EQ_STEPS.forEach((x, i) => { if (e.steps[x.key]) for (const p of EQ_STEPS.slice(0, i)) if (!e.steps[p.key]) out.push(`«${x.fa}» بدون «${p.fa}» ثبت شده`) })
  return [...new Set(out)]
}

// ── test packs ──────────────────────────────────────────────────────────
export const PACK_STATUS_FA: Record<PackStatus, string> = { open: 'در حال تکمیل', ready: 'آمادهٔ آزمون', tested: 'آزمون‌شده', reinstated: 'بازگردانی‌شده' }
export interface PackReadiness { lines: number; welds: number; welded: number; accepted: number; blocking: number; punchA: number; ready: boolean; reasons: string[] }
/** the same rule the server enforces before a pack may be marked «tested» (cs_guard, migration 050) */
export function packReadiness(pack: Pick<CsTestPack, 'id' | 'punchA'>, lines: CsLine[], welds: CsWeld[]): PackReadiness {
  const ls = lines.filter((l) => l.testPackId === pack.id && !l.archived)
  const need = new Map(ls.map((l) => [l.id, l.ndtPct >= 100]))
  const ws = welds.filter((w) => need.has(w.lineId) && !w.archived)
  const welded = ws.filter((w) => w.weldDate).length
  const accepted = ws.filter((w) => w.ndtResult === 'accept').length
  const blocking = ws.filter((w) => !w.weldDate || w.ndtResult === 'reject' || (need.get(w.lineId) && w.ndtResult !== 'accept')).length
  const reasons: string[] = []
  if (!ls.length) reasons.push('هیچ لاینی به این تست‌پک وصل نیست')
  if (ws.length - welded > 0) reasons.push(`${(ws.length - welded).toLocaleString('fa-IR')} جوش انجام‌نشده`)
  const rej = ws.filter((w) => w.ndtResult === 'reject').length
  if (rej) reasons.push(`${rej.toLocaleString('fa-IR')} جوش ردشده در NDT`)
  const waitNdt = ws.filter((w) => w.weldDate && w.ndtResult === 'pending' && need.get(w.lineId)).length
  if (waitNdt) reasons.push(`${waitNdt.toLocaleString('fa-IR')} جوش منتظر نتیجهٔ NDT`)
  if (pack.punchA > 0) reasons.push(`${pack.punchA.toLocaleString('fa-IR')} مورد پانچ A باز`)
  return { lines: ls.length, welds: ws.length, welded, accepted, blocking, punchA: pack.punchA, ready: ls.length > 0 && blocking === 0 && pack.punchA === 0, reasons }
}

// ── summaries ───────────────────────────────────────────────────────────
export interface IdSum { total: number; earned: number; welded: number; count: number; weldedCount: number }
const emptySum = (): IdSum => ({ total: 0, earned: 0, welded: 0, count: 0, weldedCount: 0 })
export interface CsSummary {
  shop: IdSum; field: IdSum; all: IdSum
  piping: number; spools: { total: number; byStage: Record<SpoolStage, number>; earned: number }
  equipment: { total: number; earned: number; done: number }
  ndt: { examined: number; accepted: number; rejected: number; rejectRate: number | null; waiting: number }
  welders: { welder: string; welds: number; examined: number; rejected: number; rate: number | null; id: number }[]
  packs: { total: number; ready: number; tested: number; reinstated: number }
  byLine: { line: CsLine; total: number; earned: number; welds: number; welded: number; pct: number }[]
}
/** Station piping progress (inch-dia), spool fabrication, equipment installation, NDT and test packs in one pass. */
export function csSummary(d: { lines: CsLine[]; spools: CsSpool[]; welds: CsWeld[]; equipment: CsEquipment[]; packs: CsTestPack[] }): CsSummary {
  const lines = d.lines.filter((l) => !l.archived), lineById = new Map(lines.map((l) => [l.id, l]))
  const welds = d.welds.filter((w) => !w.archived && lineById.has(w.lineId))
  const shop = emptySum(), field = emptySum(), all = emptySum()
  const perLine = new Map<string, { total: number; earned: number; welds: number; welded: number }>()
  const wl = new Map<string, { welds: number; examined: number; rejected: number; id: number }>()
  let examined = 0, accepted = 0, rejected = 0, waiting = 0
  for (const w of welds) {
    const id = inchDia(w), need = (lineById.get(w.lineId)?.ndtPct ?? 100) >= 100, e = weldEarned(w, need) * id
    for (const s of [w.location === 'shop' ? shop : field, all]) { s.total += id; s.earned += e; s.count++; if (w.weldDate) { s.welded += id; s.weldedCount++ } }
    const pl = perLine.get(w.lineId) ?? { total: 0, earned: 0, welds: 0, welded: 0 }; pl.total += id; pl.earned += e; pl.welds++; if (w.weldDate) pl.welded++; perLine.set(w.lineId, pl)
    // a repaired weld counts each NDT it went through: the rejections that caused repairs, then its current result
    const exams = w.repairCount + (w.ndtResult === 'pending' ? 0 : 1), rejs = w.repairCount + (w.ndtResult === 'reject' ? 1 : 0)
    examined += exams; rejected += rejs; if (w.ndtResult === 'accept') accepted++
    if (w.weldDate && w.ndtResult === 'pending' && need) waiting++
    if (w.welder && w.weldDate) { const x = wl.get(w.welder) ?? { welds: 0, examined: 0, rejected: 0, id: 0 }; x.welds++; x.examined += exams; x.rejected += rejs; x.id += id; wl.set(w.welder, x) }
  }
  const spools = d.spools.filter((s) => !s.archived)
  const byStage = Object.fromEntries(SPOOL_STAGES.map((s) => [s, 0])) as Record<SpoolStage, number>
  for (const s of spools) byStage[s.stage]++
  const spoolEarned = spools.length ? spools.reduce((n, s) => n + SPOOL_EARNED[s.stage], 0) / spools.length : 0
  const eq = d.equipment.filter((e) => !e.archived)
  const eqEarned = eq.length ? eq.reduce((n, e) => n + equipmentEarned(e), 0) / eq.length : 0
  const packs = d.packs.filter((p) => !p.archived)
  const packReady = packs.filter((p) => p.status === 'open' || p.status === 'ready').filter((p) => packReadiness(p, lines, welds).ready).length
  return {
    shop, field, all, piping: all.total ? all.earned / all.total : 0,
    spools: { total: spools.length, byStage, earned: spoolEarned },
    equipment: { total: eq.length, earned: eqEarned, done: eq.filter((e) => equipmentEarned(e) >= 1).length },
    ndt: { examined, accepted, rejected, rejectRate: examined ? rejected / examined : null, waiting },
    welders: [...wl.entries()].map(([welder, x]) => ({ welder, ...x, rate: x.examined ? x.rejected / x.examined : null })).sort((a, b) => b.id - a.id),
    packs: { total: packs.length, ready: packReady, tested: packs.filter((p) => p.status === 'tested').length, reinstated: packs.filter((p) => p.status === 'reinstated').length },
    byLine: lines.map((l) => { const p = perLine.get(l.id) ?? { total: 0, earned: 0, welds: 0, welded: 0 }; return { line: l, ...p, pct: p.total ? p.earned / p.total : 0 } }),
  }
}

// ── import ──────────────────────────────────────────────────────────────
/** A size written as 8, 8", 8in, ۸ or 3/4 → inches. */
export function parseSize(v: unknown): number | null {
  if (v == null) return null
  const s = String(v).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٫,]/g, '.').replace(/["”″]|inch|in|اینچ/gi, '').trim()
  if (!s) return null
  const m = s.match(/^(\d+)\s*-?\s*(\d+)\/(\d+)$/) // 1-1/2
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3])
  const f = s.match(/^(\d+)\/(\d+)$/)
  if (f) return Number(f[1]) / Number(f[2])
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

const pick = (r: Record<string, unknown>, keys: string[]): string => {
  const norm = (s: string) => s.replace(/[\s‌_.-]/g, '').toLowerCase()
  const want = keys.map(norm)
  for (const [k, v] of Object.entries(r)) if (want.includes(norm(k))) return String(v ?? '').trim()
  return ''
}
const num = (s: string): number | null => { const v = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٫,]/g, '.').trim(); if (!v) return null; const n = Number(v); return Number.isFinite(n) ? n : null }
/** Column headers the importer reads (Persian or English); also the template's headers. */
export const IMPORT_HEADERS = {
  lines: ['شماره لاین', 'سایز (اینچ)', 'سرویس', 'کلاس لوله', 'جنس', 'ناحیه', 'شماره ایزومتریک', 'درصد NDT'],
  spools: ['شماره لاین', 'شماره اسپول', 'سایز (اینچ)', 'وزن (کیلوگرم)', 'ناحیه', 'شماره ایزومتریک'],
  welds: ['شماره لاین', 'شماره جوش', 'کارگاهی یا میدانی', 'نوع اتصال', 'سایز (اینچ)', 'ضخامت (میلی‌متر)', 'جنس', 'WPS', 'شماره اسپول'],
  equipment: ['تگ', 'شرح', 'نوع', 'ناحیه', 'وزن (تن)'],
} as const
export type ImportEntity = keyof typeof IMPORT_HEADERS
export interface ImportResult { rows: Record<string, unknown>[]; errors: string[] }
/**
 * Excel rows → register rows. Every row is checked before anything is written: a missing key, an unknown line or spool,
 * a bad size or a number repeated in the file (or already registered) is reported with its row number and nothing is
 * imported until the file is clean.
 */
export function mapImport(e: ImportEntity, sheet: Record<string, unknown>[], ctx: { lines: CsLine[]; spools: CsSpool[]; welds: CsWeld[]; equipment: CsEquipment[] }): ImportResult {
  const errors: string[] = [], rows: Record<string, unknown>[] = []
  const lineByNo = new Map(ctx.lines.map((l) => [l.lineNo.trim(), l]))
  const spoolByNo = new Map(ctx.spools.map((s) => [s.spoolNo.trim(), s]))
  const seen = new Set<string>()
  sheet.forEach((r, i) => {
    const at = `ردیف ${(i + 2).toLocaleString('fa-IR')}`
    if (Object.values(r).every((v) => String(v ?? '').trim() === '')) return
    if (e === 'lines') {
      const lineNo = pick(r, ['شماره لاین', 'line no', 'line', 'لاین']), size = parseSize(pick(r, ['سایز (اینچ)', 'سایز', 'size', 'nps']))
      if (!lineNo) return void errors.push(`${at}: شمارهٔ لاین خالی است`)
      if (!size) return void errors.push(`${at}: سایز لاین «${lineNo}» نامعتبر است`)
      if (seen.has(lineNo) || lineByNo.has(lineNo)) return void errors.push(`${at}: لاین «${lineNo}» تکراری است`)
      seen.add(lineNo)
      const ndt = num(pick(r, ['درصد NDT', 'ndt %', 'ndt']))
      if (ndt != null && (ndt < 0 || ndt > 100)) return void errors.push(`${at}: درصد NDT باید بین ۰ و ۱۰۰ باشد`)
      rows.push({ lineNo, sizeIn: size, service: pick(r, ['سرویس', 'service', 'fluid']), specClass: pick(r, ['کلاس لوله', 'کلاس', 'class', 'spec']), material: pick(r, ['جنس', 'material']), area: pick(r, ['ناحیه', 'area', 'unit']), isoNo: pick(r, ['شماره ایزومتریک', 'ایزومتریک', 'iso', 'isometric']), ndtPct: ndt ?? 100 })
    } else if (e === 'spools') {
      const ln = pick(r, ['شماره لاین', 'line no', 'line']), spoolNo = pick(r, ['شماره اسپول', 'spool no', 'spool'])
      const line = lineByNo.get(ln)
      if (!spoolNo) return void errors.push(`${at}: شمارهٔ اسپول خالی است`)
      if (!line) return void errors.push(`${at}: لاین «${ln || '—'}» ثبت نشده است`)
      if (seen.has(spoolNo) || spoolByNo.has(spoolNo)) return void errors.push(`${at}: اسپول «${spoolNo}» تکراری است`)
      seen.add(spoolNo)
      rows.push({ lineId: line.id, spoolNo, sizeIn: parseSize(pick(r, ['سایز (اینچ)', 'سایز', 'size'])) ?? line.sizeIn, weightKg: num(pick(r, ['وزن (کیلوگرم)', 'وزن', 'weight'])), area: pick(r, ['ناحیه', 'area']) || line.area, isoNo: pick(r, ['شماره ایزومتریک', 'iso']) || line.isoNo, stage: 'planned' })
    } else if (e === 'welds') {
      const ln = pick(r, ['شماره لاین', 'line no', 'line']), weldNo = pick(r, ['شماره جوش', 'weld no', 'joint no', 'weld'])
      const line = lineByNo.get(ln)
      if (!weldNo) return void errors.push(`${at}: شمارهٔ جوش خالی است`)
      if (!line) return void errors.push(`${at}: لاین «${ln || '—'}» ثبت نشده است`)
      const key = `${line.id}|${weldNo}`
      if (seen.has(key) || ctx.welds.some((w) => w.lineId === line.id && w.weldNo === weldNo)) return void errors.push(`${at}: جوش «${weldNo}» روی لاین «${ln}» تکراری است`)
      seen.add(key)
      const loc = pick(r, ['کارگاهی یا میدانی', 'محل', 'shop/field', 'location']).toLowerCase()
      const location = /field|میدان|سایت|f$/.test(loc) ? 'field' : 'shop'
      const jt = pick(r, ['نوع اتصال', 'joint type', 'type']).toUpperCase()
      const jointType = (['BW', 'SW', 'FW', 'BR'] as const).find((x) => jt.startsWith(x)) ?? 'BW'
      const spoolNo = pick(r, ['شماره اسپول', 'spool'])
      const spool = spoolNo ? spoolByNo.get(spoolNo) : undefined
      if (spoolNo && (!spool || spool.lineId !== line.id)) return void errors.push(`${at}: اسپول «${spoolNo}» روی لاین «${ln}» ثبت نشده است`)
      const size = parseSize(pick(r, ['سایز (اینچ)', 'سایز', 'size', 'dia'])) ?? line.sizeIn
      rows.push({ lineId: line.id, spoolId: spool?.id ?? null, weldNo, location, jointType, sizeIn: size, thkMm: num(pick(r, ['ضخامت (میلی‌متر)', 'ضخامت', 'thk', 'thickness'])), material: pick(r, ['جنس', 'material']) || line.material, wps: pick(r, ['WPS']) })
    } else {
      const tag = pick(r, ['تگ', 'tag', 'tag no'])
      if (!tag) return void errors.push(`${at}: تگ خالی است`)
      if (seen.has(tag) || ctx.equipment.some((x) => x.tag === tag)) return void errors.push(`${at}: تگ «${tag}» تکراری است`)
      seen.add(tag)
      const kindTxt = pick(r, ['نوع', 'kind', 'type'])
      const kind = Object.entries(EQ_KINDS).find(([k, f]) => k === kindTxt.toLowerCase() || (kindTxt && f.includes(kindTxt)))?.[0] ?? 'other'
      rows.push({ tag, title: pick(r, ['شرح', 'title', 'description']), kind, area: pick(r, ['ناحیه', 'area']), weightT: num(pick(r, ['وزن (تن)', 'وزن', 'weight'])) })
    }
  })
  return { rows: errors.length ? [] : rows, errors }
}
