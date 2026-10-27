import type { EstBenchmark, EstFullInputs, EstMethod, EstProjectDraft, EstResults } from '../types'
import { computeEstimate, estimateRange, maturityOf } from './calc'

/* ---------------------------------------------------------------------------
 * Estimating methods.
 *
 *  parametric  bottom-up from the organisation's unit rates (computeEstimate).
 *  historical  the library's typical cost per inch-km (median, in today's money) × the project's
 *              inch-km; onshore costs are brought to a flat-ground equivalent first and then
 *              re-scaled by the project's own terrain factor.
 *  analog      the few library projects closest in diameter and length, each scaled to this
 *              project (economies of scale on diameter and length), weighted by closeness.
 *  blended     weighted average of whichever of the three have data.
 *
 * Library rows are pipeline costs; when a project includes a compressor station and the rows
 * used do not, the parametric cost of the station (with its share of overheads and reserves) is
 * added so the methods stay comparable.
 * ------------------------------------------------------------------------- */

export const METHOD_META: Record<EstMethod, { label: string; short: string; color: string; hint: string }> = {
  parametric: { label: 'پارامتریک (نرخ واحد)', short: 'پارامتریک', color: '#3987e5', hint: 'جمع اجزای پروژه با نرخ‌های واحد مبانی برآورد؛ ساختار شکست هزینه کامل دارد.' },
  historical: { label: 'تاریخی (میانگین کتابخانه)', short: 'تاریخی', color: '#199e70', hint: 'هزینهٔ هر اینچ‌-کیلومتر پروژه‌های اخیر کتابخانه، به‌روزشده به قیمت امروز.' },
  analog: { label: 'قیاسی (پروژه‌های مشابه)', short: 'قیاسی', color: '#9085e9', hint: 'نزدیک‌ترین پروژه‌های کتابخانه از نظر قطر و طول، مقیاس‌شده به این پروژه.' },
  blended: { label: 'ترکیبی (میانگین وزنی)', short: 'ترکیبی', color: '#F2B705', hint: 'میانگین وزنی روش‌هایی که داده دارند؛ وزن‌ها قابل تنظیم است.' },
}

export const DEFAULT_WEIGHTS = { parametric: 0.5, historical: 0.25, analog: 0.25 }
export const DEFAULT_BENCH_ESCALATION = 0.04
export const TERRAIN_FACTOR: Record<EstBenchmark['terrain'], number> = { flat: 1, mixed: 1.3, mountain: 1.65 }
export const TERRAIN_LABEL: Record<EstBenchmark['terrain'], string> = { flat: 'دشت', mixed: 'ترکیبی', mountain: 'کوهستانی' }
export const SETTING_LABEL: Record<EstBenchmark['setting'], string> = { onshore: 'خشکی', offshore: 'دریایی', mixed: 'خشکی و دریایی' }
/** scale exponents: cost grows a little slower than diameter and almost linearly with length */
const fa = (n: number) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
const DIAMETER_EXP = 0.8
const LENGTH_EXP = 0.95

export function toEur(amount: number, currency: EstBenchmark['currency'], fxRialPerEur?: number | null, fxEurPerUsd?: number | null) {
  if (currency === 'EUR') return amount
  if (currency === 'USD') return amount * (fxEurPerUsd || 0.92)
  return fxRialPerEur ? amount / fxRialPerEur : 0
}

export function escalate(costEur: number, costYear: number, nowYear: number, rate: number) {
  return costEur * Math.pow(1 + rate, Math.max(0, nowYear - costYear))
}

export function benchmarkMetrics(b: Pick<EstBenchmark, 'costEur' | 'costYear' | 'lengthKm' | 'diameterIn' | 'terrain' | 'setting'>, nowYear: number, rate: number) {
  const eurNow = escalate(b.costEur, b.costYear, nowYear, rate)
  const perKm = eurNow / b.lengthKm
  const perInchKm = perKm / b.diameterIn
  const flatPerInchKm = b.setting === 'offshore' ? perInchKm : perInchKm / TERRAIN_FACTOR[b.terrain]
  return { eurNow, perKm, perInchKm, flatPerInchKm }
}

export function stats(values: number[]) {
  const v = [...values].filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  const q = (p: number) => {
    if (!v.length) return 0
    const i = (v.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i)
    return v[lo] + (v[hi] - v[lo]) * (i - lo)
  }
  return { n: v.length, mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0, median: q(0.5), p25: q(0.25), p75: q(0.75), min: v[0] ?? 0, max: v[v.length - 1] ?? 0 }
}

export interface MethodResult {
  method: EstMethod
  available: boolean
  reason?: string
  eur: number
  low: number
  high: number
  /** library rows used, with their scaled contribution when it applies */
  used: { id: string; name: string; eur?: number }[]
  note: string
}

interface Ctx { project: EstProjectDraft; inputs: EstFullInputs; benchmarks: EstBenchmark[]; nowYear: number }

