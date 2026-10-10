import type { MtlRole, MtlSettings } from '../../types'

/** Same matrix as mtl_default_perms() in the database; the database enforces it, this only decides what the screen offers. */
export const DEFAULT_PERMS: Record<MtlRole, string[]> = {
  contractor: ['edit_items', 'edit_packages', 'submit_stage', 'post_txn', 'raise'],
  consultant: ['review_stage', 'decide_discrepancy', 'review_change', 'approve_txn', 'raise'],
  employer: ['review_stage', 'approve_stage', 'decide_discrepancy', 'approve_change', 'approve_baseline', 'approve_txn', 'raise'],
  storekeeper: ['post_txn'],
  controller: ['edit_items', 'edit_packages', 'post_txn', 'approve_txn', 'sync', 'raise'],
  inspector: ['inspect', 'review_stage'],
  manager: ['*'],
}

export const ACTIONS: { key: string; label: string }[] = [
  { key: 'edit_items', label: 'ثبت و ویرایش اقلام MTO' }, { key: 'edit_packages', label: 'ثبت بسته‌های خرید و سفارش‌ها' }, { key: 'submit_stage', label: 'ارسال مرحلهٔ تأمین با مدرک' },
  { key: 'review_stage', label: 'بررسی مرحلهٔ تأمین' }, { key: 'approve_stage', label: 'تأیید نهایی مرحله' }, { key: 'post_txn', label: 'ثبت ورود، انتقال و حواله مصرف' }, { key: 'approve_txn', label: 'تأیید ضایعات و تعدیل' },
  { key: 'inspect', label: 'بازرسی ورودی' }, { key: 'sync', label: 'همگام‌سازی مغایرت‌ها' }, { key: 'decide_discrepancy', label: 'تعیین تکلیف مغایرت' }, { key: 'review_change', label: 'بررسی تغییر مقدار/قیمت' },
  { key: 'approve_change', label: 'تأیید تغییر مقدار/قیمت' }, { key: 'approve_baseline', label: 'تصویب مبنای قیمت و وزن' }, { key: 'raise', label: 'ایجاد ریسک و مسئله' },
]

/** Whether any of the user's roles in the project grants the action (administrators are handled by the caller). */
export function roleAllows(roles: MtlRole[], action: string, settings?: Pick<MtlSettings, 'rolePerms'>): boolean {
  return roles.some((r) => { const list = settings?.rolePerms?.[r] ?? DEFAULT_PERMS[r] ?? []; return list.includes('*') || list.includes(action) })
}
