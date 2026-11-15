/**
 * بانک گزینه‌ها — the three related but separate decisions the module supports:
 *   1. Project Delivery Method      (who designs, procures and builds, and how many contracts)
 *   2. Contracting & Procurement    (how the price is set and the market is approached)
 *   3. Execution & Construction     (how the work itself is sequenced and packaged)
 *
 * Every performance value is on a 1–5 scale (5 = best for the owner on that criterion) and is the team's documented
 * judgement for an oil & gas / energy project of average conditions. The engine then moves each value up or down with
 * explicit, traceable rules that read the project's own answers (engine.ts); nothing here is a final score.
 */

export type CriterionKey = 'time' | 'costCert' | 'cost' | 'quality' | 'flex' | 'ownerLoad' | 'interface' | 'risk' | 'market' | 'finance' | 'compliance'
export interface Criterion { key: CriterionKey; fa: string; en: string; help: string }

export const CRITERIA: Criterion[] = [
  { key: 'time', fa: 'سرعت تحویل', en: 'Schedule', help: 'امکان هم‌پوشانی طراحی، تأمین و ساخت و رسیدن زودتر به بهره‌برداری.' },
  { key: 'costCert', fa: 'قطعیت هزینه', en: 'Cost certainty', help: 'اطمینان کارفرما از مبلغ نهایی هنگام تصمیم؛ احتمال کم ادعا و تغییر.' },
  { key: 'cost', fa: 'هزینهٔ تمام‌شده', en: 'Total cost', help: 'هزینهٔ نهایی مورد انتظار با احتساب صرف ریسک، سود و تغییرات.' },
  { key: 'quality', fa: 'کنترل فنی و کیفیت', en: 'Technical control & quality', help: 'میزان اشراف کارفرما بر طراحی، انتخاب تجهیزات و کیفیت اجرا.' },
  { key: 'flex', fa: 'انعطاف در تغییرات', en: 'Flexibility to change', help: 'هزینه و دشواری اعمال تغییر در محدوده یا طراحی پس از عقد قرارداد.' },
  { key: 'ownerLoad', fa: 'سبکی بار مدیریتی کارفرما', en: 'Low owner effort', help: 'هرچه کمتر نیروی متخصص و مدیریت مستقیم از کارفرما بخواهد، بالاتر.' },
  { key: 'interface', fa: 'یکپارچگی مسئولیت', en: 'Single-point responsibility', help: 'تعداد فصل‌های مشترک قراردادی که کارفرما باید مدیریت کند (کمتر = بالاتر).' },
  { key: 'risk', fa: 'تناسب تخصیص ریسک', en: 'Risk allocation fit', help: 'هر ریسک نزد طرفی بماند که بهتر می‌تواند آن را مدیریت کند.' },
  { key: 'market', fa: 'تناسب با بازار', en: 'Market fit', help: 'وجود پیمانکاران و تأمین‌کنندگان توانا و رقابت واقعی برای این مدل.' },
  { key: 'finance', fa: 'تناسب با تأمین مالی', en: 'Financing fit', help: 'سازگاری با منبع تأمین مالی، جریان نقدی و شرایط تأمین‌کنندگان مالی.' },
  { key: 'compliance', fa: 'انطباق قانونی و سازمانی', en: 'Legal & organisational fit', help: 'سازگاری با قانون برگزاری مناقصات، آیین‌نامه‌ها و رویه‌های سازمان.' },
]
export const CRITERION = Object.fromEntries(CRITERIA.map((c) => [c.key, c])) as Record<CriterionKey, Criterion>

export type MethodKey = 'epc' | 'turnkey' | 'epcm' | 'db' | 'dbb' | 'ep' | 'pc' | 'direct' | 'multi' | 'bot' | 'hybrid'
export type Profile = Record<CriterionKey, number>
/** who carries each risk family under the method: owner, contractor or shared */
export type Bearer = 'O' | 'C' | 'S'
export type RiskFamily = 'design' | 'ground' | 'permits' | 'price' | 'supply' | 'interface' | 'operations' | 'finance'
export interface Method {
  key: MethodKey; fa: string; en: string; summary: string
  profile: Profile
  /** risk families and who bears them */
  bearer: Record<RiskFamily, Bearer>
  /** indicative duration and final-cost multipliers against design-bid-build of the same scope [low, high] */
  duration: [number, number]; costIdx: [number, number]
  bestFor: string[]; weakFor: string[]
  /** the contracting / pricing forms that naturally go with it */
  pricing: PricingKey[]
}

