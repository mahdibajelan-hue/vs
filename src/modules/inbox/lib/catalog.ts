import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { KIND_META as M, type ActionDef, type InboxItem, type InboxKind, type KindDef } from '../types'

const CODES: Record<string, string> = {
  not_allowed: 'نقش شما اجازهٔ این کار را ندارد', not_authorized_for_step: 'این مرحله برای نقش شما نیست', self_approval_forbidden: 'ثبت‌کنندهٔ درخواست نمی‌تواند خودش آن را تأیید کند', separation_of_duties: 'ثبت‌کننده نمی‌تواند خودش تأیید کند',
  note_required: 'برای رد یا بازگرداندن، ثبت علت لازم است', reason_required: 'برای رد یا بازگرداندن، ثبت علت لازم است', resolution_required: 'برای این تصمیم، شرح تعیین تکلیف لازم است', reference_required: 'شمارهٔ نامه یا مرجع تأیید لازم است',
  not_pending: 'این مورد دیگر در انتظار تصمیم نیست (شخص دیگری تصمیم گرفته است)', step_not_active: 'این مرحله دیگر فعال نیست', step_outdated: 'این مرحله قدیمی شده است', bad_state: 'وضعیت فعلی اجازهٔ این کار را نمی‌دهد',
  insufficient_stock: 'موجودی انبار برای این برداشت کافی نیست', authority_required: 'اختیار لازم برای این تصمیم را ندارید', cannot_decide_own_request: 'درخواست‌دهنده نمی‌تواند خودش تصمیم بگیرد', acceptance_not_pending: 'این درخواست دیگر در انتظار نیست',
}
export function explain(error: { message?: string } | null): string | null {
  if (!error) return null
  const m = error.message ?? ''
  const hit = Object.keys(CODES).find((k) => m.includes(k))
  return hit ? CODES[hit] : friendlyErrorMessage(error as { message: string })
}
const rpc = async (fn: string, args: Record<string, unknown>) => explain((await supabase.rpc(fn, args)).error)
const upd = async (table: string, id: string, patch: Record<string, unknown>) => explain((await supabase.from(table).update(patch).eq('id', id)).error)
const uid = async () => (await supabase.auth.getUser()).data.user?.id ?? null
const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number(v) || d)

const A = (key: string, label: string, tone: ActionDef['tone'], note: ActionDef['note'], run: ActionDef['run'], field?: ActionDef['field']): ActionDef => ({ key, label, tone, note, run, field })
const yesNo = (fn: string, idArg: string, approveArg: string): ActionDef[] => [
  A('approve', 'تأیید', 'good', 'opt', (i, x) => rpc(fn, { [idArg]: i.refId, [approveArg]: true, p_note: x.note })),
  A('reject', 'رد', 'bad', 'req', (i, x) => rpc(fn, { [idArg]: i.refId, [approveArg]: false, p_note: x.note })),
]

