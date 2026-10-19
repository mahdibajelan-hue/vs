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

const today = () => new Date().toISOString().slice(0, 10)
/** Finance decisions keep the earlier notes and add the comment of the decision. */
const decide = async (table: string, id: string, patch: Record<string, unknown>, note: string) => {
  const cur = note ? (await supabase.from(table).select('notes').eq('id', id).maybeSingle()).data?.notes : ''
  return upd(table, id, note ? { ...patch, notes: [cur, note].filter(Boolean).join('\n') } : patch)
}

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
  delay_assess: { ...M.delay_assess, ask: 'یک توقف ثبت‌شده در گزارش روزانه هنوز ارزیابی نشده است: مسئولیت آن با کیست؟ این ارزیابی پایهٔ ادعای زمان و هزینه است.', actions: () => [
    A('employer', 'کارفرما', 'good', 'opt', (i, x) => rpc('ex_stoppage_assess', { p_id: i.refId, p_resp: 'employer', p_critical: false, p_note: x.note })),
    A('contractor', 'پیمانکار', 'bad', 'opt', (i, x) => rpc('ex_stoppage_assess', { p_id: i.refId, p_resp: 'contractor', p_critical: false, p_note: x.note })),
    A('force_majeure', 'فورس‌ماژور', 'warn', 'opt', (i, x) => rpc('ex_stoppage_assess', { p_id: i.refId, p_resp: 'force_majeure', p_critical: false, p_note: x.note })),
    A('third_party', 'شخص ثالث', 'plain', 'opt', (i, x) => rpc('ex_stoppage_assess', { p_id: i.refId, p_resp: 'third_party', p_critical: false, p_note: x.note })),
  ] },
  delay_notice: { ...M.delay_notice, ask: 'برای این توقف هنوز اخطار کتبی تأخیر ثبت نشده است. پس از مهلت قراردادی، حق ادعای زمان ممکن است ساقط شود. تاریخ و شمارهٔ نامه را در «مدیریت اجرا ← تأخیرات و کلیم» ثبت کنید.', actions: () => [] },
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
  fin_certify: { ...M.fin_certify, ask: 'صورت‌وضعیت ارسال‌شده منتظر تأیید کارکرد است. با تأیید، مبلغ قابل پرداخت به‌عنوان مبلغ تأییدشده ثبت می‌شود؛ اگر مبلغ دیگری مدنظر است در ماژول مالی ثبت کنید.', actions: (i) => [
    A('certify', 'تأیید کارکرد', 'good', 'opt', async (it, x) => decide('fin_payment_certificates', it.refId, { certified_amount: num(it.extra.payable), certified_by: await uid(), certified_date: today(), status: 'certified' }, x.note)),
    ...(i.extra.status === 'submitted' ? [A('review', 'شروع بررسی', 'plain', 'opt', (it, x) => decide('fin_payment_certificates', it.refId, { status: 'under_review' }, x.note))] : []),
    A('reject', 'رد صورت‌وضعیت', 'bad', 'req', (it, x) => decide('fin_payment_certificates', it.refId, { status: 'rejected' }, x.note)),
  ] },
  fin_claim: { ...M.fin_claim, ask: 'کلایم پیمانکار منتظر تصمیم است. تأیید کامل مبلغ ادعا را می‌پذیرد؛ برای تأیید جزئی یا ارجاع به داوری، ماژول مالی را باز کنید.', actions: (i) => [
    A('approve', 'تأیید کامل', 'good', 'opt', (it, x) => decide('fin_claims', it.refId, { status: 'approved', amount_approved: num(it.extra.claimed), resolution_date: today() }, x.note)),
    ...(i.extra.status === 'submitted' ? [A('review', 'در دست بررسی', 'plain', 'opt', (it, x) => decide('fin_claims', it.refId, { status: 'under_review' }, x.note))] : []),
    A('reject', 'رد کلایم', 'bad', 'req', (it, x) => decide('fin_claims', it.refId, { status: 'rejected', amount_approved: 0, resolution_date: today() }, x.note)),
  ] },
  fin_retention: { ...M.fin_retention, ask: 'زمان آزادسازی حسن انجام کار رسیده است. پس از آزادسازی، آن را ثبت کنید.', actions: () => [
    A('released', 'آزاد شد', 'good', 'opt', (it, x) => decide('fin_retention_releases', it.refId, { status: 'released', actual_date: today(), actual_amount: num(it.extra.planned) }, x.note)),
  ] },
  fin_guarantee: { ...M.fin_guarantee, ask: 'ضمانت‌نامه به پایان اعتبار نزدیک است. تمدید یا آزادسازی آن را در ماژول مالی ثبت کنید.', actions: () => [] },
  fin_pay: { ...M.fin_pay, ask: 'بیش از ۳۰ روز از تأیید این صورت‌وضعیت گذشته و پرداخت کامل نشده است. پرداخت را در ماژول مالی ثبت کنید.', actions: () => [] },
  sch_review: { ...M.sch_review, ask: 'پیمانکار به‌روزرسانی برنامه را برای بررسی فرستاده است. نسخه را در «برنامه‌ریزی ← نسخه‌ها» ببینید؛ پس از تأیید شما، کارفرما می‌تواند آن را تأیید نهایی کند.', actions: () => [
    A('endorse', 'تأیید مشاور', 'good', 'opt', (i, x) => rpc('sch_review_version', { p_version: i.refId, p_decision: 'endorse', p_note: x.note })),
    A('return', 'بازگرداندن برای اصلاح', 'warn', 'req', (i, x) => rpc('sch_review_version', { p_version: i.refId, p_decision: 'return', p_note: x.note })),
  ] },
  sch_approve: { ...M.sch_approve, ask: 'نسخهٔ برنامه آمادهٔ تأیید نهایی است. با تأیید، نسخه قفل می‌شود و دیگر قابل ویرایش نیست.', actions: () => [
    A('approve', 'تأیید نهایی و قفل', 'good', 'none', (i) => rpc('sch_approve', { p_version: i.refId })),
  ] },
  sch_fix: { ...M.sch_fix, ask: 'مشاور نسخه را برگردانده است. دلیل را بخوانید، پیش‌نویس را اصلاح کنید و دوباره ارسال کنید.', actions: () => [] },
  sch_eot: { ...M.sch_eot, ask: 'پیمانکار تمدید زمان ادعا کرده و رویداد ارزیابی شده است. تعداد روز مصوب (پیش‌فرض: همان ادعا) را بپذیرید یا با ثبت دلیل رد کنید. جزئیات در «برنامه‌ریزی ← تحلیل تاخیرات».', actions: () => [
    A('approve', 'تأیید به‌اندازهٔ ادعا', 'good', 'opt', (i, x) => upd('sch_delay_events', i.refId, { status: 'approved', approved_days: num(i.extra.days), note: x.note || undefined })),
    A('reject', 'رد تمدید', 'bad', 'req', (i, x) => upd('sch_delay_events', i.refId, { status: 'rejected', approved_days: 0, note: x.note })),
  ] },
  mission_mine: { ...M.mission_mine, ask: 'مأموریت شما منتظر اقدام شماست؛ ادامهٔ کار در ماژول مأموریت‌ها است.', actions: () => [] },
}

