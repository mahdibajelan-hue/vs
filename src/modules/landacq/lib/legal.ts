import type { LegalData, Parcel } from '../types'
import { addDays, diffDays } from './dates'
import { addJalaliMonths } from './jalali'
import { stageOf } from './workflow'

/**
 * Legal clocks of the «لایحه قانونی نحوه خرید و تملک اراضی و املاک برای اجرای برنامه‌های عمومی، عمرانی و نظامی دولت» (۱۳۵۸/۱۱/۱۷).
 * Each clock starts on a date the user records, runs for the period the law sets («ماه» = Jalali month) and either finishes
 * (the closing event is recorded) or becomes an alarm. Pure functions; the UI only renders them.
 */
export type ClockStatus = 'done' | 'overdue' | 'due_soon' | 'running'
export type ClockSeverity = 'critical' | 'high' | 'low' | 'ok'

export interface LegalClock {
  key: string
  article: string
  title: string
  /** What the law demands, in one sentence. */
  rule: string
  start: string | null
  due: string
  done: string | null
  status: ClockStatus
  /** Days until the deadline (negative = days overdue); 0 for finished clocks. */
  daysLeft: number
  severity: ClockSeverity
  /** What happens (legally) if the deadline is missed. */
  consequence: string
}

interface Def {
  key: string
  article: string
  title: string
  rule: string
  consequence: string
  start: (p: Parcel) => string | null | undefined
  done: (p: Parcel) => string | null | undefined
  due: (start: string) => string
  routes: 'regular' | 'art9'
}

const days = (n: number) => (s: string) => addDays(s, n)
const months = (n: number) => (s: string) => addJalaliMonths(s, n)
const L = (p: Parcel): LegalData => p.legal ?? {}

