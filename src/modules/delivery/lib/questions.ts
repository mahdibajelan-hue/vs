/**
 * فرم ورودی — the questions the engine reads, in nine groups. Every answer may stay «نامشخص» (null): the engine treats an
 * unknown critical answer as a gap that lowers the confidence of the analysis and, beyond a limit, blocks a definitive
 * recommendation. A question can depend on the project type or on another answer; values filled from the project
 * record or the risk register are marked with their source and stay editable.
 */

export type ProjectType = 'pipeline' | 'station' | 'plant' | 'offshore' | 'storage' | 'building' | 'other'
export const PROJECT_TYPE_FA: Record<ProjectType, string> = {
  pipeline: 'خط لوله انتقال', station: 'ایستگاه تقویت فشار / تقلیل فشار', plant: 'پالایشگاه / واحد فرایندی', offshore: 'تأسیسات فراساحل',
  storage: 'ذخیره‌سازی (مخازن / ذخیره‌سازی زیرزمینی)', building: 'ساختمانی و زیرساخت پشتیبان', other: 'سایر',
}

export type Answer = number | boolean | string | null
export type Answers = Record<string, Answer>
export type QType = 'scale' | 'bool' | 'choice' | 'number'
export interface Question {
  key: string; group: GroupKey; fa: string; help?: string; type: QType
  /** scale: what 1 and 5 mean */
  lo?: string; hi?: string
  options?: { v: string; fa: string }[]
  unit?: string
  /** a missing answer counts against the confidence; critical ones count three times */
  critical?: boolean
  /** shown only when this holds */
  when?: (a: Answers) => boolean
  /** filled from the platform when available */
  source?: 'project' | 'risk'
}
export type GroupKey = 'general' | 'technical' | 'schedule' | 'finance' | 'owner' | 'market' | 'site' | 'risk' | 'legal'
export const GROUPS: { key: GroupKey; fa: string; help: string }[] = [
  { key: 'general', fa: 'مشخصات عمومی پروژه', help: 'نوع، اندازه و پیچیدگی طرح.' },
  { key: 'technical', fa: 'ویژگی‌های فنی و مهندسی', help: 'بلوغ طراحی، تجهیزات بلندمدت و امکان استانداردسازی.' },
  { key: 'schedule', fa: 'محدودیت‌های زمانی', help: 'اهمیت زمان و تعهدات زمانی.' },
  { key: 'finance', fa: 'شرایط مالی و اقتصادی', help: 'منبع تأمین مالی، قطعیت بودجه و حساسیت به هزینه.' },
  { key: 'owner', fa: 'توانمندی‌های کارفرما', help: 'نیروی مدیریت، مهندسی، تأمین و اجرای کارفرما.' },
  { key: 'market', fa: 'بازار پیمانکاری و تأمین‌کنندگان', help: 'تعداد و توان پیمانکاران، دسترسی به تأمین‌کنندگان و تمایل به پذیرش ریسک.' },
  { key: 'site', fa: 'شرایط سایت و بهره‌برداری', help: 'دسترسی، تأسیسات در حال بهره‌برداری و حساسیت HSE.' },
  { key: 'risk', fa: 'ریسک‌ها و عدم قطعیت‌ها', help: 'ریسک‌های اصلی طرح؛ از ماژول مدیریت ریسک نیز خوانده می‌شود.' },
  { key: 'legal', fa: 'الزامات قانونی و سازمانی', help: 'قانون مناقصات، مجوز روش‌های قراردادی و مشارکت بخش خصوصی.' },
]

const notType = (...t: ProjectType[]) => (a: Answers) => !t.includes(a.projectType as ProjectType)
const isType = (...t: ProjectType[]) => (a: Answers) => t.includes(a.projectType as ProjectType)
const S = (key: string, group: GroupKey, fa: string, lo: string, hi: string, extra: Partial<Question> = {}): Question => ({ key, group, fa, type: 'scale', lo, hi, ...extra })
const Y = (key: string, group: GroupKey, fa: string, extra: Partial<Question> = {}): Question => ({ key, group, fa, type: 'bool', ...extra })

