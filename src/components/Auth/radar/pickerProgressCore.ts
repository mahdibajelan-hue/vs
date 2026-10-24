import { stageGateRadarSection, type SgRadarInput } from './stageGateRadarCore'
import { sgProgress, type SgpScheduleItem, type SgpPhaseRow } from '../../../modules/stagegate/sgProgress'

/** One project's lifecycle picture for the picker gauge: the same "overall" figure the radar's lifecycle ring shows. */
export interface PickerProgress {
  /** average of every Stage-Gate phase's own completion, 0…100 */
  pct: number
  /** each phase's completion in phase order (one gauge segment per gate) */
  segments: { code: string; pct: number; state: 'done' | 'current' | 'upcoming' }[]
  phaseCode: string
  phaseTitle: string
}

export type PickerSource = Omit<SgRadarInput, 'project' | 'prereqs' | 'engine'> & {
  links: { project: string; masterId: string }[]
  /** inputs of the Stage-Gate progress engine (all projects; filtered per project here). When `engines` is absent the
   * gauge falls back to the step share. */
  engines?: {
    phases: { code: string; engine: string }[]
    phaseRows: (SgpPhaseRow & { project: string })[]
    schedule: (SgpScheduleItem & { project: string })[]
    clientReports: Map<string, Record<string, unknown>>
  }
}

/** master project id → its lifecycle progress; projects with no Stage-Gate link or no recorded gate data are left out. */
export function pickerProgress(src: PickerSource, today = new Date()): Map<string, PickerProgress> {
  const out = new Map<string, PickerProgress>()
  for (const { project, masterId } of src.links) {
    const eng = src.engines
    const prog = eng ? sgProgress({
      phases: eng.phases,
      phaseRows: eng.phaseRows.filter((r) => r.project === project),
      schedule: eng.schedule.filter((r) => r.project === project),
      clientReport: eng.clientReports.get(project) ?? null,
    }, today) : null
    const sec = stageGateRadarSection({
      project, phases: src.phases, steps: src.steps, prereqs: [],
      engine: prog ? { phases: prog.phases, overall: prog.overall.actual } : undefined,
      items: src.items.filter((x) => x.project === project),
      decisions: src.decisions.filter((x) => x.project === project),
      phaseRows: src.phaseRows.filter((x) => x.project === project),
    }, today)
    if (!sec || !sec.lifecycle.length) continue
    const cur = sec.lifecycle.find((s) => s.state === 'current')
    out.set(masterId, {
      pct: sec.overallPct ?? Math.round(sec.lifecycle.reduce((s, x) => s + x.progressPct, 0) / sec.lifecycle.length),
      segments: sec.lifecycle.map((s) => ({ code: s.key, pct: s.progressPct, state: s.state })),
      phaseCode: cur?.key ?? 'پایان',
      phaseTitle: cur?.label ?? 'پایان چرخه',
    })
  }
  return out
}
