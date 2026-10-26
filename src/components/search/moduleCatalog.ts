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
  { key: 'testing', fa: 'آزمایش‌ها (هیدروتست و پوشش)', en: 'Hydrotest / Coating test', words: 'هیدروتست هیدرواستاتیک تست فشار قطعه بندی پروفیل پوشش هالیدی DCVG CIPS ایستگاه بسته آزمون' },
  { key: 'pssr', fa: 'آمادگی راه‌اندازی (PSSR)', en: 'PSSR / RFSU', words: 'PSSR RFSU ایمنی راه اندازی پیش راه اندازی پانچ لیست تزریق گاز گواهی آمادگی' },
  { key: 'stagegate', fa: 'چرخه عمر پروژه (Stage-Gate)', en: 'Stage-Gate', words: 'گیت مرحله چرخه عمر فاز تصویب' },
  { key: 'taskissue', fa: 'مدیریت موانع و اقدامات', en: 'Issue & Task', words: 'مانع مسئله اقدام پیگیری issue' },
  { key: 'supervision', fa: 'حضور و غیاب دستگاه نظارت', en: 'Supervision Attendance', words: 'ناظر نظارت نماینده کارفرما حضور غیاب اضافه کار ساعت کار صبحانه ناهار شام خودرو استیجاری کارت ساعت' },
  { key: 'risk', fa: 'مدیریت ریسک', en: 'Risk Management', words: 'ریسک خطر کنترل KRI' },
  { key: 'change', fa: 'مدیریت تغییرات', en: 'Change Management', words: 'تغییر درخواست تغییر CR' },
  { key: 'finance', fa: 'کنترل قراردادها و مالی', en: 'Finance Control', words: 'مالی قرارداد صورت‌وضعیت پرداخت ضمانت‌نامه بودجه' },
  { key: 'material', fa: 'کنترل و تأمین کالا', en: 'Material Control', words: 'متریال کالا انبار حواله MTO سفارش بسته' },
  { key: 'execution', fa: 'مدیریت اجرا', en: 'Execution', words: 'اجرا گزارش روزانه کارکرد فهرست بها نیروی انسانی ماشین‌آلات' },
  { key: 'engineering', fa: 'پیشرفت مهندسی و آمادگی اجرا', en: 'Engineering Readiness', words: 'مهندسی مدارک نقشه آمادگی پیش‌نیاز تأخیر مدرک رشته وزن' },
  { key: 'scheduling', fa: 'برنامه‌ریزی و کنترل زمان پروژه', en: 'Project Scheduling & Time Control', words: 'برنامه زمان‌بندی گانت مسیر بحرانی خط مبنا پریمارا P6 اکسل انحراف پیش‌بینی شناوری مونت‌کارلو' },
  { key: 'admin', fa: 'مدیریت کاربران و داده‌های پایه', en: 'Users & Master Data', words: 'کاربر دسترسی نقش پروژه سازمان داده پایه' },
]
