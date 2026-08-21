import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../store/useAuthStore'
import { makeId } from '../../../lib/id'
import {
  RM_CATEGORIES,
  strategiesForRiskType,
  type RmRiskCategory,
  type RmRiskType,
  type RmResponseStrategy,
} from '../../risk/types'

/**
 * Coherent, seeded (reproducible) demo dataset generator + wipe/reseed orchestration, run
 * entirely through the app's own authenticated Supabase client (admin RLS policies already
 * allow this) — the codebase's earlier one-off seed script had to be handed to the user to run
 * locally because this sandbox's outbound network is blocked; an in-app admin action has no
 * such limitation and is repeatable on demand (spec: "Reset Demo Data" / "Reload Demo Dataset").
 *
 * Scope: the full Portfolio -> Program -> Project hierarchy (4 / 8 / 16) plus every connected
 * module — Risk, Issue Management, PipePulse (schematic/schedule/daily-log) and Reporting
 * (decisions/actions/role roster) — each with its own project registry reconciled back onto
 * master_projects via rasta_project_mappings, so Portfolio/Program-level rollup reports (e.g.
 * "risks of a portfolio") resolve real data across every module, not just Risk.
 */

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic across runs so results are coherent/reproducible.
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let rand = mulberry32(20260811)
function ri(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min
}
function pick<T>(arr: T[]): T {
  return arr[ri(0, arr.length - 1)]
}
function chance(p: number): boolean {
  return rand() < p
}
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const TODAY = new Date().toISOString().slice(0, 10)
const PROJECT_START = addDays(TODAY, -300)

/** Cycles through a fixed pool (real profiles fetched at seed time) — used so every management/
 * ownership FK across every module gets a real user instead of null, without ever assuming the
 * target tenant has more than one registered user. */
function makeCycler(pool: string[]) {
  const items = pool.length > 0 ? pool : ['']
  let i = 0
  const next = (): string => items[i++ % items.length]
  const nextDistinct = (n: number, exclude: Set<string> = new Set()): string[] => {
    const result: string[] = []
    let guard = 0
    while (result.length < n && guard < items.length * 3 + 6) {
      guard++
      const id = next()
      if (id && !exclude.has(id) && !result.includes(id)) result.push(id)
    }
    return result
  }
  return { next, nextDistinct }
}

// ---------------------------------------------------------------------------
// Hierarchy definition — 4 portfolios, 8 programs (2 each), 16 projects (2 per program).
// ---------------------------------------------------------------------------
const PORTFOLIO_DEFS = [
  { code: 'PF-GTD', name: 'توسعه انتقال گاز', description: 'پورتفولیوی پروژه‌های احداث و توسعه خطوط انتقال گاز سراسری' },
  { code: 'PF-GID', name: 'توسعه زیرساخت گاز', description: 'پورتفولیوی پروژه‌های ایستگاه‌های تقویت فشار و زیرساخت توزیع' },
  { code: 'PF-GPF', name: 'پالایش و تاسیسات گاز', description: 'پورتفولیوی پروژه‌های پالایشگاهی و تاسیسات فرآورش گاز' },
  { code: 'PF-SDI', name: 'نوسازی و پایش هوشمند دارایی‌ها', description: 'پورتفولیوی پروژه‌های دیجیتالی‌سازی، پایش هوشمند و نوسازی دارایی‌های صنعت گاز' },
]

const PROGRAM_DEFS = [
  { code: 'PG-1A', name: 'طرح خطوط ۵۶ اینچ شمال', portfolioIndex: 0 },
  { code: 'PG-1B', name: 'طرح خطوط ۴۲ اینچ جنوب', portfolioIndex: 0 },
  { code: 'PG-2A', name: 'طرح ایستگاه‌های تقویت فشار مرکزی', portfolioIndex: 1 },
  { code: 'PG-2B', name: 'طرح توسعه شبکه توزیع غرب', portfolioIndex: 1 },
  { code: 'PG-3A', name: 'طرح واحدهای فرآورش گاز ترش', portfolioIndex: 2 },
  { code: 'PG-3B', name: 'طرح تاسیسات جانبی پالایشگاه', portfolioIndex: 2 },
  { code: 'PG-4A', name: 'طرح پایش هوشمند خطوط لوله (SCADA/IoT)', portfolioIndex: 3 },
  { code: 'PG-4B', name: 'طرح نوسازی و بازرسی هوشمند تاسیسات', portfolioIndex: 3 },
]

/** category/type/description shared by every project under a given program (programIndex-keyed). */
const PROGRAM_META = [
  { category: 'خط لوله انتقال گاز', type: 'EPC' },
  { category: 'خط لوله انتقال گاز', type: 'EPC' },
  { category: 'ایستگاه تقویت فشار', type: 'EPC' },
  { category: 'شبکه توزیع گاز', type: 'EPC' },
  { category: 'واحد فرآورش و پالایش گاز', type: 'EPCF' },
  { category: 'واحد فرآورش و پالایش گاز', type: 'EPCF' },
  { category: 'زیرساخت دیجیتال و پایش هوشمند', type: 'PC' },
  { category: 'زیرساخت دیجیتال و پایش هوشمند', type: 'PC' },
]

const PROJECT_DEFS = [
  { code: 'P-01', name: 'احداث خط لوله ۵۶ اینچ فاز ۱ (کیلومتر ۰ تا ۸۰)', programIndex: 0 },
  { code: 'P-02', name: 'احداث خط لوله ۵۶ اینچ فاز ۲ (کیلومتر ۸۰ تا ۲۰۰)', programIndex: 0 },
  { code: 'P-03', name: 'احداث خط لوله ۴۲ اینچ جنوب - قطعه شمالی', programIndex: 1 },
  { code: 'P-04', name: 'احداث خط لوله ۴۲ اینچ جنوب - قطعه جنوبی', programIndex: 1 },
  { code: 'P-05', name: 'ایستگاه تقویت فشار شماره ۳', programIndex: 2 },
  { code: 'P-06', name: 'ایستگاه تقویت فشار شماره ۴', programIndex: 2 },
  { code: 'P-07', name: 'توسعه شبکه توزیع منطقه غرب - فاز ۱', programIndex: 3 },
  { code: 'P-08', name: 'توسعه شبکه توزیع منطقه غرب - فاز ۲', programIndex: 3 },
  { code: 'P-09', name: 'واحد شیرین‌سازی گاز ترش - واحد ۱', programIndex: 4 },
  { code: 'P-10', name: 'واحد شیرین‌سازی گاز ترش - واحد ۲', programIndex: 4 },
  { code: 'P-11', name: 'تاسیسات جانبی و مخازن ذخیره‌سازی', programIndex: 5 },
  { code: 'P-12', name: 'واحد بازیافت گوگرد', programIndex: 5 },
  { code: 'P-13', name: 'پایش هوشمند خط لوله ۵۶ اینچ (SCADA)', programIndex: 6 },
  { code: 'P-14', name: 'سامانه تشخیص نشت و پایش لحظه‌ای خطوط', programIndex: 6 },
  { code: 'P-15', name: 'نوسازی و بازرسی هوشمند ایستگاه‌های تقویت فشار', programIndex: 7 },
  { code: 'P-16', name: 'سامانه مدیریت دارایی و بازرسی هوشمند تاسیسات', programIndex: 7 },
]

