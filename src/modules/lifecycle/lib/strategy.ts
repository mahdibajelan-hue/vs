import { runCpm, addDaysIso, type CpmDep, type CpmResult } from './cpm'
import { GATE_META } from './gateModel'

/** Execution-strategy engine: standard gate durations are fixed and never shortened — a strategy
 * only decides how much consecutive gates overlap. */

export type StrategyKey = 'sequential' | 'overlapping' | 'fast_track' | 'emergency'
export const STRATEGY_LABEL_FA: Record<StrategyKey, string> = {
  sequential: 'متوالی (Sequential)', overlapping: 'همپوشان (Overlapping)',
  fast_track: 'مسیر سریع (Fast-Track)', emergency: 'مسیر سریع اضطراری (Emergency)',
}
export const STRATEGY_HINT_FA: Record<StrategyKey, string> = {
  sequential: 'زنجیرهٔ خالص پایان‌به‌شروع، بدون همپوشانی',
  overlapping: 'G4→G5 با SS+۹۰ و G6→G7 با SS+۵۴۰ روز',
  fast_track: 'همپوشانی بیشتر بین G2 تا G5 و G6 تا G8',
  emergency: 'بیشترین همپوشانی؛ از G1 آغاز می‌شود',
}

export type GovStatus = 'draft' | 'proposed' | 'reviewed' | 'approved' | 'baseline' | 'in_execution' | 'revised' | 'completed'
export const GOV_STATUS_ORDER: GovStatus[] = ['draft', 'proposed', 'reviewed', 'approved', 'baseline', 'in_execution', 'revised', 'completed']
export const GOV_STATUS_LABEL_FA: Record<GovStatus, string> = {
  draft: 'پیش‌نویس', proposed: 'پیشنهادشده', reviewed: 'بررسی‌شده', approved: 'تأییدشده',
  baseline: 'خط مبنا', in_execution: 'در اجرا', revised: 'تجدیدنظرشده', completed: 'تکمیل‌شده',
}
/** Allowed transitions: forward one step, or `revised` from execution/baseline, or back to draft. */
export function canTransition(from: GovStatus, to: GovStatus): boolean {
  if (from === to) return false
  const i = GOV_STATUS_ORDER.indexOf(from), j = GOV_STATUS_ORDER.indexOf(to)
  if (to === 'draft') return from !== 'completed'
  if (to === 'revised') return from === 'baseline' || from === 'in_execution'
  if (from === 'revised') return to === 'baseline' || to === 'in_execution'
  return j === i + 1
}

export const STANDARD_DAYS: number[] = GATE_META.map((g) => g.standardDays)

/** Dependencies between gate N and N+1 (1-based) — SS+lag where overlapped, FS elsewhere.
 * Values are the organisation's own (lifecycle_strategy_phase_dependencies in the Stage-Gate source app). */
const SS = (lag: number): { type: 'SS' | 'FS'; lag: number } => ({ type: 'SS', lag })
const FS0 = { type: 'FS' as const, lag: 0 }
const LINKS: Record<StrategyKey, ({ type: 'SS' | 'FS'; lag: number })[]> = {
  //                G1→2  2→3  3→4  4→5   5→6   6→7    7→8  8→9
  sequential:  [FS0, FS0, FS0, FS0, FS0, FS0, FS0, FS0],
  overlapping: [FS0, FS0, FS0, SS(90), FS0, SS(540), FS0, FS0],
  fast_track:  [FS0, SS(0), SS(60), SS(60), FS0, SS(510), SS(30), FS0],
  emergency:   [SS(30), SS(0), SS(30), SS(60), SS(90), SS(480), SS(15), FS0],
}

export function strategyDeps(strategy: StrategyKey): CpmDep[] {
  return LINKS[strategy].map((l, i) => ({ from: `G${i + 1}`, to: `G${i + 2}`, type: l.type, lag: l.lag }))
}

export interface GateSchedule extends CpmResult { code: string; start: string; finish: string; days: number }
export interface MasterSchedule {
  gates: GateSchedule[]
  startDate: string
  commissioningStart: string
  finishDate: string
  totalDays: number
  /** A gate cannot start before its predecessor's logic allows; true when the plan is valid. */
  ok: boolean
}

export function computeMasterSchedule(
  strategy: StrategyKey, startDate: string, durations: number[] = STANDARD_DAYS,
): MasterSchedule {
  const tasks = durations.map((d, i) => ({ id: `G${i + 1}`, duration: d }))
  const out = runCpm(tasks, strategyDeps(strategy))
  const gates: GateSchedule[] = tasks.map((t) => {
    const r = out.tasks.get(t.id)!
    return { ...r, code: t.id, days: t.duration, start: addDaysIso(startDate, r.es), finish: addDaysIso(startDate, r.ef) }
  })
  const g7 = gates[6]
  return {
    gates, startDate, commissioningStart: g7.start,
    finishDate: addDaysIso(startDate, out.finish), totalDays: out.finish, ok: !out.cycle,
  }
}

export interface ScheduleVersion { label: string; startDate: string; commissioningStart: string; finishDate: string; totalDays: number }
/** Next immutable version label: a revision of the same scope is a minor bump, a re-baseline a major one. */
export function nextVersionLabel(existing: string[], kind: 'minor' | 'major'): string {
  const parsed = existing.map((l) => /^V(\d+)\.(\d+)$/.exec(l)).filter((m): m is RegExpExecArray => !!m)
    .map((m) => [Number(m[1]), Number(m[2])] as const)
  if (parsed.length === 0) return 'V1.0'
  const maxMajor = Math.max(...parsed.map((p) => p[0]))
  if (kind === 'major') return `V${maxMajor + 1}.0`
  const maxMinor = Math.max(...parsed.filter((p) => p[0] === maxMajor).map((p) => p[1]))
  return `V${maxMajor}.${maxMinor + 1}`
}
