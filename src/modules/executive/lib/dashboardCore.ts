/**
 * Portfolio dashboard: geography, budget absorption, trend, delay, warnings and cross-project summaries — all derived
 * from the same portfolio views the other tabs use, so a figure on the dashboard agrees with the tab behind it.
 * Pure: no store, no network.
 */
import type { PfProjectView } from './portfolioCore'

/* ── geography ─────────────────────────────────────────────────────── */

export interface Place { name: string; province: string; lat: number; lng: number }

/** province centres and the oil / gas / pipeline sites most often named in project titles */
export const PROVINCES: Place[] = [
  ['تهران', 35.69, 51.39], ['البرز', 35.84, 50.97], ['قم', 34.64, 50.88], ['مرکزی', 34.09, 49.69], ['قزوین', 36.27, 50.0],
  ['گیلان', 37.28, 49.58], ['مازندران', 36.56, 53.06], ['گلستان', 36.84, 54.43], ['خراسان رضوی', 36.3, 59.6], ['خراسان شمالی', 37.47, 57.33],
  ['خراسان جنوبی', 32.87, 59.22], ['سمنان', 35.58, 53.39], ['اصفهان', 32.65, 51.67], ['یزد', 31.9, 54.37], ['کرمان', 30.28, 57.08],
  ['سیستان و بلوچستان', 29.5, 60.86], ['هرمزگان', 27.18, 56.27], ['بوشهر', 28.97, 50.84], ['فارس', 29.59, 52.58], ['کهگیلویه و بویراحمد', 30.67, 51.59],
  ['چهارمحال و بختیاری', 32.33, 50.86], ['خوزستان', 31.32, 48.67], ['لرستان', 33.49, 48.36], ['ایلام', 33.64, 46.42], ['کرمانشاه', 34.31, 47.07],
  ['کردستان', 35.31, 47.0], ['همدان', 34.8, 48.51], ['زنجان', 36.67, 48.48], ['آذربایجان شرقی', 38.08, 46.29], ['آذربایجان غربی', 37.55, 45.08], ['اردبیل', 38.25, 48.29],
].map(([n, lat, lng]) => ({ name: n as string, province: n as string, lat: lat as number, lng: lng as number }))

const SITES: Place[] = [
  ['عسلویه', 'بوشهر', 27.47, 52.61], ['پارس جنوبی', 'بوشهر', 27.47, 52.61], ['کنگان', 'بوشهر', 27.83, 52.06], ['جم', 'بوشهر', 27.83, 52.33], ['خارگ', 'بوشهر', 29.25, 50.32],
  ['بندرعباس', 'هرمزگان', 27.18, 56.27], ['قشم', 'هرمزگان', 26.95, 56.27], ['جاسک', 'هرمزگان', 25.64, 57.77], ['چابهار', 'سیستان و بلوچستان', 25.29, 60.64], ['زاهدان', 'سیستان و بلوچستان', 29.5, 60.86],
  ['اهواز', 'خوزستان', 31.32, 48.67], ['آبادان', 'خوزستان', 30.34, 48.3], ['ماهشهر', 'خوزستان', 30.56, 49.2], ['مسجدسلیمان', 'خوزستان', 31.94, 49.3], ['بیدبلند', 'خوزستان', 30.73, 50.13], ['امیدیه', 'خوزستان', 30.76, 49.71],
  ['گچساران', 'کهگیلویه و بویراحمد', 30.36, 50.8], ['یاسوج', 'کهگیلویه و بویراحمد', 30.67, 51.59], ['شیراز', 'فارس', 29.59, 52.58], ['لامرد', 'فارس', 27.34, 53.18],
  ['کوهدشت', 'لرستان', 33.53, 47.61], ['خرم‌آباد', 'لرستان', 33.49, 48.36], ['سرخس', 'خراسان رضوی', 36.54, 61.16], ['مشهد', 'خراسان رضوی', 36.3, 59.6], ['بجنورد', 'خراسان شمالی', 37.47, 57.33], ['بیرجند', 'خراسان جنوبی', 32.87, 59.22],
  ['تبریز', 'آذربایجان شرقی', 38.08, 46.29], ['ارومیه', 'آذربایجان غربی', 37.55, 45.08], ['سنندج', 'کردستان', 35.31, 47.0], ['اراک', 'مرکزی', 34.09, 49.69], ['کاشان', 'اصفهان', 33.98, 51.43],
  ['رشت', 'گیلان', 37.28, 49.58], ['ساری', 'مازندران', 36.56, 53.06], ['نکا', 'مازندران', 36.65, 53.3], ['گرگان', 'گلستان', 36.84, 54.43], ['دماوند', 'تهران', 35.72, 52.07], ['ری', 'تهران', 35.59, 51.43],
].map(([n, p, lat, lng]) => ({ name: n as string, province: p as string, lat: lat as number, lng: lng as number }))