const ORG_DEFS = [
  { name: 'شرکت ملی گاز ایران', short_name: 'NIGC', org_type: 'employer', description: 'کارفرمای اصلی پروژه‌های انتقال و توسعه گاز کشور', contact_name: 'روابط عمومی کارفرما', contact_email: 'contact@nigc.example.com', contact_phone: '021-88900000' },
  { name: 'شرکت انتقال گاز ایران', short_name: 'IGTC', org_type: 'employer', description: 'کارفرمای پروژه‌های خطوط انتقال سراسری', contact_name: 'دفتر فنی کارفرما', contact_email: 'info@igtc.example.com', contact_phone: '021-88900010' },
  { name: 'مهندسین مشاور پارس انرژی', short_name: 'PEC', org_type: 'consultant', description: 'مشاور طراحی پایه و تفصیلی خطوط لوله و تاسیسات', contact_name: 'مدیر پروژه مشاور', contact_email: 'pm@parsenergy.example.com', contact_phone: '021-88900020' },
  { name: 'مهندسین مشاور توسعه انرژی', short_name: 'TEC', org_type: 'consultant', description: 'مشاور نظارت کارگاهی و کنترل کیفیت', contact_name: 'مدیر نظارت مشاور', contact_email: 'supervision@tec.example.com', contact_phone: '021-88900030' },
  { name: 'شرکت پیمانکاری خط و لوله جنوب', short_name: 'SPL', org_type: 'contractor', description: 'پیمانکار اجرایی خطوط لوله و ایستگاه‌های تقویت فشار', contact_name: 'مدیر پروژه پیمانکار', contact_email: 'pm@spl.example.com', contact_phone: '021-88900040' },
  { name: 'شرکت ساختمانی و صنعتی البرز', short_name: 'ASC', org_type: 'contractor', description: 'پیمانکار اجرایی تاسیسات و ساختمان‌های صنعتی', contact_name: 'مدیر پروژه پیمانکار', contact_email: 'pm@asc.example.com', contact_phone: '021-88900050' },
  { name: 'کنسرسیوم فناوری پایش هوشمند', short_name: 'SMC', org_type: 'partner', description: 'شریک فناوری پایش، SCADA و کنترل هوشمند پروژه', contact_name: 'مدیر همکاری‌های فناوری', contact_email: 'partners@smc.example.com', contact_phone: '021-88900060' },
]

const CLIENTS = ['شرکت ملی گاز ایران', 'شرکت انتقال گاز', 'شرکت پالایش و پخش']
const PROJECT_MANAGERS = ['مهندس رضایی', 'مهندس احمدی', 'مهندس کریمی', 'مهندس موسوی', 'مهندس صادقی']
const CONTRACT_TYPES = ['قرارداد سرجمع (Lump Sum)', 'قرارداد فهرست بهایی (Unit Price)', 'قرارداد EPC تمام‌شده (Turnkey)', 'قرارداد مشارکت در ساخت (BOT)']
const LOCATIONS = [
  'استان خوزستان - مسیر خط اصلی',
  'استان بوشهر - سایت پالایشگاهی',
  'استان فارس - ایستگاه تقویت فشار',
  'استان کهگیلویه و بویراحمد - مسیر کوهستانی',
  'استان هرمزگان - منطقه ساحلی',
  'استان ایلام - مرز غربی',
  'استان کرمانشاه - مسیر غرب کشور',
  'استان گلستان - شبکه توزیع شمال',
]
const UNITS = ['واحد ۱۰۰', 'واحد ۲۰۰', 'خط اصلی A', 'خط اصلی B', 'ایستگاه مرکزی', 'بلوک شمالی']
const LINE_SIZES = ['4"', '6"', '8"', '10"', '12"', '16"', '20"', '24"', '30"', '36"', '42"', '56"']
const LINE_SPECS = ['CS-A106-GrB', 'CS-API5L-X60', 'CS-API5L-X70', 'SS316L']
const LINE_SERVICES = ['گاز ترش', 'گاز شیرین', 'آب صنعتی', 'هوای فشرده', 'کاندنسیت']
const LINE_CONTRACTORS = ['شرکت پیمانکاری خط و لوله جنوب', 'شرکت ساختمانی و صنعتی البرز', 'گروه اجرایی نصب و ساخت شرق', 'کارگاه جوشکاری تخصصی مرکزی']
const MILESTONE_LABELS = ['شروع پروژه', 'تکمیل مهندسی پایه', 'تکمیل تدارکات کالای اصلی', 'تکمیل ۵۰٪ عملیات اجرایی', 'آماده‌سازی پیش‌راه‌اندازی', 'تحویل موقت به کارفرما']
const MILESTONE_COLORS = ['#0ea5e9', '#a78bfa', '#f59e0b', '#2dd4bf', '#e74c3c', '#22c55e']

const ISSUE_TEMPLATES = [
  'عدم هماهنگی در تحویل زمین کارگاه به پیمانکار',
  'تاخیر در تامین برق موقت کارگاه',
  'اختلاف در برداشت نقشه‌های اجرایی بین پیمانکار و مشاور',
  'کمبود نیروی انسانی متخصص جوشکاری',
  'مغایرت مصالح تحویلی با مشخصات فنی قرارداد',
  'تداخل مسیر خط لوله با تاسیسات زیرساختی موجود',
  'تاخیر در صدور مجوز کار ایمن (Permit to Work)',
  'کمبود تجهیزات حمل و نقل سنگین در کارگاه',
  'مغایرت صورت‌وضعیت با کارکرد واقعی',
  'تاخیر در تامین تجهیزات آزمایشگاهی بازرسی جوش',
  'مشکل دسترسی جاده‌ای به بخشی از مسیر خط',
  'اعتراض پیمانکار به تفسیر بند قراردادی',
]

const DECISION_TEMPLATES = [
  { title: 'تخصیص منابع اضافی برای جبران تاخیر برنامه', reason: 'انحراف تجمعی برنامه از خط پایه بیش از آستانه قابل‌قبول است', impact: 'در صورت عدم تصمیم‌گیری، تاریخ تکمیل قراردادی از دست می‌رود', recommended: 'افزایش گروه‌های اجرایی و کار در شیفت دوم برای فعالیت‌های بحرانی' },
  { title: 'تایید تغییر دامنه کار بر اساس درخواست کارفرما', reason: 'کارفرما درخواست افزودن محدوده کاری جدید به قرارداد را داده است', impact: 'بدون تصمیم، تیم اجرا نمی‌تواند برنامه‌ریزی قطعی انجام دهد', recommended: 'تهیه متمم قرارداد و برنامه زمان‌بندی اصلاحی' },
  { title: 'تصمیم درباره تعویض فروشنده تجهیزات کنترلی', reason: 'فروشنده اصلی قادر به تحویل به‌موقع تجهیزات نیست', impact: 'تاخیر تحویل تجهیزات مسیر بحرانی پروژه را متاثر می‌کند', recommended: 'تایید فروشنده جایگزین با هزینه و زمان تحویل بهتر' },
  { title: 'تصویب بودجه اضافی برای اقدامات کنترل کیفیت', reason: 'نتایج بازرسی‌های اخیر نشان‌دهنده نیاز به بازرسی مضاعف است', impact: 'ریسک عدم انطباق کیفیت در صورت عدم تامین بودجه افزایش می‌یابد', recommended: 'تخصیص بودجه برای بازرسی شخص ثالث در نقاط بحرانی' },
  { title: 'تصمیم نهایی درباره مسیر جایگزین عبور خط', reason: 'اعتراض مالکین اراضی به مسیر مصوب همچنان ادامه دارد', impact: 'بدون تصمیم قطعی، عملیات خاکبرداری در این قطعه متوقف می‌ماند', recommended: 'تصویب مسیر جایگزین پیشنهادی تیم مهندسی' },
]

const RASTA_ACTION_TEMPLATES = [
  'پیگیری اقدام اصلاحی با پیمانکار اصلی',
  'ارائه گزارش وضعیت به کارفرما',
  'بازنگری برنامه زمان‌بندی کلی پروژه',
  'هماهنگی جلسه تصمیم‌گیری با ذی‌نفعان',
  'تخصیص منابع اضافی برای جبران تاخیر',
  'پیگیری اجرای تصمیم مصوب کمیته راهبری',
  'به‌روزرسانی ثبت ریسک و مسائل پروژه',
  'تهیه گزارش تحلیل انحراف هزینه و زمان',
]

