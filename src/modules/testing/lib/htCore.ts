/**
 * Hydrostatic test and coating test rules — pure, so the module, the digital twin layer and the PSSR advisories agree.
 *
 * Sectioning a line for the hydrotest (the water column adds ρ·g·Δh to the pressure at every point below the highest one):
 *  - every point of a section must see at least the minimum test pressure  → the HIGH point gets P_min = factor × design pressure
 *  - no point may be stressed beyond the limit                              → the LOW point gets at most P_max = limit × P(SMYS)
 *  so a section may span at most Δh_max = (P_max − P_min) / (ρ·g) of elevation, and at most a maximum length. The line is cut
 *  greedily along its profile; a forced cut moves back to the nearest preferred break (a valve, a station) when there is one.
 *  Barlow: hoop stress σ = P·D / (2·t).
 */

export interface ProfilePoint { km: number; elev: number }
export interface HtParams {
  odMm: number
  wtMm: number
  smysMpa: number
  designPressureBar: number
  /** minimum test pressure at the high point = factor × design pressure (strength test) */
  testFactor: number
  /** maximum hoop stress at the low point, % of SMYS */
  maxHoopPct: number
  maxSectionKm: number
  minSectionKm: number
  /** kg/m³ of the test medium (water ≈ 1000) */
  density: number
}
export const DEFAULT_HT: Omit<HtParams, 'odMm' | 'wtMm' | 'smysMpa' | 'designPressureBar'> = { testFactor: 1.25, maxHoopPct: 95, maxSectionKm: 20, minSectionKm: 1, density: 1000 }

/** SMYS (MPa) of an API 5L grade named in the material text («API 5L X70» → 483) */
export function smysOf(material: string): number | null {
  const m = /X\s?(42|46|52|56|60|65|70|80)\b/i.exec(material)
  if (m) return ({ 42: 290, 46: 317, 52: 359, 56: 386, 60: 414, 65: 448, 70: 483, 80: 552 } as Record<string, number>)[m[1]]
  return /\bgr(?:ade)?\.?\s*B\b|\b5L\s*B\b/i.test(material) ? 241 : null
}
/** bar of pressure per metre of medium column */
export const barPerM = (density: number) => (density * 9.80665) / 1e5
/** hoop stress (MPa) at a pressure (bar) — Barlow */
export const hoopMpa = (pBar: number, odMm: number, wtMm: number) => (pBar / 10) * odMm / (2 * wtMm)
/** pressure (bar) that stresses the pipe to `pct` % of SMYS */
export const pressureAtPct = (pct: number, smysMpa: number, odMm: number, wtMm: number) => ((pct / 100) * smysMpa * 2 * wtMm / odMm) * 10

/** a polyline's profile: cumulative km (from `startKm`) and elevation, for points that carry an elevation */
export function profileOf(points: { lon: number; lat: number; elevation: number | null }[], startKm = 0): ProfilePoint[] {
  const R = 6371008.8, rad = Math.PI / 180
  const out: ProfilePoint[] = []
  let d = 0
  for (let i = 0; i < points.length; i++) {
    if (i) {
      const a = points[i - 1], b = points[i]
      const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2
      d += 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
    }
    const e = points[i].elevation
    if (e != null && Number.isFinite(e)) out.push({ km: startKm + d / 1000, elev: e })
  }
  return out
}
/** true when the elevations are a real profile (not a flat / clamped-to-ground line) */
export const hasRealProfile = (p: ProfilePoint[]) => p.length >= 2 && Math.max(...p.map((x) => x.elev)) - Math.min(...p.map((x) => x.elev)) > 1

/** elevation at km (linear between profile points) */
export function elevAt(p: ProfilePoint[], km: number): number {
  if (km <= p[0].km) return p[0].elev
  for (let i = 1; i < p.length; i++) if (km <= p[i].km) { const a = p[i - 1], b = p[i]; return b.km === a.km ? b.elev : a.elev + ((km - a.km) / (b.km - a.km)) * (b.elev - a.elev) }
  return p[p.length - 1].elev
}
/** the profile resampled every `stepKm` (plus every original vertex), so a steep stretch cannot jump over the limit */
export function densify(p: ProfilePoint[], stepKm = 0.1): ProfilePoint[] {
  const out: ProfilePoint[] = []
  for (let i = 0; i < p.length; i++) {
    if (i) { const a = p[i - 1], b = p[i]; const n = Math.floor((b.km - a.km) / stepKm); for (let k = 1; k < n; k++) { const km = a.km + k * stepKm; out.push({ km, elev: elevAt(p, km) }) } }
    out.push(p[i])
  }
  return out
}

export interface SectionPlan {
  seq: number
  kmFrom: number; kmTo: number; lengthKm: number
  elevMin: number; elevMinKm: number; elevMax: number; elevMaxKm: number
  /** test pressure at the high point (the minimum) and at the low point (the maximum), bar */
  pHigh: number; pLow: number
  hoopLowPct: number; hoopHighPct: number
  /** the end of the section where the test head sits (the lower end: the gauge then reads the highest pressure) */
  headKm: number; pHead: number
  volumeM3: number
  /** why the section ends here */
  cut: 'elevation' | 'length' | 'preferred' | 'end'
}

