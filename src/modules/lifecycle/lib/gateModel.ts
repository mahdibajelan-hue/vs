/** Nine-gate (G1–G9) model: metadata, weighted progress and readiness rules.
 * Pure functions only — no store / Supabase imports — so they are unit-testable. */

export type GateItemKind = 'objective' | 'output' | 'criterion'
export type GateEngine = 'step' | 'basic_design' | 'epc'
export type PhaseGroup = 'fel' | 'execution' | 'commissioning'
export type GateItemStatus =
  | 'not_started' | 'in_progress' | 'completed' | 'pending' | 'submitted' | 'verified'
  | 'rejected' | 'failed' | 'waived'

export const KIND_LABEL_FA: Record<GateItemKind, string> = {
  objective: 'اهداف', output: 'خروجی‌ها', criterion: 'معیارهای عبور',
}
export const KIND_WEIGHT: Record<GateItemKind, number> = { objective: 50, output: 30, criterion: 20 }

export const ITEM_STATUS_LABEL_FA: Record<GateItemStatus, string> = {
  not_started: 'شروع‌نشده', in_progress: 'در حال انجام', completed: 'تکمیل‌شده', pending: 'در انتظار',
  submitted: 'ارسال‌شده برای تأیید', verified: 'تأییدشده', rejected: 'ردشده', failed: 'ناموفق', waived: 'مستثنی‌شده',
}

export const PHASE_LABEL_FA: Record<PhaseGroup, string> = {
  fel: 'پیش از اجرا (FEL)', execution: 'اجرا', commissioning: 'راه‌اندازی و تحویل',
}

export interface GateMeta {
  code: string; order: number; owner: string; approvalDoc: string
  threshold: number; engine: GateEngine; phase: PhaseGroup; icon: string
  standardDays: number
}

export const GATE_META: GateMeta[] = [
  { code: 'G1', order: 1, owner: 'مدیر برنامه‌ریزی راهبردی', approvalDoc: 'ابلاغیه تصویب و تعریف پروژه', threshold: 30, engine: 'step', phase: 'fel', icon: '🎯', standardDays: 60 },
  { code: 'G2', order: 2, owner: 'مدیر پروژه', approvalDoc: 'مجوز خرید خدمات مشاور', threshold: 50, engine: 'step', phase: 'fel', icon: '🔍', standardDays: 30 },
  { code: 'G3', order: 3, owner: 'مدیر قراردادها', approvalDoc: 'ابلاغ شروع به کار مهندسی', threshold: 70, engine: 'step', phase: 'execution', icon: '🤝', standardDays: 120 },
  { code: 'G4', order: 4, owner: 'مدیر مهندسی', approvalDoc: 'مجوز کمیسیون/هیئت فنی برای برگزاری مناقصات', threshold: 80, engine: 'basic_design', phase: 'execution', icon: '📐', standardDays: 180 },
  { code: 'G5', order: 5, owner: 'مدیر قراردادها', approvalDoc: 'ابلاغ شروع به کار اجرا', threshold: 90, engine: 'step', phase: 'execution', icon: '📜', standardDays: 180 },
  { code: 'G6', order: 6, owner: 'مدیر اجرا', approvalDoc: 'تأیید شروع پیش‌راه‌اندازی', threshold: 100, engine: 'epc', phase: 'execution', icon: '🏗️', standardDays: 600 },
  { code: 'G7', order: 7, owner: 'مدیر راه‌اندازی', approvalDoc: 'تحویل موقت توسط بهره‌بردار', threshold: 100, engine: 'step', phase: 'commissioning', icon: '⚡', standardDays: 60 },
  { code: 'G8', order: 8, owner: 'مدیر بهره‌برداری', approvalDoc: 'تحویل قطعی', threshold: 100, engine: 'step', phase: 'commissioning', icon: '🛠️', standardDays: 120 },
  { code: 'G9', order: 9, owner: 'مدیر مالی', approvalDoc: 'تأیید نهایی و بستن پروژه', threshold: 100, engine: 'step', phase: 'commissioning', icon: '✅', standardDays: 30 },
]

