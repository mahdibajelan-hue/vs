import { buildPipeline, type SgDecision, type SgItem, type SgPhase, type SgPhaseRow, type SgStepDef } from '../../../modules/executive/lib/lifecyclePipeline'
import type { RadarGate, RadarLifecycleStage } from './radarTypes'

/** Stage-Gate (G1…G9) is the lifecycle of record: the radar's lifecycle strip and «next gate» come from it. */
export interface SgRadarInput {
  project: string
  phases: (SgPhase & { gateName: string })[]
  steps: SgStepDef[]
  /** gate prerequisites per phase: outputs + criteria (ids) */
  prereqs: { phase: string; kind: 'output' | 'criterion'; id: number }[]
  items: SgItem[]
  decisions: SgDecision[]
  phaseRows: (SgPhaseRow & { plannedFinish: string | null; actualFinish: string | null; manualPct: number | null })[]
}
export interface SgRadarSection { lifecycle: RadarLifecycleStage[]; currentStageLabel: string; nextGate: RadarGate | null }

const VERIFIED = new Set(['verified', 'completed'])
/** English labels for the radar's English panels (G1…G9 of the 9-gate model) */
const EN: Record<string, string> = { G1: 'Definition', G2: 'Identification', G3: 'Consultant Procurement', G4: 'Basic Design', G5: 'Tender & Award', G6: 'Execution', G7: 'Commissioning', G8: 'Maintenance', G9: 'Closeout' }
const faDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) : '—')

export function stageGateRadarSection(input: SgRadarInput, today = new Date()): SgRadarSection | null {
  const [line] = buildPipeline({ projects: [input.project], phases: input.phases, steps: input.steps, titles: new Map(), items: input.items, decisions: input.decisions, phaseRows: input.phaseRows }, today)
  if (!line || line.phase === 'nodata') return null
  const phases = [...input.phases].sort((a, b) => a.sort - b.sort)
  const curIdx = line.phase === 'done' ? phases.length : phases.findIndex((p) => p.code === line.phase)
  const rows = new Map(input.phaseRows.map((r) => [r.phase, r]))

  const lifecycle: RadarLifecycleStage[] = phases.map((p, i) => {
    const row = rows.get(p.code)
    const state = i < curIdx ? 'done' : i === curIdx ? 'current' : 'upcoming'
    const stepPct = line.steps.length ? Math.round((line.stepsDone / line.steps.length) * 100) : 0
    const progressPct = state === 'done' ? 100 : state === 'upcoming' ? 0 : row?.manualPct != null ? Math.round(row.manualPct) : stepPct
    return { key: p.code, label: p.title, labelEn: EN[p.code] ?? p.code, state, dateFa: faDate(row?.actualFinish ?? row?.plannedFinish ?? null), progressPct }
  })

  const gatePhase = phases[Math.min(curIdx, phases.length - 1)]
  let nextGate: RadarGate | null = null
  if (gatePhase) {
    const req = input.prereqs.filter((q) => q.phase === gatePhase.code)
    const done = req.filter((q) => input.items.some((it) => it.phase === gatePhase.code && it.kind === q.kind && it.itemId === q.id && VERIFIED.has(it.status))).length
    const passedGate = line.phase === 'done'
    nextGate = {
      name: gatePhase.gateName || `گیت ${gatePhase.code}`,
      nameEn: `Gate ${gatePhase.code}`,
      prerequisites: req.length,
      passed: passedGate ? req.length : done,
      pending: passedGate ? 0 : req.length - done,
      failed: 0,
      readinessPct: passedGate ? 100 : req.length ? Math.round((done / req.length) * 100) : 0,
    }
  }
  return { lifecycle, currentStageLabel: line.phase === 'done' ? 'پایان چرخه' : `${line.phase} — ${phases[curIdx]?.title ?? ''}`, nextGate }
}