/** figures of one section [a, b] on the profile */
export function sectionFigures(p: ProfilePoint[], a: number, b: number, x: HtParams): Omit<SectionPlan, 'seq' | 'cut'> {
  const pts = [{ km: a, elev: elevAt(p, a) }, ...p.filter((q) => q.km > a && q.km < b), { km: b, elev: elevAt(p, b) }]
  let lo = pts[0], hi = pts[0]
  for (const q of pts) { if (q.elev < lo.elev) lo = q; if (q.elev > hi.elev) hi = q }
  const g = barPerM(x.density)
  const pHigh = x.testFactor * x.designPressureBar
  const pLow = pHigh + g * (hi.elev - lo.elev)
  const pSmys = pressureAtPct(100, x.smysMpa, x.odMm, x.wtMm)
  const ea = elevAt(p, a), eb = elevAt(p, b)
  const headKm = eb < ea ? b : a
  const idM = (x.odMm - 2 * x.wtMm) / 1000
  return {
    kmFrom: a, kmTo: b, lengthKm: b - a,
    elevMin: lo.elev, elevMinKm: lo.km, elevMax: hi.elev, elevMaxKm: hi.km,
    pHigh, pLow, hoopLowPct: (pLow / pSmys) * 100, hoopHighPct: (pHigh / pSmys) * 100,
    headKm, pHead: pHigh + g * (hi.elev - Math.min(ea, eb)),
    volumeM3: Math.PI / 4 * idM * idM * (b - a) * 1000,
  }
}

export interface SectionResult { sections: SectionPlan[]; maxDeltaH: number; pMin: number; pMax: number; error: string | null }

/** Cuts the profile into hydrotest sections (see the file header). */
export function sectionize(profile: ProfilePoint[], x: HtParams, preferredKm: number[] = []): SectionResult {
  const g = barPerM(x.density)
  const pMin = x.testFactor * x.designPressureBar
  const pMax = pressureAtPct(x.maxHoopPct, x.smysMpa, x.odMm, x.wtMm)
  const maxDeltaH = (pMax - pMin) / g
  const empty = { sections: [], maxDeltaH, pMin, pMax }
  if (profile.length < 2) return { ...empty, error: 'پروفیل ارتفاعی خط در دسترس نیست.' }
  if (maxDeltaH <= 0) return { ...empty, error: `با این لوله و فشار طراحی، فشار آزمون (${pMin.toFixed(1)} bar) از حد تنش مجاز (${pMax.toFixed(1)} bar) بیشتر است.` }
  const p = densify([...profile].sort((a, b) => a.km - b.km))
  const end = p[p.length - 1].km
  const prefs = [...new Set(preferredKm)].filter((k) => k > p[0].km && k < end).sort((a, b) => a - b)
  const out: SectionPlan[] = []
  let start = p[0].km
  let i = 0
  while (start < end - 1e-9) {
    let lo = elevAt(p, start), hi = lo, lastOk = start, cut: SectionPlan['cut'] = 'end'
    while (i < p.length && p[i].km <= start) i++
    for (; i < p.length; i++) {
      const q = p[i]
      const nlo = Math.min(lo, q.elev), nhi = Math.max(hi, q.elev)
      if (nhi - nlo > maxDeltaH) { cut = 'elevation'; break }
      if (q.km - start > x.maxSectionKm) { cut = 'length'; break }
      lo = nlo; hi = nhi; lastOk = q.km
    }
    let to = i >= p.length ? end : lastOk
    if (cut === 'length' && to === start) to = Math.min(end, start + x.maxSectionKm)
    if (to <= start) to = p[Math.min(i, p.length - 1)].km // a single step steeper than the limit: cut anyway
    if (cut !== 'end') {
      // move back to a preferred break (valve / station) when one lies in the section and leaves a sensible length
      const pref = prefs.filter((k) => k > start + x.minSectionKm && k <= to).pop()
      if (pref != null) { to = pref; cut = 'preferred' }
    }
    out.push({ seq: out.length + 1, cut, ...sectionFigures(p, start, to, x) })
    start = to
    i = 0
  }
  return { sections: out, maxDeltaH, pMin, pMax, error: null }
}

// ── test record ─────────────────────────────────────────────────────────────
export type HtStage = 'planned' | 'cleaning' | 'filling' | 'stabilization' | 'strength' | 'leak' | 'dewatering' | 'accepted'
export const HT_STAGES: HtStage[] = ['planned', 'cleaning', 'filling', 'stabilization', 'strength', 'leak', 'dewatering', 'accepted']
export const HT_STAGE_FA: Record<HtStage, string> = { planned: 'برنامه‌ریزی‌شده', cleaning: 'پیگ‌رانی و گیجینگ', filling: 'آبگیری', stabilization: 'تثبیت دما و فشار', strength: 'آزمون مقاومت', leak: 'آزمون نشتی', dewatering: 'تخلیه و خشک‌کردن', accepted: 'پذیرفته‌شده' }
export const HT_STAGE_COLOR: Record<HtStage, string> = { planned: '#64748b', cleaning: '#a78bfa', filling: '#38bdf8', stabilization: '#06b6d4', strength: '#f59e0b', leak: '#f97316', dewatering: '#84cc16', accepted: '#22c55e' }
export const HT_FAILED_COLOR = '#ef4444'

