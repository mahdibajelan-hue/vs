/**
 * Module manifest — everything the host application needs to know to mount this module.
 * The launchpad card, the Project-Radar entry, the RBAC registry and RootApp all read from here, so
 * renaming the module or changing its key is a one-line change and the host never hard-codes it.
 */
export const MISSIONS_MODULE = {
  /** ModuleKey in useModuleStore, rasta_modules.key in the database, and RBAC module_key. */
  key: 'missions',
  labelFa: 'مأموریت و بازدید پروژه',
  labelEn: 'Mission & Visit Debrief',
  descriptionFa: 'درخواست مأموریت، گزارش‌گیری هوشمند پس از بازدید، کشف Issue/Risk و اقدام مدیریتی.',
  accent: '#f2a93b',
  /** RBAC actions this module consults (rasta_permissions rows are seeded by schema Section 61). */
  permissions: {
    view: 'مشاهده مأموریت‌های دیگران',
    create: 'ثبت درخواست مأموریت',
    review: 'بازبینی گزارش‌ها (مدیر)',
    approve: 'تأیید مأموریت و گزارش (مدیر)',
    configure: 'مدیریت مجموعه‌های سؤال',
  },
} as const
