/**
 * Stage-Gate progress engine — the lifecycle module's own numbers (actual / planned per phase and for the whole
 * project), lifted out of the legacy engine so the control tower, the radar and the project picker show exactly what
 * the Stage-Gate orbit shows. Same rules as engine.ts (lcPhaseProgress / lcOverallProgress / lcItemActualPct):
 *  - 'step' phase: actual = weighted rollup of its schedule (Gantt) items' recorded %, planned = elapsed share of its
 *    planned window (falls back to actual when it has no window)
 *  - 'basic_design' phase: actual = the phase's manual %, planned by date
 *  - 'epc' phase: E/P/C progress from the latest client report, weighted
 *  - project: phases weighted by weight_pct (equal shares when unset)
 * Pure: the caller passes rows in.
 */
export interface SgpPhase { code: string; engine: string }
export interface SgpPhaseRow { phase: string; plannedStart: string | null; plannedFinish: string | null; manualPct: number | null; weightPct: number | null }
export interface SgpScheduleItem { id: number; phase: string; parentId: number | null; weightPct: number | null; manualPct: number | null }
export type SgpClientReport = Record<string, unknown> | null

export interface SgProgress {
  phases: Map<string, { actual: number; planned: number }>
  overall: { actual: number; planned: number }
}

export function plannedByDate(start: string | null, finish: string | null, asOf: Date): number | null {
  if (!start || !finish) return null
  const s = new Date(start).getTime(), f = new Date(finish).getTime(), n = asOf.getTime()
  if (!(f > s)) return null
  if (n <= s) return 0
  if (n >= f) return 100
  return Math.round(((n - s) / (f - s)) * 100)
}

function epcWeighted(cr: SgpClientReport, mode: 'actual' | 'planned'): number {
  if (!cr) return 0
  const num = (k: string) => Number(cr[k]) || 0
  const we = num('progress_engineering_weight'), wp = num('progress_procurement_weight'), wc = num('progress_construction_weight')
  const totalW = we + wp + wc || 100
  const sfx = mode === 'planned' ? '_planned' : ''
  const e = num('progress_engineering' + sfx), p = num('progress_procurement' + sfx), c = num('progress_construction' + sfx)
  const effWe = we || totalW / 3, effWp = wp || totalW / 3, effWc = wc || totalW / 3
  return (e * effWe + p * effWp + c * effWc) / totalW
}

export function sgProgress(input: {
  phases: SgpPhase[]
  phaseRows: SgpPhaseRow[]
  schedule: SgpScheduleItem[]
  clientReport: SgpClientReport
}, today = new Date()): SgProgress {
  const rows = new Map(input.phaseRows.map((r) => [r.phase, r]))
  const children = (phase: string, parentId: number | null) => input.schedule.filter((s) => s.phase === phase && (s.parentId ?? null) === parentId)
  const rollup = (items: SgpScheduleItem[]): number => {
    const custom = items.some((c) => typeof c.weightPct === 'number')
    let sum = 0, totalW = 0
    for (const c of items) {
      const w = custom ? Number(c.weightPct) || 0 : 1
      sum += itemActual(c) * w
      totalW += w
    }
    return totalW ? sum / totalW : 0
  }
  const itemActual = (item: SgpScheduleItem): number => {
    const kids = children(item.phase, item.id)
    return kids.length ? rollup(kids) : item.manualPct ?? 0
  }

  const phases = new Map<string, { actual: number; planned: number }>()
  for (const p of input.phases) {
    const r = rows.get(p.code)
    let actual: number, planned: number | null
    if (p.engine === 'epc') {
      actual = epcWeighted(input.clientReport, 'actual')
      planned = epcWeighted(input.clientReport, 'planned')
    } else if (p.engine === 'basic_design') {
      actual = typeof r?.manualPct === 'number' ? r.manualPct : 0
      planned = plannedByDate(r?.plannedStart ?? null, r?.plannedFinish ?? null, today)
    } else {
      const top = children(p.code, null)
      actual = top.length ? rollup(top) : 0
      planned = plannedByDate(r?.plannedStart ?? null, r?.plannedFinish ?? null, today)
    }
    phases.set(p.code, { actual, planned: planned ?? actual })
  }

  const n = input.phases.length || 1
  let sumW = 0, sumA = 0, sumP = 0
  for (const p of input.phases) {
    const r = rows.get(p.code)
    const w = typeof r?.weightPct === 'number' ? r.weightPct : 100 / n
    const v = phases.get(p.code)!
    sumW += w; sumA += w * v.actual; sumP += w * v.planned
  }
  return { phases, overall: { actual: sumW ? sumA / sumW : 0, planned: sumW ? sumP / sumW : 0 } }
}