export function gateMetaByOrder(order: number): GateMeta | undefined {
  return GATE_META.find((g) => g.order === order)
}

export interface GateItemLite {
  kind: GateItemKind
  status: GateItemStatus
  isMandatory: boolean
}

/** Per-kind completion fraction (0..1) — null when the kind has no items. */
function doneWeight(i: GateItemLite): number {
  switch (i.status) {
    case 'verified': case 'completed': case 'waived': return 1
    case 'submitted': return 0.75
    case 'in_progress': return 0.4
    default: return 0
  }
}
/** Criteria only count once an independent verifier has confirmed them. */
function criterionWeight(i: GateItemLite): number {
  return i.status === 'verified' || i.status === 'waived' ? 1 : i.status === 'submitted' ? 0.5 : 0
}

export function kindProgress(items: GateItemLite[], kind: GateItemKind): number | null {
  const list = items.filter((i) => i.kind === kind)
  if (list.length === 0) return null
  const fn = kind === 'criterion' ? criterionWeight : doneWeight
  return (list.reduce((s, i) => s + fn(i), 0) / list.length) * 100
}

/** 50/30/20 weighted progress; absent kinds are renormalised away. Returns 0..100 (rounded). */
export function weightedItemProgress(items: GateItemLite[]): number {
  let num = 0, den = 0
  for (const k of ['objective', 'output', 'criterion'] as GateItemKind[]) {
    const p = kindProgress(items, k)
    if (p === null) continue
    num += p * KIND_WEIGHT[k]; den += KIND_WEIGHT[k]
  }
  return den === 0 ? 0 : Math.round(num / den)
}

export interface EpcInput { engineering: number; procurement: number; construction: number }
/** Weights of E/P/C inside G6 when no explicit weights are supplied. */
export const EPC_WEIGHTS = { engineering: 0.15, procurement: 0.35, construction: 0.5 }

export function epcProgress(i: EpcInput, w = EPC_WEIGHTS): number {
  const sum = w.engineering + w.procurement + w.construction
  const v = (i.engineering * w.engineering + i.procurement * w.procurement + i.construction * w.construction) / sum
  return Math.round(Math.max(0, Math.min(100, v)))
}

export interface ManualLogEntry { pct: number; at: string; by?: string | null; note?: string }
/** Latest value of the immutable manual-% history (by timestamp). */
export function latestManualPct(log: ManualLogEntry[]): number {
  if (log.length === 0) return 0
  return [...log].sort((a, b) => a.at.localeCompare(b.at)).at(-1)!.pct
}
/** A new entry is only valid if it is 0..100; the log is append-only so we return a new array. */
export function appendManualPct(log: ManualLogEntry[], entry: ManualLogEntry): ManualLogEntry[] {
  if (!(entry.pct >= 0 && entry.pct <= 100)) throw new Error('درصد باید بین ۰ تا ۱۰۰ باشد')
  return [...log, entry]
}

export interface GateProgressInput {
  engine: GateEngine
  items: GateItemLite[]
  manualLog?: ManualLogEntry[]
  epc?: EpcInput | null
}

/** Actual progress of a gate under its engine. `epc` with no data falls back to items so the
 * gate never silently reads 0 because an upstream module is empty. */
export function gateActualProgress(g: GateProgressInput): number {
  if (g.engine === 'basic_design') {
    if (g.manualLog && g.manualLog.length > 0) return Math.round(latestManualPct(g.manualLog))
    return weightedItemProgress(g.items)
  }
  if (g.engine === 'epc' && g.epc) return epcProgress(g.epc)
  return weightedItemProgress(g.items)
}