const DEFS: Def[] = [
  { key: 'registry_reply', article: 'ماده ۲، تبصرهٔ ۲', title: 'پاسخ اداره ثبت به استعلام', rule: 'اداره ثبت محل باید وضع ثبتی ملک را حداکثر ظرف ۱۵ روز از تاریخ استعلام پاسخ دهد.', consequence: 'پیگیری کتبی از اداره ثبت؛ تأخیر ثبت نباید طرح را متوقف کند.', routes: 'regular', start: (p) => L(p).inquiryDate, done: (p) => L(p).registryReplyDate, due: days(15) },
  { key: 'agreement_payment', article: 'ماده ۳، تبصرهٔ ۲', title: 'خرید و پرداخت پس از توافق', rule: 'پس از توافق بر بهای عادله، حداکثر ظرف سه ماه ملک خریداری و حقوق پرداخت شود یا انصراف کتباً به مالک اعلام گردد.', consequence: 'عدم اقدام یا اعلام انصراف در این مدت به منزلهٔ انصراف از تملک است.', routes: 'regular', start: (p) => L(p).agreementDate, done: (p) => L(p).settledDate, due: months(3) },
  { key: 'owner_expert', article: 'ماده ۴، تبصرهٔ ۲', title: 'معرفی کارشناس توسط مالک', rule: 'مالک باید حداکثر ظرف یک ماه از ابلاغ دستگاه اجرایی، کارشناس خود را معرفی کند.', consequence: 'پس از مهلت، دستگاه اجرایی از دادگاه صالح درخواست تعیین کارشناس می‌کند.', routes: 'regular', start: (p) => L(p).ownerNoticeDate, done: (p) => L(p).expertNamedDate, due: months(1) },
  { key: 'court_expert', article: 'ماده ۴، تبصرهٔ ۲', title: 'تعیین کارشناس توسط دادگاه', rule: 'دادگاه صالح محل وقوع ملک حداکثر ظرف ۱۵ روز از مراجعهٔ دستگاه اجرایی کارشناس را تعیین می‌کند.', consequence: 'پیگیری از دادگاه؛ تأخیر دادگاه مانع ادامهٔ فرایند نیست.', routes: 'regular', start: (p) => L(p).courtAppointRequestDate, done: (p) => L(p).courtAppointedDate, due: days(15) },
  { key: 'expert_opinion', article: 'ماده ۵، تبصرهٔ ۵', title: 'نظر هیئت کارشناسی', rule: 'هیئت سه‌نفره کارشناسان رسمی دادگستری باید حداکثر ظرف یک ماه نظر خود را دقیقاً اعلام کند.', consequence: 'تأخیر هیئت کارشناسی مستقیماً تعیین بهای عادله و تملک را به تأخیر می‌اندازد؛ پیگیری کتبی.', routes: 'regular', start: (p) => L(p).expertAssignedDate, done: (p) => L(p).expertOpinionDate, due: months(1) },
  { key: 'art8_notice2', article: 'ماده ۸', title: 'ابلاغ دوم به مالک', rule: 'اگر مالک ظرف یک ماه از اعلام اول برای معامله مراجعه نکند، مراتب برای بار دوم اعلام می‌شود.', consequence: 'بدون اعلام دوم نمی‌توان به مرحلهٔ تودیع در صندوق ثبت رسید.', routes: 'regular', start: (p) => L(p).notice1Date, done: (p) => L(p).notice2Date, due: months(1) },
  { key: 'art8_deposit', article: 'ماده ۸', title: 'تودیع بهای ملک در صندوق ثبت', rule: 'پس از انقضای ۱۵ روز مهلت مجدد از اعلام دوم، ارزش تقویمی ملک به صندوق ثبت محل تودیع و سند انتقال با امضای دادستان یا نمایندهٔ او تنظیم می‌شود.', consequence: 'تا تودیع انجام نشود تصرف و خلع ید بدون مجوز ماده ۹ مجاز نیست.', routes: 'regular', start: (p) => L(p).notice2Date, done: (p) => L(p).depositDate, due: days(15) },
  { key: 'art8_evict', article: 'ماده ۸', title: 'تخلیه و خلع ید', rule: 'پس از امضای سند انتقال، ظرف یک ماه به تخلیه و خلع ید اقدام می‌شود.', consequence: 'تأخیر در تخلیه، آزادسازی مسیر و شروع عملیات را عقب می‌اندازد.', routes: 'regular', start: (p) => L(p).depositDate, done: (p) => L(p).evictedDate, due: months(1) },
  { key: 'annulment_pay', article: 'ماده ۱، تبصرهٔ الحاقی ۱۳۸۸', title: 'پرداخت پس از ابطال سند و دستور توقف حکم', rule: 'اگر سند مالکیت ابطال شده و دادگاه به درخواست دستگاه، اجرای حکم خلع ید یا قلع و قمع را متوقف کرده است، دستگاه باید ظرف شش ماه قیمت روز را پرداخت یا تودیع کند.', consequence: 'پس از مهلت، دستور توقف اجرای حکم منتفی می‌شود و خلع ید یا قلع و قمع قابل اجراست.', routes: 'regular', start: (p) => L(p).annulmentStayOrderDate, done: (p) => L(p).annulmentPaidDate, due: months(6) },
  {
    key: 'art9_payment', article: 'ماده ۹', title: 'پرداخت یا تودیع بهای عادله پس از تصرف', routes: 'art9',
    rule: 'دستگاه اجرایی مکلف است حداکثر تا سه ماه از تاریخ تصرف، قیمت عادلهٔ مصوب این قانون را پرداخت یا تودیع کند.',
    consequence: 'پس از مهلت، مالک می‌تواند از دادگاه توقف عملیات اجرایی را تا زمان پرداخت بخواهد؛ دادگاه خارج از نوبت رسیدگی می‌کند.',
    start: (p) => (stageOf(p, 'art9_possession')?.status === 'done' ? stageOf(p, 'art9_possession')?.actualDate ?? stageOf(p, 'art9_possession')?.plannedDate ?? null : null),
    done: (p) => (stageOf(p, 'art9_payment')?.status === 'done' ? stageOf(p, 'art9_payment')?.actualDate ?? '0000-00-00' : null),
    due: months(3),
  },
]

