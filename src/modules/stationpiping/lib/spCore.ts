/**
 * Station piping & welding — the pure calculations. A station's progress is the weighted average of its disciplines;
 * each discipline's progress comes from where the work is actually recorded:
 *   welding → inch-dia (DI) welded ÷ DI of all welds of the station
 *   ndt     → DI of welds whose NDT is accepted ÷ DI of welds that need NDT
 *   others  → Σ weight × min(done ÷ scope, 1) ÷ Σ weight over the discipline's scope items (daily quantities)
 * Planned progress spreads each item linearly between its planned dates (the station's dates when it has none);
 * welding and NDT follow the station's dates. Dates are ISO «YYYY-MM-DD».
 */
export type Discipline = 'civil' | 'structure' | 'mechanical' | 'piping' | 'welding' | 'ndt' | 'electrical' | 'instrument' | 'painting' | 'testing'
export const DISCIPLINES: Discipline[] = ['civil', 'structure', 'mechanical', 'piping', 'welding', 'ndt', 'electrical', 'instrument', 'painting', 'testing']
export const DISC_FA: Record<Discipline, string> = {
  civil: 'سیویل', structure: 'سازهٔ فلزی', mechanical: 'مکانیکال و تجهیزات', piping: 'پایپینگ (نصب)', welding: 'جوشکاری', ndt: 'آزمایش‌های غیرمخرب (NDT)',
  electrical: 'برق', instrument: 'ابزار دقیق', painting: 'رنگ و عایق', testing: 'تست و پیش‌راه‌اندازی',
}
export const DISC_COLOR: Record<Discipline, string> = {
  civil: '#a16207', structure: '#64748b', mechanical: '#0ea5e9', piping: '#6366f1', welding: '#f97316', ndt: '#ec4899',
  electrical: '#eab308', instrument: '#14b8a6', painting: '#84cc16', testing: '#8b5cf6',
}
/** disciplines measured from the weld register rather than from daily quantities */
export const AUTO_DISC: Discipline[] = ['welding', 'ndt']
export const DEFAULT_WEIGHTS: Record<Discipline, number> = { civil: 20, structure: 5, mechanical: 10, piping: 15, welding: 15, ndt: 5, electrical: 10, instrument: 10, painting: 5, testing: 5 }

export type StationKind = 'valve' | 'launcher' | 'receiver' | 'launcher_receiver' | 'pcs' | 'cgs' | 'other'
export const KIND_FA: Record<StationKind, string> = {
  valve: 'ایستگاه شیر بین‌راهی', launcher: 'ایستگاه ارسال توپک (Launcher)', receiver: 'ایستگاه دریافت توپک (Receiver)', launcher_receiver: 'ایستگاه ارسال و دریافت توپک',
  pcs: 'ایستگاه تقلیل فشار (PCS)', cgs: 'ایستگاه CGS', other: 'سایر',
}

export interface Station { id: string; code: string; name: string; kind: StationKind; km: number | null; plannedStart: string | null; plannedFinish: string | null; weights: Partial<Record<Discipline, number>> | null }
export interface Item { id: string; stationId: string; discipline: Discipline; code: string; title: string; unit: string; qty: number; weight: number; plannedStart: string | null; plannedFinish: string | null; sort: number }
export interface Log { id: string; stationId: string; itemId: string; at: string; qty: number; note: string; by: string }
export type JointType = 'BW' | 'SW' | 'FW' | 'BR'
export type NdtResult = 'pending' | 'accepted' | 'rejected' | 'na'
export interface Weld {
  id: string; stationId: string; lineId: string | null; drawingId: string | null; weldNo: string; sizeIn: number; thkMm: number | null; jointType: JointType; shopField: 'shop' | 'field'
  material: string; wps: string; welder: string; fitupDate: string | null; weldDate: string | null; ndtMethod: string; ndtDate: string | null; ndtResult: NdtResult; repairs: number
  x: number | null; y: number | null; note: string
}
export const JOINT_FA: Record<JointType, string> = { BW: 'لب‌به‌لب (BW)', SW: 'ساکت‌ولد (SW)', FW: 'گوشه (FW)', BR: 'انشعاب (Branch)' }
export const NDT_FA: Record<NdtResult, string> = { pending: 'در انتظار', accepted: 'قبول', rejected: 'مردود', na: 'لازم نیست' }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const day = (iso: string) => Date.parse(iso.slice(0, 10) + 'T00:00:00Z')
/** share of [start, finish] elapsed at `asOf` (0 before, 1 after; a one-day span is all-or-nothing) */
export function plannedShare(start: string | null, finish: string | null, asOf: string): number | null {
  if (!start || !finish) return null
  const a = day(start), b = day(finish), t = day(asOf)
  if (t < a) return 0
  if (t >= b) return 1
  return clamp01((t - a) / Math.max(86400000, b - a))
}
/** inch-dia of a weld (branch and fillet welds count their own size; the industry's simplest DI) */
export const diOf = (w: Pick<Weld, 'sizeIn'>) => (Number.isFinite(w.sizeIn) && w.sizeIn > 0 ? w.sizeIn : 0)
export const isWelded = (w: Weld, asOf?: string) => !!w.weldDate && (!asOf || w.weldDate <= asOf)
export const needsNdt = (w: Weld) => w.ndtResult !== 'na' && w.ndtMethod !== '' && w.ndtMethod !== 'none'

