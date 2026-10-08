/**
 * Module manifest — everything the host application needs to mount this module (launchpad card, Project-Radar entry,
 * RBAC registry, RootApp). The host reads the identity from here instead of hard-coding it.
 */
export const LANDACQ_MODULE = {
  /** ModuleKey in useModuleStore, rasta_modules.key in the database, and RBAC module_key. */
  key: 'landacq',
  labelFa: 'مدیریت تملک و آزادسازی اراضی مسیر',
  labelEn: 'Land Acquisition & Right of Way Management',
  descriptionFa: 'غربالگری زمین مسیر، تصرف فوری ماده ۹، مواعد و هشدارهای قانونی، لایهٔ نقشه و اتصال به برنامه، ریسک و مسائل.',
  accent: '#b45309',
} as const
