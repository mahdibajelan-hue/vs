import { DEFAULT_QUESTION_SET } from '../lib/questionSets'
import { startInterview, submitAnswer, type EngineInput } from '../lib/interviewEngine'
import { buildReport } from '../lib/reportBuilder'
import { scoreReport } from '../lib/qualityScore'
import { SLOT_LABEL } from '../lib/batch'
import { extractMetrics } from '../lib/ruleAnalyzer'
import { addDaysIso, shamsi as shamsiOf, todayIso } from '../lib/fa'
import type { Finding, InterviewState, MissionDiscipline, Mission, Objective, PendingQuestion, PersonRef, ProjectRef, VisitType } from '../types'
import type { CurrentUser, MissionDraft, MissionRepo, ObjectiveDraft } from './types'

/**
 * Realistic sample data (Persian, EPC oil & gas pipelines), produced by running the REAL interview engine
 * over scripted answers — so every finding, slot, report and quality score in the demo is what the product
 * itself would have produced, not hand-typed fixtures.
 */

type End = 'draft' | 'pending' | 'ticketing' | 'approved' | 'debrief' | 'review' | 'returned' | 'ready' | 'claimed'

interface Scenario {
  discipline?: MissionDiscipline
  visitType: VisitType
  destination: string
  visitees: { name: string; org: string; role: string }[]
  topicsOfInterest: string
  expectedOutput: string
  startOffset: number
  days: number
  objectives: ObjectiveDraft[]
  end: End
  /** answers keyed by main-question id (or `<topic>` fallback) */
  answers: Record<string, string>
  objectiveAnswers: string[]
  /** Structured decisions / actions (title, who, by when) — filled into the batch template's repeating blocks. */
  decisions?: Entry[]
  actions?: Entry[]
  suggestion?: string
  /** A deliberately vague report: gap rounds are answered with «نمی‌دانم». */
  weak?: boolean
  /** stop the scripted interview after this many topics (for the "in progress" scenario) */
  stopAfterTopics?: number
  evidence?: number
  managerNote?: string
  transfer?: boolean
  /** false → no flight ticket needed (skips Administrative Affairs ticketing) */
  ticket?: boolean
  originCity?: string
  destinationCity?: string
  companions?: string[]
  /** Scenario-specific answers to the engine's «still missing» questions (cause, impact, …), used before the generic ones. */
  slotAnswers?: Partial<Record<string, string[]>>
}

interface Entry { title: string; owner: string; due: string }

const SLOT_ANSWERS: Record<string, string[]> = {
  cause: ['چون سازنده مشکل تأمین ارز و مواد اولیه دارد', 'به دلیل هماهنگ نبودن مجوزهای دسترسی با مالکین اراضی', 'به علت تأخیر در تأیید نقشه‌ها توسط مشاور'],
  impact: ['حدود دو ماه تأخیر دارد و روی مسیر بحرانی اثر می‌گذارد', 'باعث توقف بخشی از جوشکاری و افزایش هزینه سربار می‌شود', 'تأخیر جزئی در تحویل و نیاز به بازنگری برنامه'],
  party: ['آقای رضایی از شرکت سازنده', 'پیمانکار اصلی', 'مشاور'],
  newDate: ['تا پایان ماه آینده', 'تاریخ جدیدی اعلام نشده', 'دو هفته دیگر'],
  needAction: ['باید نامه تسریع رسمی ارسال شود'],
  probability: ['زیاد', 'متوسط'],
  mitigation: ['می‌توان از سازنده جایگزین خرید کرد', 'باید برنامه جبرانی با افزایش شیفت کاری تدوین شود'],
  owner: ['آقای کریمی', 'مهندس احمدی'],
  due: ['دو هفته دیگر', 'تا پایان هفته'],
}