/** quantity done of each item up to a date */
export function doneByItem(logs: Log[], asOf?: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of logs) if (!asOf || l.at <= asOf) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.qty)
  return m
}

export interface DiscProgress { discipline: Discipline; weight: number; hasScope: boolean; actual: number; planned: number | null; /** what it is measured in, e.g. «۴۲۰ از ۶۱۰ اینچ‌قطر» */ basis: { done: number; total: number; unit: string } }
export interface StationProgress { station: Station; disciplines: DiscProgress[]; actual: number; planned: number | null; welds: WeldStats }

export interface WeldStats {
  count: number; welded: number; totalDi: number; weldedDi: number
  ndtRequired: number; tested: number; accepted: number; rejected: number; acceptedDi: number; ndtDi: number
  /** rejected or repaired ÷ tested */
  repairRate: number | null
}
export function weldStats(welds: Weld[], asOf?: string): WeldStats {
  let welded = 0, totalDi = 0, weldedDi = 0, ndtRequired = 0, tested = 0, accepted = 0, rejected = 0, acceptedDi = 0, ndtDi = 0, repairedTested = 0
  for (const w of welds) {
    const di = diOf(w); totalDi += di
    const done = isWelded(w, asOf)
    if (done) { welded++; weldedDi += di }
    if (needsNdt(w)) {
      ndtRequired++; ndtDi += di
      const t = w.ndtDate && (!asOf || w.ndtDate <= asOf) && (w.ndtResult === 'accepted' || w.ndtResult === 'rejected')
      if (t) { tested++; if (w.ndtResult === 'accepted') { accepted++; acceptedDi += di } else rejected++; if (w.ndtResult === 'rejected' || w.repairs > 0) repairedTested++ }
    }
  }
  return { count: welds.length, welded, totalDi, weldedDi, ndtRequired, tested, accepted, rejected, acceptedDi, ndtDi, repairRate: tested ? repairedTested / tested : null }
}

export function stationProgress(station: Station, items: Item[], logs: Log[], welds: Weld[], asOf: string): StationProgress {
  const w = { ...DEFAULT_WEIGHTS, ...(station.weights ?? {}) }
  const done = doneByItem(logs, asOf)
  const ws = weldStats(welds, asOf)
  const span = plannedShare(station.plannedStart, station.plannedFinish, asOf)
  const out: DiscProgress[] = DISCIPLINES.map((d) => {
    if (d === 'welding') return { discipline: d, weight: w[d], hasScope: ws.totalDi > 0, actual: ws.totalDi ? (ws.weldedDi / ws.totalDi) * 100 : 0, planned: span == null ? null : span * 100, basis: { done: ws.weldedDi, total: ws.totalDi, unit: 'اینچ‌قطر' } }
    if (d === 'ndt') return { discipline: d, weight: w[d], hasScope: ws.ndtDi > 0, actual: ws.ndtDi ? (ws.acceptedDi / ws.ndtDi) * 100 : 0, planned: span == null ? null : span * 100, basis: { done: ws.acceptedDi, total: ws.ndtDi, unit: 'اینچ‌قطر قبول‌شده' } }
    const its = items.filter((i) => i.discipline === d && i.qty > 0)
    const tw = its.reduce((s, i) => s + i.weight, 0)
    if (!its.length || tw <= 0) return { discipline: d, weight: w[d], hasScope: false, actual: 0, planned: null, basis: { done: 0, total: 0, unit: '' } }
    let act = 0, pl = 0, plKnown = true
    for (const i of its) {
      act += i.weight * clamp01((done.get(i.id) ?? 0) / i.qty)
      const share = plannedShare(i.plannedStart ?? station.plannedStart, i.plannedFinish ?? station.plannedFinish, asOf)
      if (share == null) plKnown = false; else pl += i.weight * share
    }
    return { discipline: d, weight: w[d], hasScope: true, actual: (act / tw) * 100, planned: plKnown ? (pl / tw) * 100 : null, basis: { done: act, total: tw, unit: 'وزن' } }
  })
  const scoped = out.filter((x) => x.hasScope && x.weight > 0)
  const W = scoped.reduce((s, x) => s + x.weight, 0)
  const actual = W ? scoped.reduce((s, x) => s + x.weight * x.actual, 0) / W : 0
  const planned = W && scoped.every((x) => x.planned != null) ? scoped.reduce((s, x) => s + x.weight * (x.planned as number), 0) / W : null
  return { station, disciplines: out, actual, planned, welds: ws }
}