const P = (time: number, costCert: number, cost: number, quality: number, flex: number, ownerLoad: number, iface: number, risk: number, market: number, finance: number, compliance: number): Profile =>
  ({ time, costCert, cost, quality, flex, ownerLoad, interface: iface, risk, market, finance, compliance })
const B = (design: Bearer, ground: Bearer, permits: Bearer, price: Bearer, supply: Bearer, iface: Bearer, operations: Bearer, finance: Bearer): Record<RiskFamily, Bearer> =>
  ({ design, ground, permits, price, supply, interface: iface, operations, finance })

export const METHODS: Method[] = [
  { key: 'epc', fa: 'EPC (مهندسی، تأمین و ساخت — قیمت مقطوع)', en: 'EPC / LSTK', summary: 'یک پیمانکار مسئولیت مهندسی تفصیلی، تأمین کالا و ساخت را با مبلغ مقطوع می‌پذیرد.',
    profile: P(4, 5, 3, 3, 1, 5, 5, 4, 3, 4, 4), bearer: B('C', 'S', 'O', 'C', 'C', 'C', 'S', 'O'), duration: [0.78, 0.9], costIdx: [1.04, 1.15],
    bestFor: ['طراحی پایه (FEED) کامل و محدودهٔ پایدار', 'کارفرما با نیروی محدود', 'نیاز به قطعیت مبلغ برای تصویب بودجه'], weakFor: ['محدودهٔ ناپخته یا تغییرات زیاد', 'بازار با پیمانکار توانای کم', 'تورم و نوسان ارز شدید'], pricing: ['lump', 'adjust'] },
  { key: 'turnkey', fa: 'کلید در دست (Turnkey با تضمین عملکرد)', en: 'Turnkey', summary: 'مانند EPC، به‌علاوهٔ راه‌اندازی، آموزش و تضمین عملکرد تا تحویل آمادهٔ بهره‌برداری.',
    profile: P(4, 5, 2, 3, 1, 5, 5, 4, 2, 4, 3), bearer: B('C', 'C', 'S', 'C', 'C', 'C', 'C', 'O'), duration: [0.78, 0.9], costIdx: [1.08, 1.22],
    bestFor: ['فناوری لیسانس‌دار یا واحد فرایندی با تضمین عملکرد', 'کارفرمای بدون تجربهٔ راه‌اندازی'], weakFor: ['کارفرمای خواهان اشراف فنی', 'بازار محدود و صرف ریسک بالا'], pricing: ['lump'] },
  { key: 'epcm', fa: 'EPCM (مدیریت مهندسی، تأمین و ساخت)', en: 'EPCM', summary: 'پیمانکار EPCM مهندسی و مدیریت را به‌عنوان نمایندهٔ کارفرما انجام می‌دهد؛ خرید و پیمان‌های ساخت به نام کارفرما است.',
    profile: P(4, 2, 4, 5, 5, 2, 3, 2, 4, 2, 3), bearer: B('S', 'O', 'O', 'O', 'O', 'S', 'O', 'O'), duration: [0.75, 0.9], costIdx: [0.95, 1.12],
    bestFor: ['محدودهٔ ناپخته با فشار زمانی (fast-track)', 'کارفرمای توانا و خواهان کنترل', 'طرح‌های بزرگ و چندبسته‌ای'], weakFor: ['کارفرمای کم‌نیرو', 'تأمین مالی پروژه‌ای (وام‌دهنده)', 'منع قراردادهای هزینه‌محور'], pricing: ['reimb', 'target'] },
  { key: 'db', fa: 'طرح و ساخت (Design-Build)', en: 'Design-Build', summary: 'یک قرارداد برای طراحی و ساخت؛ تأمین تجهیزات اصلی معمولاً با کارفرما یا مشترک.',
    profile: P(4, 4, 3, 3, 2, 4, 4, 4, 3, 3, 4), bearer: B('C', 'S', 'O', 'S', 'S', 'C', 'S', 'O'), duration: [0.8, 0.92], costIdx: [1.02, 1.12],
    bestFor: ['ساختمانی و زیرساخت و تأسیسات جانبی', 'محدودهٔ تعریف‌شده با تجهیزات کم'], weakFor: ['واحدهای فرایندی پیچیده', 'تجهیزات بلندمدت زیاد'], pricing: ['lump', 'gmp'] },
  { key: 'dbb', fa: 'طراحی، مناقصه، ساخت (سه‌عاملی سنتی)', en: 'Design-Bid-Build', summary: 'مشاور طراحی را کامل می‌کند، سپس پیمانکار ساخت با مناقصه بر پایهٔ نقشه‌های کامل انتخاب می‌شود.',
    profile: P(2, 3, 4, 4, 3, 2, 2, 3, 5, 3, 5), bearer: B('O', 'O', 'O', 'S', 'S', 'O', 'O', 'O'), duration: [1, 1], costIdx: [1, 1.12],
    bestFor: ['زمان غیربحرانی و طراحی کامل', 'الزام رقابت حداکثری و شفافیت', 'بازار پیمانکار ساخت قوی'], weakFor: ['فشار زمانی', 'تجهیزات بلندمدت (تأمین دیر آغاز می‌شود)'], pricing: ['unit', 'lump', 'adjust'] },
  { key: 'ep', fa: 'EP + C (تأمین‌محور، ساخت جداگانه)', en: 'EP + C', summary: 'یک پیمانکار مهندسی تفصیلی و تأمین کالا را انجام می‌دهد و ساخت با پیمان(های) جداگانه واگذار می‌شود.',
    profile: P(3, 3, 4, 4, 3, 3, 2, 3, 4, 3, 4), bearer: B('C', 'O', 'O', 'S', 'C', 'O', 'S', 'O'), duration: [0.85, 0.95], costIdx: [0.98, 1.1],
    bestFor: ['تأمین کالا بزرگ‌ترین ریسک است', 'بازار ساخت داخلی قوی و بازار EPC محدود'], weakFor: ['کارفرمای ضعیف در مدیریت فصل مشترک', 'نیاز به مسئولیت واحد'], pricing: ['lump', 'unit'] },
  { key: 'pc', fa: 'PC (تأمین و ساخت بر پایهٔ طراحی کارفرما)', en: 'PC', summary: 'طراحی تفصیلی توسط کارفرما یا مشاور؛ یک پیمانکار تأمین و ساخت را با مبلغ مقطوع یا فهرست‌بها انجام می‌دهد.',
    profile: P(3, 4, 4, 4, 2, 3, 3, 3, 4, 3, 4), bearer: B('O', 'S', 'O', 'S', 'C', 'S', 'S', 'O'), duration: [0.88, 0.96], costIdx: [0.98, 1.08],
    bestFor: ['طراحی تفصیلی آماده یا مشاور طراحی قوی', 'خط لوله و ایستگاه‌های تکرارشونده'], weakFor: ['طراحی ناقص (ادعای پیمانکار)', 'فشار زمانی شدید'], pricing: ['lump', 'unit'] },
  { key: 'direct', fa: 'اجرای مستقیم (امانی) توسط کارفرما', en: 'Direct / Owner self-perform', summary: 'کارفرما با نیرو، ماشین‌آلات و خرید خود اجرا می‌کند و فقط بسته‌های تخصصی را واگذار می‌کند.',
    profile: P(2, 2, 4, 4, 5, 1, 3, 1, 3, 3, 2), bearer: B('O', 'O', 'O', 'O', 'O', 'O', 'O', 'O'), duration: [1, 1.2], costIdx: [0.92, 1.2],
    bestFor: ['کار کوچک یا تعمیراتی در تأسیسات در حال بهره‌برداری', 'کارفرمای دارای توان اجرایی'], weakFor: ['پروژه‌های بزرگ', 'محدودیت قانونی اجرای امانی'], pricing: ['reimb'] },
  { key: 'multi', fa: 'چندبسته‌ای (Multi-Package / Multi-Prime)', en: 'Multi-Package', summary: 'طرح به چند بستهٔ مستقل (مثلاً خط لوله، ایستگاه‌ها، تجهیزات) تقسیم و هر بسته جداگانه واگذار می‌شود؛ یکپارچه‌سازی با کارفرما.',
    profile: P(4, 3, 4, 4, 4, 2, 1, 3, 5, 3, 4), bearer: B('S', 'S', 'O', 'S', 'S', 'O', 'S', 'O'), duration: [0.8, 0.9], costIdx: [0.96, 1.1],
    bestFor: ['طرح‌های بزرگ با بخش‌های متمایز', 'افزایش رقابت و سهم پیمانکاران داخلی', 'کاهش وابستگی به یک پیمانکار'], weakFor: ['کارفرمای کم‌توان در یکپارچه‌سازی', 'فصل‌های مشترک فنی پیچیده'], pricing: ['lump', 'unit'] },
  { key: 'bot', fa: 'BOT / BOO (ساخت، بهره‌برداری، انتقال)', en: 'BOT / BOO', summary: 'سرمایه‌گذار طرح را تأمین مالی، اجرا و برای دورهٔ امتیاز بهره‌برداری می‌کند و هزینه را از درآمد طرح برمی‌گرداند.',
    profile: P(3, 5, 2, 3, 1, 5, 4, 5, 1, 5, 2), bearer: B('C', 'C', 'S', 'C', 'C', 'C', 'C', 'C'), duration: [1, 1.25], costIdx: [1.15, 1.4],
    bestFor: ['کمبود بودجهٔ دولتی و درآمد قابل اتکا', 'وجود سرمایه‌گذار و چارچوب قانونی مشارکت'], weakFor: ['نبود جریان درآمدی', 'نیاز به کنترل راهبردی دارایی'], pricing: ['concession'] },
]
export const METHOD = Object.fromEntries(METHODS.map((m) => [m.key, m])) as Record<Exclude<MethodKey, 'hybrid'>, Method>