// ---------------------------------------------------------------------------
// Risk templates per category (mapped onto the 8 categories the schema already supports).
// ---------------------------------------------------------------------------
const RISK_TEMPLATES: Record<RmRiskCategory, { threat: string[]; opportunity: string[] }> = {
  procurement: {
    threat: ['تاخیر در تامین شیرآلات از فروشنده خارجی', 'افزایش قیمت لوله در بازار جهانی', 'عدم تحویل به‌موقع تجهیزات کنترلی'],
    opportunity: ['امکان تامین محلی بخشی از تجهیزات', 'قرارداد بلندمدت با تخفیف حجمی فروشنده'],
  },
  technical: {
    threat: ['ناسازگاری طراحی با شرایط ژئوتکنیک منطقه', 'خطای مدارک مهندسی در فاز تفصیلی', 'محدودیت فنی تجهیزات کنترل فشار'],
    opportunity: ['امکان بهینه‌سازی مسیر خط با فناوری جدید', 'استفاده از متریال جایگزین با عملکرد بهتر'],
  },
  schedule: {
    threat: ['تاخیر پیمانکار در تحویل مدارک مهندسی', 'تاخیر در اخذ مجوز عبور از اراضی', 'همپوشانی فعالیت‌های بحرانی مسیر'],
    opportunity: ['امکان تسریع با موازی‌سازی فعالیت‌های ساخت', 'کاهش زمان کمیسیونینگ با برنامه‌ریزی بهینه'],
  },
  cost: {
    threat: ['افزایش هزینه به‌دلیل نوسان نرخ ارز', 'هزینه اضافی ناشی از تغییرات دامنه کار'],
    opportunity: ['صرفه‌جویی از طریق تجدید مذاکره قرارداد', 'کاهش هزینه حمل با بهینه‌سازی زنجیره تامین'],
  },
  hse: {
    threat: ['ریسک ایمنی در عملیات جوشکاری در ارتفاع', 'خطر نشت گاز حین تست هیدرواستاتیک'],
    opportunity: ['بهبود فرهنگ ایمنی با آموزش تخصصی'],
  },
  quality: {
    threat: ['نقص کیفیت جوش در تست‌های غیرمخرب', 'عدم انطباق پوشش ضدخوردگی با استاندارد'],
    opportunity: ['ارتقای کیفیت با بازرسی مضاعف شخص ثالث'],
  },
  external: {
    threat: ['تاخیر مجوز محیط‌زیست از سازمان‌های ذی‌ربط', 'اعتراض مالکین اراضی به مسیر خط', 'تحریم فروشنده خارجی تجهیزات کنترلی'],
    opportunity: ['امکان مشارکت با پیمانکار محلی برای تسریع مجوزها'],
  },
  other: {
    threat: ['عدم قطعیت در تخصیص منابع مالی پروژه', 'تغییر اولویت‌های کارفرما'],
    opportunity: ['امکان بهره‌برداری زودتر از موعد از بخشی از خط'],
  },
}

/** Deliberately recurring/duplicate risks across specific projects, per spec §23-24. */
const CROSS_PROJECT_DUPLICATES: { title: string; description: string; projectIndexes: number[]; category: RmRiskCategory }[] = [
  {
    title: 'تاخیر تامین شیرآلات از فروشنده خارجی',
    description: 'تاخیر در ساخت و ترخیص شیرآلات اصلی خط از فروشنده خارجی',
    projectIndexes: [0, 3, 6, 8, 12],
    category: 'procurement',
  },
  {
    title: 'تاخیر تحویل شیرآلات مسیر اصلی',
    description: 'تاخیر فروشنده در تحویل شیرآلات بحرانی مسیر اصلی خط لوله',
    projectIndexes: [1, 4, 13],
    category: 'procurement',
  },
  {
    title: 'تاخیر پیمانکار فرعی در تحویل کار',
    description: 'تاخیر مکرر پیمانکاران فرعی نسبت به برنامه زمان‌بندی مصوب',
    projectIndexes: [0, 1, 2, 5, 7, 9, 14, 15],
    category: 'schedule',
  },
  {
    title: 'تاخیر اخذ مجوز عبور از اراضی',
    description: 'تاخیر در اخذ مجوزهای عبور از اراضی کشاورزی و منابع طبیعی',
    projectIndexes: [0, 2, 4, 6, 12],
    category: 'external',
  },
  {
    title: 'تاخیر تحویل مدارک مهندسی تفصیلی',
    description: 'تاخیر مشاور در تحویل مدارک مهندسی تفصیلی به تیم اجرا',
    projectIndexes: [1, 3, 5, 8, 9, 13, 15],
    category: 'schedule',
  },
]

export interface DemoSeedCounts {
  organizations: number
  portfolios: number
  programs: number
  projects: number
  phases: number
  risks: number
  reviews: number
  riskActions: number
  issues: number
  pipepulseLines: number
  dailyLogs: number
  decisions: number
  actions: number
  roleAssignments: number
}

export interface DemoSeedProgress {
  (message: string): void
}