const SCENARIOS: Scenario[] = [
  // ───────── ۵ نمونه گزارش کامل در حوزه‌های مختلف (هر کدام زاویه‌ای از ماژول را نشان می‌دهد) ─────────
  {
    // ۱) حقوقی — ادعا و تمدید مدت؛ گزارش تأییدشده، منتظر کلیم امور اداری (کارت کلیم + مصوبات با مسئول و موعد)
    discipline: 'legal',
    visitType: 'client_meeting',
    destination: 'دفتر کارفرما و واحد حقوقی — تهران',
    destinationCity: 'تهران',
    originCity: 'اصفهان',
    companions: ['خانم دکتر صالحی (کارشناس ارشد قرارداد)'],
    visitees: [{ name: 'دکتر موسوی', org: 'کارفرما', role: 'مدیر طرح' }, { name: 'آقای فرهادی', org: 'کارفرما', role: 'مشاور حقوقی' }],
    topicsOfInterest: 'الحاقیه شماره ۳، ادعای تمدید مدت، ضمانت‌نامه حسن انجام کار',
    slotAnswers: {
      cause: ['کمیته قراردادهای کارفرما جلسه تشکیل نداده و پرونده در نوبت بررسی مانده است', 'مستندات ارسالی ناقص بوده و کارفرما تکمیل آن را خواسته است', 'ابهام در تفسیر ماده ۴۶ قرارداد درباره تعلیق کار', 'تأخیر کارفرما در تحویل اراضی کیلومتر ۱۲ تا ۱۸', 'غفلت پیمانکار جزء در تمدید به‌موقع بیمه‌نامه'],
      impact: ['در صورت ادامه، خسارت تأخیر محاسبه و پرداخت‌ها متوقف می‌شود', 'تغییر دامنه بدون پوشش قراردادی هزینه اجرا را بدون پشتوانه می‌گذارد', 'ریسک بی‌اعتباری ضمانت‌نامه و توقف پرداخت‌ها'],
      party: ['آقای فرهادی از کارفرما', 'دکتر موسوی', 'خانم دکتر صالحی'],
      newDate: ['در کمیته بعدی کارفرما', 'تا پایان آبان', 'اعلام نشده'],
      needAction: ['نامه رسمی با پیوست مستندات ارسال شود', 'در کمیته قراردادها مطرح و امضا شود'],
      probability: ['زیاد', 'متوسط'],
      mitigation: ['پیگیری هفتگی با دفتر حقوقی کارفرما و ارسال نامه رسمی', 'تمدید زودهنگام ضمانت‌نامه و بیمه‌نامه'],
      owner: ['خانم دکتر صالحی', 'آقای فرهادی'],
      due: ['تا پایان هفته', 'دو هفته دیگر'],
    },
    expectedOutput: 'صورتجلسه حقوقی با تعهدات دو طرف و فهرست مکاتبات لازم',
    startOffset: -20, days: 2, end: 'ready', evidence: 4,
    objectives: [
      { title: 'روشن‌کردن وضعیت الحاقیه شماره ۳ و تغییر دامنه کار', measure: 'تاریخ امضای الحاقیه یا نامه رسمی کارفرما', topicKey: 'legal', priority: 'high' },
      { title: 'پیگیری پاسخ رسمی به ادعای تمدید مدت ۹۰ روزه', measure: 'نامه یا صورتجلسه امضاشده', topicKey: 'legal', priority: 'critical' },
      { title: 'کنترل تاریخ انقضای ضمانت‌نامه‌ها و بیمه‌نامه‌ها', measure: 'فهرست ضمانت‌نامه‌ها با تاریخ انقضا', topicKey: 'legal', priority: 'medium' },
    ],
    answers: {
      'overview-1': 'جلسه سازنده بود؛ کارفرما به ادعای تمدید مدت نزدیک شده ولی موضوع الحاقیه هنوز باز است.',
      'leg-1': 'الحاقیه شماره ۳ برای تغییر دامنه کار خط فرعی هنوز امضا نشده و بیش از ۴۵ روز در کمیته قراردادهای کارفرما معطل مانده است. مسئول پیگیری آقای فرهادی است.',
      'leg-2': 'ادعای تمدید مدت ۹۰ روزه ما به دلیل تأخیر در تحویل اراضی هنوز پاسخ رسمی نگرفته و کارفرما می‌گوید مستندات ناقص است. اثرش روی خسارت تأخیر جدی است و اگر پاسخ داده نشود جریمه تأخیر محاسبه می‌شود.',
      'leg-3': 'ضمانت‌نامه حسن انجام کار تا پایان آبان معتبر است و باید تمدید شود؛ بیمه‌نامه تمام‌خطر کارگاه تمدید شده است.',
      'leg-4': 'تأخیر تحویل اراضی کیلومتر ۱۲ تا ۱۸ مبنای تمدید مدت است و مکاتبات اولیه ارسال شده ولی نامه نهایی با پیوست‌های مستند هنوز ارسال نشده است.',
      'leg-5': 'بیمه‌نامه دو پیمانکار جزء منقضی شده بود که یادآوری شد و باید ظرف یک هفته تمدید شود.',
      'ir-1': 'ابهام در تفسیر ماده ۴۶ قرارداد درباره تعلیق کار هنوز در گزارش‌های رسمی نیامده است. اثرش روی خسارت تأخیر زیاد است.',
      'ir-2': 'در صورت نبود پاسخ رسمی به ادعای تمدید، خطر محاسبه جریمه تأخیر و توقف پرداخت‌ها وجود دارد.',
      'evd-1': 'ثبت شد',
    },
    objectiveAnswers: ['تا حدی؛ کارفرما قول داد الحاقیه را در کمیته بعدی مطرح کند', 'تا حدی؛ پاسخ کتبی ندادند ولی صورتجلسه شد', 'کاملاً محقق شد؛ فهرست با تاریخ انقضا گرفته شد'],
    decisions: [
      { title: 'الحاقیه شماره ۳ در جلسه بعدی کمیته قراردادهای کارفرما مطرح و امضا شود', owner: 'آقای فرهادی', due: 'تا پایان هفته آینده' },
      { title: 'ضمانت‌نامه حسن انجام کار پیش از انقضا تمدید شود', owner: 'خانم دکتر صالحی', due: 'تا پایان آبان' },
      { title: 'نامه نهایی ادعای تمدید مدت با پیوست‌های مستند ارسال شود', owner: 'دکتر موسوی', due: 'دو هفته دیگر' },
    ],
    actions: [
      { title: 'تهیه پیوست‌های مستند ادعای تمدید مدت', owner: 'خانم دکتر صالحی', due: 'تا پایان هفته' },
      { title: 'تمدید بیمه‌نامه دو پیمانکار جزء', owner: 'آقای کریمی', due: 'یک هفته دیگر' },
    ],
    suggestion: 'کمیته مشترک حقوقی با کارفرما هر دو هفته یک‌بار تشکیل شود.',
  },
  {
    // ۲) مالی — صورت‌وضعیت و جریان نقدی؛ گزارش ارسال‌شده و منتظر تصمیم مجری طرح
    discipline: 'finance',
    visitType: 'progress_review',
    destination: 'دفتر مرکزی پیمانکار EPC — شیراز',
    destinationCity: 'شیراز',
    originCity: 'تهران',
    companions: [],
    visitees: [{ name: 'آقای نعمتی', org: 'پیمانکار EPC', role: 'مدیر مالی' }],
    topicsOfInterest: 'صورت‌وضعیت‌های معوق، جریان نقدی، افزایش قیمت لوله',
    slotAnswers: {
      cause: ['اختلاف در متره صورت‌وضعیت ۸ بین مشاور و پیمانکار', 'محدودیت ارزی و تأخیر در گشایش اعتبار اسنادی', 'افزایش قیمت جهانی لوله و نبود شاخص تعدیل در قرارداد', 'ثبت‌نشدن دو کار اضافه در سیستم مالی'],
      impact: ['نقدینگی ماه آینده منفی می‌شود و تأمین مصالح با تأخیر روبه‌رو است', 'افزایش حدود ۶ درصدی هزینه تا پایان پروژه', 'فشار مالی روی پیمانکاران جزء و احتمال کندی کار'],
      party: ['آقای نعمتی از پیمانکار', 'مدیر مالی کارفرما', 'مشاور'],
      newDate: ['تا پایان ماه', 'یک هفته دیگر', 'اعلام نشده'],
      needAction: ['متره با مشاور تطبیق و صورت‌وضعیت نهایی شود', 'پرداخت علی‌الحساب انجام شود'],
      probability: ['زیاد', 'متوسط'],
      mitigation: ['پرداخت علی‌الحساب و برنامه تسویه مرحله‌ای', 'پیش‌خرید بخشی از لوله با قیمت ثابت'],
      owner: ['آقای نعمتی', 'آقای کریمی'],
      due: ['یک هفته دیگر', 'تا پایان ماه'],
    },
    expectedOutput: 'گزارش وضعیت مالی و برنامه تسویه',
    startOffset: -6, days: 2, end: 'review', evidence: 2,
    objectives: [
      { title: 'بررسی وضعیت صورت‌وضعیت‌های ۷ تا ۹ و مبلغ معوق', measure: 'جدول مبلغ و مدت معوقات', topicKey: 'finance', priority: 'high' },
      { title: 'بررسی اثر افزایش قیمت لوله روی برآورد هزینه تا پایان (EAC)', measure: 'درصد افزایش EAC نسبت به بودجه', topicKey: 'finance', priority: 'high' },
    ],
    answers: {
      'overview-1': 'وضعیت مالی پروژه تحت فشار است؛ پرداخت‌ها دیر انجام می‌شود ولی قابل مدیریت است.',
      'fin-1': 'صورت‌وضعیت شماره ۸ و ۹ جمعاً حدود ۴۲ میلیارد ریال بیش از ۷۰ روز معوق مانده است. به دلیل کسر ناشی از اختلاف در متره پرداخت متوقف شده و فشار روی پیمانکار و سازندگان زیاد است. مسئول پیگیری آقای نعمتی است.',
      'fin-2': 'گشایش اعتبار اسنادی برای شیرآلات به دلیل محدودیت ارزی دو هفته عقب است و جریان نقدی ماه آینده منفی می‌شود.',
      'fin-3': 'برآورد هزینه تا پایان حدود ۶ درصد بالاتر از بودجه است چون قیمت لوله بالا رفته است. اگر نوسان ادامه پیدا کند افزایش بیشتر هم محتمل است.',
      'fin-4': 'دو کار اضافه مربوط به اصلاح مسیر هنوز ثبت و تأیید مالی نشده و حدود ۸ میلیارد ریال اثر دارد.',
      'ir-1': 'اختلاف متره صورت‌وضعیت ۸ در گزارش‌های رسمی نیامده است. اثرش روی تسویه پیمانکاران جزء زیاد است.',
      'ir-2': 'اگر معوقات تسویه نشود، ریسک توقف تأمین مصالح توسط سازندگان وجود دارد.',
      'evd-1': 'ثبت شد',
    },
    objectiveAnswers: ['کاملاً محقق شد؛ جدول معوقات تهیه شد', 'تا حدی؛ برآورد اولیه گرفتیم و نهایی نشده است'],
    decisions: [
      { title: 'مابه‌التفاوت متره صورت‌وضعیت ۸ ظرف یک هفته با مشاور تطبیق و نهایی شود', owner: 'آقای نعمتی', due: 'یک هفته دیگر' },
      { title: 'پرداخت علی‌الحساب ۵۰ درصد مبلغ معوق انجام شود', owner: 'مدیر مالی کارفرما', due: 'تا پایان ماه' },
    ],
    actions: [{ title: 'ثبت و تأیید دو کار اضافه مسیر', owner: 'آقای کریمی', due: 'دو هفته دیگر' }],
    suggestion: 'گزارش جریان نقدی ماهانه برای مجری طرح تهیه شود.',
  },
  {
    // ۳) کیفیت — ممیزی پوشش لوله؛ کلیم‌شده، مسائل مهم به Issue/Risk منتقل شده
    discipline: 'quality',
    visitType: 'quality_audit',
    destination: 'کارخانه پوشش لوله — بندرعباس',
    destinationCity: 'بندرعباس',
    originCity: 'تهران',
    companions: ['مهندس طاهری (بازرس جوش)'],
    visitees: [{ name: 'مهندس شریفی', org: 'پیمانکار پوشش', role: 'مدیر کنترل کیفیت' }],
    topicsOfInterest: 'ITP پوشش، تست هالیدی، NCR باز، مدارک کیفی',
    slotAnswers: {
      cause: ['ضعف کنترل فرآیند و نبود ناظر در شیفت شب', 'ثبت‌نشدن دمای پخت و تنظیم نبودن دستگاه', 'نبود گواهی مصالح پوشش از تأمین‌کننده'],
      impact: ['احتمال رد لوله‌ها در بازرسی نهایی و تأخیر در حمل', 'نیاز به بازپوشش و افزایش هزینه و زمان', 'کاهش عمر مفید پوشش در بلندمدت'],
      party: ['مهندس شریفی', 'پیمانکار پوشش', 'ناظر کارفرما'],
      newDate: ['تا پایان هفته', 'دو هفته دیگر', 'اعلام نشده'],
      needAction: ['بازپوشش و تست مجدد با حضور ناظر', 'ثبت روزانه دما و ارائه به ناظر'],
      probability: ['زیاد', 'متوسط'],
      mitigation: ['استقرار بازرس دائمی و چک‌لیست هر شیفت', 'تأیید مدارک مصالح پیش از مصرف'],
      owner: ['مهندس شریفی', 'مهندس طاهری'],
      due: ['تا پایان هفته', 'دو هفته دیگر'],
    },
    expectedOutput: 'گزارش ممیزی کیفیت با فهرست عدم‌انطباق‌ها',
    startOffset: -34, days: 3, end: 'claimed', evidence: 4, transfer: true,
    objectives: [
      { title: 'ممیزی انطباق فرآیند پوشش با ITP مصوب', measure: 'فهرست عدم‌انطباق‌ها با شواهد', topicKey: 'quality', priority: 'high' },
      { title: 'کنترل نتایج تست هالیدی ده روز اخیر', measure: 'گزارش تست با امضای ناظر', topicKey: 'quality', priority: 'medium' },
    ],
    answers: {
      'overview-1': 'کیفیت پوشش در حد قابل قبول است ولی مدارک کیفی و ثبت بازرسی‌ها ضعف جدی دارد.',
      'progress-1': 'پیشرفت واقعی ۵۸ درصد و برنامه ۶۰ درصد است.',
      'progress-2': 'پوشش‌دهی شاخه‌های ۳۶ اینچ کمی عقب‌تر از برنامه است.',
      'qual-1': 'چهار عدم‌انطباق مهم دیدم: ضخامت پوشش در دو شاخه کمتر از حد مجاز بود و تست هالیدی در سه نوبت بدون حضور ناظر انجام شده بود. اثرش روی پذیرش لوله‌ها و تأخیر در حمل جدی است. مسئول پیگیری مهندس شریفی است.',
      'qual-2': 'دو مورد رفع شده و دو مورد هنوز باز است؛ تاریخ رفع اعلام نشده است.',
      'qual-3': 'برخی بازرسی‌ها مطابق ITP ثبت نشده و گواهی‌های مصالح پوشش ناقص است.',
      'ir-1': 'کنترل دمای پخت پوشش ثبت نمی‌شود که در گزارش‌های رسمی نیامده است. اثرش روی کیفیت بلندمدت زیاد است.',
      'ir-2': 'اگر عدم‌انطباق‌ها رفع نشود، ریسک رد لوله‌ها در بازرسی نهایی و تأخیر در حمل وجود دارد.',
      'evd-1': 'ثبت شد',
    },
    objectiveAnswers: ['کاملاً محقق شد؛ فهرست با عکس تهیه شد', 'تا حدی؛ سه نوبت بدون ناظر بود'],
    decisions: [
      { title: 'تست هالیدی فقط با حضور ناظر انجام و امضا شود', owner: 'مهندس شریفی', due: 'از فردا' },
      { title: 'دو شاخه با ضخامت ناکافی بازپوشش شوند', owner: 'مهندس شریفی', due: 'تا پایان هفته' },
    ],
    actions: [{ title: 'ثبت روزانه دمای پخت پوشش و ارائه به ناظر', owner: 'مهندس شریفی', due: 'دو هفته دیگر' }],
    suggestion: 'یک بازرس کیفیت دائمی در کارخانه مستقر شود.',
  },
  {
    // ۴) مهندسی — گزارش برگشت‌خورده؛ مسئول/موعد ناقص (جریان بازبینی)
    discipline: 'engineering',
    visitType: 'engineering',
    destination: 'دفتر مهندسی مشاور — اصفهان',
    destinationCity: 'اصفهان',
    originCity: 'تهران',
    companions: [],
    visitees: [{ name: 'مهندس نوری', org: 'مشاور', role: 'مدیر مهندسی' }],
    topicsOfInterest: 'نقشه‌های ایستگاه، ریویژن P&ID، تأیید دیتاشیت‌ها',
    slotAnswers: {
      cause: ['کندی مشاور در بررسی و تأیید نقشه‌ها', 'تغییر معیار تأیید دیتاشیت شیرها', 'ابهام در بارگذاری تکیه‌گاه‌ها'],
      impact: ['تأخیر در سفارش تجهیزات و شروع نصب', 'نیاز به بازنگری نقشه‌های اجرایی', 'تأخیر در خرید تکیه‌گاه‌ها'],
      party: ['مهندس نوری', 'مشاور', 'مدیر مهندسی پیمانکار'],
      newDate: ['اعلام نشده', 'تا پایان ماه'],
      needAction: ['مشاور نقشه‌ها را به ترتیب اولویت تأیید کند'],
      probability: ['زیاد', 'متوسط'],
      mitigation: ['جلسه هفتگی تأیید مدارک با مشاور'],
      owner: ['', 'مهندس نوری'],
      due: ['', 'تا پایان ماه'],
    },
    expectedOutput: 'فهرست مدارک معوق با تاریخ تأیید',
    startOffset: -13, days: 2, end: 'returned', evidence: 1,
    managerNote: 'تاریخ تأیید هر مدرک معوق و مسئول تأیید در گزارش مشخص نیست؛ لطفاً بخش مصوبات و اقدامات را کامل و گزارش را دوباره ارسال کنید.',
    objectives: [
      { title: 'دریافت فهرست مدارک معوق و تاریخ تأیید هرکدام', measure: 'فهرست مکتوب با تاریخ', topicKey: 'engineering', priority: 'high' },
    ],
    answers: {
      'overview-1': 'مدارک مهندسی عقب‌تر از برنامه است و مشاور در تأیید نقشه‌ها کند عمل می‌کند.',
      'progress-1': 'پیشرفت مهندسی واقعی ۷۱ درصد و برنامه ۸۰ درصد است.',
      'progress-2': 'نقشه‌های ایستگاه و ریویژن P&ID از برنامه عقب‌تر است.',
      'eng-1': 'نقشه‌های ایستگاه تقویت فشار و ریویژن ۲ نقشه P&ID هنوز تأیید نشده و بیش از سه هفته معطل مشاور مانده است. این تأخیر روی خرید تجهیزات اثر دارد. مسئول پیگیری مهندس نوری است.',
      'eng-2': 'تغییر طراحی در تکیه‌گاه‌های لوله‌کشی ایستگاه مطرح شده که اثر آن روی سفارش تکیه‌گاه‌ها مشخص نیست.',
      'ir-1': 'ابهام در معیار تأیید دیتاشیت شیرها هنوز حل نشده است.',
      'ir-2': 'اگر تأیید نقشه‌ها به تعویق بیفتد، سفارش تجهیزات و شروع نصب با تأخیر روبه‌رو می‌شود.',
      'evd-1': 'ثبت شد',
    },
    objectiveAnswers: ['تا حدی؛ فهرست گرفته شد ولی تاریخ تأیید اعلام نشد'],
    decisions: [
      { title: 'مشاور مدارک معوق را به ترتیب اولویت تأیید کند', owner: 'مهندس نوری', due: '' },
    ],
    actions: [{ title: 'ارسال یادآوری رسمی برای تأیید نقشه‌ها', owner: '', due: '' }],
  },
  {
    // ۵) نیروی انسانی/اداری — پشتیبانی کمپ؛ شامل پاسخ محرمانه (کانال «استقلال و شفافیت») که در گزارش نمی‌آید
    discipline: 'hr_admin',
    visitType: 'construction_supervision',
    destination: 'کمپ و کارگاه ایستگاه کمپرسور — عسلویه',
    destinationCity: 'عسلویه',
    originCity: 'تهران',
    companions: ['آقای رحیمی (کارشناس اداری)', 'خانم نوری (کارشناس رفاه)'],
    visitees: [{ name: 'مهندس باقری', org: 'مدیریت پروژه', role: 'مدیر پشتیبانی کارگاه' }],
    topicsOfInterest: 'اسکان و تغذیه نیروها، پرداخت دستمزد پیمانکاران جزء، کمبود نیرو',
    slotAnswers: {
      cause: ['ظرفیت کمپ ۲ برای نیروهای جدید کافی نیست', 'تأخیر پرداخت دستمزد توسط پیمانکار اصلی', 'ترک کار جوشکاران ماهر به‌دلیل شرایط اسکان'],
      impact: ['افزایش غیبت و کاهش بهره‌وری جبهه جوشکاری', 'خطر اعتصاب و توقف کار پیمانکاران جزء', 'نارضایتی کارکنان و ریسک ترک کار بیشتر'],
      party: ['مهندس باقری', 'پیمانکار جزء', 'آقای رحیمی'],
      newDate: ['تا پایان هفته', 'تا پایان ماه'],
      needAction: ['کاهش ظرفیت کمپ و انتقال بخشی از نیروها', 'تسویه دستمزد معوق'],
      probability: ['زیاد', 'متوسط'],
      mitigation: ['برنامه مدون اسکان و کمیته رفاه ماهانه', 'پرداخت علی‌الحساب دستمزد'],
      owner: ['مهندس باقری', 'آقای کریمی'],
      due: ['تا پایان هفته', 'تا پایان ماه'],
    },
    expectedOutput: 'گزارش وضعیت پشتیبانی و رفاه کارکنان',
    startOffset: -27, days: 3, end: 'ready', evidence: 3,
    objectives: [
      { title: 'بررسی وضعیت اسکان، تغذیه و ایاب‌ذهاب نیروهای کارگاه', measure: 'فهرست موارد با عکس', topicKey: 'hr_admin', priority: 'high' },
      { title: 'بررسی وضعیت پرداخت دستمزد و بیمه پیمانکاران جزء', measure: 'جدول وضعیت پرداخت هر پیمانکار', topicKey: 'hr_admin', priority: 'high' },
    ],
    answers: {
      'overview-1': 'پشتیبانی کارگاه قابل قبول است ولی اسکان و دستمزد پیمانکاران جزء نگرانی‌هایی دارد.',
      'hr-1': 'کمبود جوشکار ماهر داریم؛ دو نفر در ماه گذشته ترک کار کرده‌اند و غیبت‌ها بالاست. اثرش روی برنامه جوشکاری جدی است. مسئول پیگیری مهندس باقری است.',
      'hr-2': 'کمپ شماره ۲ بیش از ظرفیت اسکان شده، تهویه ضعیف است و غذا با کیفیت پایین عرضه می‌شود. رضایت کارکنان پایین است و این وضعیت باعث افزایش غیبت می‌شود.',
      'hr-3': 'دستمزد دو پیمانکار جزء بیش از دو ماه معوق است و بیمه یک پیمانکار منقضی شده است؛ خطر اعتصاب و توقف کار وجود دارد.',
      'ir-1': 'نبود برنامه مدون اسکان نیروهای جدید در گزارش‌های رسمی نیامده است.',
      'ir-2': 'اگر دستمزدها پرداخت نشود، ریسک توقف کار پیمانکاران جزء و تعطیلی جبهه جوشکاری وجود دارد.',
      'int-1': 'در پایان بازدید مدیر پشتیبانی کارگاه خواست موضوع معوقات دستمزد پیمانکاران جزء را در گزارش پررنگ نکنم.',
      'int-2': 'ندارم',
      'int-3': 'نگرانم اگر موضوع دستمزد را شفاف بنویسم رابطه کاری‌ام با کارگاه آسیب ببیند.',
      'evd-1': 'ثبت شد',
    },
    objectiveAnswers: ['کاملاً محقق شد؛ فهرست با عکس تهیه شد', 'تا حدی؛ جدول دو پیمانکار از چهار پیمانکار گرفته شد'],
    decisions: [
      { title: 'ظرفیت کمپ شماره ۲ کاهش و بخشی از نیروها به کمپ ۱ منتقل شوند', owner: 'مهندس باقری', due: 'تا پایان هفته' },
      { title: 'دستمزد معوق پیمانکاران جزء تسویه شود', owner: 'آقای کریمی', due: 'تا پایان ماه' },
    ],
    actions: [{ title: 'تمدید بیمه پیمانکار جزء', owner: 'آقای رحیمی', due: 'یک هفته دیگر' }],
    suggestion: 'کمیته رفاه ماهانه با حضور نماینده کارکنان تشکیل شود.',
  },
  {
    visitType: 'procurement_expediting',
    destination: 'کارخانه سازنده شیرآلات — کرج',
    visitees: [{ name: 'آقای رضایی', org: 'شرکت فولاد ارقام', role: 'مدیر فروش' }, { name: 'مهندس سلطانی', org: 'شرکت فولاد ارقام', role: 'مدیر تولید' }],
    topicsOfInterest: 'تأخیر تأمین شیرهای ۳۶ اینچ، وضعیت بازرسی کارخانه',
    expectedOutput: 'برنامه تحویل مکتوب و صورتجلسه با سازنده',
    startOffset: -9, days: 2, end: 'review', evidence: 3,
    objectives: [
      { title: 'دریافت برنامه زمانی تحویل شیرهای ۳۶ اینچ از سازنده', measure: 'برنامه مکتوب با تاریخ مشخص', topicKey: 'procurement', priority: 'high' },
      { title: 'بازدید از خط تولید و ثبت وضعیت ساخت', measure: 'گزارش مکتوب با عکس از خط تولید', topicKey: 'procurement', priority: 'medium' },
    ],
    answers: {
      'overview-1': 'در کل وضعیت قابل قبول است ولی در بخش تأمین شیرها نگرانی داریم.',
      'progress-1': 'پیشرفت واقعی ۴۲ درصد و برنامه ۵۰ درصد است.',
      'progress-2': 'فقط خرید شیرها عقب افتاده است و بقیه فعالیت‌ها مطابق برنامه است.',
      'proc-1': 'تأمین شیرهای ۳۶ اینچ عقب افتاده است چون سازنده مشکل ارزی دارد. حدود سه ماه تأخیر دارد و مسیر بحرانی را تحت تأثیر قرار می‌دهد. مسئول پیگیری آقای رضایی است.',
      'proc-2': 'سازنده تعهد داد تا پایان مهر اولین محموله را تحویل بدهد.',
      'con-1': 'در این بازدید به کارگاه نرفتیم.',
      'con-2': 'مانعی ندیدم.',
      'hse-1': 'در کارخانه موردی از نظر ایمنی مشاهده نشد.',
      'ir-1': 'مورد دیگری نبود.',
      'ir-2': 'ممکن است اگر تحریم‌ها ادامه پیدا کند سازنده نتواند قطعات را تأمین کند و پروژه با ریسک توقف روبه‌رو شود.',
      'evd-1': 'ثبت شد',
    },
    objectiveAnswers: ['کاملاً محقق شد، برنامه مکتوب گرفتیم', 'تا حدی؛ فقط بخشی از خط تولید را دیدیم'],
    decisions: [
      { title: 'سازنده هر هفته گزارش پیشرفت تولید بدهد', owner: 'آقای رضایی', due: 'تا پایان ماه' },
      { title: 'سازنده برنامه مکتوب تحویل شیرها را ارائه کند', owner: 'آقای رضایی', due: 'تا پایان ماه' },
    ],
    actions: [{ title: 'ارسال نامه تسریع رسمی به سازنده', owner: 'آقای کریمی', due: 'دو هفته دیگر' }],
    suggestion: 'یک سازنده جایگزین هم برای شیرها پیش‌ارزیابی شود.',
  },
  {
    visitType: 'construction_supervision',
    destination: 'کارگاه ایستگاه تقویت فشار — جاسک',
    visitees: [{ name: 'مهندس احمدی', org: 'پیمانکار اجرا', role: 'سرپرست کارگاه' }],
    topicsOfInterest: 'ایمنی داربست، کیفیت جوش خط ورودی، پیشرفت اجرا',
    expectedOutput: 'گزارش ایمنی و فهرست NCRهای باز',
    startOffset: -24, days: 3, end: 'ready', evidence: 4, transfer: true,
    objectives: [
      { title: 'بررسی وضعیت ایمنی داربست‌ها و مجوزهای کار در ارتفاع', measure: 'فهرست موارد عدم‌رعایت با عکس', topicKey: 'hse', priority: 'critical' },
      { title: 'کنترل NCRهای باز جوش خط ورودی', measure: 'فهرست NCR با وضعیت رفع', topicKey: 'quality', priority: 'high' },
      { title: 'ثبت درصد پیشرفت اجرایی ایستگاه', measure: 'درصد پیشرفت واقعی در برابر برنامه', topicKey: 'progress', priority: 'medium' },
    ],
    answers: {
      'overview-1': 'پروژه با تأخیر ولی قابل جبران پیش می‌رود و مهم‌ترین نگرانی ایمنی داربست‌هاست.',
      'progress-1': 'پیشرفت واقعی ۶۱ درصد و برنامه ۶۸ درصد است.',
      'progress-2': 'نصب پایپینگ ایستگاه از برنامه عقب‌تر است و ساخت فونداسیون جلوتر.',
      'con-1': 'نیروی جوشکار کم است و دو جبهه کاری به دلیل کمبود جرثقیل کند شده است. حدود دو هفته تأخیر دارد.',
      'con-2': 'کمبود جرثقیل فعالیت نصب را کند کرده است چون جرثقیل دوم هنوز نرسیده. مسئول پیگیری پیمانکار اجرا است.',
      'hse-1': 'شبه‌حادثه جدی دیدم: داربست طبقه دوم بدون تأیید بازرسی ایمنی استفاده می‌شد و یک نفر نزدیک بود سقوط کند. این وضعیت بحرانی است.',
      'qual-1': 'سه NCR جوش خط ورودی باز است و بازرسی رادیوگرافی هنوز انجام نشده است.',
      'ir-1': 'مورد دیگری نبود.',
      'ir-2': 'ممکن است در صورت ادامه کمبود جرثقیل، فعالیت‌های مسیر بحرانی نصب با تأخیر بیشتری روبه‌رو شود.',
      'evd-1': 'ثبت شد',
    },
    objectiveAnswers: ['محقق شد؛ فهرست موارد با عکس ثبت شد', 'تا حدی؛ سه NCR باز شناسایی شد ولی وضعیت رفع نامشخص است', 'محقق شد'],
    decisions: [
      { title: 'استفاده از داربست طبقه دوم تا بازرسی ایمنی متوقف شود', owner: 'مهندس احمدی', due: 'فردا' },
      { title: 'پیمانکار گواهی بازرسی داربست را ارائه کند', owner: 'مهندس احمدی', due: 'تا پایان هفته' },
    ],
    actions: [{ title: 'بازرسی و برچسب‌گذاری همه داربست‌ها', owner: 'مهندس احمدی', due: 'تا پایان هفته' }],
    suggestion: 'بازرس ایمنی دائمی در کارگاه مستقر شود.',
  },
  {
    visitType: 'client_meeting',
    destination: 'دفتر مرکزی کارفرما — تهران',
    visitees: [{ name: 'دکتر موسوی', org: 'کارفرما', role: 'مدیر طرح' }],
    topicsOfInterest: 'ادعای تمدید مدت، تغییر دامنه کار',
    expectedOutput: 'صورتجلسه با تعهدات دو طرف',
    startOffset: -3, days: 1, end: 'debrief', stopAfterTopics: 3,
    objectives: [
      { title: 'دریافت پاسخ رسمی کارفرما به درخواست تمدید مدت', measure: 'نامه یا صورتجلسه امضاشده', topicKey: 'decisions', priority: 'high' },
    ],
    answers: {
      'overview-1': 'جلسه سازنده بود ولی کارفرما درباره تمدید مدت قاطع نبود.',
      'progress-1': 'پیشرفت واقعی ۳۵ درصد و برنامه ۴۰ درصد است.',
      'progress-2': 'فعالیت‌های مهندسی عقب‌تر از برنامه است.',
    },
    objectiveAnswers: ['تا حدی'],
  },
  {
    visitType: 'progress_review',
    destination: 'دفتر مهندسی مشاور — اصفهان',
    visitees: [{ name: 'مهندس نوری', org: 'مشاور', role: 'مدیر مهندسی' }],
    topicsOfInterest: 'تأیید نقشه‌های ایستگاه، ریویژن P&ID',
    expectedOutput: 'فهرست مدارک معوق با تاریخ تأیید',
    startOffset: 5, days: 2, end: 'pending',
    objectives: [
      { title: 'دریافت فهرست مدارک مهندسی معلق نزد مشاور', measure: 'فهرست مکتوب با تاریخ تأیید هر مدرک', topicKey: 'engineering', priority: 'high' },
    ],
    answers: {}, objectiveAnswers: [],
  },
  {
    visitType: 'engineering',
    destination: 'دفتر مهندسی طراحی — شیراز',
    visitees: [{ name: 'مهندس کیانی', org: 'پیمانکار EPC', role: 'مدیر مهندسی' }],
    topicsOfInterest: 'نقشه‌های ایستگاه، P&ID',
    expectedOutput: 'فهرست مدارک معلق',
    startOffset: 4, days: 2, end: 'ticketing', originCity: 'تهران',
    objectives: [{ title: 'دریافت فهرست مدارک مهندسی معلق نزد پیمانکار', measure: 'فهرست مکتوب با تاریخ تحویل', topicKey: 'engineering', priority: 'high' }],
    answers: {}, objectiveAnswers: [],
  },
  {
    discipline: 'quality',
    visitType: 'quality_audit',
    destination: 'کارخانه پوشش لوله — بندرعباس',
    visitees: [{ name: 'مهندس شریفی', org: 'پیمانکار پوشش', role: 'مدیر کنترل کیفیت' }],
    topicsOfInterest: 'ITP پوشش، تست هالیدی، NCR',
    expectedOutput: 'گزارش ممیزی کیفیت',
    startOffset: -7, days: 2, end: 'approved',
    objectives: [
      { title: 'بررسی انطباق فرآیند پوشش با ITP مصوب', measure: 'فهرست عدم‌انطباق‌ها با شواهد', topicKey: 'quality', priority: 'high' },
      { title: 'کنترل نتایج تست هالیدی ده روز اخیر', measure: 'گزارش تست با امضای ناظر', topicKey: 'quality', priority: 'medium' },
    ],
    answers: {}, objectiveAnswers: [],
  },
  {
    visitType: 'progress_review',
    destination: 'کارگاه خط لوله ۳۶ اینچ — بخش دوم',
    visitees: [],
    topicsOfInterest: 'پیشرفت و موانع',
    expectedOutput: 'گزارش وضعیت',
    startOffset: -16, days: 2, end: 'returned',
    objectives: [{ title: 'بازدید از کارگاه و ثبت وضعیت', measure: 'گزارش مکتوب', topicKey: 'progress', priority: 'medium' }],
    answers: {
      'overview-1': 'خوب بود.',
      'progress-1': 'خوب پیش می‌رود.',
      'progress-2': 'تأخیر هست.',
      'con-1': 'نیرو کم بود.',
      'con-2': 'بله.',
      'hse-1': 'مشکلی نبود.',
      'ir-1': 'نه.',
      'ir-2': 'نه.',
      'evd-1': 'ندارم',
    },
    objectiveAnswers: ['تا حدی'],
    weak: true,
    actions: [{ title: 'پیگیری شود', owner: '', due: '' }],
    managerNote: 'گزارش بسیار کلی است: درصد پیشرفت، موانع مشخص و مسئول هر اقدام را بنویسید و حداقل یک عکس از کارگاه پیوست کنید.',
  },
  {
    discipline: 'hse',
    visitType: 'hse_audit',
    destination: 'کمپ و کارگاه ایستگاه کمپرسور — عسلویه',
    visitees: [{ name: 'مهندس باقری', org: 'مدیریت HSE پروژه', role: 'مدیر HSE' }],
    topicsOfInterest: 'ممیزی HSE، مجوز کار، آمادگی اضطراری',
    expectedOutput: 'گزارش ممیزی HSE',
    startOffset: -62, days: 3, end: 'claimed', evidence: 3,
    objectives: [
      { title: 'ممیزی مجوزهای کار و آمادگی اضطراری کارگاه', measure: 'چک‌لیست تکمیل‌شده ممیزی با عکس', topicKey: 'hse', priority: 'high' },
    ],
    answers: {
      'overview-1': 'وضعیت HSE کارگاه مطابق برنامه و رضایت‌بخش است.',
      'progress-1': 'پیشرفت واقعی ۵۵ درصد و برنامه ۵۳ درصد است.',
      'progress-2': 'فعالیت‌ها مطابق برنامه است.',
      'con-1': 'منابع کافی است و مانعی نیست.',
      'con-2': 'مانعی ندیدم.',
      'hse-1': 'عدم‌رعایت جزئی: در دو مورد مجوز کار در ارتفاع امضای ناظر نداشت و بلافاصله اصلاح شد.',
      'qual-1': 'موردی مشاهده نشد.',
      'ir-1': 'مورد دیگری نبود.',
      'ir-2': 'ریسک جدیدی ندیدم.',
      'evd-1': 'ثبت شد',
      'int-1': 'در جلسه پایانی از من خواسته شد مورد مجوزهای کار بدون امضای ناظر را در گزارش نیاورم.',
    },
    objectiveAnswers: ['کاملاً محقق شد، چک‌لیست تکمیل شد'],
    decisions: [
      { title: 'چک‌لیست ممیزی هر دو هفته تکرار شود', owner: 'مهندس باقری', due: 'دو هفته دیگر' },
      { title: 'برنامه ممیزی دوره‌ای ارائه شود', owner: 'مهندس باقری', due: 'تا پایان ماه' },
    ],
    actions: [{ title: 'تهیه برنامه آموزش مجوز کار', owner: 'مهندس باقری', due: 'دو هفته دیگر' }],
  },
  {
    visitType: 'coordination_meeting',
    destination: 'دفتر پروژه — تهران',
    visitees: [],
    topicsOfInterest: 'هماهنگی تأمین و اجرا',
    expectedOutput: '',
    startOffset: 12, days: 1, end: 'draft',
    objectives: [{ title: 'برگزاری جلسه هماهنگی تأمین و اجرا', measure: '', topicKey: '', priority: 'low' }],
    answers: {}, objectiveAnswers: [],
  },
]