function build(def: Def, p: Parcel, today: string): LegalClock | null {
  const start = def.start(p) || null
  if (!start) return null
  const due = def.due(start)
  const done = def.done(p) || null
  const total = Math.max(1, diffDays(due, start))
  const daysLeft = diffDays(due, today)
  const soon = Math.max(3, Math.ceil(total * 0.2))
  const status: ClockStatus = done ? 'done' : daysLeft < 0 ? 'overdue' : daysLeft <= soon ? 'due_soon' : 'running'
  return { key: def.key, article: def.article, title: def.title, rule: def.rule, start, due, done: done === '0000-00-00' ? start : done, status, daysLeft: done ? 0 : daysLeft, severity: status === 'done' ? 'ok' : status === 'overdue' ? 'critical' : status === 'due_soon' ? 'high' : 'low', consequence: def.consequence }
}

/** Is an owner's court stay of the works in force (Article 9 note)? It lifts the moment payment/deposit is made. */
export function stayActive(p: Pick<Parcel, 'legal' | 'stages' | 'acquisitionRoute'>): boolean {
  const l = p.legal ?? {}
  if (!l.stayOrderDate || l.stayLiftedDate) return false
  return !(p.acquisitionRoute === 'art9' && stageOf(p, 'art9_payment')?.status === 'done')
}

/** Every legal clock that has started for this parcel (finished ones included), most urgent first. */
export function legalClocks(p: Parcel, today: string): LegalClock[] {
  const route = p.acquisitionRoute === 'art9' ? 'art9' : 'regular'
  const out = DEFS.filter((d) => d.routes === route).map((d) => build(d, p, today)).filter((c): c is LegalClock => !!c)
  if (p.acquisitionRoute === 'art9') {
    const l = p.legal ?? {}
    const paid = stageOf(p, 'art9_payment')?.status === 'done'
    if (stayActive(p)) {
      out.push({ key: 'art9_stay', article: 'ماده ۹، تبصره', title: 'عملیات اجرایی به دستور دادگاه متوقف است', rule: 'مالک با مراجعه به دادگاه، توقف عملیات اجرایی را تا زمان پرداخت بها خواسته و دادگاه خارج از نوبت رسیدگی کرده است.', start: l.stayOrderDate ?? null, due: today, done: null, status: 'overdue', daysLeft: 0, severity: 'critical', consequence: 'با پرداخت یا تودیع قیمت تعیین‌شده، دستور توقف بلافاصله رفع می‌شود؛ پرداخت را فوراً انجام دهید.' })
    } else if (l.stayFiledDate && !l.stayOrderDate && !l.stayLiftedDate && !paid) {
      out.push({ key: 'art9_stay_filed', article: 'ماده ۹، تبصره', title: 'درخواست توقف عملیات از سوی مالک ثبت شده است', rule: 'دادگاه موضوع را خارج از نوبت رسیدگی می‌کند و در صورت پرداخت بها، توقیف فوراً رفع می‌شود.', start: l.stayFiledDate, due: today, done: null, status: 'overdue', daysLeft: 0, severity: 'critical', consequence: 'پرداخت یا تودیع بها پیش از صدور دستور توقف، از توقف عملیات جلوگیری می‌کند.' })
    }
    const pos = stageOf(p, 'art9_possession')
    const ok1 = stageOf(p, 'art9_necessity')?.status === 'done'
    const ok2 = stageOf(p, 'art9_minutes')?.status === 'done'
    if (pos && (pos.status === 'done' || pos.status === 'in_progress') && !(ok1 && ok2)) {
      out.push({ key: 'art9_compliance', article: 'ماده ۹', title: 'تصرف بدون تکمیل پیش‌نیازهای قانونی', rule: 'تصرف فوری فقط پس از تشخیص فوریت به امضای وزیر و تنظیم صورت‌مجلس وضع موجود با حضور مالک یا نماینده (و در غیاب او نماینده دادستان و کارشناس رسمی) مجاز است.', start: pos.actualDate ?? pos.plannedDate, due: today, done: null, status: 'overdue', daysLeft: 0, severity: 'critical', consequence: `${!ok1 ? 'تأیید ضرورت و فوریت با امضای وزیر' : ''}${!ok1 && !ok2 ? ' و ' : ''}${!ok2 ? 'صورت‌جلسه با نماینده دادستانی' : ''} هنوز ثبت نشده است؛ تصرف بدون آن‌ها از نظر قانونی آسیب‌پذیر است.` })
    }
  }
  const rank = (c: LegalClock) => (c.status === 'overdue' ? 0 : c.status === 'due_soon' ? 1 : c.status === 'running' ? 2 : 3)
  return out.sort((a, b) => rank(a) - rank(b) || a.due.localeCompare(b.due))
}

