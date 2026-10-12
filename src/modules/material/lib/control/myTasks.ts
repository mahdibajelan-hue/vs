import { faDate, faNum } from './fmt'
import type { ItemStage, MtlChange, MtlDiscrepancy, MtlTxn, Requisition, RequisitionSigner, StageDef } from '../../types'

export type TaskKind = 'stage_decide' | 'stage_fix' | 'stage_do' | 'sign' | 'discrepancy' | 'change' | 'txn' | 'record'
export interface MyTask {
  id: string
  kind: TaskKind
  title: string
  sub: string
  /** where the person goes to do it */
  go: { tab: string; sub?: string; record?: { type: 'risk' | 'issue'; id: string } }
  /** days overdue / waiting (0 = not late) and a coarse urgency for ordering */
  late: number
  urgent: boolean
}

export const TASK_KIND_LABEL_FA: Record<TaskKind, string> = { stage_decide: 'تأیید مرحله', stage_fix: 'اصلاح مرحلهٔ ردشده', stage_do: 'مرحلهٔ من', sign: 'امضای مجوز خروج', discrepancy: 'مغایرت', change: 'تغییر مقدار/قیمت', txn: 'تأیید تراکنش', record: 'ریسک و مسئله' }

const day = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)

export interface TaskInput {
  uid: string | null
  today: string
  can: (action: string) => boolean
  stages: ItemStage[]
  defs: Map<string, StageDef>
  /** item name / package code of a stage */
  stageLabel: (s: ItemStage) => { item: string; pkg: string }
  discrepancies: MtlDiscrepancy[]
  discLabel: (d: MtlDiscrepancy) => string
  changes: MtlChange[]
  changeLabel: (c: MtlChange) => string
  txns: MtlTxn[]
  txnLabel: (t: MtlTxn) => string
  requisitions: Requisition[]
  signers: RequisitionSigner[]
  records: { id: string; type: 'risk' | 'issue'; title: string; due: string | null }[]
}

/** Everything that waits for this person in the module, newest-urgent first. Nothing here is a to-do list kept by hand: each task disappears when the underlying record moves on. */
export function buildMyTasks(a: TaskInput): MyTask[] {
  const out: MyTask[] = []
  if (!a.uid) return out
  const myTurn = (s: ItemStage, d: StageDef | undefined) => !!d && (d.reviewLevel === 'employer' ? a.can('approve_stage') : d.reviewLevel === 'both' ? (s.status === 'submitted' ? a.can('review_stage') : a.can('approve_stage')) : a.can('review_stage') || a.can('approve_stage')) && s.submittedBy !== a.uid
  for (const s of a.stages) {
    if (!s.applicable) continue
    const d = a.defs.get(s.stageKey)
    const l = a.stageLabel(s)
    if ((s.status === 'submitted' || s.status === 'reviewed') && myTurn(s, d)) {
      const w = s.submittedAt ? day(a.today, s.submittedAt.slice(0, 10)) : 0
      out.push({ id: `sd:${s.id}`, kind: 'stage_decide', title: `${d?.title ?? 'مرحله'} — ${l.item}`, sub: `بسته ${l.pkg} · در انتظار تصمیم شما${w > 0 ? ` از ${faNum(w, 0)} روز پیش` : ''}`, go: { tab: 'progress', sub: 'inbox' }, late: Math.max(0, w - 7), urgent: w > 7 })
    } else if (s.status === 'rejected' && (s.submittedBy === a.uid || s.responsible === a.uid)) {
      out.push({ id: `sf:${s.id}`, kind: 'stage_fix', title: `${d?.title ?? 'مرحله'} — ${l.item}`, sub: `ردشده: ${s.rejectReason || 'بدون توضیح'} · اصلاح و ارسال مجدد`, go: { tab: 'packages', sub: 'packages' }, late: 0, urgent: true })
    } else if (s.responsible === a.uid && (s.status === 'pending')) {
      const late = s.plannedDate && s.plannedDate < a.today ? day(a.today, s.plannedDate) : 0
      out.push({ id: `sm:${s.id}`, kind: 'stage_do', title: `${d?.title ?? 'مرحله'} — ${l.item}`, sub: `بسته ${l.pkg}${s.plannedDate ? ` · برنامه ${faDate(s.plannedDate)}` : ''}${late ? ` · ${faNum(late, 0)} روز عقب` : ''}`, go: { tab: 'packages', sub: 'packages' }, late, urgent: late > 0 })
    }
  }
  for (const r of a.requisitions) {
    if (r.status !== 'awaiting_signatures') continue
    const sg = a.signers.filter((x) => x.requisitionId === r.id).sort((x, y) => x.sort - y.sort)
    const next = sg.find((x) => x.decision !== 'approved')
    if (next && next.userId === a.uid && next.decision === 'pending') out.push({ id: `rq:${r.id}`, kind: 'sign', title: `مجوز خروج ${r.number} — ${r.facility || 'بدون محل'}`, sub: `نوبت امضای شما${r.neededBy ? ` · نیاز تا ${faDate(r.neededBy)}` : ''}`, go: { tab: 'stock', sub: 'requisitions' }, late: r.neededBy && r.neededBy < a.today ? day(a.today, r.neededBy) : 0, urgent: !!r.neededBy && r.neededBy <= a.today })
  }
  for (const d of a.discrepancies) if (d.responsible === a.uid && (d.status === 'open' || d.status === 'in_review')) {
    const late = d.dueDate && d.dueDate < a.today ? day(a.today, d.dueDate) : 0
    out.push({ id: `dc:${d.id}`, kind: 'discrepancy', title: a.discLabel(d), sub: `مسئول تعیین تکلیف${d.dueDate ? ` · مهلت ${faDate(d.dueDate)}` : ''}`, go: { tab: 'discrepancy' }, late, urgent: late > 0 })
  }
  if (a.can('review_change') || a.can('approve_change')) for (const c of a.changes) if (c.status === 'requested' && c.requestedBy !== a.uid) out.push({ id: `ch:${c.id}`, kind: 'change', title: a.changeLabel(c), sub: `درخواست تغییر در انتظار تصمیم${c.reason ? ` · ${c.reason}` : ''}`, go: { tab: 'mto', sub: 'changes' }, late: 0, urgent: false })
  if (a.can('approve_txn')) for (const t of a.txns) if (t.status === 'pending' && t.createdBy !== a.uid) out.push({ id: `tx:${t.id}`, kind: 'txn', title: a.txnLabel(t), sub: 'ضایعات یا تعدیل در انتظار تأیید', go: { tab: 'stock', sub: 'moves' }, late: 0, urgent: false })
  for (const r of a.records) out.push({ id: `rc:${r.id}`, kind: 'record', title: r.title, sub: `${r.type === 'risk' ? 'ریسک' : 'مسئله'} مرتبط با متریال · شما مسئول آن هستید${r.due ? ` · مهلت ${faDate(r.due)}` : ''}`, go: { tab: 'dashboard', record: { type: r.type, id: r.id } }, late: r.due && r.due < a.today ? day(a.today, r.due) : 0, urgent: !!r.due && r.due < a.today })
  return out.sort((x, y) => Number(y.urgent) - Number(x.urgent) || y.late - x.late || x.title.localeCompare(y.title, 'fa'))
}