const norm = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').replace(/\s+/g, ' ')

/** the first place named in the text (sites before provinces, longer names before shorter); null when none is named */
export function locate(text: string | null | undefined): Place | null {
  if (!text) return null
  const t = norm(text)
  const all = [...SITES, ...PROVINCES].map((p) => ({ p, at: t.indexOf(norm(p.name)) })).filter((x) => x.at >= 0)
  if (!all.length) return null
  all.sort((a, b) => a.at - b.at || b.p.name.length - a.p.name.length)
  return all[0].p
}

/** where a project sits: its recorded location first, then a place named in its title */
export function projectPlace(p: { location?: string | null; name: string }): { place: Place; from: 'location' | 'name' } | null {
  const a = locate(p.location)
  if (a) return { place: a, from: 'location' }
  const b = locate(p.name)
  return b ? { place: b, from: 'name' } : null
}

/** schematic outline of Iran (longitude, latitude), coarse — for orientation, not survey use */
export const IRAN_OUTLINE: [number, number][] = [
  [44.03, 39.38], [44.8, 39.71], [45.45, 38.88], [46.52, 38.87], [47.68, 39.5], [48.36, 39.37], [48.0, 38.8], [48.88, 38.43],
  [48.87, 37.95], [49.47, 37.47], [50.15, 37.25], [50.66, 36.92], [51.6, 36.65], [52.65, 36.7], [53.9, 36.92], [53.95, 37.3],
  [55.4, 37.95], [56.6, 38.1], [57.3, 38.05], [58.4, 37.6], [59.4, 37.35], [60.4, 36.65], [61.15, 36.6], [61.2, 35.6],
  [60.55, 34.3], [60.9, 33.55], [60.6, 32.95], [60.85, 31.5], [61.7, 31.4], [61.8, 30.85], [60.9, 29.85], [61.9, 28.6],
  [62.75, 28.25], [62.8, 27.25], [63.25, 27.1], [62.8, 26.3], [61.6, 25.2], [60.6, 25.3], [59.6, 25.4], [58.5, 25.55],
  [57.8, 25.65], [57.3, 26.4], [57.1, 27.05], [56.3, 27.18], [55.6, 26.9], [54.7, 26.5], [53.7, 26.75], [52.6, 27.35],
  [52.0, 27.82], [51.4, 28.0], [50.85, 28.85], [50.3, 29.6], [49.6, 30.0], [48.9, 30.4], [48.55, 29.95], [48.0, 30.45],
  [47.7, 31.0], [47.85, 31.75], [47.4, 32.4], [46.1, 33.0], [45.45, 33.9], [45.75, 34.6], [45.45, 35.95], [46.15, 35.75],
  [45.1, 36.95], [44.8, 37.2], [44.22, 37.95], [44.45, 38.35],
]
export const MAP_BOUNDS = { minLng: 43.8, maxLng: 63.5, minLat: 24.9, maxLat: 39.9 }
/** equirectangular with the width shrunk by cos(32°) so Iran keeps its shape */
export function project(lng: number, lat: number, width: number): [number, number] {
  const c = Math.cos((32 * Math.PI) / 180)
  const k = width / ((MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng) * c)
  return [(lng - MAP_BOUNDS.minLng) * c * k, (MAP_BOUNDS.maxLat - lat) * k]
}
export function mapHeight(width: number) { return project(MAP_BOUNDS.minLng, MAP_BOUNDS.minLat, width)[1] }

/* ── budget ────────────────────────────────────────────────────────── */

export interface Budget { total: number; absorbed: number; remaining: number; absorbedPct: number | null; projectsWithBudget: number; projectsWithCost: number }
/** total = budget of every project (EPC contract value, else contract value); absorbed = certified EPC cost */
export function budget(views: PfProjectView[]): Budget {
  const total = views.reduce((n, v) => n + (v.bac ?? 0), 0)
  const absorbed = views.reduce((n, v) => n + (v.input.snapshot?.ac ?? 0), 0)
  return { total, absorbed, remaining: Math.max(0, total - absorbed), absorbedPct: total > 0 ? (absorbed / total) * 100 : null, projectsWithBudget: views.filter((v) => (v.bac ?? 0) > 0).length, projectsWithCost: views.filter((v) => v.input.snapshot?.ac != null && (v.input.snapshot.ac as number) > 0).length }
}

/* ── progress and delay ────────────────────────────────────────────── */