export interface Reading { at: string; phase: string; pressureBar: number; tempC: number | null }
/** a hold period: how long the readings of `phase` cover and how much the pressure dropped over it */
export function evaluateHold(readings: Reading[], phase: string, holdH: number, allowedDropBar: number) {
  const r = readings.filter((x) => x.phase === phase).sort((a, b) => a.at.localeCompare(b.at))
  if (r.length < 2) return { readings: r.length, hours: 0, drop: 0, tempChange: null as number | null, longEnough: false, ok: false }
  const hours = (Date.parse(r[r.length - 1].at) - Date.parse(r[0].at)) / 3600000
  const drop = r[0].pressureBar - r[r.length - 1].pressureBar
  const t0 = r[0].tempC, t1 = r[r.length - 1].tempC
  const longEnough = hours >= holdH - 1e-6
  return { readings: r.length, hours, drop, tempChange: t0 != null && t1 != null ? t1 - t0 : null, longEnough, ok: longEnough && drop <= allowedDropBar }
}
/** what must be true to move a test from `stage` to the next one (null = allowed) */
export function advanceBlocker(stage: HtStage, readings: Reading[], cfg: { strengthHoldH: number; leakHoldH: number; allowedDropBar: number; minStrengthBar?: number }): string | null {
  if (stage === 'strength') {
    const h = evaluateHold(readings, 'strength', cfg.strengthHoldH, cfg.allowedDropBar)
    if (!h.longEnough) return `آزمون مقاومت باید دست‌کم ${cfg.strengthHoldH} ساعت نگه داشته و ثبت شود (اکنون ${h.hours.toFixed(1)} ساعت).`
    if (cfg.minStrengthBar != null && readings.some((x) => x.phase === 'strength' && x.pressureBar < cfg.minStrengthBar! - 1e-6)) return `فشار در آزمون مقاومت زیر حداقل ${cfg.minStrengthBar.toFixed(1)} bar رفته است.`
    if (!h.ok) return `افت فشار ${h.drop.toFixed(2)} bar بیش از حد مجاز ${cfg.allowedDropBar} bar است؛ علت (نشتی یا تغییر دما) بررسی شود.`
  }
  if (stage === 'leak') {
    const h = evaluateHold(readings, 'leak', cfg.leakHoldH, cfg.allowedDropBar)
    if (!h.longEnough) return `آزمون نشتی باید دست‌کم ${cfg.leakHoldH} ساعت ثبت شود (اکنون ${h.hours.toFixed(1)} ساعت).`
    if (!h.ok) return `افت فشار ${h.drop.toFixed(2)} bar در آزمون نشتی بیش از حد مجاز است.`
  }
  return null
}

// ── coating ─────────────────────────────────────────────────────────────────
export type CoatingKind = 'holiday' | 'dcvg' | 'cips' | 'adhesion' | 'dft'
export const COATING_KIND_FA: Record<CoatingKind, string> = { holiday: 'هالیدی (Holiday / Spark test)', dcvg: 'DCVG پس از خاک‌ریزی', cips: 'CIPS (پتانسیل فاصله‌نزدیک)', adhesion: 'چسبندگی (Peel / Pull-off)', dft: 'ضخامت پوشش (DFT)' }
/** total km of a set of [from, to] ranges, overlaps counted once */
export function coveredKm(ranges: [number, number][]): number {
  const r = ranges.map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number]).sort((a, b) => a[0] - b[0])
  let total = 0, cs = -Infinity, ce = -Infinity
  for (const [a, b] of r) {
    if (a > ce) { if (ce > cs) total += ce - cs; cs = a; ce = b } else ce = Math.max(ce, b)
  }
  if (ce > cs) total += ce - cs
  return total
}

/** joint numbers (each joint closes the `stockLengthM` of pipe before it) → merged km ranges on the project chainage */
export function rangesOfJoints(nos: number[], stockLengthM: number, startKm: number): [number, number][] {
  const sorted = [...new Set(nos)].sort((a, b) => a - b)
  const out: [number, number][] = []
  for (const no of sorted) {
    const a = startKm + ((no - 1) * stockLengthM) / 1000, b = startKm + (no * stockLengthM) / 1000
    const last = out[out.length - 1]
    if (last && Math.abs(last[1] - a) < 1e-9) last[1] = b
    else out.push([a, b])
  }
  return out
}
/** km of [a, b] covered by the ranges */
export function overlapKm(a: number, b: number, ranges: [number, number][]): number {
  return ranges.reduce((n, [x, y]) => n + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0)
}
