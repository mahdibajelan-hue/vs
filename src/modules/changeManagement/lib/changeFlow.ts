import type { ChangeRequest, ChangeStep } from '../types'

/** What the viewer is allowed to attempt (the server re-checks every call; this only hides buttons that would be refused). */
export interface Perms { isAdmin: boolean; roles: string[]; userId: string | null }
export const SUBMIT_ROLES = ['پیمانکار', 'مشاور', 'مجری', 'مدیر پروژه', 'مدیر مهندسی', 'مدیر برنامه‌ریزی و کنترل پروژه', 'مدیر کنترل پروژه', 'مدیر امور پیمان', 'مدیر ارشد پروژه']
export const EVALUATE_ROLES = ['مدیر مهندسی', 'مدیر برنامه‌ریزی و کنترل پروژه', 'مدیر کنترل پروژه', 'مدیر امور پیمان', 'مدیر پروژه', 'مدیر ارشد پروژه']
export const EXCEPTION_ROLES = ['مدیرعامل', 'مدیر ارشد پروژه']

export const canSubmit = (p: Perms) => p.isAdmin || p.roles.some((r) => SUBMIT_ROLES.includes(r))
export const canEvaluate = (p: Perms) => p.isAdmin || p.roles.some((r) => EVALUATE_ROLES.includes(r))
export const canDecideException = (p: Perms) => p.isAdmin || p.roles.some((r) => EXCEPTION_ROLES.includes(r))

export interface Actions { edit: boolean; submit: boolean; startEvaluation: boolean; completeEvaluation: boolean; decide: ChangeStep[]; startImplementation: boolean; recordResult: boolean; close: boolean; cancel: boolean; requestException: boolean }
export function actionsFor(r: ChangeRequest, steps: ChangeStep[], p: Perms, hasAuthorisedException: boolean): Actions {
  const mine = r.createdBy === p.userId || r.submittedBy === p.userId
  const ev = canEvaluate(p)
  const active = steps.filter((s) => s.attempt === r.attempt && s.status === 'active')
  const decide = active.filter((s) => (p.isAdmin || p.roles.includes(s.roleName)) && !mine && (r.status === 'awaiting_approval' || (r.status === 'implementing' && r.executedUnderException && !r.approvedAt)))
  return {
    edit: (r.status === 'draft' || r.status === 'returned') && (r.createdBy === p.userId || ev),
    submit: (r.status === 'draft' || r.status === 'returned') && canSubmit(p) && (r.createdBy === p.userId || ev),
    startEvaluation: r.status === 'submitted' && ev,
    completeEvaluation: r.status === 'evaluating' && ev,
    decide,
    startImplementation: ev && ((r.status === 'approved' && !!r.approvedAt) || (r.status === 'awaiting_approval' && hasAuthorisedException)),
    recordResult: r.status === 'implementing' && (ev || r.implementationOwnerId === p.userId),
    close: r.status === 'implemented' && ev && !!r.approvedAt,
    cancel: ['draft', 'submitted', 'evaluating', 'awaiting_approval', 'returned', 'approved'].includes(r.status) && (r.createdBy === p.userId || ev),
    requestException: ev && (r.status === 'evaluating' || r.status === 'awaiting_approval'),
  }
}

export const ERRORS: Record<string, string> = {
  not_authorized: 'شما مجاز به انجام این اقدام نیستید.', not_authorized_for_step: 'نقش شما با مرجع این مرحله یکی نیست.', self_approval_forbidden: 'ثبت‌کنندهٔ درخواست نمی‌تواند خودش آن را تصویب کند.',
  invalid_status: 'در وضعیت فعلی درخواست این اقدام ممکن نیست.', step_not_active: 'این مرحله اکنون در نوبت تصمیم نیست.', step_outdated: 'این مرحله مربوط به نسخهٔ قبلی درخواست است.', reason_required: 'ثبت دلیل/توضیح الزامی است.',
  reference_required: 'برای این مرحله شمارهٔ مصوبه الزامی است.', beyond_authority_limit: 'این تغییر از سقف اختیار نقش شما بیشتر است؛ آن را عودت دهید یا به مرجع بالاتر ارجاع شود.', opinion_cannot_reject: 'مرحلهٔ «نظر» فقط تأیید یا عودت دارد.',
  approved_exceeds_requested: 'مبلغ/مدت مصوب نمی‌تواند از مقدار درخواستی بیشتر باشد.', title_required: 'عنوان را وارد کنید.', description_required: 'شرح تغییر را وارد کنید.', type_required: 'نوع تغییر را انتخاب کنید.',
  not_owner: 'فقط ثبت‌کنندهٔ درخواست یا مسئول ارزیابی می‌تواند آن را ارسال کند.', approval_required: 'اجرا پیش از تصویب معتبر ممکن نیست؛ مگر با مجوز استثنای مصوب.', owner_and_due_required: 'مسئول اجرا و مهلت را مشخص کنید.',
  deviation_note_required: 'نتیجه مغایر با مصوبه است؛ توضیح مغایرت را بنویسید.', approval_pending: 'تصویب نهایی هنوز کامل نشده است؛ بستن ممکن نیست.', justification_required: 'توجیه استثنا حداقل ۱۰ نویسه باشد.', evidence_required: 'مستند/ارجاع استثنا را وارد کنید.',
  exception_pending: 'یک درخواست استثنا در انتظار تصمیم است.', locked_after_submit: 'پس از ارسال، این فیلدها قابل ویرایش نیستند؛ درخواست را عودت دهید.', workflow_fields_via_rpc: 'وضعیت و مسیر تصویب فقط از طریق گردش کار تغییر می‌کند.', evaluation_not_permitted: 'فقط مسئولان ارزیابی می‌توانند اطلاعات ارزیابی را ویرایش کنند.',
  ruleset_locked: 'مجموعهٔ قواعد فعال/بایگانی‌شده قابل ویرایش نیست؛ نسخهٔ جدید بسازید.', validation_failed: 'اعتبارسنجی قواعد خطا دارد؛ ابتدا خطاها را برطرف کنید.', target_not_found: 'رکورد مقصد پیدا نشد.',
}
export const friendly = (e: { message?: string } | null | undefined): string => { const m = e?.message ?? ''; const k = Object.keys(ERRORS).find((x) => m.includes(x)); return k ? ERRORS[k] : m.includes('row-level security') ? 'دسترسی شما برای این عملیات کافی نیست.' : m || 'خطای نامشخص' }

export const ACTION_FA: Record<string, string> = {
  submitted: 'ارسال درخواست', resubmitted: 'ارسال مجدد پس از عودت', evaluation_started: 'شروع ارزیابی', route_resolved: 'تعیین مسیر تصویب', route_blocked: 'توقف: مسیر تصویب قابل تعیین نبود', step_approved: 'تأیید مرحله', approved: 'تصویب نهایی', rejected: 'رد شد', returned: 'عودت داده شد',
  implementation_started: 'شروع اجرا', implementation_started_under_exception: 'شروع اجرا با مجوز استثنا', implemented: 'اجرا و ثبت نتیجه', implemented_with_deviation: 'اجرا با مغایرت از مصوبه', closed: 'بسته شد', cancelled: 'لغو شد', comment: 'یادداشت',
  exception_requested: 'درخواست استثنا', exception_authorised: 'استثنا مجاز شد', exception_refused: 'استثنا رد شد', linked_risk: 'پیوند به ریسک', linked_issue: 'پیوند به مسئله', unlinked_risk: 'حذف پیوند ریسک', unlinked_issue: 'حذف پیوند مسئله',
}