/** Everything the inbox knows how to show and do, per kind of item. Each action calls the owning module's own RPC, which re-checks the same permissions. */
export const KINDS: Record<InboxKind, KindDef> = {
  review: { ...M.review, ask: 'کارکرد ثبت‌شده را بررسی کنید: ردیف‌به‌ردیف تأیید یا برگردانید، یا کل گزارش را یکجا تصمیم بگیرید.', actions: () => [
    A('approved', 'تأیید کل گزارش', 'good', 'opt', (i, x) => rpc('ex_report_decide_whole', { p_id: i.refId, p_decision: 'approved', p_note: x.note })),
    A('returned', 'برگرداندن برای اصلاح', 'warn', 'req', (i, x) => rpc('ex_report_decide_whole', { p_id: i.refId, p_decision: 'returned', p_note: x.note })),
    A('rejected', 'رد گزارش', 'bad', 'req', (i, x) => rpc('ex_report_decide_whole', { p_id: i.refId, p_decision: 'rejected', p_note: x.note })),
  ] },
  fix: { ...M.fix, ask: 'این گزارش برای اصلاح یا تکمیل به شما برگشته است. اصلاح آن در ماژول مدیریت اجرا انجام می‌شود.', actions: () => [] },
  gap: { ...M.gap, ask: 'مسئول رفع این کسری شمایید. وضعیت پیگیری را ثبت کنید.', actions: (i) => [
    ...(i.extra.status === 'open' ? [A('progress', 'شروع پیگیری', 'plain', 'opt', (it, x) => upd('ex_gap_items', it.refId, { status: 'in_progress', note: x.note, updated_at: new Date().toISOString() }))] : []),
    A('close', 'رفع شد — بستن', 'good', 'opt', (it, x) => upd('ex_gap_items', it.refId, { status: 'closed', note: x.note, updated_at: new Date().toISOString() })),
  ] },
  sign: { ...M.sign, ask: 'نوبت امضای شما در مجوز خروج کالا رسیده است.', actions: () => [
    A('approve', 'امضا و تأیید', 'good', 'opt', (i, x) => rpc('mtl_req_sign', { p_req: i.refId, p_decision: 'approve', p_note: x.note, p_issue: null })),
    A('reject', 'رد درخواست', 'bad', 'req', (i, x) => rpc('mtl_req_sign', { p_req: i.refId, p_decision: 'reject', p_note: x.note, p_issue: null })),
  ] },
  discrepancy: { ...M.discrepancy, ask: 'مسئول تعیین تکلیف این مغایرت شمایید؛ تصمیم و شرح آن را ثبت کنید.', actions: () => [
    A('accepted', 'پذیرفتن مغایرت', 'warn', 'req', (i, x) => rpc('mtl_decide_discrepancy', { p_id: i.refId, p_status: 'accepted', p_resolution: x.note })),
    A('resolved', 'رفع شد', 'good', 'req', (i, x) => rpc('mtl_decide_discrepancy', { p_id: i.refId, p_status: 'resolved', p_resolution: x.note })),
    A('escalated', 'ارجاع به بالاتر', 'plain', 'req', (i, x) => rpc('mtl_decide_discrepancy', { p_id: i.refId, p_status: 'escalated', p_resolution: x.note })),
    A('rejected', 'رد مغایرت', 'bad', 'req', (i, x) => rpc('mtl_decide_discrepancy', { p_id: i.refId, p_status: 'rejected', p_resolution: x.note })),
  ] },
  change: { ...M.change, ask: 'تغییر مقدار یا مشخصهٔ کالا درخواست شده است.', actions: () => yesNo('mtl_decide_change', 'p_id', 'p_approve') },
  txn: { ...M.txn, ask: 'یک تراکنش انبار منتظر تأیید شماست.', actions: () => yesNo('mtl_decide_txn', 'p_id', 'p_approve') },
  stage: { ...M.stage, ask: 'مرحلهٔ ارسال‌شده را بررسی و تأیید یا رد کنید.', actions: () => [
    A('approve', 'تأیید مرحله', 'good', 'opt', (i, x) => rpc('mtl_stage_decide', { p_stage: i.refId, p_decision: 'approve', p_note: x.note })),
    A('reject', 'رد مرحله', 'bad', 'req', (i, x) => rpc('mtl_stage_decide', { p_stage: i.refId, p_decision: 'reject', p_note: x.note })),
  ] },
  stage_fix: { ...M.stage_fix, ask: 'این مرحله رد شده است؛ اصلاح و ارسال مجدد در ماژول کنترل متریال انجام می‌شود.', actions: () => [] },
  verify: { ...M.verify, ask: 'مجری اتمام اقدام را اعلام کرده است؛ تأیید یا بازگشت.', actions: () => [
    A('accept', 'تأیید اتمام', 'good', 'opt', async (i) => upd('im_issue_tasks', i.refId, { status: 'done', verified_by: await uid(), verified_at: new Date().toISOString() })),
    A('back', 'برگشت به مجری', 'warn', 'opt', (i) => upd('im_issue_tasks', i.refId, { status: 'in_progress', completion_claimed_at: null })),
  ] },
  extension: { ...M.extension, ask: 'درخواست تمدید مهلت را تأیید یا رد کنید.', actions: () => [
    A('approve', 'تأیید تمدید', 'good', 'opt', (i, x) => rpc('im_decide_extension', { p_ext: i.refId, p_approve: true, p_note: x.note })),
    A('reject', 'رد تمدید', 'bad', 'req', (i, x) => rpc('im_decide_extension', { p_ext: i.refId, p_approve: false, p_note: x.note })),
  ] },
  task: { ...M.task, ask: 'پیشرفت را ثبت کنید یا پس از اتمام، برای تأیید بفرستید.', actions: (i) => [
    ...(i.extra.status === 'todo' || i.extra.status === 'not_started' ? [A('start', 'شروع کار', 'plain', 'none', (it) => upd('im_issue_tasks', it.refId, { status: 'in_progress' }))] : []),
    A('progress', 'ثبت پیشرفت', 'plain', 'opt', (it, x) => upd('im_issue_tasks', it.refId, { progress: Math.max(0, Math.min(100, Math.round(x.progress ?? num(it.extra.progress)))), last_progress_at: new Date().toISOString() }), 'progress'),
    A('done', 'اتمام — ارسال برای تأیید', 'good', 'opt', async (it) => upd('im_issue_tasks', it.refId, { status: 'pending_verification', completion_claimed_at: new Date().toISOString(), completion_claimed_by: await uid() })),
  ] },
  risk_action: { ...M.risk_action, ask: 'پیشرفت اقدام را ثبت کنید یا پس از اتمام، آن را ببندید.', actions: (i) => [
    ...(i.extra.status === 'not_started' ? [A('start', 'شروع کار', 'plain', 'none', (it) => upd('rm_risk_actions', it.refId, { status: 'in_progress' }))] : []),
    A('progress', 'ثبت پیشرفت', 'plain', 'opt', (it, x) => upd('rm_risk_actions', it.refId, { completion_percentage: Math.max(0, Math.min(99, Math.round(x.progress ?? num(it.extra.progress)))), status: 'in_progress', updated_at: new Date().toISOString() }), 'progress'),
    A('done', 'انجام شد', 'good', 'opt', (it, x) => upd('rm_risk_actions', it.refId, { status: 'completed', completion_percentage: 100, completed_at: new Date().toISOString(), evidence_note: x.note, updated_at: new Date().toISOString() })),
  ] },
  acceptance: { ...M.acceptance, ask: 'درخواست پذیرش ریسک باقیمانده را تأیید یا رد کنید.', actions: () => yesNo('rm_decide_acceptance', 'p_id', 'p_approve') },
  change_step: { ...M.change_step, ask: 'نوبت نظر یا تصویب شما در مسیر تأیید درخواست تغییر است.', actions: (i) => {
    const needsRef = !!i.extra.requiresReference
    const dec = (d: 'approve' | 'reject' | 'return') => (it: InboxItem, x: { note: string; refNo?: string; refDate?: string }) => rpc('cm_decide_step', { p_step: it.refId, p_decision: d, p_opinion: x.note, p_ref_no: x.refNo ?? '', p_ref_date: x.refDate || null })
    return [A('approve', i.extra.kind === 'opinion' ? 'ثبت نظر' : 'تأیید', 'good', 'opt', dec('approve'), needsRef ? 'ref' : undefined), A('return', 'برگشت برای اصلاح', 'warn', 'req', dec('return')), ...(i.extra.kind === 'opinion' ? [] : [A('reject', 'رد', 'bad', 'req', dec('reject'))])]
  } },
  mission_decide: { ...M.mission_decide, ask: 'درخواست یا گزارش مأموریت منتظر تصمیم شماست.', actions: (i) => {
    const req = i.extra.status === 'pending_approval'
    return [
      A('approve', req ? 'تأیید مأموریت' : 'تأیید گزارش', 'good', 'opt', (it, x) => rpc('ms_transition', { p_mission_id: it.refId, p_action: req ? 'approve_request' : 'approve_report', p_comment: x.note, p_data: {} })),
      A('return', 'برگشت برای اصلاح', 'warn', 'req', (it, x) => rpc('ms_transition', { p_mission_id: it.refId, p_action: req ? 'return_request' : 'return_report', p_comment: x.note, p_data: {} })),
      ...(req ? [A('reject', 'رد مأموریت', 'bad', 'req', (it, x) => rpc('ms_transition', { p_mission_id: it.refId, p_action: 'reject_request', p_comment: x.note, p_data: {} }))] : []),
    ]
  } },
  mission_mine: { ...M.mission_mine, ask: 'مأموریت شما منتظر اقدام شماست؛ ادامهٔ کار در ماژول مأموریت‌ها است.', actions: () => [] },
}

