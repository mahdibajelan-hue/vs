import { WELDER_FIELDS, splitStamps } from './registers'
import { weldKey } from './welds'

/**
 * Repair rate of each welder per month, measured by the quality records (radiography) and nothing typed again:
 * a weld counts for every welder named on its welding / tie-in row; its FIRST radiography result decides (acceptable / repair) and lands in the month of that radiography.
 * repair % = welds whose first RT said «repair» ÷ welds radiographed. Re-shots after a repair are not counted again.
 */
export interface QRow { formKey: string; date: string; detail: Record<string, unknown> }
export interface MonthStat { key: string; label: string; tested: number; repaired: number; rate: number }
export interface WelderQuality { months: MonthStat[]; tested: number; repaired: number; rate: number }
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0)

export function welderQuality(rows: QRow[], monthOf: (iso: string) => { key: string; label: string }): Map<string, WelderQuality> {
  const weldersOf = new Map<string, Set<string>>()
  for (const r of rows) {
    if (r.formKey !== 'welding' && r.formKey !== 'tie_in') continue
    const wk = weldKey(r.detail.sec, r.detail.weldNo ?? r.detail.jointNo); if (!wk) continue
    const s = weldersOf.get(wk) ?? new Set<string>()
    for (const f of WELDER_FIELDS) for (const t of splitStamps(r.detail[f])) s.add(t)
    weldersOf.set(wk, s)
  }
  const first = new Map<string, { date: string; rep: boolean }>()
  for (const r of [...rows].filter((x) => x.formKey === 'rt_report').sort((a, b) => a.date.localeCompare(b.date))) {
    const wk = weldKey(r.detail.sec, r.detail.weldNo ?? r.detail.jointNo); if (!wk || first.has(wk)) continue
    if (r.detail.result !== 'acc' && r.detail.result !== 'rep') continue
    first.set(wk, { date: r.date, rep: r.detail.result === 'rep' })
  }
  const acc = new Map<string, Map<string, MonthStat>>()
  for (const [wk, f] of first) {
    const ws = weldersOf.get(wk); if (!ws) continue
    const m = monthOf(f.date)
    for (const w of ws) {
      const byMonth = acc.get(w) ?? new Map<string, MonthStat>()
      const e = byMonth.get(m.key) ?? { key: m.key, label: m.label, tested: 0, repaired: 0, rate: 0 }
      e.tested++; if (f.rep) e.repaired++
      byMonth.set(m.key, e); acc.set(w, byMonth)
    }
  }
  const out = new Map<string, WelderQuality>()
  for (const [w, byMonth] of acc) {
    const months = [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key)).map((x) => ({ ...x, rate: pct(x.repaired, x.tested) }))
    const tested = months.reduce((s, x) => s + x.tested, 0), repaired = months.reduce((s, x) => s + x.repaired, 0)
    out.set(w, { months, tested, repaired, rate: pct(repaired, tested) })
  }
  return out
}

export interface Rank { rank: number | null; of: number; score: number | null; tested: number; repaired: number; rate: number }
/** period = 'ALL' or a month key. Rank 1 = the lowest repair %; equal rates share a rank; a welder with fewer than `minTested` radiographed welds in the period is not ranked (too few to mean anything). Score = 100 − repair %. */
export function rankWelders(q: Map<string, WelderQuality>, period: string, minTested: number): Map<string, Rank> {
  const rows = [...q].map(([key, v]) => { const ms = period === 'ALL' ? v.months : v.months.filter((m) => m.key === period); const tested = ms.reduce((s, m) => s + m.tested, 0), repaired = ms.reduce((s, m) => s + m.repaired, 0); return { key, tested, repaired, rate: pct(repaired, tested) } })
  const elig = rows.filter((r) => r.tested >= Math.max(1, minTested)).sort((a, b) => a.rate - b.rate || b.tested - a.tested || a.key.localeCompare(b.key))
  const out = new Map<string, Rank>()
  elig.forEach((r, i) => { const rank = i > 0 && elig[i - 1].rate === r.rate && elig[i - 1].tested === r.tested ? (out.get(elig[i - 1].key) as Rank).rank : i + 1; out.set(r.key, { rank, of: elig.length, score: Math.round((100 - r.rate) * 10) / 10, tested: r.tested, repaired: r.repaired, rate: r.rate }) })
  for (const r of rows) if (!out.has(r.key)) out.set(r.key, { rank: null, of: elig.length, score: null, tested: r.tested, repaired: r.repaired, rate: r.rate })
  return out
}
