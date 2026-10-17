import type { EngDocRow, EngStatus } from '../../execution/epcTypes'
import type { ExRole } from '../../execution/types'

/** Who the document is waiting for — the party that must act next. Documents circulate only between the contractor and the supervision consultant: the ball is never with the employer (who may only comment). */
export type Court = 'contractor' | 'consultant' | 'done'
export type EngLens = 'contractor' | 'consultant' | 'employer' | 'manager'

export const COURT_LABEL_FA: Record<Court, string> = { contractor: 'پیمانکار / طراح', consultant: 'مشاور نظارت', done: 'تکمیل' }
export const COURT_COLOR: Record<Court, string> = { contractor: '#f97316', consultant: '#0ea5e9', done: '#22c55e' }
export const LENS_LABEL_FA: Record<EngLens, string> = { contractor: 'پیمانکار', consultant: 'مشاور', employer: 'کارفرما', manager: 'مدیر / نظارت کل' }

export function courtOf(status: EngStatus): Court {
  if (status === 'required' || status === 'in_preparation') return 'contractor'
  if (status === 'issued' || status === 'pending_approval' || status === 'restricted') return 'consultant'
  return 'done'
}

/** The person's lens on the module, from their execution-project roles (strongest first). */
export function lensOf(roles: ExRole[]): EngLens {
  if (roles.includes('manager')) return 'manager'
  if (roles.includes('employer')) return 'employer'
  if (roles.includes('consultant') || roles.includes('supervision')) return 'consultant'
  return 'contractor'
}

/** Next states a lens may move a document to from its current state (the database enforces the same matrix in ex_doc_transition). */
export function nextMoves(status: EngStatus, lens: EngLens): { to: EngStatus; label: string; tone: 'go' | 'back' | 'warn' }[] {
  const all = lens === 'manager'
  const m: { to: EngStatus; label: string; tone: 'go' | 'back' | 'warn' }[] = []
  if ((status === 'required' || status === 'in_preparation') && (lens === 'contractor' || all)) {
    if (status === 'required') m.push({ to: 'in_preparation', label: 'شروع تهیه', tone: 'go' })
    m.push({ to: 'issued', label: 'ارسال برای مشاور', tone: 'go' })
  }
  if ((status === 'issued' || status === 'pending_approval' || status === 'restricted') && (lens === 'consultant' || all)) {
    m.push({ to: 'approved', label: status === 'restricted' ? 'رفع محدودیت و تأیید' : 'تأیید', tone: 'go' })
    if (status !== 'restricted') m.push({ to: 'restricted', label: 'تأیید با محدودیت', tone: 'warn' })
    m.push({ to: 'in_preparation', label: 'بازگشت برای اصلاح', tone: 'back' })
  }
  return m
}

export type TaskKind = 'prepare' | 'review' | 'approve' | 'lift' | 'escalate'
export const TASK_KIND_LABEL_FA: Record<TaskKind, string> = { prepare: 'تهیه مدرک', review: 'بررسی مشاور', approve: 'تأیید مشاور', lift: 'رفع محدودیت', escalate: 'پیگیری معوق' }
export interface EngTask { id: string; docId: string; kind: TaskKind; title: string; sub: string; urgent: boolean; overdueDays: number; blocking: boolean; critical: boolean }

const diff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000)

/** «کارهای من»: the documents whose next move belongs to the viewer's lens, most urgent first. blockedDocIds = documents currently blocking an execution activity. */
export function buildEngTasks(docs: EngDocRow[], lens: EngLens, today: string, blockedDocIds: Set<string> = new Set()): EngTask[] {
  const out: EngTask[] = []
  for (const d of docs) {
    if (d.status === 'superseded') continue
    const court = courtOf(d.status)
    if (court === 'done') continue
    const mine = lens === 'manager' ? true : court === lens
    if (!mine) continue
    const due = court === 'contractor' ? d.plannedPrepared : d.plannedApproved
    const overdue = due && due < today ? diff(today, due) : 0
    const kind: TaskKind = lens === 'manager' ? 'escalate' : court === 'contractor' ? 'prepare' : d.status === 'restricted' ? 'lift' : 'review'
    if (lens === 'manager' && !overdue && !d.critical && !blockedDocIds.has(d.id)) continue
    if (lens === 'contractor' && !overdue && (!due || diff(due, today) > 14) && !d.critical && !blockedDocIds.has(d.id)) continue
    const blocking = blockedDocIds.has(d.id)
    out.push({ id: d.id, docId: d.id, kind, title: `${d.docNo} — ${d.title}`, sub: `${d.discipline}${d.category ? ` · ${d.category}` : ''} · ${COURT_LABEL_FA[court]}${due ? ` · موعد ${due}` : ''}`, urgent: overdue > 0 || blocking || d.critical, overdueDays: overdue, blocking, critical: d.critical })
  }
  return out.sort((a, b) => Number(b.blocking) - Number(a.blocking) || b.overdueDays - a.overdueDays || Number(b.critical) - Number(a.critical))
}

/** How many documents sit with each party (weights ignored — a head-count of the ball's position). */
export function courtCounts(docs: Pick<EngDocRow, 'status' | 'weight'>[]): Record<Court, { n: number; w: number }> {
  const r: Record<Court, { n: number; w: number }> = { contractor: { n: 0, w: 0 }, consultant: { n: 0, w: 0 }, done: { n: 0, w: 0 } }
  for (const d of docs) { if (d.status === 'superseded') continue; const c = courtOf(d.status); r[c].n++; r[c].w += d.weight }
  return r
}