// ── 2 · contracting & procurement strategy
export type PricingKey = 'lump' | 'unit' | 'reimb' | 'target' | 'gmp' | 'convert' | 'adjust' | 'concession'
export interface Pricing { key: PricingKey; fa: string; summary: string }
export const PRICING: Pricing[] = [
  { key: 'lump', fa: 'مبلغ مقطوع (Lump Sum)', summary: 'قیمت ثابت برای کل کار؛ ریسک مقادیر و قیمت با پیمانکار.' },
  { key: 'unit', fa: 'فهرست‌بها و مقادیر (Unit Rate / Re-measurable)', summary: 'پرداخت بر اساس مقادیر واقعی و نرخ‌های واحد؛ ریسک مقادیر با کارفرما.' },
  { key: 'reimb', fa: 'هزینه به‌اضافهٔ حق‌الزحمه (Cost-Reimbursable)', summary: 'پرداخت هزینهٔ واقعی به‌اضافهٔ درصد یا مبلغ ثابت؛ نیازمند کنترل قوی کارفرما.' },
  { key: 'target', fa: 'هزینهٔ هدف با سهم سود و زیان (Target Cost)', summary: 'هزینهٔ هدف توافقی؛ صرفه‌جویی یا افزایش بین طرفین تقسیم می‌شود.' },
  { key: 'gmp', fa: 'سقف تضمینی قیمت (GMP)', summary: 'پرداخت هزینهٔ واقعی تا سقف تضمینی؛ مازاد با پیمانکار.' },
  { key: 'convert', fa: 'کتاب‌باز قابل تبدیل به مقطوع (Open-Book → LSTK)', summary: 'آغاز با هزینه‌محور تا تکمیل FEED و تبدیل به مقطوع پس از بلوغ محدوده.' },
  { key: 'adjust', fa: 'مقطوع با تعدیل قیمت (Price Adjustment)', summary: 'مبلغ مقطوع با شاخص تعدیل برای مصالح و ارز؛ کاهش صرف ریسک تورمی.' },
  { key: 'concession', fa: 'قرارداد امتیاز / خرید محصول (Concession / Offtake)', summary: 'بازگشت سرمایه از تعرفه یا خرید تضمینی محصول در دورهٔ امتیاز.' },
]
export const PRICING_BY = Object.fromEntries(PRICING.map((p) => [p.key, p])) as Record<PricingKey, Pricing>