// ---------------------------------------------------------------------------
// Wipe — leaf/junction tables first, then each module's project registry, then the shared
// hierarchy. Most of these FKs already cascade from their module's project-registry root, but
// every step is listed explicitly so the wipe doesn't depend on assuming a specific cascade
// chain stays intact as the schema evolves.
// ---------------------------------------------------------------------------
export async function wipeAllDemoData(onProgress?: DemoSeedProgress): Promise<void> {
  const step = async (label: string, fn: () => PromiseLike<unknown>) => {
    onProgress?.(label)
    await fn()
  }
  const anyId = '00000000-0000-0000-0000-000000000000'
  const del = (table: string) => supabase.from(table).delete().neq('id', anyId)

  await step('حذف اقدامات مدیریتی...', () => del('rasta_actions'))
  await step('حذف تصمیمات...', () => del('rasta_decisions'))
  await step('حذف نقش‌های تخصیص‌یافته پروژه...', () => del('rasta_project_role_assignments'))
  await step('حذف نگاشت پروژه‌ها...', () => del('rasta_project_mappings'))
  await step('حذف اقدامات ریسک...', () => del('rm_risk_actions'))
  await step('حذف تاریخچه ریسک...', () => del('rm_risk_history'))
  await step('حذف بازبینی‌های ریسک...', () => del('rm_risk_assessments'))
  await step('حذف ریسک‌ها...', () => del('rm_risks'))
  await step('حذف اعضای پروژه ریسک...', () => supabase.from('rm_project_members').delete().neq('project_id', anyId))
  await step('حذف پروژه‌های ریسک...', () => del('rm_projects'))
  await step('حذف مسائل...', () => del('im_issues'))
  await step('حذف اعضای پروژه مسائل...', () => supabase.from('im_project_members').delete().neq('project_id', anyId))
  await step('حذف پروژه‌های مدیریت مسائل...', () => del('im_projects'))
  await step('حذف گزارش‌های روزانه PipePulse...', () => del('daily_logs'))
  await step('حذف خطوط PipePulse...', () => del('lines'))
  await step('حذف اعضای پروژه PipePulse...', () => supabase.from('project_members').delete().neq('project_id', anyId))
  await step('حذف پروژه‌های PipePulse...', () => del('projects'))
  await step('حذف فازهای پروژه...', () => del('project_phases'))
  await step('حذف پروژه‌های پایه...', () => del('master_projects'))
  await step('حذف طرح‌ها...', () => del('programs'))
  await step('حذف پورتفولیوها...', () => del('portfolios'))
  await step('حذف سازمان‌ها...', () => del('organizations'))
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
export async function seedDemoData(onProgress?: DemoSeedProgress): Promise<DemoSeedCounts> {
  rand = mulberry32(20260811)
  const userId = useAuthStore.getState().profile?.id ?? null
  if (!userId) throw new Error('کاربر واردشده یافت نشد')

  onProgress?.('دریافت فهرست کاربران سامانه...')
  const { data: profileRows } = await supabase.from('profiles').select('id').order('created_at')
  const profileIds = profileRows && profileRows.length > 0 ? (profileRows.map((p) => p.id as string) as string[]) : [userId]
  const people = makeCycler(profileIds)

  onProgress?.('ایجاد سازمان‌ها...')
  const { data: orgRows, error: orgErr } = await supabase
    .from('organizations')
    .insert(ORG_DEFS.map((o) => ({ ...o, is_active: true })))
    .select('id, short_name, org_type')
  if (orgErr || !orgRows) throw new Error(orgErr?.message ?? 'خطا در ایجاد سازمان‌ها')
  const orgIdsByType = (type: string) => orgRows.filter((r) => r.org_type === type).map((r) => r.id as string)
  const employerOrgIds = orgIdsByType('employer')
  const consultantOrgIds = orgIdsByType('consultant')
  const contractorOrgIds = orgIdsByType('contractor')
  const partnerOrgIds = orgIdsByType('partner')

  onProgress?.('ایجاد پورتفولیوها...')
  const { data: portfolioRows, error: pfErr } = await supabase
    .from('portfolios')
    .insert(
      PORTFOLIO_DEFS.map((p, i) => ({
        code: p.code,
        name: p.name,
        description: p.description,
        owner_id: people.next(),
        organization_id: employerOrgIds[i % employerOrgIds.length] ?? null,
        status: 'active',
        start_date: addDays(PROJECT_START, ri(-60, 0)),
        end_date: addDays(PROJECT_START, ri(900, 1200)),
        strategic_objectives: `توسعه پایدار و افزایش ظرفیت اطمینان در حوزه ${p.name} در راستای سند راهبردی صنعت گاز کشور`,
        is_active: true,
      })),
    )
    .select('id, code')
  if (pfErr || !portfolioRows) throw new Error(pfErr?.message ?? 'خطا در ایجاد پورتفولیوها')
  const portfolioIds = PORTFOLIO_DEFS.map((_, i) => portfolioRows.find((r) => r.code === PORTFOLIO_DEFS[i].code)!.id as string)

  onProgress?.('ایجاد طرح‌ها...')
  const { data: programRows, error: pgErr } = await supabase
    .from('programs')
    .insert(
      PROGRAM_DEFS.map((p) => ({
        code: p.code,
        name: p.name,
        description: `${p.name} — مجموعه پروژه‌های هم‌راستا تحت این طرح در چارچوب پورتفولیوی مربوطه`,
        portfolio_id: portfolioIds[p.portfolioIndex],
        program_manager_id: people.next(),
        sponsor_id: people.next(),
        status: 'active',
        start_date: addDays(PROJECT_START, ri(-45, 15)),
        planned_finish: addDays(PROJECT_START, ri(700, 1000)),
        strategic_objectives: `تحقق اهداف زمان‌بندی، هزینه و کیفیت پروژه‌های این طرح مطابق برنامه مصوب پورتفولیو`,
      })),
    )
    .select('id, code')
  if (pgErr || !programRows) throw new Error(pgErr?.message ?? 'خطا در ایجاد طرح‌ها')
  const programIds = PROGRAM_DEFS.map((_, i) => programRows.find((r) => r.code === PROGRAM_DEFS[i].code)!.id as string)

  onProgress?.('محاسبه زمان‌بندی پروژه‌ها...')
  const timelines = PROJECT_DEFS.map((_, i) => buildTimeline(i))

  onProgress?.('ایجاد پروژه‌های پایه...')
  const { data: masterProjectRows, error: mpErr } = await supabase
    .from('master_projects')
    .insert(
      PROJECT_DEFS.map((p, i) => {
        const program = PROGRAM_DEFS[p.programIndex]
        const meta = PROGRAM_META[p.programIndex]
        const t = timelines[i]
        return {
          project_code: p.code,
          official_name: p.name,
          short_name: p.name.split(' ').slice(0, 3).join(' '),
          description: `${p.name} در قالب طرح «${program.name}» و با هدف تحقق برنامه زمان‌بندی و کیفیت مصوب اجرا می‌شود.`,
          project_type: meta.type,
          project_category: meta.category,
          portfolio_id: portfolioIds[program.portfolioIndex],
          program_id: programIds[p.programIndex],
          status: t.status,
          contract_number: `GC-${1401 + (i % 3)}-${p.code}`,
          contract_type: pick(CONTRACT_TYPES),
          contract_value: (p.programIndex >= 6 ? ri(50, 500) : ri(500, 8000)) * 1_000_000_000,
          currency: 'IRR',
          contract_start_date: t.contractStart,
          contractual_completion_date: t.contractualCompletion,
          revised_completion_date: t.revisedCompletion,
          employer_org_id: employerOrgIds[i % employerOrgIds.length] ?? null,
          consultant_org_id: consultantOrgIds[i % consultantOrgIds.length] ?? null,
          contractor_org_id: contractorOrgIds[i % contractorOrgIds.length] ?? null,
          partner_org_id: partnerOrgIds[i % partnerOrgIds.length] ?? null,
          sponsor_id: people.next(),
          project_manager_id: people.next(),
          project_director_id: people.next(),
          program_manager_id: people.next(),
          portfolio_manager_id: people.next(),
          pmo_owner_id: people.next(),
          planned_start_date: t.plannedStart,
          planned_finish_date: t.plannedFinish,
          actual_start_date: t.actualStart,
          actual_finish_date: t.actualFinish,
          forecast_finish_date: t.forecastFinish,
          baseline_version: t.baselineVersion,
          schedule_status: t.scheduleStatus,
        }
      }),
    )
    .select('id, project_code')
  if (mpErr || !masterProjectRows) throw new Error(mpErr?.message ?? 'خطا در ایجاد پروژه‌های پایه')
  const masterProjectIds = PROJECT_DEFS.map((p) => masterProjectRows.find((r) => r.project_code === p.code)!.id as string)

  onProgress?.('ایجاد فازهای پروژه...')
  const phaseRows: Record<string, unknown>[] = []
  for (let i = 0; i < PROJECT_DEFS.length; i++) {
    phaseRows.push(...buildPhaseRows(masterProjectIds[i], timelines[i]))
  }
  const { error: phaseErr } = await supabase.from('project_phases').insert(phaseRows)
  if (phaseErr) throw new Error(phaseErr.message)

  // -------------------------------------------------------------------------
  // Risk Management
  // -------------------------------------------------------------------------
  onProgress?.('ایجاد پروژه‌های ماژول ریسک...')
  const { data: rmProjectRows, error: rmpErr } = await supabase
    .from('rm_projects')
    .insert(
      PROJECT_DEFS.map((p) => ({
        name: p.name,
        client: pick(CLIENTS),
        project_manager_id: people.next(),
        start_date: PROJECT_START,
        finish_date: addDays(PROJECT_START, ri(500, 800)),
        status: 'active',
      })),
    )
    .select('id, name')
  if (rmpErr || !rmProjectRows) throw new Error(rmpErr?.message ?? 'خطا در ایجاد پروژه‌های ریسک')
  const rmProjectIds = PROJECT_DEFS.map((p) => rmProjectRows.find((r) => r.name === p.name)!.id as string)

  const rmMemberRows: Record<string, unknown>[] = []
  for (const id of rmProjectIds) {
    const extra = people.nextDistinct(2, new Set([userId]))
    rmMemberRows.push({ project_id: id, user_id: userId, role: 'risk_manager' })
    if (extra[0]) rmMemberRows.push({ project_id: id, user_id: extra[0], role: 'project_manager' })
    if (extra[1]) rmMemberRows.push({ project_id: id, user_id: extra[1], role: 'risk_owner' })
  }
  await supabase.from('rm_project_members').insert(rmMemberRows)

  onProgress?.('اتصال پروژه‌ها به ماژول ریسک...')
  await supabase.from('rasta_project_mappings').insert(
    masterProjectIds.map((masterProjectId, i) => ({
      master_project_id: masterProjectId,
      source_module: 'risk',
      source_project_id: rmProjectIds[i],
      status: 'confirmed',
      alias_name: PROJECT_DEFS[i].name,
      created_by: userId,
      decided_by: userId,
      decided_at: new Date().toISOString(),
    })),
  )

  onProgress?.('ایجاد ریسک‌ها...')
  let riskCounter = 0
  let reviewCounter = 0
  let riskActionCounter = 0
  const risksByProject: string[][] = []

  for (let projectIndex = 0; projectIndex < PROJECT_DEFS.length; projectIndex++) {
    const rmProjectId = rmProjectIds[projectIndex]
    const riskCount = ri(8, 15)
    const riskRows: Record<string, unknown>[] = []

    const duplicatesHere = CROSS_PROJECT_DUPLICATES.filter((d) => d.projectIndexes.includes(projectIndex))
    for (const dup of duplicatesHere) {
      riskRows.push(buildRiskRow(rmProjectId, dup.title, dup.description, dup.category, 'threat', people.next()))
    }

    for (let i = riskRows.length; i < riskCount; i++) {
      const category = pick(RM_CATEGORIES)
      const riskType: RmRiskType = chance(0.8) ? 'threat' : 'opportunity'
      const templates = RISK_TEMPLATES[category][riskType === 'threat' ? 'threat' : 'opportunity']
      const title = templates.length > 0 ? pick(templates) : pick(RISK_TEMPLATES.other.threat)
      riskRows.push(buildRiskRow(rmProjectId, title, '', category, riskType, people.next()))
    }

    onProgress?.(`ثبت ${riskRows.length} ریسک برای پروژه ${projectIndex + 1} از ${PROJECT_DEFS.length}...`)
    const { data: insertedRisks, error: riskErr } = await supabase.from('rm_risks').insert(riskRows).select('id, initial_probability, initial_impact, status, risk_type')
    if (riskErr || !insertedRisks) throw new Error(riskErr?.message ?? 'خطا در ثبت ریسک‌ها')
    riskCounter += insertedRisks.length
    risksByProject.push((insertedRisks as { id: string }[]).map((r) => r.id))

    const assessmentRows: Record<string, unknown>[] = []
    const actionRows: Record<string, unknown>[] = []

    for (const risk of insertedRisks as { id: string; initial_probability: number; initial_impact: number; status: string; risk_type: string }[]) {
      if (risk.status !== 'closed' || chance(0.6)) {
        const trajectory: 'improving' | 'stable' | 'worsening' | 'fluctuating' = pick(['improving', 'stable', 'worsening', 'fluctuating'])
        const reviewCount = ri(0, 4)
        let prob = risk.initial_probability
        let impact = risk.initial_impact
        let reviewDate = PROJECT_START
        for (let r = 0; r < reviewCount; r++) {
          reviewDate = addDays(reviewDate, ri(14, 35))
          if (reviewDate > TODAY) break
          const delta = trajectory === 'improving' ? -1 : trajectory === 'worsening' ? 1 : trajectory === 'fluctuating' ? pick([-1, 1]) : 0
          prob = clamp(prob + (chance(0.5) ? delta : 0), 1, 5)
          impact = clamp(impact + (chance(0.5) ? delta : 0), 1, 5)
          const residualProb = clamp(prob - ri(0, 1), 1, 5)
          const residualImpact = clamp(impact - ri(0, 1), 1, 5)
          const trend = delta < 0 ? 'improving' : delta > 0 ? 'worsening' : 'stable'
          assessmentRows.push({
            risk_id: risk.id,
            review_date: reviewDate,
            current_probability: prob,
            current_impact: impact,
            residual_probability: residualProb,
            residual_impact: residualImpact,
            trend,
            reviewer_comment: REVIEW_COMMENTS[trend][ri(0, REVIEW_COMMENTS[trend].length - 1)],
            created_at: new Date(reviewDate).toISOString(),
          })
        }
      }

      const actionCount = ri(1, 4)
      for (let a = 0; a < actionCount; a++) {
        const statusRoll = rand()
        const dueDate = addDays(TODAY, ri(-25, 40))
        const status = statusRoll < 0.3 ? 'completed' : statusRoll < 0.65 ? 'in_progress' : 'not_started'
        const completion = status === 'completed' ? 100 : status === 'in_progress' ? ri(10, 80) : 0
        actionRows.push({
          risk_id: risk.id,
          description: pick(ACTION_TEMPLATES),
          owner_id: people.next(),
          due_date: dueDate,
          status,
          completion_percentage: completion,
        })
      }
    }

    if (assessmentRows.length > 0) {
      const { error } = await supabase.from('rm_risk_assessments').insert(assessmentRows)
      if (error) throw new Error(error.message)
      reviewCounter += assessmentRows.length
    }
    if (actionRows.length > 0) {
      const { error } = await supabase.from('rm_risk_actions').insert(actionRows)
      if (error) throw new Error(error.message)
      riskActionCounter += actionRows.length
    }
  }

  // -------------------------------------------------------------------------
  // Issue Management
  // -------------------------------------------------------------------------
  onProgress?.('ایجاد پروژه‌های مدیریت مسائل...')
  const { data: imProjectRows, error: impErr } = await supabase
    .from('im_projects')
    .insert(
      PROJECT_DEFS.map((p) => ({
        name: p.name,
        description: `پیگیری مسائل اجرایی پروژه ${p.name}`,
      })),
    )
    .select('id, name')
  if (impErr || !imProjectRows) throw new Error(impErr?.message ?? 'خطا در ایجاد پروژه‌های مدیریت مسائل')
  const imProjectIds = PROJECT_DEFS.map((p) => imProjectRows.find((r) => r.name === p.name)!.id as string)

  const imMemberRows: Record<string, unknown>[] = []
  const imMembersByProject: { pursuer: string; approver: string }[] = []
  for (const id of imProjectIds) {
    const extra = people.nextDistinct(2, new Set([userId]))
    const pursuer: string = extra[0] ?? userId
    const approver: string = extra[1] ?? userId
    imMemberRows.push({ project_id: id, user_id: userId, role: 'admin' })
    if (pursuer !== userId) imMemberRows.push({ project_id: id, user_id: pursuer, role: 'pursuer' })
    if (approver !== userId && approver !== pursuer) imMemberRows.push({ project_id: id, user_id: approver, role: 'approver' })
    imMembersByProject.push({ pursuer, approver })
  }
  await supabase.from('im_project_members').insert(imMemberRows)

  onProgress?.('اتصال پروژه‌ها به ماژول مدیریت مسائل...')
  await supabase.from('rasta_project_mappings').insert(
    masterProjectIds.map((masterProjectId, i) => ({
      master_project_id: masterProjectId,
      source_module: 'issues',
      source_project_id: imProjectIds[i],
      status: 'confirmed',
      alias_name: PROJECT_DEFS[i].name,
      created_by: userId,
      decided_by: userId,
      decided_at: new Date().toISOString(),
    })),
  )

  onProgress?.('ایجاد مسائل...')
  let issueCounter = 0
  const issuesByProject: string[][] = []
  for (let projectIndex = 0; projectIndex < PROJECT_DEFS.length; projectIndex++) {
    const projectId = imProjectIds[projectIndex]
    const { pursuer, approver } = imMembersByProject[projectIndex]
    const issueRows = buildIssueRows(projectId, pursuer, approver, timelines[projectIndex])
    const { data: insertedIssues, error } = await supabase.from('im_issues').insert(issueRows).select('id')
    if (error || !insertedIssues) throw new Error(error?.message ?? 'خطا در ثبت مسائل')
    issueCounter += insertedIssues.length
    issuesByProject.push((insertedIssues as { id: string }[]).map((r) => r.id))
    onProgress?.(`ثبت ${issueRows.length} مسئله برای پروژه ${projectIndex + 1} از ${PROJECT_DEFS.length}...`)
  }

  // -------------------------------------------------------------------------
  // PipePulse
  // -------------------------------------------------------------------------
  let lineCounter = 0
  let dailyLogCounter = 0
  const ppProjectIds: string[] = []

  for (let projectIndex = 0; projectIndex < PROJECT_DEFS.length; projectIndex++) {
    onProgress?.(`ایجاد پروژه PipePulse ${projectIndex + 1} از ${PROJECT_DEFS.length}...`)
    const p = PROJECT_DEFS[projectIndex]
    const t = timelines[projectIndex]

    const { data: ppProjectRow, error: ppErr } = await supabase
      .from('projects')
      .insert({
        name: p.name,
        client: pick(CLIENTS),
        location: pick(LOCATIONS),
        unit: pick(UNITS),
      })
      .select('id')
      .single()
    if (ppErr || !ppProjectRow) throw new Error(ppErr?.message ?? 'خطا در ایجاد پروژه PipePulse')
    const ppProjectId = ppProjectRow.id as string
    ppProjectIds.push(ppProjectId)

    const memberRoles = people.nextDistinct(3, new Set())
    const roles: ('contractor' | 'consultant' | 'owner')[] = ['contractor', 'consultant', 'owner']
    const memberInserts = memberRoles.map((uid, idx) => ({ project_id: ppProjectId, user_id: uid, role: roles[idx] }))
    if (!memberInserts.some((m) => m.user_id === userId)) memberInserts.push({ project_id: ppProjectId, user_id: userId, role: 'owner' })
    await supabase.from('project_members').insert(memberInserts)

    const lineCount = ri(4, 6)
    const lineDefs = Array.from({ length: lineCount }, (_, idx) => {
      const plannedLength = ri(200, 3000)
      const totalWelds = Math.max(4, Math.round(plannedLength / 12))
      return {
        svg_element_id: `L-${idx + 1}`,
        svg_element_ids: [`L-${idx + 1}`],
        size: pick(LINE_SIZES),
        spec: pick(LINE_SPECS),
        service: pick(LINE_SERVICES),
        contractor: pick(LINE_CONTRACTORS),
        planned_length: plannedLength,
        total_welds: totalWelds,
        fitting_weld_count: ri(0, Math.round(totalWelds * 0.15)),
        status: pick(['not_started', 'in_progress', 'in_progress', 'testing', 'completed'] as const),
        project_id: ppProjectId,
      }
    })
    const { data: insertedLines, error: lineErr } = await supabase.from('lines').insert(lineDefs).select('id, svg_element_id, planned_length, total_welds, status')
    if (lineErr || !insertedLines) throw new Error(lineErr?.message ?? 'خطا در ایجاد خطوط')
    lineCounter += insertedLines.length

    const dailyLogRows: Record<string, unknown>[] = []
    const scheduleRows: Record<string, unknown>[] = []
    for (const line of insertedLines as { id: string; svg_element_id: string; planned_length: number; total_welds: number; status: string }[]) {
      const activities: ('welding' | 'ndt' | 'coating' | 'hydrotest')[] = ['welding', 'ndt', 'coating', 'hydrotest']
      const finishedActivities = line.status === 'completed' ? 4 : line.status === 'testing' ? 3 : line.status === 'in_progress' ? ri(0, 2) : 0
      let cursor = t.plannedStart
      activities.forEach((activity, actIdx) => {
        const plannedStart = cursor
        const plannedEnd = addDays(plannedStart, ri(30, 90))
        cursor = plannedEnd
        const isDone = actIdx < finishedActivities
        const isCurrent = actIdx === finishedActivities && line.status !== 'not_started'
        const percentComplete = isDone ? 100 : isCurrent ? ri(15, 85) : 0
        scheduleRows.push({
          id: makeId('sch'),
          lineId: line.id,
          activity,
          plannedStart,
          plannedEnd,
          actualStart: percentComplete > 0 ? addDays(plannedStart, ri(-5, 10)) : null,
          actualEnd: percentComplete === 100 ? addDays(plannedEnd, ri(-10, 5)) : null,
          percentComplete,
          consultantApprovedAt: percentComplete === 100 ? new Date(addDays(plannedEnd, ri(-8, 8))).toISOString() : null,
          consultantApprovedBy: percentComplete === 100 ? people.next() : null,
        })

        if (isDone || isCurrent) {
          const logCount = ri(2, 5)
          const activityLength = Math.round((line.planned_length / 4) * (percentComplete / 100))
          const activityWelds = Math.round((line.total_welds / 4) * (percentComplete / 100))
          let remainingLength = activityLength
          let remainingWelds = activityWelds
          for (let l = 0; l < logCount; l++) {
            const isLast = l === logCount - 1
            const lengthDone = isLast ? remainingLength : Math.round(remainingLength / (logCount - l))
            const weldCount = isLast ? remainingWelds : Math.round(remainingWelds / (logCount - l))
            remainingLength -= lengthDone
            remainingWelds -= weldCount
            const logDate = addDays(plannedStart, ri(2, 60))
            const approvalRoll = rand()
            const approvalStatus = approvalRoll < 0.65 ? 'approved' : approvalRoll < 0.85 ? 'pending' : 'rejected'
            const reviewer = approvalStatus !== 'pending' ? people.next() : null
            const ownerAudited = approvalStatus === 'approved' && chance(0.35)
            dailyLogRows.push({
              project_id: ppProjectId,
              line_id: line.id,
              date: logDate <= TODAY ? logDate : TODAY,
              length_done: Math.max(0, lengthDone),
              weld_count: Math.max(0, weldCount),
              activity,
              contractor: pick(LINE_CONTRACTORS),
              notes: pick(DAILY_LOG_NOTES),
              delay_reason: chance(0.2) ? pick(DELAY_REASONS) : '',
              approval_status: approvalStatus,
              reviewed_by: reviewer,
              review_note: approvalStatus === 'approved' ? 'کارکرد گزارش‌شده مطابق مشاهده میدانی تایید شد' : approvalStatus === 'rejected' ? 'مغایرت با گزارش سرپرست کارگاه — نیاز به اصلاح' : '',
              contractor_length_done: Math.max(0, lengthDone),
              contractor_weld_count: Math.max(0, weldCount),
              consultant_length_done: approvalStatus === 'approved' ? Math.max(0, lengthDone) : null,
              consultant_weld_count: approvalStatus === 'approved' ? Math.max(0, weldCount) : null,
              owner_length_done: ownerAudited ? Math.max(0, lengthDone) : null,
              owner_weld_count: ownerAudited ? Math.max(0, weldCount) : null,
              owner_reviewed_at: ownerAudited ? new Date(logDate).toISOString() : null,
              owner_reviewed_by: ownerAudited ? people.next() : null,
              owner_note: ownerAudited ? 'بازدید میدانی مدیر کارفرما انجام و مقادیر تایید شد' : '',
            })
          }
        }
      })
    }

    if (dailyLogRows.length > 0) {
      const { error } = await supabase.from('daily_logs').insert(dailyLogRows)
      if (error) throw new Error(error.message)
      dailyLogCounter += dailyLogRows.length
    }

    const milestoneCount = ri(4, 6)
    const milestones = Array.from({ length: milestoneCount }, (_, idx) => {
      const label = MILESTONE_LABELS[idx % MILESTONE_LABELS.length]
      const percentComplete = t.status === 'completed' ? 100 : t.status === 'planning' || t.status === 'approved' ? 0 : clamp(100 - idx * ri(15, 30), 0, 100)
      const consultantApproved = percentComplete > 0 && chance(0.6)
      const ownerReviewed = consultantApproved && chance(0.5)
      return {
        id: makeId('ms'),
        label,
        percentComplete,
        color: MILESTONE_COLORS[idx % MILESTONE_COLORS.length],
        consultantApprovedAt: consultantApproved ? new Date(addDays(t.plannedStart, ri(30, 250))).toISOString() : null,
        consultantApprovedBy: consultantApproved ? people.next() : null,
        ownerReviewedAt: ownerReviewed ? new Date(addDays(t.plannedStart, ri(60, 260))).toISOString() : null,
        ownerReviewedBy: ownerReviewed ? people.next() : null,
      }
    })

    const curvePoints = 12
    const plannedCurve = Array.from({ length: curvePoints }, (_, idx) => {
      const frac = idx / (curvePoints - 1)
      const date = addDays(t.plannedStart, Math.round(frac * (new Date(t.plannedFinish).getTime() - new Date(t.plannedStart).getTime()) / 86400000))
      const s = 1 / (1 + Math.exp(-10 * (frac - 0.5)))
      return { date, plannedPercent: Math.round(s * 100) }
    })

    const scheduleApproved = t.status === 'completed' || (t.status === 'executing' && chance(0.3))
    await supabase
      .from('projects')
      .update({
        schedules: scheduleRows,
        milestones,
        planned_curve: plannedCurve,
        schedule_owner_approved_at: scheduleApproved ? new Date(addDays(t.plannedStart, ri(200, 280))).toISOString() : null,
        schedule_owner_approved_by: scheduleApproved ? people.next() : null,
      })
      .eq('id', ppProjectId)
  }

  onProgress?.('اتصال پروژه‌ها به ماژول PipePulse...')
  await supabase.from('rasta_project_mappings').insert(
    masterProjectIds.map((masterProjectId, i) => ({
      master_project_id: masterProjectId,
      source_module: 'pipepulse',
      source_project_id: ppProjectIds[i],
      status: 'confirmed',
      alias_name: PROJECT_DEFS[i].name,
      created_by: userId,
      decided_by: userId,
      decided_at: new Date().toISOString(),
    })),
  )

  // -------------------------------------------------------------------------
  // RASTA Access Control — Project Role Assignments (roster of who holds which
  // organizational role on each project, from the 9 system-seeded rasta_project_roles).
  // -------------------------------------------------------------------------
  onProgress?.('تخصیص نقش‌های پروژه...')
  const { data: roleDefs } = await supabase.from('rasta_project_roles').select('id, name')
  let roleAssignmentCounter = 0
  if (roleDefs && roleDefs.length > 0) {
    const assignmentRows = masterProjectIds.flatMap((masterProjectId) =>
      (roleDefs as { id: string; name: string }[]).map((role) => ({
        project_id: masterProjectId,
        user_id: people.next(),
        project_role_id: role.id,
        created_by: userId,
      })),
    )
    const { error } = await supabase.from('rasta_project_role_assignments').insert(assignmentRows)
    if (error) throw new Error(error.message)
    roleAssignmentCounter = assignmentRows.length
  }

  // -------------------------------------------------------------------------
  // Reporting — Decisions & Actions, cross-referencing the risks/issues seeded above so
  // Portfolio/Program-level reports have real decision/action data to roll up too.
  // -------------------------------------------------------------------------
  onProgress?.('ایجاد تصمیمات و اقدامات گزارش‌گیری...')
  let decisionCounter = 0
  let actionCounter = 0
  for (let projectIndex = 0; projectIndex < PROJECT_DEFS.length; projectIndex++) {
    const masterProjectId = masterProjectIds[projectIndex]
    const projectRisks = risksByProject[projectIndex]
    const projectIssues = issuesByProject[projectIndex]

    const decisionCount = ri(1, 2)
    const decisionRows: Record<string, unknown>[] = []
    for (let d = 0; d < decisionCount; d++) {
      const tmpl = pick(DECISION_TEMPLATES)
      const statusRoll = rand()
      const status = statusRoll < 0.3 ? 'pending' : statusRoll < 0.45 ? 'in_review' : statusRoll < 0.75 ? 'approved' : statusRoll < 0.9 ? 'rejected' : 'deferred'
      const decided = status === 'approved' || status === 'rejected' || status === 'deferred'
      const requiredBy = addDays(TODAY, ri(-10, 45))
      decisionRows.push({
        master_project_id: masterProjectId,
        title: tmpl.title,
        description: `${tmpl.title} — مرتبط با پروژه ${PROJECT_DEFS[projectIndex].name}`,
        reason: tmpl.reason,
        required_by: requiredBy,
        impact: tmpl.impact,
        recommended_action: tmpl.recommended,
        decision_owner_id: people.next(),
        status,
        final_decision: status === 'approved' ? 'تصمیم پیشنهادی تصویب و ابلاغ شد' : status === 'rejected' ? 'تصمیم پیشنهادی رد و راهکار جایگزین درخواست شد' : status === 'deferred' ? 'تصمیم‌گیری تا دریافت اطلاعات تکمیلی به تعویق افتاد' : '',
        decided_at: decided ? new Date(addDays(requiredBy, ri(-5, 5))).toISOString() : null,
        related_risk_id: chance(0.5) && projectRisks.length > 0 ? pick(projectRisks) : null,
        related_issue_id: chance(0.5) && projectIssues.length > 0 ? pick(projectIssues) : null,
        related_milestone_label: pick(MILESTONE_LABELS),
      })
    }
    const { data: insertedDecisions, error: decErr } = await supabase.from('rasta_decisions').insert(decisionRows).select('id')
    if (decErr || !insertedDecisions) throw new Error(decErr?.message ?? 'خطا در ثبت تصمیمات')
    decisionCounter += insertedDecisions.length
    const decisionIds = (insertedDecisions as { id: string }[]).map((r) => r.id)

    const actionCount = ri(2, 3)
    const actionRows: Record<string, unknown>[] = []
    for (let a = 0; a < actionCount; a++) {
      const source = pick(['risk', 'issue', 'decision', 'management_report'] as const)
      const statusRoll = rand()
      const status = statusRoll < 0.3 ? 'not_started' : statusRoll < 0.65 ? 'in_progress' : statusRoll < 0.92 ? 'completed' : 'cancelled'
      actionRows.push({
        master_project_id: masterProjectId,
        title: pick(RASTA_ACTION_TEMPLATES),
        owner_id: people.next(),
        due_date: addDays(TODAY, ri(-20, 45)),
        priority: pick(['low', 'medium', 'medium', 'high', 'critical'] as const),
        status,
        source,
        source_decision_id: source === 'decision' && decisionIds.length > 0 ? pick(decisionIds) : null,
        related_risk_id: source === 'risk' && projectRisks.length > 0 ? pick(projectRisks) : null,
        related_issue_id: source === 'issue' && projectIssues.length > 0 ? pick(projectIssues) : null,
      })
    }
    const { error: actErr } = await supabase.from('rasta_actions').insert(actionRows)
    if (actErr) throw new Error(actErr.message)
    actionCounter += actionRows.length
  }

  onProgress?.('اتمام')
  return {
    organizations: ORG_DEFS.length,
    portfolios: PORTFOLIO_DEFS.length,
    programs: PROGRAM_DEFS.length,
    projects: PROJECT_DEFS.length,
    phases: phaseRows.length,
    risks: riskCounter,
    reviews: reviewCounter,
    riskActions: riskActionCounter,
    issues: issueCounter,
    pipepulseLines: lineCounter,
    dailyLogs: dailyLogCounter,
    decisions: decisionCounter,
    actions: actionCounter,
    roleAssignments: roleAssignmentCounter,
  }
}

// ---------------------------------------------------------------------------
// Timelines & phases
// ---------------------------------------------------------------------------
interface ProjectTimeline {
  plannedStart: string
  plannedFinish: string
  status: string
  scheduleStatus: string
  actualStart: string | null
  actualFinish: string | null
  forecastFinish: string | null
  contractStart: string
  contractualCompletion: string
  revisedCompletion: string
  baselineVersion: string
}

const STATUS_CYCLE = [
  'executing', 'executing', 'executing', 'executing', 'executing',
  'executing', 'executing', 'executing', 'executing', 'executing',
  'completed', 'completed', 'planning', 'planning', 'on_hold', 'approved',
]

function buildTimeline(index: number): ProjectTimeline {
  const status = STATUS_CYCLE[index % STATUS_CYCLE.length]
  const plannedStart = addDays(PROJECT_START, ri(-30, 30))
  const plannedFinish = addDays(plannedStart, ri(500, 800))
  const contractStart = addDays(plannedStart, -ri(10, 40))
  const contractualCompletion = plannedFinish
  const scheduleStatus =
    status === 'completed' ? 'on_track' : status === 'planning' || status === 'approved' ? 'unknown' : status === 'on_hold' ? 'delayed' : pick(['on_track', 'on_track', 'at_risk', 'delayed', 'ahead'])
  const revisedCompletion = scheduleStatus === 'delayed' || scheduleStatus === 'at_risk' ? addDays(contractualCompletion, ri(15, 90)) : contractualCompletion
  const actualStart = status === 'planning' || status === 'approved' ? null : addDays(plannedStart, ri(-10, 20))
  const actualFinish = status === 'completed' ? addDays(contractualCompletion, ri(-20, 10)) : null
  const forecastFinish =
    status === 'completed'
      ? actualFinish
      : status === 'planning' || status === 'approved'
        ? null
        : scheduleStatus === 'delayed'
          ? addDays(contractualCompletion, ri(20, 90))
          : scheduleStatus === 'at_risk'
            ? addDays(contractualCompletion, ri(5, 30))
            : addDays(contractualCompletion, ri(-10, 10))
  const baselineVersion = revisedCompletion !== contractualCompletion ? 'Baseline 1' : 'Baseline 0'
  return { plannedStart, plannedFinish, status, scheduleStatus, actualStart, actualFinish, forecastFinish, contractStart, contractualCompletion, revisedCompletion, baselineVersion }
}

const PHASE_DEFS = [
  { name: 'مهندسی', code: 'ENG' },
  { name: 'تدارکات', code: 'PRC' },
  { name: 'ساخت و اجرا', code: 'CON' },
  { name: 'راه‌اندازی', code: 'COM' },
]

function buildPhaseRows(masterProjectId: string, t: ProjectTimeline): Record<string, unknown>[] {
  const totalDays = Math.max(1, Math.round((new Date(t.plannedFinish).getTime() - new Date(t.plannedStart).getTime()) / 86400000))
  const chunk = Math.round(totalDays / PHASE_DEFS.length)
  const completedPhases = t.status === 'completed' ? 4 : t.status === 'planning' || t.status === 'approved' ? 0 : t.status === 'on_hold' ? 1 : ri(1, 3)

  return PHASE_DEFS.map((phase, idx) => {
    const plannedStart = addDays(t.plannedStart, idx * chunk)
    const plannedFinish = addDays(t.plannedStart, (idx + 1) * chunk)
    const isDone = idx < completedPhases
    const isCurrent = idx === completedPhases && t.status !== 'planning' && t.status !== 'approved'
    const status = isDone ? 'completed' : isCurrent ? 'in_progress' : t.status === 'on_hold' && idx === completedPhases ? 'on_hold' : 'not_started'
    const progress = isDone ? 100 : isCurrent ? ri(20, 85) : 0
    return {
      project_id: masterProjectId,
      name: phase.name,
      code: phase.code,
      sequence: idx + 1,
      planned_start: plannedStart,
      planned_finish: plannedFinish,
      actual_start: isDone || isCurrent ? addDays(plannedStart, ri(-5, 10)) : null,
      actual_finish: isDone ? addDays(plannedFinish, ri(-10, 5)) : null,
      forecast_finish: isDone ? null : addDays(plannedFinish, isCurrent ? ri(-5, 20) : 0),
      status,
      progress,
    }
  })
}

// ---------------------------------------------------------------------------
// Issue Management row builder
// ---------------------------------------------------------------------------
function buildIssueRows(projectId: string, pursuerId: string, approverId: string, t: ProjectTimeline): Record<string, unknown>[] {
  const count = ri(5, 9)
  return Array.from({ length: count }, () => {
    const priority = pick(['low', 'medium', 'medium', 'high', 'critical'] as const)
    const statusRoll = rand()
    const status = statusRoll < 0.25 ? 'open' : statusRoll < 0.5 ? 'in_progress' : statusRoll < 0.65 ? 'pending_approval' : statusRoll < 0.9 ? 'approved' : 'rejected'
    const createdAt = new Date(addDays(t.plannedStart, ri(20, 260))).toISOString()
    const deadlineDays = ri(2, 10)
    const advanced = status === 'in_progress' || status === 'pending_approval' || status === 'approved' || status === 'rejected'
    const closed = status === 'approved' || status === 'rejected'
    return {
      project_id: projectId,
      title: pick(ISSUE_TEMPLATES),
      description: 'شرح مسئله بر اساس گزارش سرپرست کارگاه و پیگیری‌های میدانی ثبت شده است.',
      pursuer_id: pursuerId,
      approver_id: approverId,
      priority,
      deadline_days: deadlineDays,
      action_date: advanced ? addDays(createdAt.slice(0, 10), ri(1, deadlineDays + 5)) : null,
      status,
      closed_at: closed ? addDays(createdAt.slice(0, 10), ri(deadlineDays, deadlineDays + 10)) : null,
      created_at: createdAt,
      updated_at: createdAt,
    }
  })
}

// ---------------------------------------------------------------------------
// Risk row builder
// ---------------------------------------------------------------------------
function buildRiskRow(rmProjectId: string, title: string, description: string, category: RmRiskCategory, riskType: RmRiskType, ownerId: string): Record<string, unknown> {
  const probability = ri(1, 5)
  const impact = ri(1, 5)
  const score = probability * impact
  const strategies = strategiesForRiskType(riskType)
  const responseStrategy: RmResponseStrategy = pick(strategies)

  const statusRoll = rand()
  const status = statusRoll < 0.15 ? 'closed' : statusRoll < 0.3 ? 'escalated' : statusRoll < 0.55 ? 'monitoring' : 'open'

  const escalationRoll = rand()
  const escalationStatus = score >= 16 && escalationRoll < 0.5 ? (escalationRoll < 0.2 ? 'decided' : escalationRoll < 0.35 ? 'escalated' : 'recommended') : 'none'

  const identifiedDate = addDays(PROJECT_START, ri(0, 200))

  return {
    project_id: rmProjectId,
    title,
    description: description || `${title} — بررسی و پایش این ریسک در طول اجرای پروژه ادامه دارد.`,
    category,
    risk_type: riskType,
    owner_id: ownerId,
    identified_date: identifiedDate,
    status,
    response_strategy: responseStrategy,
    strategy_details: {},
    project_phase: pick(['engineering', 'procurement', 'construction', 'commissioning']),
    time_to_impact_days: chance(0.2) ? ri(1, 30) : null,
    initial_probability: probability,
    initial_impact: impact,
    escalation_level: escalationStatus !== 'none' ? pick(['project_team', 'project_manager', 'management']) : null,
    escalated_to: escalationStatus !== 'none' ? pick(PROJECT_MANAGERS) : '',
    escalation_reason: escalationStatus !== 'none' ? 'امتیاز ریسک بالاتر از آستانه توجه مدیریت است' : '',
    escalation_date: escalationStatus !== 'none' ? addDays(identifiedDate, ri(5, 60)) : null,
    required_decision: escalationStatus !== 'none' ? 'تصمیم برای تخصیص منابع اضافی یا تغییر استراتژی پاسخ' : '',
    escalation_decision: escalationStatus === 'decided' ? 'تایید تخصیص منابع اضافی و پیگیری فشرده' : '',
    escalation_decision_date: escalationStatus === 'decided' ? addDays(identifiedDate, ri(20, 70)) : null,
    escalation_status: escalationStatus,
  }
}

const REVIEW_COMMENTS: Record<string, string[]> = {
  improving: ['اقدامات کنترلی موثر بوده و ریسک رو به کاهش است', 'با پیگیری مستمر، وضعیت بهبود یافت'],
  worsening: ['شرایط نسبت به بازبینی قبل بدتر شده است', 'اقدامات کنترلی کافی نبوده و ریسک افزایش یافت'],
  stable: ['وضعیت نسبت به بازبینی قبل بدون تغییر محسوس است', 'ریسک در محدوده قابل‌قبول باقی مانده است'],
}

const ACTION_TEMPLATES = [
  'پیگیری روزانه با فروشنده/پیمانکار',
  'برگزاری جلسه هماهنگی با ذی‌نفعان',
  'تهیه برنامه اقتضایی جایگزین',
  'بازرسی میدانی و تهیه گزارش وضعیت',
  'تسریع فرآیند اخذ مجوز از مرجع ذی‌ربط',
  'بازنگری برنامه زمان‌بندی فعالیت‌های مرتبط',
  'تامین منبع مالی یا انسانی اضافی',
  'تهیه گزارش ارزیابی ریسک به‌روزشده',
]

const DAILY_LOG_NOTES = [
  'کارکرد روزانه مطابق برنامه انجام شد',
  'تیم اجرایی با یک گروه کاری اضافه فعالیت کرد',
  'بازرسی کیفی هم‌زمان با اجرای عملیات انجام شد',
  'شرایط جوی مناسب امکان کارکرد کامل را فراهم کرد',
  'کارکرد با تاخیر جزئی نسبت به برنامه روزانه انجام شد',
]

const DELAY_REASONS = ['تاخیر در تامین مصالح از انبار مرکزی', 'شرایط نامساعد جوی', 'توقف موقت به دلیل بازرسی ایمنی', 'کمبود موقت نیروی اجرایی']
