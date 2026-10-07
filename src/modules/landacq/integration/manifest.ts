/**
 * Module manifest — everything the host application needs to mount this module (launchpad card, Project-Radar entry,
 * RBAC registry, RootApp). The host reads the identity from here instead of hard-coding it.
 */
export const LANDACQ_MODULE = {
  /** ModuleKey in useModuleStore, rasta_modules.key in the database, and RBAC module_key. */
  key: 'landacq',
  labelFa: 'تحصیل اراضی',
  labelEn: 'Land Acquisition Control Tower',
  descriptionFa: 'غربالگری زمین مسیر، نقاط بحرانی، لایهٔ نقشه، هشدار زودهنگام شروع تحصیل و اتصال به برنامه، ریسک و مسائل.',
  accent: '#b45309',
} as const
