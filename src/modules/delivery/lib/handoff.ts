/**
 * What the Stage-Gate master schedule's execution strategy (sg_lifecycle_master_schedule.execution_strategy) should be once a delivery strategy is approved.
 * The lifecycle knows three ways of overlapping its gates; the approved execution strategies and delivery method map onto them.
 */
export type LifecycleStrategy = 'sequential' | 'overlapping' | 'fast_track'
export const LIFECYCLE_FA: Record<LifecycleStrategy, string> = { sequential: 'ترتیبی (Sequential)', overlapping: 'همپوشان (Overlapping)', fast_track: 'تسریع‌شده (Fast-Track)' }

export function lifecycleStrategyOf(execution: string[], method: string | null): { key: LifecycleStrategy; why: string } {
  if (execution.includes('fasttrack')) return { key: 'fast_track', why: 'راهبرد اجرای «مسیر سریع» تصویب شده است؛ مراحل مهندسی، تأمین و ساخت با همپوشانی بیشتر برنامه‌ریزی می‌شوند.' }
  if (execution.includes('concurrent') || execution.includes('earlyworks')) return { key: 'overlapping', why: 'مهندسی و اجرای همزمان یا کارهای زودهنگام تصویب شده است؛ گیت‌های متوالی همپوشانی دارند.' }
  if (execution.includes('sequential')) return { key: 'sequential', why: 'اجرای متوالی تصویب شده است؛ هر گیت پس از پایان گیت قبل آغاز می‌شود.' }
  if (method === 'dbb' || method === 'direct') return { key: 'sequential', why: 'در روش تحویل مصوب، طراحی پیش از مناقصه یا اجرا کامل می‌شود؛ گیت‌ها ترتیبی‌اند.' }
  return { key: 'overlapping', why: 'روش تحویل مصوب یکپارچه است (طراحی، تأمین و ساخت در یک یا چند قرارداد هم‌پوشان)؛ گیت‌های متوالی همپوشانی دارند.' }
}