export type ProcurementKey = 'ofe' | 'twostage' | 'prequal' | 'framework' | 'open' | 'local' | 'bundle'
export const PROCUREMENT: { key: ProcurementKey; fa: string; summary: string }[] = [
  { key: 'ofe', fa: 'خرید زودهنگام اقلام بلندمدت توسط کارفرما (OFE)', summary: 'سفارش لوله، کمپرسور و شیرهای اصلی پیش از انتخاب پیمانکار و تحویل به او.' },
  { key: 'twostage', fa: 'مناقصهٔ دومرحله‌ای / مشارکت زودهنگام پیمانکار (ECI)', summary: 'انتخاب فنی پیش از تکمیل طراحی و توافق قیمت در مرحلهٔ دوم.' },
  { key: 'prequal', fa: 'مناقصهٔ محدود با ارزیابی کیفی سخت‌گیرانه', summary: 'فهرست کوتاه پیمانکاران با سابقهٔ مشابه برای کاهش ریسک اجرا.' },
  { key: 'open', fa: 'مناقصهٔ عمومی رقابتی', summary: 'حداکثر رقابت و شفافیت؛ مناسب بازار پرعرضه و طراحی کامل.' },
  { key: 'framework', fa: 'قرارداد چارچوبی (Framework)', summary: 'برای کارهای تکرارشونده (ایستگاه‌ها، انشعابات) با نرخ‌های از پیش توافق‌شده.' },
  { key: 'local', fa: 'برنامهٔ ساخت داخل و مشارکت پیمانکاران محلی', summary: 'تفکیک بسته‌ها برای افزایش سهم داخل و پاسخ به الزامات قانونی.' },
  { key: 'bundle', fa: 'یکپارچه‌سازی تأمین تجهیزات مشابه چند پروژه', summary: 'خرید تجمیعی برای قدرت چانه‌زنی و کاهش زمان تحویل.' },
]