function pools(benchmarks: EstBenchmark[], setting: 'onshore' | 'offshore') {
  const exact = benchmarks.filter((b) => b.setting === setting)
  return exact.length ? exact : benchmarks.filter((b) => b.setting === 'mixed')
}

/** the compressor station's full parametric cost in euros (direct + its share of overheads and reserves) */
function compressorEur(ctx: Ctx, rows: EstBenchmark[]) {
  if (!ctx.project.hasCompressorStation) return 0
  if (rows.length && rows.filter((b) => b.hasCompressor).length * 2 >= rows.length) return 0
  const r = computeEstimate(ctx.project, ctx.inputs)
  const c = r.sections.find((s) => s.key === 'compressor')?.totalUsd ?? 0
  return r.direct ? c * (r.grand / r.direct) * ctx.inputs.overhead.fxEurPerUsd : 0
}

const rateOf = (inputs: EstFullInputs) => inputs.overhead.benchEscalation ?? DEFAULT_BENCH_ESCALATION

export function parametricMethod(ctx: Ctx): MethodResult {
  const r = computeEstimate(ctx.project, ctx.inputs)
  const eur = r.grand * ctx.inputs.overhead.fxEurPerUsd
  const rg = estimateRange(eur, maturityOf(ctx.inputs))
  return { method: 'parametric', available: eur > 0, eur, low: rg.low, high: rg.high, used: [], note: 'جمع اجزا با نرخ‌های واحد؛ بازه از مرحلهٔ تعریف پروژه.' }
}

export function historicalMethod(ctx: Ctx): MethodResult {
  const { project, inputs, nowYear } = ctx
  const rate = rateOf(inputs)
  let eur = 0, low = 0, high = 0
  const used: MethodResult['used'] = []
  const all: EstBenchmark[] = []
  const parts: [boolean, 'onshore' | 'offshore', number, number, number][] = [
    [project.hasOnshore, 'onshore', inputs.specs.onshore.lengthKm, inputs.specs.onshore.diameterIn, inputs.specs.onshore.terrain],
    [project.hasOffshore, 'offshore', inputs.specs.offshore.lengthKm, inputs.specs.offshore.diameterIn, 1],
  ]
  for (const [on, setting, km, inch, terrain] of parts) {
    if (!on) continue
    const rows = pools(ctx.benchmarks, setting)
    if (!rows.length) return { method: 'historical', available: false, reason: `پروژهٔ ${setting === 'onshore' ? 'خشکی' : 'دریایی'} در کتابخانه نیست`, eur: 0, low: 0, high: 0, used: [], note: '' }
    const st = stats(rows.map((b) => benchmarkMetrics(b, nowYear, rate).flatPerInchKm))
    const k = setting === 'onshore' ? terrain : 1
    eur += st.median * inch * km * k
    low += st.p25 * inch * km * k
    high += st.p75 * inch * km * k
    for (const b of rows) { used.push({ id: b.id, name: b.name }); all.push(b) }
  }
  const comp = compressorEur(ctx, all)
  return {
    method: 'historical', available: eur > 0, eur: eur + comp, low: low + comp, high: high + comp, used,
    note: `میانهٔ هزینهٔ هر اینچ‌-کیلومتر ${fa(used.length)} پروژه به قیمت امروز (تعدیل ${fa(Math.round(rate * 100))}٪ در سال)` + (comp ? '؛ ایستگاه تقویت فشار به روش پارامتریک افزوده شد.' : '.'),
  }
}

