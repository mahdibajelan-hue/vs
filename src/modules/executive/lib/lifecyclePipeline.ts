/**
 * پروژه‌ها در مراحل چرخهٔ عمر — every Stage-Gate project placed on G1…G9, with the step it is on and its last action.
 * Pure: takes the sg_* rows, returns one line per project. All rules live here so the report and its tests agree.
 *
 * Rules
 *  - A gate is passed when its latest decision is 'pass' or 'conditional' (a 'cancelled' decision undoes it), or the
 *    project's phase row says gate_status 'passed'/'conditional' when no decision was recorded.
 *  - Current phase = the phase after the last passed gate (gates whose decision was never recorded do not pull a project
 *    back). No gate passed → the first phase; G9 passed → 'done'. No gate decision, phase row or item at all → 'nodata'.
 *  - Steps = the phase's objectives in their order. Current step = the first one in progress, else the first not completed.
 *  - Last action = the latest of: any item change of the project (step / output / criterion) and any gate decision.
 *  - Entered the phase = the decision that passed the previous gate, else the phase's actual start.
 */

export interface SgPhase { code: string; sort: number; title: string }
export interface SgStepDef { id: number; phase: string; seq: number; title: string }
export interface SgItem { project: string; phase: string; kind: string; itemId: number; status: string; updatedAt: string | null; updatedBy: string | null }
export interface SgDecision { project: string; phase: string; decision: string; decidedAt: string; decidedBy: string | null }
export interface SgPhaseRow { project: string; phase: string; gateStatus: string | null; actualStart: string | null }

export interface StepState { title: string; status: 'done' | 'active' | 'todo' }
export interface LastAction { text: string; at: string; by: string | null; phase: string }
export interface PipelineLine {
  project: string
  /** phase code; 'done' when G9 is passed; 'nodata' when Stage-Gate holds nothing for the project */
  phase: string
  steps: StepState[]
  stepIndex: number | null
  stepsDone: number
  enteredAt: string | null
  daysInPhase: number | null
  lastAction: LastAction | null
  daysSinceAction: number | null
}

const PASSED = new Set(['pass', 'conditional'])
const ROW_PASSED = new Set(['passed', 'conditional'])
const day = 86_400_000
const daysBetween = (from: string, to: Date) => Math.max(0, Math.floor((to.getTime() - Date.parse(from)) / day))

function itemText(kind: string, status: string, title: string): string {
  if (kind === 'objective') return status === 'completed' ? `گام «${title}» انجام شد` : status === 'in_progress' ? `گام «${title}» شروع شد` : `گام «${title}» به‌روز شد`
  if (kind === 'output') return status === 'verified' ? `خروجی «${title}» تأیید شد` : status === 'submitted' ? `خروجی «${title}» ارسال شد` : `خروجی «${title}» به‌روز شد`
  if (kind === 'criterion') return status === 'verified' ? `معیار «${title}» تأیید شد` : `معیار «${title}» به‌روز شد`
  return `«${title}» به‌روز شد`
}
function decisionText(phase: string, decision: string): string {
  return decision === 'pass' ? `گیت ${phase} تصویب شد` : decision === 'conditional' ? `گیت ${phase} با شرط تصویب شد` : decision === 'cancelled' ? `تصویب گیت ${phase} لغو شد` : `تصمیم گیت ${phase}: ${decision}`
}

export function buildPipeline(input: {
  projects: string[]
  phases: SgPhase[]
  steps: SgStepDef[]
  /** titles of outputs / criteria by id (for the last-action text) */
  titles: Map<string, string>
  items: SgItem[]
  decisions: SgDecision[]
  phaseRows: SgPhaseRow[]
}, today = new Date()): PipelineLine[] {
  const phases = [...input.phases].sort((a, b) => a.sort - b.sort)
  return input.projects.map((project) => {
    const decisions = input.decisions.filter((d) => d.project === project).sort((a, b) => Date.parse(b.decidedAt) - Date.parse(a.decidedAt))
    const rows = new Map(input.phaseRows.filter((r) => r.project === project).map((r) => [r.phase, r]))
    const items = input.items.filter((i) => i.project === project)
    const passed = (code: string) => {
      const latest = decisions.find((d) => d.phase === code)
      return latest ? PASSED.has(latest.decision) : ROW_PASSED.has(rows.get(code)?.gateStatus ?? '')
    }
    const hasData = decisions.length > 0 || items.length > 0 || [...rows.values()].some((r) => (r.gateStatus && r.gateStatus !== 'not_ready') || r.actualStart)
    let lastPassed = -1
    phases.forEach((p, i) => { if (passed(p.code)) lastPassed = i })
    const cur = hasData ? phases[lastPassed + 1] : undefined
    const phase = !hasData ? 'nodata' : cur?.code ?? 'done'

    // steps of the current phase
    const defs = cur ? input.steps.filter((s) => s.phase === cur.code).sort((a, b) => a.seq - b.seq) : []
    const statusOf = (id: number) => items.find((i) => i.kind === 'objective' && i.itemId === id && i.phase === cur?.code)?.status
    const raw = defs.map((d) => ({ title: d.title, s: statusOf(d.id) }))
    let stepIndex: number | null = raw.findIndex((r) => r.s === 'in_progress')
    if (stepIndex < 0) stepIndex = raw.findIndex((r) => r.s !== 'completed')
    if (stepIndex < 0) stepIndex = null
    const steps: StepState[] = raw.map((r, i) => ({ title: r.title, status: r.s === 'completed' ? 'done' : i === stepIndex ? 'active' : 'todo' }))

    // when the project entered its current phase
    const idx = cur ? phases.indexOf(cur) : hasData ? phases.length : 0
    const prev = idx > 0 ? phases[idx - 1] : null
    const enteredAt = (prev && decisions.find((d) => d.phase === prev.code && PASSED.has(d.decision))?.decidedAt) || (cur ? rows.get(cur.code)?.actualStart ?? null : null)

    // last action
    const titleOf = (i: SgItem) => (i.kind === 'objective' ? input.steps.find((s) => s.id === i.itemId)?.title : input.titles.get(`${i.kind}:${i.itemId}`)) ?? 'یک مورد'
    const candidates: LastAction[] = [
      ...items.filter((i) => i.updatedAt).map((i) => ({ text: itemText(i.kind, i.status, titleOf(i)), at: i.updatedAt as string, by: i.updatedBy, phase: i.phase })),
      ...decisions.map((d) => ({ text: decisionText(d.phase, d.decision), at: d.decidedAt, by: d.decidedBy, phase: d.phase })),
    ]
    const lastAction = candidates.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null

    return {
      project, phase, steps, stepIndex,
      stepsDone: steps.filter((s) => s.status === 'done').length,
      enteredAt, daysInPhase: enteredAt ? daysBetween(enteredAt, today) : null,
      lastAction, daysSinceAction: lastAction ? daysBetween(lastAction.at, today) : null,
    }
  })
}

/** count per phase code, in phase order, then 'done' and 'nodata' */
export function countByPhase(lines: PipelineLine[], phases: SgPhase[]): { code: string; count: number }[] {
  return [...[...phases].sort((a, b) => a.sort - b.sort).map((p) => p.code), 'done', 'nodata'].map((code) => ({ code, count: lines.filter((l) => l.phase === code).length }))
}

/** no recorded action for this many days → «راکد» */
export const STALE_DAYS = 30