// ── 3 · execution & construction strategy
export type ExecKey = 'sequential' | 'fasttrack' | 'concurrent' | 'phased' | 'modular' | 'spreads' | 'earlyworks' | 'phasedcomm'
export const EXECUTION: { key: ExecKey; fa: string; summary: string }[] = [
  { key: 'sequential', fa: 'اجرای متوالی (متعارف)', summary: 'هر مرحله پس از تکمیل مرحلهٔ قبل؛ کمترین ریسک دوباره‌کاری، طولانی‌ترین زمان.' },
  { key: 'fasttrack', fa: 'مسیر سریع (Fast-Track)', summary: 'آغاز تأمین و ساخت پیش از تکمیل طراحی؛ زمان کوتاه‌تر با ریسک دوباره‌کاری.' },
  { key: 'concurrent', fa: 'مهندسی و اجرای هم‌زمان (Concurrent)', summary: 'هم‌پوشانی کنترل‌شدهٔ مهندسی تفصیلی، تأمین و ساخت با بسته‌های کاری آزادشده.' },
  { key: 'phased', fa: 'اجرای فازبندی‌شده', summary: 'تقسیم طرح به فازهای قابل بهره‌برداری مستقل (مثلاً قطعه‌های خط یا قطارهای فرایندی).' },
  { key: 'modular', fa: 'مدولارسازی و پیش‌ساخت (Modularization)', summary: 'ساخت مدول‌ها در کارگاه و نصب در سایت؛ مناسب سایت دورافتاده یا فراساحل.' },
  { key: 'spreads', fa: 'چندجبهه‌ای (Multi-Spread)', summary: 'اجرای هم‌زمان خط لوله در چند جبههٔ مستقل با اکیپ‌های کامل.' },
  { key: 'earlyworks', fa: 'بستهٔ کارهای زودهنگام (Early Works)', summary: 'راه دسترسی، تسطیح، کمپ و تملک پیش از پیمان اصلی.' },
  { key: 'phasedcomm', fa: 'راه‌اندازی مرحله‌ای', summary: 'تحویل و راه‌اندازی سیستم‌به‌سیستم برای درآمدزایی زودتر و کاهش ریسک راه‌اندازی.' },
]

export const RISK_FAMILY_FA: Record<RiskFamily, string> = {
  design: 'طراحی و تعریف محدوده', ground: 'شرایط زمین و سایت', permits: 'مجوزها، اراضی و ذینفعان', price: 'قیمت، تورم و ارز',
  supply: 'تأمین کالا و تحریم', interface: 'فصل مشترک و هماهنگی', operations: 'بهره‌برداری و HSE', finance: 'تأمین مالی و جریان نقدی',
}
export const BEARER_FA: Record<Bearer, string> = { O: 'کارفرما', C: 'پیمانکار', S: 'مشترک' }