/** the project's stations together: each station counts equally (a station is a package of work of its own) */
export function overallProgress(ps: StationProgress[]) {
  const s = ps.filter((p) => p.disciplines.some((d) => d.hasScope))
  if (!s.length) return { actual: 0, planned: null as number | null, stations: 0 }
  const planned = s.every((p) => p.planned != null) ? s.reduce((a, p) => a + (p.planned as number), 0) / s.length : null
  return { actual: s.reduce((a, p) => a + p.actual, 0) / s.length, planned, stations: s.length }
}

/** cumulative actual vs planned curve of one or more stations, sampled weekly between the first date and `asOf` (or the last finish) */
export function progressCurve(stations: Station[], items: Item[], logs: Log[], welds: Weld[], asOf: string, stepDays = 7) {
  const dates = [
    ...stations.flatMap((s) => [s.plannedStart, s.plannedFinish]), ...items.flatMap((i) => [i.plannedStart, i.plannedFinish]),
    ...logs.map((l) => l.at), ...welds.flatMap((w) => [w.weldDate, w.ndtDate]),
  ].filter((x): x is string => !!x).sort()
  if (!dates.length) return []
  const start = dates[0], end = dates[dates.length - 1] > asOf ? dates[dates.length - 1] : asOf
  const pts: { at: string; actual: number | null; planned: number | null }[] = []
  for (let t = day(start); ; t += stepDays * 86400000) {
    const at = new Date(Math.min(t, day(end))).toISOString().slice(0, 10)
    const ps = stations.map((s) => stationProgress(s, items.filter((i) => i.stationId === s.id), logs.filter((l) => l.stationId === s.id), welds.filter((w) => w.stationId === s.id), at))
    const o = overallProgress(ps)
    pts.push({ at, actual: at <= asOf ? o.actual : null, planned: o.planned })
    if (at >= end) break
  }
  return pts
}

/** welder performance: welds, DI, tested, rejected and the repair rate of each welder (stamp) */
export function welderStats(welds: Weld[]) {
  const m = new Map<string, Weld[]>()
  for (const w of welds) if (w.welder && w.weldDate) m.set(w.welder, [...(m.get(w.welder) ?? []), w])
  return [...m.entries()].map(([welder, ws]) => ({ welder, ...weldStats(ws) })).sort((a, b) => b.weldedDi - a.weldedDi)
}

/** what was done on a day: per item quantity and the welds welded / tested that day */
export function dayReport(date: string, items: Item[], logs: Log[], welds: Weld[]) {
  const byItem = doneByItem(logs.filter((l) => l.at === date))
  return {
    items: items.filter((i) => byItem.has(i.id)).map((i) => ({ item: i, qty: byItem.get(i.id)! })),
    welded: welds.filter((w) => w.weldDate === date),
    tested: welds.filter((w) => w.ndtDate === date),
  }
}