export interface GateReadiness {
  mandatoryCriteria: number
  mandatoryReady: number
  remaining: number
  isReadyForReview: boolean
  badge: string | null
}

const toPersian = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])

/** Gate is ready only when all mandatory criteria are verified/waived — percentages never open it. */
export function gateReadiness(items: GateItemLite[], progress: number, threshold: number): GateReadiness {
  const crit = items.filter((i) => i.kind === 'criterion' && i.isMandatory)
  const ready = crit.filter((i) => i.status === 'verified' || i.status === 'waived').length
  const remaining = crit.length - ready
  return {
    mandatoryCriteria: crit.length,
    mandatoryReady: ready,
    remaining,
    isReadyForReview: remaining === 0 && progress >= threshold,
    badge: remaining > 0 ? `${toPersian(remaining)} معیار الزامی آماده نیست` : null,
  }
}

export type GateLifecycleStatus = 'not_ready' | 'ready_for_review' | 'conditional' | 'passed' | 'blocked'
export const GATE_LIFECYCLE_LABEL_FA: Record<GateLifecycleStatus, string> = {
  not_ready: 'آماده نیست', ready_for_review: 'آماده بررسی', conditional: 'مشروط',
  passed: 'عبور کرده', blocked: 'مسدود',
}

export type GateDecisionKind = 'pass' | 'conditional' | 'return' | 'cancel'
export const DECISION_LABEL_FA: Record<GateDecisionKind, string> = {
  pass: 'تصویب (Pass)', conditional: 'تصویب مشروط', return: 'بازگشت برای اصلاح', cancel: 'لغو',
}

export interface DecisionInput {
  kind: GateDecisionKind
  reason?: string
  conditionText?: string
  conditionOwnerId?: string | null
  conditionDeadline?: string | null
}
/** Returns a Persian validation error or null. Pass additionally requires readiness. */
export function validateDecision(d: DecisionInput, readiness: GateReadiness): string | null {
  if (d.kind === 'pass' && readiness.remaining > 0) return 'همهٔ معیارهای الزامی باید تأیید شده باشند'
  if (d.kind === 'conditional') {
    if (!d.conditionText?.trim()) return 'متن شرط الزامی است'
    if (!d.conditionOwnerId) return 'مسئول رفع شرط الزامی است'
    if (!d.conditionDeadline) return 'مهلت رفع شرط الزامی است'
  }
  if ((d.kind === 'return' || d.kind === 'cancel') && !d.reason?.trim()) return 'ذکر دلیل الزامی است'
  return null
}

export function decisionToStatus(k: GateDecisionKind): GateLifecycleStatus {
  return k === 'pass' ? 'passed' : k === 'conditional' ? 'conditional' : k === 'return' ? 'not_ready' : 'blocked'
}

/** Overall project progress = duration-weighted mean of gate progress. */
export function overallProgress(gates: { progress: number; weight: number }[]): number {
  const w = gates.reduce((s, g) => s + g.weight, 0)
  return w === 0 ? 0 : Math.round(gates.reduce((s, g) => s + g.progress * g.weight, 0) / w)
}

export interface LogRowLite { series: string; pct: number; recordedAt: string }
/** Convenience: actual progress of a gate straight from its items and the progress log rows. */
export function gateProgressFromLog(engine: GateEngine, items: GateItemLite[], log: LogRowLite[]): number {
  const series = (s: string): ManualLogEntry[] => log.filter((e) => e.series === s).map((e) => ({ pct: e.pct, at: e.recordedAt }))
  if (engine === 'epc') {
    const has = ['engineering', 'procurement', 'construction'].some((s) => series(s).length > 0)
    return gateActualProgress({
      engine, items,
      epc: has ? {
        engineering: latestManualPct(series('engineering')), procurement: latestManualPct(series('procurement')),
        construction: latestManualPct(series('construction')),
      } : null,
    })
  }
  return gateActualProgress({ engine, items, manualLog: series('overall') })
}