/** budget-weighted lifecycle progress of the portfolio (projects without a budget weigh 1) */
export function weightedProgress(views: PfProjectView[]): { actual: number; planned: number; n: number } | null {
  const xs = views.filter((v) => v.input.snapshot)
  if (!xs.length) return null
  const w = (v: PfProjectView) => (v.bac && v.bac > 0 ? v.bac : 1)
  const W = xs.reduce((n, v) => n + w(v), 0)
  return { actual: xs.reduce((n, v) => n + w(v) * (v.input.snapshot as NonNullable<typeof v.input.snapshot>).actual, 0) / W, planned: xs.reduce((n, v) => n + w(v) * (v.input.snapshot as NonNullable<typeof v.input.snapshot>).planned, 0) / W, n: xs.length }
}

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { minimumFractionDigits: d, maximumFractionDigits: d })
const DAY = 86400000
const ms = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime()

/**
 * Earned-schedule delay: the date at which the plan reached what has been earned now, against the date of the last
 * measurement. `lowerBound` when the plan reached that value before the first point kept (the delay is at least that).
 */
export function earnedScheduleDelay(trend: { date: string; planned: number; earned: number | null }[] | undefined): { days: number; lowerBound: boolean } | null {
  const pts = (trend ?? []).filter((p) => Number.isFinite(p.planned))
  const lastE = [...pts].reverse().find((p) => p.earned != null)
  if (!lastE) return null
  const E = lastE.earned as number
  const upto = pts.filter((p) => p.date <= lastE.date)
  if (!upto.length) return null
  if (E >= upto[upto.length - 1].planned) return { days: 0, lowerBound: false }
  if (E < upto[0].planned) return { days: Math.round((ms(lastE.date) - ms(upto[0].date)) / DAY), lowerBound: true }
  for (let i = upto.length - 1; i > 0; i--) {
    const a = upto[i - 1], b = upto[i]
    if (a.planned <= E && E <= b.planned) {
      const f = b.planned === a.planned ? 1 : (E - a.planned) / (b.planned - a.planned)
      const t = ms(a.date) + f * (ms(b.date) - ms(a.date))
      return { days: Math.max(0, Math.round((ms(lastE.date) - t) / DAY)), lowerBound: false }
    }
  }
  return null
}

/** budget-weighted EPC planned / earned of the portfolio at each month end that some project reports */
export function portfolioTrend(views: PfProjectView[]): { date: string; planned: number; earned: number | null; n: number }[] {
  const xs = views.filter((v) => v.input.snapshot?.trend?.length)
  const dates = [...new Set(xs.flatMap((v) => v.input.snapshot!.trend!.map((p) => p.date)))].sort()
  return dates.map((d) => {
    let W = 0, P = 0, We = 0, Ea = 0, n = 0
    for (const v of xs) {
      const p = v.input.snapshot!.trend!.find((x) => x.date === d)
      if (!p) continue
      const w = v.input.snapshot!.bacEvm > 0 ? v.input.snapshot!.bacEvm : 1
      W += w; P += w * p.planned; n++
      if (p.earned != null) { We += w; Ea += w * p.earned }
    }
    return { date: d, planned: W ? P / W : 0, earned: We ? Ea / We : null, n }
  }).filter((p) => p.n > 0)
}

/* ── status ────────────────────────────────────────────────────────── */

export type Status = 'critical' | 'attention' | 'good' | 'unknown'
export const STATUS_FA: Record<Status, { label: string; tone: string }> = {
  critical: { label: 'بحرانی', tone: '#ef4444' }, attention: { label: 'نیازمند توجه', tone: '#f59e0b' }, good: { label: 'خوب', tone: '#22c55e' }, unknown: { label: 'بدون داده', tone: '#94a3b8' },
}
export function statusOf(v: PfProjectView): Status {
  if (v.health === 'black' || v.health === 'red') return 'critical'
  if (v.health === 'yellow') return 'attention'
  if (v.health === 'green') return 'good'
  return 'unknown'
}
export const gapOf = (v: PfProjectView) => (v.input.snapshot ? v.input.snapshot.actual - v.input.snapshot.planned : null)
export const vacPct = (v: PfProjectView) => (v.vac != null && v.bac ? (v.vac / v.bac) * 100 : null)

/** the reason a critical project needs attention, from the record that made it critical */
export function whyCritical(v: PfProjectView): string {
  const s = v.input.snapshot
  if (v.health === 'black' && s?.blockers?.length) return `گیت مسدود: ${s.blockers[0]}`
  if (s?.drivenBy) return `عامل اصلی: ${s.drivenBy}`
  if (s?.spi != null && s.spi < 0.9) return `SPI ${fa(s.spi, 2)}`
  if (v.input.delivery?.criticalMilestonesDelayed) return `${fa(v.input.delivery.criticalMilestonesDelayed)} مایلستون بحرانی عقب`
  return 'وضعیت سلامت قرمز'
}