// ── scope templates by station kind (quantities are a starting point to be edited) ──────────────────────────
type T = [Discipline, string, string, number, number]
const COMMON: T[] = [
  ['civil', 'خاکبرداری و تسطیح', 'm³', 600, 2], ['civil', 'بتن فونداسیون و پی‌ها', 'm³', 80, 4], ['civil', 'فنس و دیوار محوطه', 'm', 220, 2], ['civil', 'جاده و محوطه‌سازی', 'm²', 900, 2], ['civil', 'ساختمان کنترل / اتاقک', 'عدد', 1, 3],
  ['structure', 'ساپورت‌ها و سکوهای فلزی', 'ton', 6, 3],
  ['piping', 'نصب اسپول‌ها و لوله‌کشی', 'm', 160, 4], ['piping', 'نصب ساپورت لوله', 'عدد', 40, 1],
  ['electrical', 'کابل‌کشی برق', 'm', 900, 2], ['electrical', 'سیستم زمین و حفاظت صاعقه', 'عدد', 1, 1], ['electrical', 'روشنایی محوطه', 'عدد', 12, 1],
  ['instrument', 'نصب ترانسمیترها و گیج‌ها', 'عدد', 10, 2], ['instrument', 'کابل‌کشی ابزار دقیق', 'm', 600, 1], ['instrument', 'RTU / تابلوی کنترل', 'عدد', 1, 2],
  ['painting', 'رنگ لوله‌ها و تجهیزات روزمینی', 'm²', 350, 2], ['painting', 'عایق‌کاری لوله‌های مدفون', 'm', 60, 1],
  ['testing', 'تست هیدرواستاتیک لوله‌کشی ایستگاه', 'بسته', 2, 3], ['testing', 'کمیسیونینگ و آماده‌سازی تحویل', 'عدد', 1, 2],
]
const BY_KIND: Record<StationKind, T[]> = {
  valve: [['mechanical', 'نصب شیر خطی و شیرهای بای‌پس', 'عدد', 3, 3], ['mechanical', 'نصب اکچویتور شیر', 'عدد', 1, 2]],
  launcher: [['mechanical', 'نصب تلهٔ ارسال توپک', 'عدد', 1, 4], ['mechanical', 'نصب شیرهای ایستگاه', 'عدد', 6, 2]],
  receiver: [['mechanical', 'نصب تلهٔ دریافت توپک', 'عدد', 1, 4], ['mechanical', 'نصب شیرهای ایستگاه', 'عدد', 6, 2]],
  launcher_receiver: [['mechanical', 'نصب تلهٔ ارسال و دریافت توپک', 'عدد', 2, 4], ['mechanical', 'نصب شیرهای ایستگاه', 'عدد', 10, 2]],
  pcs: [['mechanical', 'نصب فیلترها و جداکننده', 'عدد', 2, 3], ['mechanical', 'نصب رگولاتورها و شیرهای اطمینان', 'عدد', 4, 3], ['mechanical', 'نصب هیتر', 'عدد', 1, 3], ['mechanical', 'نصب میترینگ', 'عدد', 1, 2]],
  cgs: [['mechanical', 'نصب فیلترها', 'عدد', 2, 3], ['mechanical', 'نصب رگولاتورها', 'عدد', 2, 3], ['mechanical', 'نصب هیتر', 'عدد', 1, 3], ['mechanical', 'نصب بودارکننده و کنتور', 'عدد', 2, 2]],
  other: [['mechanical', 'نصب تجهیزات مکانیکی', 'عدد', 1, 2]],
}
export function scopeTemplate(kind: StationKind): Omit<Item, 'id' | 'stationId' | 'plannedStart' | 'plannedFinish'>[] {
  return [...COMMON.slice(0, 6), ...BY_KIND[kind], ...COMMON.slice(6)].map(([discipline, title, unit, qty, weight], i) => ({ discipline, code: `${discipline.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(2, '0')}`, title, unit, qty, weight, sort: i }))
}

/** a weld register row from a spreadsheet (column names in Persian or English) */
export function weldFromSheet(r: Record<string, unknown>): Partial<Weld> & { weldNo: string } | null {
  const g = (...ks: string[]) => { for (const k of Object.keys(r)) if (ks.some((x) => k.trim().toLowerCase() === x.toLowerCase())) return r[k]; return undefined }
  const no = String(g('weld no', 'weld_no', 'weld', 'شماره جوش', 'شمارهٔ جوش', 'joint') ?? '').trim()
  if (!no) return null
  const num = (v: unknown) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))
  const date = (v: unknown) => { const s = String(v ?? '').trim(); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null }
  const jt = String(g('type', 'joint type', 'نوع') ?? 'BW').toUpperCase().trim()
  const res = String(g('ndt result', 'result', 'نتیجه') ?? '').toLowerCase()
  return {
    weldNo: no, sizeIn: num(g('size', 'size_in', 'dia', 'قطر', 'سایز')) ?? 0, thkMm: num(g('thk', 'thickness', 'ضخامت')),
    jointType: (['BW', 'SW', 'FW', 'BR'].includes(jt) ? jt : 'BW') as JointType, material: String(g('material', 'جنس') ?? ''), wps: String(g('wps') ?? ''),
    welder: String(g('welder', 'جوشکار', 'stamp') ?? ''), fitupDate: date(g('fit up', 'fitup', 'fitup date')), weldDate: date(g('weld date', 'تاریخ جوش', 'date')),
    ndtMethod: String(g('ndt', 'ndt method', 'روش') ?? 'RT') || 'RT', ndtDate: date(g('ndt date', 'تاریخ ndt')),
    ndtResult: (/acc|قبول|ok/.test(res) ? 'accepted' : /rej|مردود|rep/.test(res) ? 'rejected' : 'pending') as NdtResult,
  }
}
