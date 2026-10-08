import type { LandType, Parcel } from '../types'

/**
 * Reference unit prices (rial per m²) used until the project has its own data. They are a screening yardstick for spotting a
 * mistyped or unreasonable price, not a valuation — the official expert's opinion always decides the real price.
 */
export const BASE_PRICE: Record<LandType, number> = {
  desert: 1_200_000,
  rangeland: 1_000_000,
  forest: 1_500_000,
  riverbed: 800_000,
  road_rail: 3_000_000,
  agricultural: 6_000_000,
  garden: 14_000_000,
  industrial: 35_000_000,
  urban: 60_000_000,
  other: 4_000_000,
  unknown: 4_000_000,
}
/** A price is "unusual" below half or above double the expected one. */
export const LOW_RATIO = 0.5
export const HIGH_RATIO = 2

export interface PriceFactor {
  label: string
  mult: number
}

/** The facts about a parcel that move its expected price. */
export function factorsOf(p: Pick<Parcel, 'flags' | 'ownershipClass'>): PriceFactor[] {
  const out: PriceFactor[] = []
  if (p.flags.residence_livelihood) out.push({ label: 'محل سکونت یا ممر اعاشه (۱۵٪ افزایش بها)', mult: 1.15 })
  if (p.flags.high_value) out.push({ label: 'ارزش بالای زمین', mult: 1.5 })
  if (p.flags.has_facilities) out.push({ label: 'وجود تأسیسات / ابنیه', mult: 1.2 })
  if (p.flags.sensitive_area) out.push({ label: 'منطقهٔ حساس', mult: 1.1 })
  if (p.ownershipClass === 'natural_resources' || p.ownershipClass === 'governmental') out.push({ label: 'زمین ملی / دولتی (غرامت محدود)', mult: 0.4 })
  return out
}
export const multOf = (p: Pick<Parcel, 'flags' | 'ownershipClass'>): number => factorsOf(p).reduce((m, f) => m * f.mult, 1)

/** Rial per m² of the recorded estimate, or null when the area or cost is missing. */
export function unitPrice(p: Pick<Parcel, 'areaM2' | 'estCost'>): number | null {
  return p.areaM2 && p.areaM2 > 0 && p.estCost != null && p.estCost > 0 ? p.estCost / p.areaM2 : null
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export interface Benchmark {
  expected: number
  low: number
  high: number
  /** 'project': the median of this project's other parcels of the same land type; 'base': the reference table. */
  source: 'project' | 'base'
  samples: number
  factors: PriceFactor[]
  mult: number
}

export function benchmarkFor(p: Pick<Parcel, 'id' | 'landType' | 'flags' | 'ownershipClass'>, all: Pick<Parcel, 'id' | 'landType' | 'flags' | 'ownershipClass' | 'areaM2' | 'estCost'>[]): Benchmark {
  const peers = all
    .filter((x) => x.id !== p.id && x.landType === p.landType)
    .map((x) => ({ u: unitPrice(x), m: multOf(x) }))
    .filter((x): x is { u: number; m: number } => x.u != null)
  const factors = factorsOf(p)
  const mult = multOf(p)
  const baseline = peers.length >= 3 ? median(peers.map((x) => x.u / x.m)) : BASE_PRICE[p.landType]
  const expected = baseline * mult
  return { expected, low: expected * LOW_RATIO, high: expected * HIGH_RATIO, source: peers.length >= 3 ? 'project' : 'base', samples: peers.length, factors, mult }
}

export type PriceVerdict = 'ok' | 'low' | 'high'
export const verdictOf = (unit: number, b: Pick<Benchmark, 'low' | 'high'>): PriceVerdict => (unit < b.low ? 'low' : unit > b.high ? 'high' : 'ok')

/** May this unit price be recorded as is? Yes when it is within range, or exactly the price the project manager approved as an exception. */
export function priceAllowed(unit: number, b: Pick<Benchmark, 'low' | 'high'>, ex: Parcel['priceException']): boolean {
  if (verdictOf(unit, b) === 'ok') return true
  return !!ex && ex.status === 'approved' && Math.abs(ex.price - unit) <= Math.max(1, ex.price * 0.002)
}

export interface FactorAverage {
  group: 'landType' | 'ownership' | 'landUse'
  key: string
  n: number
  areaM2: number
  cost: number
  /** Area-weighted average, rial per m². */
  avg: number
  min: number
  max: number
}

/** Average acquisition price per m² grouped by the facts that drive it. */
export function averagesByFactor(parcels: Pick<Parcel, 'landType' | 'ownershipClass' | 'landUse' | 'areaM2' | 'estCost'>[]): FactorAverage[] {
  const acc = new Map<string, FactorAverage>()
  const add = (group: FactorAverage['group'], key: string, area: number, cost: number, u: number) => {
    if (!key) return
    const id = `${group}:${key}`
    const cur = acc.get(id) ?? { group, key, n: 0, areaM2: 0, cost: 0, avg: 0, min: Infinity, max: 0 }
    cur.n++
    cur.areaM2 += area
    cur.cost += cost
    cur.min = Math.min(cur.min, u)
    cur.max = Math.max(cur.max, u)
    acc.set(id, cur)
  }
  for (const p of parcels) {
    const u = unitPrice(p)
    if (u == null || !p.areaM2 || p.estCost == null) continue
    add('landType', p.landType, p.areaM2, p.estCost, u)
    add('ownership', p.ownershipClass, p.areaM2, p.estCost, u)
    add('landUse', p.landUse.trim(), p.areaM2, p.estCost, u)
  }
  return [...acc.values()].map((x) => ({ ...x, avg: x.cost / x.areaM2 })).sort((a, b) => b.n - a.n)
}
