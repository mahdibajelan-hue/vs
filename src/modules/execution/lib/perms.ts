import type { ExRole, ExSettings } from '../types'

/** Same matrix as ex_default_perms() in the database; the database enforces it, this only decides what the screen offers. */
export const DEFAULT_PERMS: Record<ExRole, string[]> = {
  contractor: ['record', 'submit', 'edit_activities', 'edit_baseline', 'manage_gaps', 'raise'],
  supervision: ['review', 'reopen', 'manage_gaps', 'raise'],
  consultant: ['review', 'manage_gaps', 'approve_activity', 'raise'],
  employer: ['review', 'approve_activity', 'approve_baseline', 'manage_gaps', 'raise'],
  manager: ['*'],
}
export const ACTIONS: { key: string; label: string }[] = [
  { key: 'record', label: 'ثبت و ویرایش گزارش‌ها' }, { key: 'submit', label: 'ارسال گزارش برای بررسی' }, { key: 'review', label: 'بررسی، تأیید، رد و بازگرداندن' }, { key: 'reopen', label: 'بازگشایی گزارش تأییدشده' },
  { key: 'edit_activities', label: 'ثبت فعالیت‌ها و فهرست‌بها' }, { key: 'approve_activity', label: 'تأیید ردیف ستاره‌دار / خاص' }, { key: 'edit_baseline', label: 'ثبت نسخهٔ مبنا (مقدار و وزن)' }, { key: 'approve_baseline', label: 'تصویب نسخهٔ مبنا' },
  { key: 'manage_gaps', label: 'مدیریت کسری گزارش‌ها' }, { key: 'raise', label: 'ایجاد ریسک و مسئله' },
]
export function roleAllows(roles: ExRole[], action: string, settings?: Pick<ExSettings, 'rolePerms'>): boolean {
  return roles.some((r) => { const list = settings?.rolePerms?.[r] ?? DEFAULT_PERMS[r] ?? []; return list.includes('*') || list.includes(action) })
}
