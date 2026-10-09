import type { ImIssue, ImStage, ImTask } from '../types'
import { IM_CATEGORY_FA, isTaskOpen } from './imModel'

export interface WfStage { key: string; terminal?: boolean; start?: boolean }
export interface WfTransition { from: string; to: string; requiresReason: boolean; allowedRoles: string[] }

/** Default flow — identical to the rows seeded in im_workflow_transitions (010_core.sql). */
export const DEFAULT_STAGES: WfStage[] = [
  { key: 'registered', start: true }, { key: 'validated' }, { key: 'analysis' }, { key: 'action_plan' }, { key: 'in_progress' },
  { key: 'resolution_review' }, { key: 'effectiveness_check' }, { key: 'closed', terminal: true }, { key: 'returned' },
  { key: 'reopened' }, { key: 'cancelled', terminal: true }, { key: 'duplicate', terminal: true },
]

export function canTransition(transitions: WfTransition[], from: string, to: string, roles: string[]): { ok: boolean; requiresReason: boolean; why?: string } {
  const t = transitions.find((x) => x.from === from && x.to === to)
  if (!t) return { ok: false, requiresReason: false, why: 'انتقال از «' + from + '» به «' + to + '» در گردش‌کار تعریف نشده است' }
  if (!t.allowedRoles.some((r) => roles.includes(r))) return { ok: false, requiresReason: t.requiresReason, why: 'نقش شما اجازهٔ این انتقال را ندارد' }
  return { ok: true, requiresReason: t.requiresReason }
}

export function allowedNext(transitions: WfTransition[], from: string, roles: string[]): WfTransition[] {
  return transitions.filter((t) => t.from === from && t.allowedRoles.some((r) => roles.includes(r)))
}

/** Static validation of a (possibly admin-edited) workflow: every stage reachable from start; every non-terminal stage can reach a terminal; no dangling references. */
export function validateWorkflow(stages: WfStage[], transitions: WfTransition[]): string[] {
  const errs: string[] = []
  const keys = new Set(stages.map((s) => s.key))
  const starts = stages.filter((s) => s.start)
  if (starts.length !== 1) errs.push('دقیقاً یک مرحلهٔ شروع لازم است')
  if (!stages.some((s) => s.terminal)) errs.push('حداقل یک مرحلهٔ پایانی لازم است')
  for (const t of transitions) {
    if (!keys.has(t.from) || !keys.has(t.to)) errs.push(`انتقال ${t.from}→${t.to} به مرحلهٔ ناموجود اشاره می‌کند`)
    if (t.from === t.to) errs.push(`انتقال ${t.from}→${t.to} حلقهٔ بی‌معنی است`)
    if (!t.allowedRoles.length) errs.push(`انتقال ${t.from}→${t.to} هیچ نقشی ندارد`)
  }
  if (starts.length === 1) {
    const seen = new Set<string>([starts[0].key])
    const q = [starts[0].key]
    while (q.length) { const c = q.pop()!; for (const t of transitions) if (t.from === c && !seen.has(t.to)) { seen.add(t.to); q.push(t.to) } }
    for (const s of stages) if (!seen.has(s.key)) errs.push(`مرحلهٔ «${s.key}» از شروع قابل‌دسترس نیست`)
  }
  const terminals = new Set(stages.filter((s) => s.terminal).map((s) => s.key))
  const canEnd = new Set(terminals)
  let changed = true
  while (changed) { changed = false; for (const t of transitions) if (canEnd.has(t.to) && !canEnd.has(t.from)) { canEnd.add(t.from); changed = true } }
  for (const s of stages) if (!canEnd.has(s.key)) errs.push(`از مرحلهٔ «${s.key}» هیچ مسیری به پایان نمی‌رسد`)
  return errs
}

export interface CategoryRule { key: string; requireEvidence: boolean; requireRootCause: boolean }

/** Client-side mirror of im_close_blockers() — the database remains the authority. «اقدام انجام شد» ≠ «مسئله رفع شد». */
export function closeBlockers(i: ImIssue, tasks: ImTask[], evidenceCount: number, cat?: CategoryRule): string[] {
  const b: string[] = []
  if (!(i.resolutionSummary ?? '').trim()) b.push('خلاصه و نتیجه نهایی رفع ثبت نشده است')
  if (!(i.acceptanceCriteria ?? '').trim()) b.push('معیار پذیرش تعریف نشده است')
  if (!i.category) b.push('دسته‌بندی مسئله مشخص نیست')
  if (cat?.requireEvidence && evidenceCount === 0) b.push('شاهد رفع (پیوست) برای این دسته الزامی است و بارگذاری نشده')
  if ((cat?.requireRootCause || i.severity === 'high' || i.severity === 'critical') && !i.rootCauseConfirmed) b.push('علت ریشه‌ای تأیید نشده است')
  const open = tasks.filter(isTaskOpen).length
  if (open > 0) b.push(`${open} اقدام باز یا تأییدنشده وجود دارد`)
  return b
}

export function categoryLabel(key: string | null | undefined): string {
  return key ? IM_CATEGORY_FA[key] ?? key : 'بدون دسته'
}

export type ExtensionCheck = { ok: true } | { ok: false; error: string }
export function validateExtensionRequest(currentDue: string | null, newDue: string, reason: string): ExtensionCheck {
  if (!currentDue) return { ok: false, error: 'سررسید فعلی ثبت نشده است' }
  if (newDue <= currentDue) return { ok: false, error: 'تاریخ جدید باید بعد از سررسید فعلی باشد' }
  if (reason.trim().length < 3) return { ok: false, error: 'دلیل تمدید الزامی است' }
  return { ok: true }
}

/** Separation of duties: executor may claim completion, only someone else (or admin) verifies. */
export function canVerifyTask(t: Pick<ImTask, 'executorId' | 'approverId' | 'status'>, userId: string, isAdmin: boolean): boolean {
  if (t.status !== 'pending_verification') return false
  if (isAdmin) return true
  if (t.executorId === userId) return false
  return t.approverId ? t.approverId === userId : true
}

/** DFS cycle detection for task dependencies; deps: taskId → prerequisite ids. */
export function hasDependencyCycle(deps: Record<string, string[]>): boolean {
  const state = new Map<string, 1 | 2>()
  const visit = (n: string): boolean => {
    const s = state.get(n)
    if (s === 1) return true
    if (s === 2) return false
    state.set(n, 1)
    for (const m of deps[n] ?? []) if (visit(m)) return true
    state.set(n, 2)
    return false
  }
  return Object.keys(deps).some(visit)
}

export const STAGE_ORDER_INDEX = (s: ImStage) => ['registered', 'validated', 'analysis', 'action_plan', 'in_progress', 'resolution_review', 'effectiveness_check', 'closed'].indexOf(s)