export const QUESTIONS: Question[] = [
  { key: 'projectType', group: 'general', fa: 'نوع پروژه', type: 'choice', critical: true, source: 'project', options: (Object.keys(PROJECT_TYPE_FA) as ProjectType[]).map((v) => ({ v, fa: PROJECT_TYPE_FA[v] })) },
  { key: 'capex', group: 'general', fa: 'برآورد سرمایه‌گذاری', type: 'number', unit: 'میلیارد ریال', source: 'project', help: 'از مبلغ قرارداد یا برآورد پروژه.' },
  { key: 'lengthKm', group: 'general', fa: 'طول خط', type: 'number', unit: 'کیلومتر', when: isType('pipeline') },
  S('complexity', 'general', 'پیچیدگی فنی و تعداد سیستم‌ها', 'ساده و تکراری', 'بسیار پیچیده', { critical: true }),
  S('novelty', 'general', 'نوآوری فناوری / نبود تجربهٔ مشابه', 'فناوری اثبات‌شده', 'فناوری نو یا لیسانس‌دار'),
  Y('distinctScopes', 'general', 'آیا طرح از بخش‌های متمایز تشکیل شده است؟ (مثلاً خط لوله + ایستگاه‌ها + تجهیزات)'),

  { key: 'scopeMaturity', group: 'technical', fa: 'بلوغ طراحی و تعریف محدوده در زمان انتخاب روش', type: 'choice', critical: true,
    options: [{ v: '0', fa: 'ایده / مطالعات اولیه' }, { v: '1', fa: 'امکان‌سنجی و طراحی مفهومی' }, { v: '2', fa: 'طراحی پایه (FEED) کامل' }, { v: '3', fa: 'طراحی تفصیلی آماده' }] },
  S('changeLikelihood', 'technical', 'احتمال تغییر محدوده یا طراحی پس از قرارداد', 'محدوده پایدار', 'تغییرات زیاد محتمل', { critical: true }),
  S('longLead', 'technical', 'سهم و اهمیت تجهیزات و کالای بلندمدت (لوله، کمپرسور، شیر)', 'ناچیز', 'تعیین‌کنندهٔ مسیر بحرانی', { critical: true }),
  S('standardization', 'technical', 'تکرارپذیری و استانداردبودن اجزا', 'سفارشی', 'کاملاً تکراری'),
  S('modularPotential', 'technical', 'امکان مدولارسازی و پیش‌ساخت', 'ناممکن', 'بسیار مناسب', { when: notType('pipeline', 'building') }),
  S('interfaces', 'technical', 'تعداد و پیچیدگی فصل‌های مشترک فنی بین بخش‌ها', 'کم', 'بسیار زیاد'),

  S('scheduleCriticality', 'schedule', 'اهمیت زمان (هزینهٔ هر ماه تأخیر برای سازمان)', 'کم', 'بسیار حیاتی', { critical: true }),
  Y('fixedDeadline', 'schedule', 'تاریخ بهره‌برداری قطعی و غیرقابل جابه‌جایی (تعهد به مصرف‌کننده، زمستان، صادرات)'),
  { key: 'durationMonths', group: 'schedule', fa: 'مدت برنامه‌ریزی‌شدهٔ اجرا', type: 'number', unit: 'ماه', source: 'project' },
  Y('shutdownWindow', 'schedule', 'اجرا به پنجره‌های توقف تأسیسات محدود است', { when: (a) => a.brownfield === true }),

  { key: 'funding', group: 'finance', fa: 'منبع اصلی تأمین مالی', type: 'choice', critical: true,
    options: [{ v: 'budget', fa: 'بودجهٔ عمومی / شرکت دولتی' }, { v: 'own', fa: 'منابع داخلی شرکت' }, { v: 'loan', fa: 'تأمین مالی پروژه‌ای / وام و فاینانس' }, { v: 'private', fa: 'سرمایه‌گذار خصوصی' }] },
  S('budgetCertainty', 'finance', 'قطعیت تخصیص بودجه و جریان نقدی', 'نامطمئن', 'کاملاً قطعی', { critical: true }),
  S('costPriority', 'finance', 'اهمیت کمینه‌کردن هزینهٔ نهایی', 'کم', 'بسیار زیاد'),
  S('certaintyPriority', 'finance', 'اهمیت قطعیت مبلغ هنگام تصویب', 'کم', 'بسیار زیاد'),
  S('inflation', 'finance', 'تورم و نوسان نرخ ارز در دورهٔ اجرا', 'پایدار', 'شدید', { critical: true }),
  Y('revenue', 'finance', 'طرح جریان درآمد مستقل و قابل اتکا دارد (تعرفهٔ انتقال، فروش محصول)'),

  S('ownerPm', 'owner', 'توان مدیریت پروژه و کنترل کارفرما (نیرو و سامانه)', 'محدود', 'بسیار قوی', { critical: true }),
  S('ownerEng', 'owner', 'توان مهندسی کارفرما یا مشاور در اختیار', 'محدود', 'بسیار قوی', { critical: true }),
  S('ownerProc', 'owner', 'توان تأمین کالا و بازرگانی کارفرما', 'محدود', 'بسیار قوی'),
  S('ownerBuild', 'owner', 'توان اجرایی مستقیم کارفرما (نیرو و ماشین‌آلات)', 'ندارد', 'کامل'),
  S('experience', 'owner', 'تجربهٔ کارفرما در پروژه‌های مشابه', 'ندارد', 'زیاد'),
  S('decisionSpeed', 'owner', 'سرعت تصمیم‌گیری و تأیید مدارک در سازمان', 'کند', 'سریع'),
  S('controlPriority', 'owner', 'تمایل کارفرما به اشراف و کنترل فنی', 'کم', 'بسیار زیاد'),

  S('epcMarket', 'market', 'تعداد و توان پیمانکاران EPC واجد شرایط', 'یک یا هیچ', 'رقابت گسترده', { critical: true }),
  S('buildMarket', 'market', 'تعداد و توان پیمانکاران ساخت (C)', 'محدود', 'گسترده'),
  S('supplierAccess', 'market', 'دسترسی به تأمین‌کنندگان تجهیزات اصلی (تحریم، ساخت داخل)', 'بسیار محدود', 'آزاد', { critical: true }),
  S('riskAppetite', 'market', 'تمایل پیمانکاران به پذیرش ریسک قیمت مقطوع', 'نمی‌پذیرند', 'می‌پذیرند'),
  S('localContent', 'market', 'الزام یا سیاست ساخت داخل و سهم پیمانکاران محلی', 'ندارد', 'الزامی و سنگین'),

  S('siteAccess', 'site', 'دشواری دسترسی و دورافتادگی سایت', 'آسان', 'بسیار دشوار'),
  Y('brownfield', 'site', 'کار در تأسیسات در حال بهره‌برداری (Brownfield) انجام می‌شود'),
  S('landRisk', 'site', 'ریسک تملک اراضی و ذینفعان مسیر', 'کم', 'بسیار زیاد', { when: notType('offshore'), source: 'risk' }),
  S('hseSensitivity', 'site', 'حساسیت ایمنی، بهداشت و محیط زیست', 'معمولی', 'بسیار حساس'),

  S('groundRisk', 'risk', 'ریسک شرایط زمین، ژئوتکنیک و شرایط پیش‌بینی‌نشدهٔ سایت', 'کم', 'زیاد', { source: 'risk' }),
  S('permitRisk', 'risk', 'ریسک مجوزها و الزامات محیط‌زیستی', 'کم', 'زیاد', { source: 'risk' }),
  S('supplyRisk', 'risk', 'ریسک تأمین کالا، تحریم و تأخیر سازندگان', 'کم', 'زیاد', { source: 'risk' }),
  S('interfaceRisk', 'risk', 'ریسک هماهنگی و فصل مشترک', 'کم', 'زیاد', { source: 'risk' }),
  S('securityRisk', 'risk', 'ریسک امنیتی، اجتماعی و رخدادهای قهری', 'کم', 'زیاد'),

  Y('openTender', 'legal', 'قانون یا آیین‌نامه، مناقصهٔ عمومی را برای این طرح الزامی می‌کند'),
  Y('reimbAllowed', 'legal', 'قراردادهای هزینه‌محور (Cost-Plus / EPCM) در سازمان مجاز است', { critical: true }),
  Y('directAllowed', 'legal', 'اجرای امانی توسط کارفرما برای این اندازه مجاز است'),
  Y('ppAllowed', 'legal', 'چارچوب قانونی مشارکت بخش خصوصی (BOT / BOO) وجود دارد'),
  S('investorInterest', 'legal', 'علاقهٔ سرمایه‌گذار واجد شرایط', 'ندارد', 'زیاد', { when: (a) => a.ppAllowed === true }),
  S('approvalTime', 'legal', 'طول فرایند تصویب و انتخاب پیمانکار در سازمان', 'کوتاه', 'بسیار طولانی'),
]
export const QUESTION = Object.fromEntries(QUESTIONS.map((q) => [q.key, q])) as Record<string, Question>
export const visible = (q: Question, a: Answers) => !q.when || q.when(a)
export const isAnswered = (v: Answer | undefined) => v !== null && v !== undefined && v !== ''

/** «نوع پروژه» from the project record's free type text */
export function typeFromProject(t: string | null | undefined): ProjectType | null {
  const s = (t ?? '').toLowerCase()
  if (!s) return null
  if (/pipe|خط/.test(s)) return 'pipeline'
  if (/station|ایستگاه|compress/.test(s)) return 'station'
  if (/plant|refin|پالایش|فرایند|process/.test(s)) return 'plant'
  if (/offshore|فراساحل|platform/.test(s)) return 'offshore'
  if (/storage|ذخیره|tank|مخزن/.test(s)) return 'storage'
  if (/build|ساختمان|infra/.test(s)) return 'building'
  return 'other'
}
