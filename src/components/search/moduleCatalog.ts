import type { ModuleKey } from '../../store/useModuleStore'

/** The modules as the search knows them: Persian and English name plus words people type for them. */
export const MODULE_CATALOG: { key: ModuleKey | 'radar'; fa: string; en: string; words: string }[] = [
  { key: 'radar', fa: 'رادار پروژه‌ها', en: 'Project Radar', words: 'رادار پروژه سیگنال چرخه عمر گیت ریسک مسئله قرارداد مالی' },
  { key: 'executive', fa: 'مدیریت پرتفولیو', en: 'Portfolio', words: 'پرتفولیو برنامه مدیریت اجرایی پورتفوی' },
  { key: 'reporting', fa: 'گزارش هوشمند و تحلیل', en: 'Smart Reporting', words: 'گزارش تحلیل داشبورد هوشمند' },
  { key: 'competency', fa: 'ارزیابی شایستگی عوامل فنی', en: 'Technical Competency', words: 'شایستگی ارزیابی مصاحبه آزمون جوشکار' },
  { key: 'estimator', fa: 'برآورد پروژه‌ها', en: 'Project Estimation', words: 'برآورد هزینه تخمین' },
  { key: 'missions', fa: 'مأموریت و گزارش بازدید', en: 'Mission Debrief', words: 'مأموریت ماموریت بازدید سفر' },
  { key: 'landacq', fa: 'تحصیل اراضی', en: 'Land Acquisition', words: 'زمین اراضی پارسل مالک عبور' },
  { key: 'stagegate', fa: 'چرخه عمر Stage-Gate', en: 'Stage-Gate', words: 'گیت مرحله چرخه عمر برنامه جامع' },
  { key: 'taskissue', fa: 'مدیریت موانع و اقدامات', en: 'Issue & Task', words: 'مانع مسئله اقدام پیگیری issue' },
  { key: 'risk', fa: 'مدیریت ریسک', en: 'Risk Management', words: 'ریسک خطر کنترل KRI' },
  { key: 'change', fa: 'مدیریت تغییرات', en: 'Change Management', words: 'تغییر درخواست تغییر CR' },
  { key: 'finance', fa: 'کنترل قراردادها و مالی', en: 'Finance Control', words: 'مالی قرارداد صورت‌وضعیت پرداخت ضمانت‌نامه بودجه' },
  { key: 'material', fa: 'کنترل و تأمین کالا', en: 'Material Control', words: 'متریال کالا انبار حواله MTO سفارش بسته' },
  { key: 'execution', fa: 'مدیریت اجرا', en: 'Execution', words: 'اجرا گزارش روزانه کارکرد فهرست بها نیروی انسانی ماشین‌آلات' },
  { key: 'admin', fa: 'مدیریت کاربران و داده‌های پایه', en: 'Users & Master Data', words: 'کاربر دسترسی نقش پروژه سازمان داده پایه' },
]