export function analogMethod(ctx: Ctx, k = 3): MethodResult {
  const { project, inputs, nowYear } = ctx
  const rate = rateOf(inputs)
  let eur = 0, low = 0, high = 0
  const used: MethodResult['used'] = []
  const all: EstBenchmark[] = []
  const parts: [boolean, 'onshore' | 'offshore', number, number, number][] = [
    [project.hasOnshore, 'onshore', inputs.specs.onshore.lengthKm, inputs.specs.onshore.diameterIn, inputs.specs.onshore.terrain],
    [project.hasOffshore, 'offshore', inputs.specs.offshore.lengthKm, inputs.specs.offshore.diameterIn, 1],
  ]
  for (const [on, setting, km, inch, terrain] of parts) {
    if (!on) continue
    const rows = pools(ctx.benchmarks, setting)
    if (!rows.length) return { method: 'analog', available: false, reason: `پروژهٔ مشابه ${setting === 'onshore' ? 'خشکی' : 'دریایی'} در کتابخانه نیست`, eur: 0, low: 0, high: 0, used: [], note: '' }
    const near = rows
      .map((b) => ({ b, d: Math.abs(Math.log(b.diameterIn / inch)) + 0.5 * Math.abs(Math.log(b.lengthKm / km)) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, k)
    let wsum = 0, acc = 0, mn = Infinity, mx = 0
    for (const { b, d } of near) {
      const m = benchmarkMetrics(b, nowYear, rate)
      const tf = setting === 'onshore' ? terrain / TERRAIN_FACTOR[b.terrain] : 1
      const scaled = m.eurNow * Math.pow(inch / b.diameterIn, DIAMETER_EXP) * Math.pow(km / b.lengthKm, LENGTH_EXP) * tf
      const w = 1 / (d + 0.05)
      wsum += w; acc += scaled * w
      mn = Math.min(mn, scaled); mx = Math.max(mx, scaled)
      used.push({ id: b.id, name: b.name, eur: scaled }); all.push(b)
    }
    eur += acc / wsum; low += mn; high += mx
  }
  const comp = compressorEur(ctx, all)
  return {
    method: 'analog', available: eur > 0, eur: eur + comp, low: low + comp, high: high + comp, used,
    note: `${fa(used.length)} پروژهٔ نزدیک از نظر قطر و طول، مقیاس‌شده و وزن‌دار بر اساس شباهت` + (comp ? '؛ ایستگاه تقویت فشار به روش پارامتریک افزوده شد.' : '.'),
  }
}

export function blendedMethod(parts: MethodResult[], weights = DEFAULT_WEIGHTS): MethodResult {
  const avail = parts.filter((p) => p.available && p.method !== 'blended')
  const w = avail.map((p) => weights[p.method as keyof typeof DEFAULT_WEIGHTS] ?? 0)
  const sum = w.reduce((a, b) => a + b, 0) || 1
  const mix = (f: (p: MethodResult) => number) => avail.reduce((a, p, i) => a + f(p) * (w[i] / sum), 0)
  return {
    method: 'blended', available: avail.length > 0, eur: mix((p) => p.eur), low: mix((p) => p.low), high: mix((p) => p.high), used: [],
    note: avail.map((p, i) => `${METHOD_META[p.method].short} ${fa(Math.round((w[i] / sum) * 100))}٪`).join(' + '),
  }
}

/** every method side by side, plus the one the estimate is based on */
export function runMethods(project: EstProjectDraft, inputs: EstFullInputs, benchmarks: EstBenchmark[], nowYear: number) {
  const ctx: Ctx = { project, inputs, benchmarks, nowYear }
  const p = parametricMethod(ctx), h = historicalMethod(ctx), a = analogMethod(ctx)
  const b = blendedMethod([p, h, a], inputs.weights ?? DEFAULT_WEIGHTS)
  const list = [p, h, a, b]
  const wanted = inputs.method ?? 'parametric'
  const chosen = list.find((m) => m.method === wanted && m.available) ?? p
  return { list, chosen, fellBack: chosen.method !== wanted }
}

/** Top-down allocation: the parametric breakdown scaled so its grand total equals the chosen
 * method's total — keeps the cost breakdown, cash flow and reports consistent with the number. */
export function scaleResults(r: EstResults, factor: number): EstResults {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return r
  const f = (n: number) => n * factor
  return {
    sections: r.sections.map((s) => ({ ...s, totalUsd: f(s.totalUsd) })),
    direct: f(r.direct), eng: f(r.eng), pm: f(r.pm), ins: f(r.ins), indirect: f(r.indirect),
    base: f(r.base), contingency: f(r.contingency), escalation: f(r.escalation), grand: f(r.grand),
  }
}

/** results the whole module shows: parametric structure, chosen method's total */
export function finalResults(project: EstProjectDraft, inputs: EstFullInputs, benchmarks: EstBenchmark[], nowYear: number) {
  const base = computeEstimate(project, inputs)
  const m = runMethods(project, inputs, benchmarks, nowYear)
  const paramEur = base.grand * inputs.overhead.fxEurPerUsd
  return { results: scaleResults(base, paramEur ? m.chosen.eur / paramEur : 1), methods: m, parametric: base }
}

/** library summary for the dashboard: medians per setting and the overall per-km picture */
export function librarySummary(benchmarks: EstBenchmark[], nowYear: number, rate = DEFAULT_BENCH_ESCALATION) {
  const by = (s: EstBenchmark['setting']) => benchmarks.filter((b) => b.setting === s).map((b) => benchmarkMetrics(b, nowYear, rate))
  const all = benchmarks.map((b) => benchmarkMetrics(b, nowYear, rate))
  return {
    count: benchmarks.length,
    actual: benchmarks.filter((b) => b.kind === 'actual').length,
    totalKm: benchmarks.reduce((a, b) => a + b.lengthKm, 0),
    perKm: stats(all.map((m) => m.perKm)),
    perInchKm: stats(all.map((m) => m.perInchKm)),
    onshore: stats(by('onshore').map((m) => m.perInchKm)),
    offshore: stats(by('offshore').map((m) => m.perInchKm)),
    mixed: stats(by('mixed').map((m) => m.perInchKm)),
  }
}