/* ── warnings, achievements ────────────────────────────────────────── */

export interface Warn { key: string; projectId: string; project: string; kind: string; severity: 'high' | 'medium'; text: string }
/** rule-based signals from the views: a blocked gate, indexes under 0.9, overrun, delayed critical milestones, overdue review */
export function warnings(views: PfProjectView[], today: string): Warn[] {
  const out: Warn[] = []
  for (const v of views) {
    const s = v.input.snapshot, id = v.input.id, name = v.input.name
    if (v.health === 'black' && s?.blockers?.length) out.push({ key: `g-${id}`, projectId: id, project: name, kind: 'گیت مسدود', severity: 'high', text: s.blockers[0] })
    if (s?.spi != null && s.spi < 0.9) out.push({ key: `s-${id}`, projectId: id, project: name, kind: 'عقب‌ماندگی زمانی', severity: s.spi < 0.8 ? 'high' : 'medium', text: `SPI ${fa(s.spi, 2)}` })
    if (s?.cpi != null && s.cpi > 0 && s.cpi < 0.9) out.push({ key: `c-${id}`, projectId: id, project: name, kind: 'افزایش هزینه', severity: s.cpi < 0.8 ? 'high' : 'medium', text: `CPI ${fa(s.cpi, 2)}` })
    const vp = vacPct(v)
    if (vp != null && vp <= -5) out.push({ key: `v-${id}`, projectId: id, project: name, kind: 'پیش‌بینی بیش‌هزینه', severity: vp <= -10 ? 'high' : 'medium', text: `${fa(Math.abs(vp), 1)}٪ بیش از بودجه` })
    if (v.input.delivery?.criticalMilestonesDelayed) out.push({ key: `m-${id}`, projectId: id, project: name, kind: 'تأخیر مایلستون', severity: 'high', text: `${fa(v.input.delivery.criticalMilestonesDelayed)} مایلستون بحرانی عقب‌افتاده` })
    if (v.lastDecision?.reviewBy && v.lastDecision.reviewBy.slice(0, 10) < today) out.push({ key: `r-${id}`, projectId: id, project: name, kind: 'بازبینی تصمیم', severity: 'medium', text: 'موعد بازبینی تصمیم سبد گذشته' })
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1))
}

export interface Achievement { key: string; text: string; kind: 'achievement' | 'opportunity' }
/** what is going well, only from measured records; opportunities are high-priority projects in good health */
export function achievements(views: PfProjectView[]): Achievement[] {
  const out: Achievement[] = []
  for (const v of views) {
    const s = v.input.snapshot
    if (s?.spi != null && s.cpi != null && s.spi >= 1 && s.cpi >= 1) out.push({ key: `a-${v.input.id}`, kind: 'achievement', text: `${v.input.name}: جلوتر از برنامه و زیر بودجه (SPI ${fa(s.spi, 2)} · CPI ${fa(s.cpi, 2)})` })
    else if (s && s.actual - s.planned >= 2) out.push({ key: `p-${v.input.id}`, kind: 'achievement', text: `${v.input.name}: ${fa((s.actual - s.planned), 1)} واحد درصد جلوتر از برنامه` })
  }
  const ranked = views.filter((v) => v.priority != null && v.health === 'green').sort((a, b) => (b.priority as number) - (a.priority as number)).slice(0, 2)
  for (const v of ranked) out.push({ key: `o-${v.input.id}`, kind: 'opportunity', text: `${v.input.name}: اولویت ${fa(Math.round(v.priority as number))} با سلامت سبز — گزینهٔ تسریع یا تخصیص منابع بیشتر` })
  return out
}

/* ── programs, contractors ─────────────────────────────────────────── */

export function byGroup(views: PfProjectView[], keyOf: (v: PfProjectView) => string | null, nameOf: (k: string) => string) {
  const m = new Map<string, PfProjectView[]>()
  for (const v of views) { const k = keyOf(v); if (k) m.set(k, [...(m.get(k) ?? []), v]) }
  return [...m].map(([k, vs]) => {
    const wp = weightedProgress(vs)
    const spis = vs.map((v) => v.input.snapshot?.spi).filter((x): x is number => x != null)
    return { key: k, name: nameOf(k), count: vs.length, actual: wp?.actual ?? null, planned: wp?.planned ?? null, spi: spis.length ? spis.reduce((a, b) => a + b, 0) / spis.length : null, critical: vs.filter((v) => statusOf(v) === 'critical').length }
  }).sort((a, b) => b.count - a.count)
}