/** The nearest open deadline (overdue ones first) — what the header bell and the parcel list quote. */
export function nextDeadline(p: Parcel, today: string): { date: string; label: string } | null {
  const open = legalClocks(p, today).filter((c) => c.status !== 'done')
  const c = open.find((x) => x.status === 'overdue') ?? open.sort((a, b) => a.due.localeCompare(b.due))[0]
  return c ? { date: c.due, label: `${c.article}: ${c.title}` } : null
}

/** One row per rule of the law, for the reference table in Settings. */
export const LEGAL_REFERENCE: { article: string; title: string; rule: string; period: string }[] = [
  { article: 'ماده ۲، تبصرهٔ ۲', title: 'پاسخ اداره ثبت', rule: 'پاسخ به استعلام وضع ثبتی ملک', period: '۱۵ روز' },
  { article: 'ماده ۳، تبصرهٔ ۲', title: 'خرید پس از توافق', rule: 'خرید و پرداخت پس از توافق یا اعلام کتبی انصراف', period: '۳ ماه' },
  { article: 'ماده ۴، تبصرهٔ ۲', title: 'کارشناس مالک', rule: 'معرفی کارشناس توسط مالک از ابلاغ دستگاه اجرایی', period: '۱ ماه' },
  { article: 'ماده ۴، تبصرهٔ ۲', title: 'کارشناس دادگاه', rule: 'تعیین کارشناس توسط دادگاه پس از مراجعهٔ دستگاه', period: '۱۵ روز' },
  { article: 'ماده ۵، تبصرهٔ ۵', title: 'نظر کارشناسی', rule: 'اعلام نظر هیئت کارشناسی', period: '۱ ماه' },
  { article: 'ماده ۸', title: 'اعلام اول و دوم', rule: 'مراجعهٔ مالک پس از اعلام اول؛ سپس اعلام دوم', period: '۱ ماه' },
  { article: 'ماده ۸', title: 'تودیع', rule: 'تودیع بها پس از اعلام دوم', period: '۱۵ روز' },
  { article: 'ماده ۸', title: 'تخلیه', rule: 'تخلیه و خلع ید پس از امضای سند انتقال', period: '۱ ماه' },
  { article: 'ماده ۹', title: 'پرداخت پس از تصرف فوری', rule: 'پرداخت یا تودیع قیمت عادله از تاریخ تصرف', period: '۳ ماه' },
  { article: 'ماده ۹، تبصره', title: 'توقف عملیات', rule: 'درخواست مالک از دادگاه برای توقف عملیات تا پرداخت؛ رفع فوری با پرداخت', period: 'خارج از نوبت' },
  { article: 'ماده ۱، تبصرهٔ الحاقی', title: 'پرداخت پس از ابطال سند', rule: 'پرداخت یا تودیع قیمت روز پس از دستور توقف اجرای حکم', period: '۶ ماه' },
]
