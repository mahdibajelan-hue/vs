import type { Analysis } from './kpis'
import type { CrossingState } from './facilities'
import type { Crossing, LandRole, ReviewAction } from '../types'
import { allowedActions } from './approval'
import { currentStage, overdueStages, stageDelay } from './workflow'
import { STAGE_LABEL } from './labels'
import { fmtDate, fmtDuration, faNum } from './fa'

/** Which role is responsible for a task. */
export type TaskOwner = 'contractor' | 'consultant' | 'employer_legal' | 'project_manager'
export type TaskLevel = 'bad' | 'warn' | 'info'
export interface Task {
  id: string
  owner: TaskOwner
  level: TaskLevel
  title: string
  detail: string
  /** Opens this parcel (or crossing) when the row is clicked. */
  parcelId?: string
  crossingId?: string
  /** One-click workflow action available to the signed-in user, if any. */
  action?: ReviewAction
}

const RANK: Record<TaskLevel, number> = { bad: 0, warn: 1, info: 2 }
const name = (a: Analysis) => `قطعهٔ ${a.parcel.code}${a.parcel.title ? ` (${a.parcel.title})` : ''}`

/**
 * Everything on the land-acquisition side that is waiting for somebody, by the role that has to act: the contractor enters data (and fixes what was
 * returned), the consultant reviews, the employer's legal officer attests and watches the 1358-law deadlines, the project manager approves finally and
 * decides exceptional prices. Pure — the page filters it by the signed-in user's role.
 */
export function buildTasks(all: Analysis[], crossings: { c: Crossing; st: CrossingState }[], today: string): Task[] {
  const out: Task[] = []
  for (const a of all) {
    const p = a.parcel
    const who = name(a)
    if (p.approvalStatus === 'draft' && p.approvalNote) out.push({ id: `ret:${p.id}`, owner: 'contractor', level: 'bad', title: `${who} برای اصلاح برگشت خورد`, detail: p.approvalNote, parcelId: p.id })
    if (p.approvalStatus === 'submitted') out.push({ id: `rev:${p.id}`, owner: 'consultant', level: 'warn', title: `${who} منتظر بررسی مشاور است`, detail: 'اطلاعات ارسالی پیمانکار را تأیید یا برگشت دهید.', parcelId: p.id, action: 'approve' })
    if (p.approvalStatus === 'consultant_approved') out.push({ id: `att:${p.id}`, owner: 'employer_legal', level: 'warn', title: `${who} منتظر صحه‌گذاری حقوقی است`, detail: 'پس از تأیید مشاور، موضوع را از نظر حقوقی بررسی و صحه‌گذاری کنید.', parcelId: p.id, action: 'attest' })
    if (p.approvalStatus === 'legal_attested') out.push({ id: `fin:${p.id}`, owner: 'project_manager', level: 'warn', title: `${who} منتظر تأیید نهایی است`, detail: 'صحه‌گذاری حقوقی انجام شده؛ تأیید نهایی با مدیر پروژه است.', parcelId: p.id, action: 'final' })
    if (p.priceException?.status === 'requested') out.push({ id: `px:${p.id}`, owner: 'project_manager', level: 'warn', title: `قیمت استثنایی ${who}`, detail: `درخواست ${faNum(p.priceException.price)} ریال بر متر مربع؛ دلیل: ${p.priceException.reason}`, parcelId: p.id })

    if (a.released && !a.stay) {
      // free land still has legal deadlines, but nothing more for the contractor to chase
    } else {
      if (a.early.state === 'action_required' && a.early.startBy) out.push({ id: `early:${p.id}`, owner: 'contractor', level: 'bad', title: `${who}: شروع تحصیل از ${fmtDate(a.early.startBy)} عقب است`, detail: 'تحصیل باید شروع می‌شد؛ مرحلهٔ بعدی را انجام دهید یا مسیر تسریع‌شده را بررسی کنید.', parcelId: p.id })
      const late = overdueStages(p, today)[0]
      if (late) out.push({ id: `late:${p.id}`, owner: 'contractor', level: stageDelay(late, today) > 30 ? 'bad' : 'warn', title: `${who}: مرحلهٔ «${STAGE_LABEL[late.key]}» ${fmtDuration(stageDelay(late, today))} عقب است`, detail: `برنامه ${fmtDate(late.plannedDate!)}${currentStage(p) && currentStage(p)!.key !== late.key ? ` · مرحلهٔ جاری: ${STAGE_LABEL[currentStage(p)!.key]}` : ''}`, parcelId: p.id })
    }
    for (const c of a.clocks) {
      if (c.status !== 'overdue' && c.status !== 'due_soon') continue
      out.push({ id: `clk:${p.id}:${c.key}`, owner: 'employer_legal', level: c.status === 'overdue' ? 'bad' : 'warn', title: `${who}: ${c.title}`, detail: `${c.article} · ${c.status === 'overdue' ? `مهلت ${fmtDate(c.due)} گذشته است` : `${faNum(c.daysLeft)} روز تا مهلت ${fmtDate(c.due)}`}`, parcelId: p.id })
    }
  }
  for (const { c, st } of crossings) {
    const crit = st.alarms.filter((x) => x.level === 'critical')
    if (st.status === 'critical' || st.status === 'attention') {
      const alarm = crit[0] ?? st.alarms[0]
      out.push({ id: `cr:${c.id}`, owner: 'contractor', level: st.status === 'critical' ? 'bad' : 'warn', title: `عبور از ${c.name || c.code}`, detail: alarm?.text ?? 'مجوز یا تعهدنامه نیاز به پیگیری دارد.', crossingId: c.id })
    }
  }
  return out.sort((a, b) => RANK[a.level] - RANK[b.level])
}

/** The tasks a user sees: their own role's; the executive and admins see everyone's; a user with no project role sees all of them read-only. */
export function tasksFor(tasks: Task[], role: LandRole | null, isAdmin: boolean): Task[] {
  if (isAdmin || role === 'executive' || !role) return tasks
  return tasks.filter((t) => t.owner === role)
}

/** The workflow action the signed-in user may take on a task's parcel right now (so a button is only shown when the server would accept it). */
export function actionOf(t: Task, status: Analysis['parcel']['approvalStatus'], role: LandRole | null, isAdmin: boolean): ReviewAction | undefined {
  return t.action && allowedActions(status, role, isAdmin).includes(t.action) ? t.action : undefined
}

export const OWNER_LABEL: Record<TaskOwner, string> = { contractor: 'پیمانکار', consultant: 'مشاور', employer_legal: 'حقوقی کارفرما', project_manager: 'مدیر پروژه' }