export interface SeedContext {
  repo: MissionRepo & { forUser?: (u: CurrentUser) => MissionRepo }
  projects: ProjectRef[]
  /** People who play the visiting managers (cycled). Live DB: just the current user. */
  requesters: (PersonRef & { isAdmin?: boolean })[]
  manager: CurrentUser
  /** امور اداری — books tickets and approves claims. */
  adminAffairs: CurrentUser
  /** Mark live rows so they can be found and removed later. */
  marker?: string
  /** Offline demo only: draws a sample signature for a requester that has none. The live seed never invents one. */
  demoSignature?: (name: string) => string
}

/** A deterministic hand-drawn-looking scribble (SVG data URL) for demos. */
export function demoSignature(name: string): string {
  let h = 7
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const r = (k: number) => ((h >>> k) & 15) / 15
  let px = 12
  let py = 52
  let d = `M${px},${py}`
  for (let i = 0; i < 8; i++) {
    const x = 12 + (i + 1) * 36 + r(i) * 6
    const y = 44 + (i % 2 ? 16 : -14) * (0.6 + r(i + 5)) + r(i + 9) * 8
    d += ` Q${((px + x) / 2).toFixed(1)},${(Math.min(py, y) - 12 - r(i + 3) * 14).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`
    px = x
    py = y
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 90"><path d="${d}" fill="none" stroke="#1f2a44" stroke-width="2.6" stroke-linecap="round"/><path d="M40,70 C120,80 200,60 292,72" fill="none" stroke="#1f2a44" stroke-width="1.6" stroke-linecap="round"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function projectTypeOf(projects: ProjectRef[], id: string): string {
  return projects.find((p) => p.id === id)?.projectType ?? ''
}

/** Single-question sessions (kept so old saved interviews still replay). */
function legacyAnswer(p: PendingQuestion, sc: Scenario, objectives: Objective[], used: Record<string, number>): string {
  if (p.kind === 'followup' && p.slot) {
    const list = sc.slotAnswers?.[p.slot] ?? SLOT_ANSWERS[p.slot] ?? ['نامشخص']
    used[p.slot] = (used[p.slot] ?? 0) + 1
    return list[(used[p.slot] - 1) % list.length]
  }
  if (p.kind === 'followup') return 'مورد دیگری ندارم'
  if (p.findingKey?.startsWith('obj:')) return sc.objectiveAnswers[objectives.findIndex((o) => `obj:${o.id}` === p.findingKey)] ?? 'تا حدی'
  return sc.answers[p.id] ?? 'موردی مشاهده نشد.'
}

/** Fills the pre-built answer template the way a diligent user would, from the scenario's scripted facts. */
function composeBatchAnswer(p: PendingQuestion, state: InterviewState, sc: Scenario, objectives: Objective[], used: Record<string, number>): string {
  const layout = p.layout!
  if (layout.gap) {
    const g = layout.gap
    const out: string[] = []
    for (const f of g.fields) out.push(`${f}: ${sc.weak ? 'نمی‌دانم' : 'ندارم'}`)
    for (const id of g.objectives) out.push('▪ هدف', `نتیجه: ${sc.objectiveAnswers[objectives.findIndex((o) => o.id === id)] ?? 'تا حدی'}`, 'توضیح: ')
    for (const f of g.findings) {
      out.push(`▪ «${f.title}»`)
      for (const slot of f.slots) {
        const list = sc.slotAnswers?.[slot] ?? SLOT_ANSWERS[slot] ?? ['نامشخص']
        used[slot] = (used[slot] ?? 0) + 1
        out.push(`${SLOT_LABEL[slot as keyof typeof SLOT_LABEL]}: ${sc.weak ? 'نمی‌دانم' : list[(used[slot] - 1) % list.length]}`)
      }
    }
    return out.join('\n')
  }
  const key = p.topicKey
  const ids = state.topics[key]?.mainAsked ?? []
  const said = ids.map((id) => sc.answers[id]).filter(Boolean)
  const lines: string[] = []
  layout.fields.forEach((f, i) => {
    let v = said[i] ?? (f.optional ? 'ندارم' : 'موردی مشاهده نشد')
    if (f.metric) {
      const m = extractMetrics(said.join(' '))
      v = m[f.metric] != null ? String(m[f.metric]) : ''
    } else if (key === 'actions') v = sc.suggestion ?? 'پیشنهاد دیگری ندارم'
    lines.push(`${f.label}: ${v}`)
  })
  if (layout.entries) {
    const list = (key === 'decisions' ? sc.decisions : sc.actions) ?? []
    for (let i = 0; i < layout.entries.count; i++) {
      const e = list[i]
      lines.push('', `${layout.entries.item} ${i + 1}: ${e?.title ?? ''}`, `${layout.entries.ownerLabel}: ${e?.owner ?? ''}`, `${layout.entries.dueLabel}: ${e?.due ?? ''}`)
      if (layout.entries.noteLabel) lines.push(`${layout.entries.noteLabel}: `)
    }
  }
  if (layout.objectives) {
    layout.objectives.forEach((o, i) => {
      const a = sc.objectiveAnswers[i] ?? 'تا حدی'
      const [result, ...rest] = a.split(/[؛،]/)
      lines.push(`هدف ${i + 1} — «${o.title}»`, `نتیجه: ${result.trim()}`, `توضیح: ${rest.join('، ').trim()}`)
    })
  }
  return lines.join('\n')
}

async function ensureSignature(repo: MissionRepo, name: string, ctx: SeedContext): Promise<void> {
  if (await repo.loadMySignature()) return
  if (!ctx.demoSignature) throw new Error('برای ساخت داده نمونه ابتدا امضای نمونه خود را در «پروفایل» ثبت کنید؛ گزارش‌های نمونه با آن امضا می‌شوند.')
  await repo.saveMySignature(ctx.demoSignature(name))
}

async function runInterview(repo: MissionRepo, mission: Mission, objectives: Objective[], ctx: SeedContext, sc: Scenario) {
  const input: EngineInput = { set: DEFAULT_QUESTION_SET, mission, objectives, projectType: projectTypeOf(ctx.projects, mission.masterProjectId), projectName: mission.projectName, today: todayIso(), ai: null }
  let step = startInterview(input)
  let state: InterviewState = step.state
  let findings: Finding[] = step.findings
  let seq = 1
  await repo.appendTurns(mission.id, seq, step.turns)
  seq += step.turns.length
  const used: Record<string, number> = {}
  let completedTopics = 0
  let guard = 0
  while (state.pending && guard++ < 80) {
    const p: PendingQuestion = state.pending
    const text = p.layout ? composeBatchAnswer(p, state, sc, objectives, used) : legacyAnswer(p, sc, objectives, used)
    step = await submitAnswer(input, state, findings, text, 'text')
    const before = completedTopics
    completedTopics = Object.values(step.state.topics).filter((t) => t.state !== 'open').length
    await repo.appendTurns(mission.id, seq, step.turns)
    seq += step.turns.length
    state = step.state
    findings = step.findings
    for (const u of step.objectiveUpdates) await repo.updateObjective(u.id, { status: u.status, resultNote: u.note })
    if (sc.stopAfterTopics && completedTopics >= sc.stopAfterTopics && completedTopics > before) break
  }
  await repo.upsertFindings(mission.id, findings)
  await repo.saveInterview(mission.id, { status: state.current === null ? 'summary' : 'active', state, provider: 'rules' })
  return { state, findings }
}

export async function seedDemo(ctx: SeedContext): Promise<number> {
  const { repo, projects } = ctx
  if (!projects.length) throw new Error('هیچ پروژه‌ای برای ساخت داده نمونه وجود ندارد.')
  const today = todayIso()
  let created = 0
  let idx = 0
  for (const sc of SCENARIOS) {
    const requester = ctx.requesters[idx % ctx.requesters.length]
    const project = projects[idx % projects.length]
    idx++
    const asRequester: MissionRepo = ctx.repo.forUser ? ctx.repo.forUser({ id: requester.id, name: requester.name, position: requester.position, isAdmin: !!requester.isAdmin, isManager: false, isAdminAffairs: false }) : repo
    const asManager: MissionRepo = ctx.repo.forUser ? ctx.repo.forUser(ctx.manager) : repo
    const asAdminAffairs: MissionRepo = ctx.repo.forUser ? ctx.repo.forUser(ctx.adminAffairs) : repo
    const start = addDaysIso(today, sc.startOffset)
    const draft: MissionDraft = {
      masterProjectId: project.id,
      discipline: sc.discipline ?? 'general',
      requesterPosition: requester.position || 'مدیر پروژه',
      needsTicket: sc.ticket !== false,
      originCity: sc.originCity ?? 'تهران',
      destinationCity: sc.destinationCity ?? (sc.destination.includes('—') ? sc.destination.split('—').pop()!.trim() : ''),
      companions: sc.companions ?? [],
      ticketNote: sc.ticket === false ? '' : 'ترجیحاً پرواز صبح',
      destination: sc.destination,
      locationDetail: ctx.marker ?? '',
      startDate: start,
      endDate: addDaysIso(start, sc.days - 1),
      visitType: sc.visitType,
      visitees: sc.visitees,
      topicsOfInterest: sc.topicsOfInterest,
      expectedOutput: sc.expectedOutput,
      approverId: ctx.manager.id || null,
    }
    const mission = await asRequester.createMission(draft, sc.objectives)
    created++
    if (sc.end === 'draft') continue
    await asRequester.transition(mission.id, 'submit_request')
    if (sc.end === 'pending') continue
    await asManager.transition(mission.id, 'approve_request', 'اهداف روشن است؛ موفق باشید.')
    if (sc.end === 'ticketing') continue
    if (sc.ticket !== false) {
      await asAdminAffairs.transition(mission.id, 'issue_ticket', 'بلیط صادر و ارسال شد.', {
        airline: ['ماهان', 'ایران‌ایر', 'آسمان'][idx % 3],
        flightNo: `W5-${1100 + idx * 7}`,
        departAt: `${shamsiOf(start)} ساعت ۰۷:۳۰`,
        returnAt: `${shamsiOf(addDaysIso(start, sc.days - 1))} ساعت ۱۸:۰۰`,
        pnr: `K${String(7000 + idx * 13)}Z`,
        cost: `${12 + idx} ۰۰۰ ۰۰۰`,
      })
    }
    if (sc.end === 'approved') continue
    await asRequester.transition(mission.id, 'start_debrief')
    const bundle = await asRequester.loadBundle(mission.id)
    const { state, findings } = await runInterview(asRequester, bundle.mission, bundle.objectives, ctx, sc)
    for (let i = 0; i < (sc.evidence ?? 0); i++) {
      await asRequester.addEvidence(mission.id, { kind: (['photo', 'minutes', 'letter', 'technical'] as const)[i % 4], title: ['عکس از محل بازدید', 'صورتجلسه با سازنده', 'نامه تسریع', 'مدرک فنی'][i % 4], note: '', topicKey: ['construction', 'decisions', 'procurement', 'quality'][i % 4], findingId: null, objectiveId: null, capturedAt: `${start}T11:30:00` }, null)
    }
    if (sc.end === 'debrief') continue
    const full = await asRequester.loadBundle(mission.id)
    const content = buildReport({ mission: full.mission, projectName: full.mission.projectName, objectives: full.objectives, findings, evidence: full.evidence, state, set: DEFAULT_QUESTION_SET })
    const q = scoreReport({ mission: full.mission, objectives: full.objectives, findings, evidence: full.evidence, state, content })
    await asRequester.saveInterview(mission.id, { status: 'completed', summaryConfirmedAt: new Date().toISOString() })
    await asRequester.saveReport(mission.id, { content, qualityScore: q.score, breakdown: q.criteria, generatedBy: 'rules' })
    await ensureSignature(asRequester, requester.name, ctx)
    await asRequester.transition(mission.id, 'submit_report')
    if (sc.end === 'review') continue
    if (sc.end === 'returned') {
      await asManager.transition(mission.id, 'return_report', sc.managerNote ?? 'لطفاً گزارش را تکمیل کنید.')
      continue
    }
    if (sc.transfer) {
      const after = await asManager.loadBundle(mission.id)
      for (const f of after.findings.filter((x) => (x.kind === 'issue' || x.kind === 'risk') && (x.severity === 'critical' || x.severity === 'high'))) {
        try {
          await asManager.transferFinding(f.id, f.kind === 'issue' ? 'issue' : 'risk')
        } catch {
          /* a project without an Issue/Risk mapping simply stays proposed */
        }
      }
    }
    await asManager.transition(mission.id, 'approve_report', 'گزارش کامل و قابل اتکا بود. ممنون.')
    if (sc.end === 'claimed') await asAdminAffairs.transition(mission.id, 'approve_claim', 'کلیم مطابق دستورالعمل تأیید شد.')
  }
  return created
}
