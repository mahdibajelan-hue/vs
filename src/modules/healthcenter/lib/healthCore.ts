/**
 * Project Health Center — the health engine. One computation turns what the modules already record into indicators,
 * domain scores and a single health index out of 100; every page section (vital signs, the blood test, organs, imaging,
 * immune system, the diagnosis) is a view of the same result, so no figure is calculated twice.
 *
 * Rules:
 *  - each indicator has one definition (source, fields, formula, unit, frequency) shown on the page
 *  - an indicator with no source record is «داده ناقص»: its value stays empty, never invented, and in the index it
 *    scores `missingScore` (by default 40) — missing data is never read as good performance
 *  - a score is linear between the indicator's «good» and «bad» bound (either direction) and clipped to 0…100
 *  - critical indicators cap the index: when one crosses its cap threshold the index cannot exceed the cap
 *  - bounds, weights and caps come from settings an administrator edits; medical reference ranges are never used
 * Pure: the loader gathers the input; nothing here reads a store or the network.
 */
import { earlyWarnings, rootCauses, suggestions, type ProjectFacts } from '../../reporting/lib/analyticsCore'
import type { SiteInput } from '../../reporting/lib/periodReportCore'

export type DomainKey = 'schedule' | 'finance' | 'execution' | 'quality' | 'supply' | 'risk'
export type Status = 'good' | 'watch' | 'bad' | 'critical' | 'none'
export type Group = 'core' | 'lab' | 'vital' | 'immune'

export const DOMAIN_FA: Record<DomainKey, string> = { schedule: 'زمان و پیشرفت', finance: 'مالی', execution: 'اجرا و بهره‌وری', quality: 'کیفیت', supply: 'تأمین کالا', risk: 'ریسک و مسائل' }
export const STATUS_FA: Record<Status, string> = { good: 'مطلوب', watch: 'زیر نظر', bad: 'نامطلوب', critical: 'بحرانی', none: 'داده ناقص' }
export const STATUS_COLOR: Record<Status, string> = { good: '#22c55e', watch: '#eab308', bad: '#f97316', critical: '#ef4444', none: '#64748b' }

/* ── definitions ───────────────────────────────────────────────────── */

export interface Band { good: number; bad: number }
export interface IndicatorDef {
  id: string
  label: string
  /** the medical name it is shown under (blood test, vital sign) */
  medical?: string
  group: Group
  /** the domain it scores in; null = shown only, not counted in the index (it is derived from counted indicators) */
  domain: DomainKey | null
  unit: string
  source: string
  fields: string
  formula: string
  frequency: string
  /** a value at or past this bound caps the index (same direction as «bad») */
  capAt?: number
  cap?: number
  digits?: number
}

/** every indicator, in one list — the page's documentation table is this list */
export const INDICATORS: IndicatorDef[] = [
  // schedule
  { id: 'gap', label: 'فاصلهٔ پیشرفت از برنامه', group: 'core', domain: 'schedule', unit: 'واحد درصد', source: 'موتور شاخص پروژه (چرخهٔ عمر)', fields: 'lifecycle.actual، lifecycle.planned', formula: 'پیشرفت واقعی − پیشرفت برنامه‌ای کل چرخهٔ عمر', frequency: 'با هر ثبت پیشرفت', capAt: -20, cap: 50, digits: 1 },
  { id: 'spi', label: 'شاخص عملکرد زمانی (SPI)', group: 'core', domain: 'schedule', unit: 'نسبت', source: 'موتور شاخص پروژه (EVM دامنهٔ EPC)', fields: 'evm.spi', formula: 'ارزش کسب‌شده ÷ ارزش برنامه‌ای', frequency: 'ماهانه (منحنی EPC)', capAt: 0.8, cap: 59, digits: 2 },
  { id: 'velocity', label: 'سرعت پیشرفت', medical: 'ضربان قلب', group: 'vital', domain: 'schedule', unit: 'نسبت به برنامه', source: 'منحنی پیشرفت EPC', fields: 'curve[].earned، curve[].planned', formula: 'افزایش پیشرفت کسب‌شده ÷ افزایش برنامه‌ای در آخرین بازهٔ دست‌کم ۲۸ روزه', frequency: 'ماهانه', digits: 2 },
  { id: 'doc_overdue', label: 'مدارک مهندسی معوق', group: 'core', domain: 'schedule', unit: 'مدرک', source: 'مدارک مهندسی (اجرا)', fields: 'ex_eng_docs.planned_approved، actual_approved', formula: 'تعداد مدارکی که موعد تأییدشان گذشته و تأیید نشده‌اند', frequency: 'روزانه' },
  // finance
  { id: 'cpi', label: 'شاخص عملکرد هزینه (CPI)', medical: 'فشار خون', group: 'vital', domain: 'finance', unit: 'نسبت', source: 'موتور شاخص پروژه (EVM) + مالی', fields: 'evm.cpi', formula: 'ارزش کسب‌شده ÷ هزینهٔ تأییدشده', frequency: 'با هر صورت‌وضعیت', capAt: 0.8, cap: 59, digits: 2 },
  { id: 'vac_pct', label: 'کفایت پشتیبانی مالی', medical: 'Albumin', group: 'lab', domain: 'finance', unit: 'درصد بودجه', source: 'موتور شاخص پروژه (EVM)', fields: 'evm.vac، evm.bac', formula: 'انحراف در پایان ÷ بودجه × ۱۰۰ (منفی = کسری)', frequency: 'ماهانه', digits: 1 },
  { id: 'cash_flow', label: 'جریان نقدینگی', medical: 'Glucose', group: 'lab', domain: 'finance', unit: 'درصد', source: 'مالی (صورت‌وضعیت و پرداخت)', fields: 'fin_payments.amount، fin_payment_certificates.certified_amount', formula: 'پرداخت ۹۰ روز اخیر ÷ مبلغ تأییدشدهٔ ۹۰ روز اخیر × ۱۰۰', frequency: 'روزانه' },
  { id: 'payables', label: 'تعهدات پرداخت معوق', medical: 'Creatinine', group: 'lab', domain: 'finance', unit: 'درصد', source: 'مالی (صورت‌وضعیت)', fields: 'certified_amount، paid_amount، certificate_date', formula: 'ماندهٔ پرداخت‌نشدهٔ صورت‌وضعیت‌های بیش از ۳۰ روز ÷ کل مبلغ تأییدشده × ۱۰۰', frequency: 'روزانه', digits: 1 },
  { id: 'changes_pct', label: 'تغییرات تصویب‌شده', group: 'core', domain: 'finance', unit: 'درصد قرارداد', source: 'مدیریت تغییرات + داده پایه', fields: 'approved_change_amount، contract_value', formula: 'جمع مبلغ تغییرات تصویب‌شده ÷ مبلغ قرارداد × ۱۰۰', frequency: 'با هر تصمیم تغییر', digits: 1 },
  // execution
  { id: 'manpower_util', label: 'بهره‌وری نیروی انسانی', medical: 'Hemoglobin', group: 'lab', domain: 'execution', unit: 'درصد', source: 'گزارش روزانهٔ اجرا (منابع)', fields: 'ex_report_resources.active_qty، total_qty', formula: 'نفرات فعال ÷ کل نفرات در کارگاه، ۷ روز گزارش اخیر', frequency: 'روزانه' },
  { id: 'manpower_cap', label: 'ظرفیت نیروی انسانی اجرایی', medical: 'RBC', group: 'lab', domain: 'execution', unit: 'درصد', source: 'گزارش روزانهٔ اجرا (منابع)', fields: 'ex_report_resources.total_qty', formula: 'میانگین روزانهٔ نفرات ۷ روز اخیر ÷ میانگین ۳۰ روز پیش از آن × ۱۰۰', frequency: 'روزانه' },
  { id: 'equip_util', label: 'بهره‌وری ماشین‌آلات', group: 'core', domain: 'execution', unit: 'درصد', source: 'گزارش روزانهٔ اجرا (منابع)', fields: 'ex_report_resources (ماشین‌آلات)', formula: 'دستگاه در کار ÷ کل دستگاه‌ها، ۷ روز گزارش اخیر', frequency: 'روزانه' },
  { id: 'resource_balance', label: 'تعادل منابع پروژه', medical: 'Electrolytes', group: 'lab', domain: 'execution', unit: 'واحد درصد', source: 'گزارش روزانهٔ اجرا (منابع)', fields: 'بهره‌وری نیروی انسانی و ماشین‌آلات', formula: 'قدر مطلق اختلاف بهره‌وری نیروی انسانی و ماشین‌آلات', frequency: 'روزانه' },
  { id: 'stoppage_rate', label: 'ساعت توقف در روز', group: 'core', domain: 'execution', unit: 'ساعت در روز', source: 'گزارش روزانهٔ اجرا (توقفات)', fields: 'ex_report_stoppages.hours', formula: 'جمع ساعت توقف ۱۴ روز اخیر ÷ روزهای دارای گزارش', frequency: 'روزانه', digits: 1 },
  { id: 'activity_rate', label: 'نرخ فعالیت جبهه‌های اجرایی', medical: 'تنفس', group: 'vital', domain: 'execution', unit: 'گزارش فنی در روز', source: 'گزارش‌های فنی اجرا', fields: 'ex_reports (فرم‌های فنی ارسال‌شده)', formula: 'گزارش فنی ارسال‌شده در روز، ۷ روز اخیر؛ امتیاز نسبت به میانگین ۳۰ روز پیش از آن', frequency: 'روزانه', digits: 1 },
  { id: 'report_compliance', label: 'انضباط گزارش‌دهی', group: 'core', domain: 'execution', unit: 'درصد روزها', source: 'گزارش‌های اجرا', fields: 'ex_reports.report_date، status', formula: 'روزهای دارای گزارش ارسال‌شده ÷ ۱۴ روز اخیر × ۱۰۰', frequency: 'روزانه' },
  // quality
  { id: 'ncr_open', label: 'یافته‌های کیفی (NCR) باز', medical: 'WBC', group: 'lab', domain: 'quality', unit: 'مورد', source: 'کیفیت اجرا (یافته‌های QC)', fields: 'ex_qc_findings.status، severity', formula: 'تعداد یافته‌های باز (یافتهٔ شدید سه برابر)', frequency: 'روزانه', capAt: 9, cap: 69 },
  { id: 'ncr_closure', label: 'نرخ بستن یافته‌های کیفی', group: 'core', domain: 'quality', unit: 'درصد', source: 'کیفیت اجرا (یافته‌های QC)', fields: 'created_at، closed_at', formula: 'یافته‌های بسته‌شده ÷ یافته‌های ثبت‌شده در ۹۰ روز اخیر × ۱۰۰', frequency: 'روزانه' },
  { id: 'weld_repair', label: 'نرخ تعمیر جوش', group: 'core', domain: 'quality', unit: 'درصد', source: 'فرم‌های جوشکاری و تعمیر جوش', fields: 'فرم welding و weld_repair', formula: 'تعداد تعمیر ÷ تعداد سرجوش ۳۰ روز اخیر × ۱۰۰', frequency: 'روزانه', digits: 1 },
  { id: 'punch_a', label: 'پانچ A باز (PSSR)', group: 'core', domain: 'quality', unit: 'مورد', source: 'آمادگی راه‌اندازی', fields: 'pssr_punches.category، status', formula: 'تعداد پانچ‌های A باز', frequency: 'روزانه' },
  { id: 'ht_failed', label: 'آزمون فشار ناموفق', group: 'core', domain: 'quality', unit: 'مورد', source: 'آزمایش‌ها (هیدروتست)', fields: 'ht_sections.failed، ht_packs.failed', formula: 'تعداد مقطع یا پکیج با آزمون ناموفق و پذیرفته‌نشده', frequency: 'روزانه' },
  // supply
  { id: 'proc_gap', label: 'فاصلهٔ پیشرفت تأمین کالا', group: 'core', domain: 'supply', unit: 'واحد درصد', source: 'ماژول تأمین کالا', fields: 'پیشرفت واقعی و برنامه‌ای تأمین', formula: 'پیشرفت واقعی − برنامه‌ای رشتهٔ تأمین', frequency: 'با هر ثبت پیشرفت', digits: 1 },
  { id: 'late_shipments', label: 'محمولهٔ دیرکرد', group: 'core', domain: 'supply', unit: 'محموله', source: 'کنترل متریال (محموله‌ها)', fields: 'mtl_shipments.eta، ata', formula: 'محموله‌هایی که تاریخ پیش‌بینی رسیدنشان گذشته و نرسیده‌اند', frequency: 'روزانه' },
  { id: 'mat_disc', label: 'مغایرت کالای باز', group: 'core', domain: 'supply', unit: 'مورد', source: 'کنترل متریال (مغایرت‌ها)', fields: 'mtl_discrepancies.status', formula: 'مغایرت‌های باز یا در دست بررسی', frequency: 'روزانه' },
  // risk & issues
  { id: 'risk_temp', label: 'شدت ریسک و مشکلات بحرانی', medical: 'دمای بدن', group: 'vital', domain: 'risk', unit: 'امتیاز', source: 'ثبت ریسک + مدیریت مسائل', fields: 'سطح فعلی ریسک‌ها، اولویت و مهلت مسائل', formula: 'min(۱۰۰، ۶ × ریسک بحرانی + ۳ × ریسک بالا + ۵ × مسئلهٔ مهمِ معوق)', frequency: 'روزانه', capAt: 80, cap: 59 },
  { id: 'crp', label: 'شدت مسائل حل‌نشده', medical: 'CRP', group: 'lab', domain: 'risk', unit: 'مورد', source: 'مدیریت مسائل', fields: 'im_issues.priority، status', formula: 'مسائل باز با اولویت بحرانی یا بالا', frequency: 'روزانه' },
  { id: 'esr', label: 'میانگین عمر مسائل باز', medical: 'ESR', group: 'lab', domain: 'risk', unit: 'روز', source: 'مدیریت مسائل', fields: 'identified_at', formula: 'میانهٔ سن مسائل باز (روز)', frequency: 'روزانه' },
  { id: 'platelets', label: 'توان رفع مشکلات و اقدامات اصلاحی', medical: 'Platelets', group: 'lab', domain: 'risk', unit: 'درصد', source: 'مدیریت مسائل + مرکز اقدامات', fields: 'مسائل و اقدامات ثبت و بسته‌شده', formula: '(مسائل بسته‌شده + اقدامات انجام‌شده) ÷ (مسائل ثبت‌شده + اقدامات ایجادشده)، ۳۰ روز اخیر × ۱۰۰', frequency: 'روزانه' },
  { id: 'dec_overdue', label: 'تصمیم مدیریتی معوق', group: 'core', domain: 'risk', unit: 'تصمیم', source: 'مرکز تصمیم و اقدامات', fields: 'decisions.status، required_by', formula: 'تصمیم‌های در انتظار با موعد گذشته', frequency: 'روزانه', capAt: 3, cap: 69 },
  { id: 'act_overdue', label: 'اقدام معوق', group: 'core', domain: 'risk', unit: 'اقدام', source: 'مرکز تصمیم و اقدامات', fields: 'actions.status، due_date', formula: 'اقدام‌های باز با سررسید گذشته', frequency: 'روزانه' },
  // shown only
  { id: 'spo2', label: 'کفایت منابع حیاتی', medical: 'SpO2', group: 'vital', domain: null, unit: 'درصد', source: 'گزارش روزانهٔ اجرا (منابع)', fields: 'بهره‌وری نیروی انسانی و ماشین‌آلات', formula: 'میانگین بهره‌وری نیروی انسانی و ماشین‌آلات', frequency: 'روزانه' },
  { id: 'risk_response', label: 'توان پاسخ به ریسک', group: 'immune', domain: null, unit: 'درصد', source: 'ثبت ریسک', fields: 'ریسک‌ها و اقدام‌های پاسخ', formula: 'ریسک‌های بحرانی و بالای فعال دارای دست‌کم یک اقدام پاسخ ÷ کل آن‌ها × ۱۰۰', frequency: 'روزانه' },
  { id: 'preventive', label: 'اقدامات پیشگیرانه', group: 'immune', domain: null, unit: 'درصد', source: 'ثبت ریسک (اقدام‌های پاسخ)', fields: 'rm_risk_actions.status، due_date', formula: 'اقدام‌های پاسخ باز که از سررسید نگذشته‌اند ÷ کل اقدام‌های باز × ۱۰۰', frequency: 'روزانه' },
  { id: 'recurring', label: 'مشکلات تکرارشونده', group: 'immune', domain: null, unit: 'دسته', source: 'مدیریت مسائل', fields: 'category، identified_at', formula: 'دسته‌هایی که در ۹۰ روز اخیر سه مسئله یا بیشتر داشته‌اند', frequency: 'روزانه' },
  { id: 'recovery', label: 'سرعت بازیابی', group: 'immune', domain: null, unit: 'روز', source: 'مدیریت مسائل', fields: 'identified_at، closed_at', formula: 'میانهٔ روزهای رفع مسائل بحرانی و بالای بسته‌شده در ۱۸۰ روز اخیر', frequency: 'روزانه' },
  { id: 'resilience', label: 'تاب‌آوری پروژه', group: 'immune', domain: null, unit: 'امتیاز', source: 'شاخص‌های سیستم ایمنی', fields: 'چهار شاخص بالا', formula: 'میانگین امتیاز توان پاسخ، پیشگیری، تکرار و بازیابی', frequency: 'روزانه' },
]
export const DEF: Record<string, IndicatorDef> = Object.fromEntries(INDICATORS.map((d) => [d.id, d]))

/* ── settings ──────────────────────────────────────────────────────── */

export interface HealthSettings {
  weights: Record<DomainKey, number>
  bands: Record<string, Band>
  /** the score an indicator with no data gets inside the index */
  missingScore: number
  /** gate blocked (Stage-Gate) caps the index */
  blockedCap: number
}
export const DEFAULT_SETTINGS: HealthSettings = {
  weights: { schedule: 25, finance: 20, execution: 20, quality: 15, supply: 10, risk: 10 },
  missingScore: 40,
  blockedCap: 45,
  bands: {
    gap: { good: 0, bad: -15 }, spi: { good: 1, bad: 0.75 }, velocity: { good: 1, bad: 0.5 }, doc_overdue: { good: 0, bad: 40 },
    cpi: { good: 1, bad: 0.75 }, vac_pct: { good: 0, bad: -15 }, cash_flow: { good: 95, bad: 50 }, payables: { good: 0, bad: 30 }, changes_pct: { good: 0, bad: 15 },
    manpower_util: { good: 90, bad: 60 }, manpower_cap: { good: 100, bad: 60 }, equip_util: { good: 85, bad: 50 }, resource_balance: { good: 0, bad: 30 },
    stoppage_rate: { good: 0, bad: 8 }, activity_rate: { good: 100, bad: 40 }, report_compliance: { good: 100, bad: 50 },
    ncr_open: { good: 0, bad: 10 }, ncr_closure: { good: 100, bad: 40 }, weld_repair: { good: 2, bad: 10 }, punch_a: { good: 0, bad: 5 }, ht_failed: { good: 0, bad: 3 },
    proc_gap: { good: 0, bad: -20 }, late_shipments: { good: 0, bad: 5 }, mat_disc: { good: 0, bad: 100 },
    risk_temp: { good: 0, bad: 60 }, crp: { good: 0, bad: 10 }, esr: { good: 15, bad: 90 }, platelets: { good: 120, bad: 40 }, dec_overdue: { good: 0, bad: 5 }, act_overdue: { good: 0, bad: 15 },
    spo2: { good: 88, bad: 55 }, risk_response: { good: 100, bad: 30 }, preventive: { good: 100, bad: 40 }, recurring: { good: 0, bad: 5 }, recovery: { good: 7, bad: 60 }, resilience: { good: 100, bad: 30 },
  },
}
export function mergeSettings(...parts: (Partial<HealthSettings> | null | undefined)[]): HealthSettings {
  const out: HealthSettings = { ...DEFAULT_SETTINGS, weights: { ...DEFAULT_SETTINGS.weights }, bands: { ...DEFAULT_SETTINGS.bands } }
  for (const p of parts) {
    if (!p) continue
    if (p.weights) Object.assign(out.weights, p.weights)
    if (p.bands) Object.assign(out.bands, p.bands)
    if (typeof p.missingScore === 'number') out.missingScore = p.missingScore
    if (typeof p.blockedCap === 'number') out.blockedCap = p.blockedCap
  }
  return out
}

/* ── output ────────────────────────────────────────────────────────── */

export interface Indicator {
  id: string
  value: number | null
  score: number | null
  status: Status
  /** the value of the previous measurement (snapshot), for the trend */
  prev: number | null
  /** a short series for the sparkline (oldest first), when the source is dated */
  series: number[]
  note: string
}
export interface DomainScore { key: DomainKey; score: number; coverage: number; weight: number; prev: number | null }
export interface CapHit { id: string; label: string; cap: number; reason: string }
export interface Driver { key: DomainKey; delta: number; text: string }
export interface OrganScore { key: OrganKey; score: number | null; status: Status; indicators: string[] }
export type OrganKey = 'heart' | 'brain' | 'lungs' | 'muscles' | 'skeleton' | 'nerves' | 'immune'
export interface Prescription { priority: 'critical' | 'high' | 'medium'; action: string; owner: string | null; due: string; why: string }
export interface Diagnosis {
  headline: string
  summary: string
  problems: { id: string; label: string; value: string; range: string; status: Status }[]
  causes: { text: string; basis: string; evidence: string }[]
  prognosis: { level: 'low' | 'medium' | 'high'; text: string; signals: string[] }
  prescriptions: Prescription[]
}
export interface HealthResult {
  projectId: string
  asOf: string
  index: number
  rawIndex: number
  status: Exclude<Status, 'none'>
  coverage: number
  prevIndex: number | null
  domains: DomainScore[]
  indicators: Record<string, Indicator>
  caps: CapHit[]
  drivers: Driver[]
  organs: OrganScore[]
  imaging: Imaging
  ecg: number[]
  bp: { systolic: number | null; diastolic: number | null }
  diagnosis: Diagnosis
}
export interface Imaging {
  xray: { key: DomainKey; score: number }[]
  ct: { label: string; actual: number; planned: number | null }[]
  mri: { label: string; detail: string; weight: number }[]
  ultrasound: { front: string; reports: number; stoppageHours: number; lastDate: string }[]
  angio: { path: string; label: string; blocked: number; note: string }[]
}

export interface HealthInput {
  today: string
  facts: ProjectFacts
  site: SiteInput | null
  /** open PSSR punch A and failed hydrotests — null when the module has no record for the project */
  extra: { punchA: number | null; htFailed: number | null }
}

/* ── helpers ───────────────────────────────────────────────────────── */

const DAY = 86400000
const t = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime()
const addDays = (d: string, n: number) => new Date(t(d) + n * DAY).toISOString().slice(0, 10)
const inP = (d: string | null | undefined, from: string, to: string) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d
/** Persian digits for text the page shows */
const n = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const isOpenIssue = (s: string) => s !== 'approved' && s !== 'rejected' && s !== 'closed'
const ACTIVE_RISK = new Set(['open', 'monitoring', 'escalated'])
const SENT = new Set(['submitted', 'partially_approved', 'approved'])

/** 100 at «good», 0 at «bad», linear between, clipped — works whether bigger or smaller is better */
export function scoreOf(v: number | null, b: Band): number | null {
  if (v == null || !Number.isFinite(v)) return null
  if (b.good === b.bad) return v === b.good ? 100 : 0
  return Math.max(0, Math.min(100, ((v - b.bad) / (b.good - b.bad)) * 100))
}
export const statusOf = (score: number | null): Status => (score == null ? 'none' : score >= 80 ? 'good' : score >= 55 ? 'watch' : score >= 30 ? 'bad' : 'critical')
export const indexStatus = (v: number): Exclude<Status, 'none'> => (v >= 80 ? 'good' : v >= 65 ? 'watch' : v >= 45 ? 'bad' : 'critical')
export const INDEX_FA: Record<Exclude<Status, 'none'>, string> = { good: 'سالم', watch: 'نیازمند مراقبت', bad: 'پرریسک', critical: 'بحرانی' }
/** has the value crossed the bound in the «bad» direction? */
const crossed = (v: number, at: number, b: Band) => (b.bad < b.good ? v <= at : v >= at)

/* ── engine ────────────────────────────────────────────────────────── */

export function computeHealth(inp: HealthInput, settings: HealthSettings = DEFAULT_SETTINGS, previous: HealthResult | null = null): HealthResult {
  const { today, facts: f, site } = inp
  const m = f.input.metrics
  const v: Record<string, { value: number | null; series?: number[]; note?: string }> = {}
  const set = (id: string, value: number | null, extra: { series?: number[]; note?: string } = {}) => { v[id] = { value: value == null || !Number.isFinite(value) ? null : value, ...extra } }

  // schedule
  set('gap', m ? m.lifecycle.actual - m.lifecycle.planned : null)
  set('spi', m?.evm?.spi ?? null)
  const curve = (m?.curve ?? []).filter((c) => c.earned != null).sort((a, b) => a.date.localeCompare(b.date))
  let velocity: number | null = null
  const ecg: number[] = []
  for (let i = 1; i < curve.length; i++) ecg.push(round((curve[i].earned as number) - (curve[i - 1].earned as number), 2))
  if (curve.length >= 2) {
    const last = curve[curve.length - 1]
    const base = [...curve].reverse().find((c) => t(last.date) - t(c.date) >= 28 * DAY)
    if (base) { const dp = last.planned - base.planned; velocity = dp > 0.05 ? ((last.earned as number) - (base.earned as number)) / dp : null }
  }
  set('velocity', velocity, { series: ecg.slice(-12) })
  const docs = site?.docs ?? null
  set('doc_overdue', docs ? docs.filter((d) => d.plannedApproved && d.plannedApproved <= today && (!d.actualApproved || d.actualApproved > today)).length : null)

  // finance
  set('cpi', m?.evm?.cpi ?? null)
  set('vac_pct', m?.evm && m.evm.bac > 0 && m.evm.vac != null ? (m.evm.vac / m.evm.bac) * 100 : null)
  const certs = site?.certificates ?? null, pays = site?.payments ?? null
  const from90 = addDays(today, -89)
  if (certs && certs.length) {
    const cert90 = sum(certs.filter((c) => inP(c.date, from90, today)).map((c) => c.certified))
    const paid90 = sum((pays ?? []).filter((p) => inP(p.date, from90, today)).map((p) => p.amount))
    set('cash_flow', cert90 > 0 ? (paid90 / cert90) * 100 : null, { note: cert90 > 0 ? '' : 'در ۹۰ روز اخیر صورت‌وضعیت تأییدشده‌ای نیست' })
    const total = sum(certs.map((c) => c.certified))
    const overdue = sum(certs.filter((c) => c.date && c.date <= addDays(today, -30)).map((c) => Math.max(0, c.certified - c.paid)))
    set('payables', total > 0 ? (overdue / total) * 100 : null)
  } else { set('cash_flow', null); set('payables', null) }
  const approvedChange = (f.changes ?? []).filter((c) => c.approvedCost != null).reduce((n, c) => n + (c.approvedCost ?? 0), 0)
  set('changes_pct', f.changes && f.contractValue ? (approvedChange / f.contractValue) * 100 : null)

  // execution
  const res = site?.resources ?? []
  const resDays = [...new Set(res.map((r) => r.date))].filter((d) => d <= today).sort()
  const last7 = resDays.slice(-7)
  const util = (kind: 'man' | 'equip', days: string[]) => {
    const xs = res.filter((r) => r.kind === kind && days.includes(r.date))
    const tot = sum(xs.map((r) => r.total)); return tot > 0 ? (sum(xs.map((r) => r.active)) / tot) * 100 : null
  }
  const man = last7.length ? util('man', last7) : null, eq = last7.length ? util('equip', last7) : null
  const dailyMan = (days: string[]) => days.map((d) => sum(res.filter((r) => r.kind === 'man' && r.date === d).map((r) => r.total)))
  set('manpower_util', man, { series: resDays.slice(-14).map((d) => util('man', [d]) ?? 0) })
  set('equip_util', eq)
  if (last7.length) {
    const before = resDays.filter((d) => d < last7[0] && d >= addDays(last7[0], -30))
    const a = sum(dailyMan(last7)) / last7.length, b = before.length ? sum(dailyMan(before)) / before.length : 0
    set('manpower_cap', b > 0 ? (a / b) * 100 : null, { series: dailyMan(resDays.slice(-14)), note: b > 0 ? '' : 'برای ۳۰ روز پیش از آن گزارش منابع نیست' })
  } else set('manpower_cap', null)
  set('resource_balance', man != null && eq != null ? Math.abs(man - eq) : null)
  set('spo2', man != null && eq != null ? (man + eq) / 2 : man ?? eq)
  const reps = site?.reports ?? []
  const sent = reps.filter((r) => SENT.has(r.status))
  const from14 = addDays(today, -13)
  const repDays14 = new Set(sent.filter((r) => inP(r.date, from14, today)).map((r) => r.date))
  const stop14 = (site?.stoppages ?? []).filter((s) => inP(s.date, from14, today))
  set('stoppage_rate', site && reps.length ? (repDays14.size ? sum(stop14.map((s) => s.hours)) / repDays14.size : null) : null)
  set('report_compliance', site && reps.length ? (repDays14.size / 14) * 100 : null)
  const tech = sent.filter((r) => r.formKey !== 'work')
  const perDay = (from: string, to: string, n: number) => tech.filter((r) => inP(r.date, from, to)).length / n
  const recent = perDay(addDays(today, -6), today, 7), base30 = perDay(addDays(today, -36), addDays(today, -7), 30)
  const activitySeries = Array.from({ length: 14 }, (_, i) => tech.filter((r) => r.date === addDays(today, i - 13)).length)
  set('activity_rate', tech.length ? (base30 > 0 ? (recent / base30) * 100 : recent > 0 ? 100 : null) : null, { series: activitySeries, note: `${n(recent, 1)} گزارش فنی در روز، میانگین پیش از آن ${n(base30, 1)}` })

  // quality
  const qc = site?.qc ?? null
  if (qc && qc.length) {
    const open = qc.filter((q) => !q.closedAt || q.closedAt.slice(0, 10) > today)
    set('ncr_open', sum(open.map((q) => (q.severity === 'high' ? 3 : 1))), { note: `${n(open.length)} یافتهٔ باز، ${n(open.filter((q) => q.severity === 'high').length)} شدید` })
    const opened = qc.filter((q) => inP(q.createdAt, from90, today)).length, closed = qc.filter((q) => inP(q.closedAt, from90, today)).length
    set('ncr_closure', opened ? Math.min(150, (closed / opened) * 100) : null)
  } else { set('ncr_open', qc ? 0 : null); set('ncr_closure', null) }
  const prod30 = (site?.production ?? []).filter((x) => inP(x.date, addDays(today, -29), today))
  const welds = sum(prod30.filter((x) => x.formKey === 'welding' && /سرجوش/.test(x.unit)).map((x) => x.value))
  const repairs = sum(prod30.filter((x) => x.formKey === 'weld_repair' && /سرجوش|عدد|تعداد/.test(x.unit)).map((x) => x.value))
  set('weld_repair', welds > 0 ? (repairs / welds) * 100 : null)
  set('punch_a', inp.extra.punchA)
  set('ht_failed', inp.extra.htFailed)

  // supply
  const proc = f.disciplines.find((d) => d.key === 'procurement')
  set('proc_gap', proc && proc.planned != null ? proc.actual - proc.planned : null)
  set('late_shipments', site?.shipments ? site.shipments.filter((s) => s.eta && s.eta <= today && !s.ata).length : null)
  set('mat_disc', site?.discrepancies ? site.discrepancies.filter((d) => d.status === 'open' || d.status === 'in_review').length : null)

  // risk & issues
  const risks = (f.input.risks ?? []).filter((r) => ACTIVE_RISK.has(r.status))
  const issues = f.issues ?? null
  const openIss = (issues ?? []).filter((i) => isOpenIssue(i.status))
  const hotIss = openIss.filter((i) => i.priority === 'critical' || i.priority === 'high')
  const hotOverdue = hotIss.filter((i) => i.due && i.due.slice(0, 10) < today)
  const crit = risks.filter((r) => r.level === 'critical').length, high = risks.filter((r) => r.level === 'high').length
  set('risk_temp', f.input.risks || issues ? Math.min(100, 6 * crit + 3 * high + 5 * hotOverdue.length) : null, { note: `${n(crit)} ریسک بحرانی، ${n(high)} ریسک بالا، ${n(hotOverdue.length)} مسئلهٔ مهمِ معوق` })
  set('crp', issues ? hotIss.length : null)
  set('esr', issues ? median(openIss.map((i) => (t(today) - t(i.createdAt)) / DAY)) ?? 0 : null)
  const from30 = addDays(today, -29)
  const acts = f.input.actions
  const inflow = (issues ?? []).filter((i) => inP(i.createdAt, from30, today)).length + acts.filter((a) => inP(a.createdAt, from30, today)).length
  const outflow = (issues ?? []).filter((i) => inP(i.closedAt, from30, today)).length + acts.filter((a) => a.status === 'completed' && inP(a.updatedAt, from30, today)).length
  set('platelets', issues || acts.length ? (inflow ? Math.min(200, (outflow / inflow) * 100) : outflow ? 200 : null) : null, { note: `${n(outflow)} رفع در برابر ${n(inflow)} ورود` })
  set('dec_overdue', f.input.decisions.filter((d) => (d.status === 'pending' || d.status === 'in_review') && d.requiredBy && d.requiredBy.slice(0, 10) < today).length)
  set('act_overdue', acts.filter((a) => a.status !== 'completed' && a.status !== 'cancelled' && a.dueDate && a.dueDate.slice(0, 10) < today).length)

  // immune
  const hot = risks.filter((r) => r.level === 'critical' || r.level === 'high')
  const ra = f.input.riskActions
  set('risk_response', hot.length ? (hot.filter((r) => ra.some((x) => x.riskId === r.id)).length / hot.length) * 100 : f.input.risks ? 100 : null)
  const openRa = ra.filter((x) => x.status !== 'completed' && x.status !== 'cancelled')
  set('preventive', openRa.length ? (openRa.filter((x) => !x.dueDate || x.dueDate.slice(0, 10) >= today).length / openRa.length) * 100 : null)
  if (issues) {
    const cats = new Map<string, number>()
    for (const i of issues.filter((x) => inP(x.createdAt, from90, today) && x.category)) cats.set(i.category as string, (cats.get(i.category as string) ?? 0) + 1)
    set('recurring', [...cats.values()].filter((n) => n >= 3).length)
    set('recovery', median(issues.filter((i) => (i.priority === 'critical' || i.priority === 'high') && inP(i.closedAt, addDays(today, -179), today)).map((i) => (t(i.closedAt as string) - t(i.createdAt)) / DAY)))
  } else { set('recurring', null); set('recovery', null) }
  const immuneScores = ['risk_response', 'preventive', 'recurring', 'recovery'].map((id) => scoreOf(v[id].value, settings.bands[id])).filter((x): x is number => x != null)
  set('resilience', immuneScores.length ? sum(immuneScores) / immuneScores.length : null)

  // indicators with scores and trends
  const prevInd = previous?.indicators ?? {}
  const indicators: Record<string, Indicator> = {}
  for (const d of INDICATORS) {
    const x = v[d.id] ?? { value: null }
    const score = scoreOf(x.value, settings.bands[d.id] ?? { good: 1, bad: 0 })
    indicators[d.id] = { id: d.id, value: x.value == null ? null : round(x.value, d.digits ?? 0), score: score == null ? null : Math.round(score), status: statusOf(score), prev: prevInd[d.id]?.value ?? null, series: x.series ?? [], note: x.note ?? '' }
  }

  // domains and index
  const domains: DomainScore[] = (Object.keys(settings.weights) as DomainKey[]).map((key) => {
    const ids = INDICATORS.filter((d) => d.domain === key).map((d) => d.id)
    const scores = ids.map((id) => indicators[id].score)
    const have = scores.filter((s): s is number => s != null)
    const score = ids.length ? sum(scores.map((s) => s ?? settings.missingScore)) / ids.length : settings.missingScore
    return { key, score: Math.round(score), coverage: ids.length ? have.length / ids.length : 0, weight: settings.weights[key], prev: previous?.domains.find((p) => p.key === key)?.score ?? null }
  })
  const W = sum(domains.map((d) => d.weight)) || 1
  const rawIndex = sum(domains.map((d) => d.score * d.weight)) / W
  const caps: CapHit[] = []
  for (const d of INDICATORS) {
    const x = indicators[d.id]
    if (d.capAt == null || d.cap == null || x.value == null) continue
    if (crossed(x.value, d.capAt, settings.bands[d.id] ?? { good: 1, bad: 0 })) caps.push({ id: d.id, label: d.label, cap: d.cap, reason: `${d.label} = ${n(x.value, d.digits ?? 2)} (آستانهٔ بحرانی ${n(d.capAt, 2)})` })
  }
  if (m?.health?.status === 'black') caps.push({ id: 'gate', label: 'گیت مسدود', cap: settings.blockedCap, reason: `گیت چرخهٔ عمر مسدود است${m.health.blockers.length ? `: ${m.health.blockers.slice(0, 2).join('؛ ')}` : ''}` })
  const capValue = caps.length ? Math.min(...caps.map((c) => c.cap)) : 100
  const index = Math.round(Math.min(rawIndex, capValue))
  const counted = INDICATORS.filter((d) => d.domain)
  const coverage = counted.filter((d) => indicators[d.id].value != null).length / counted.length

  const drivers: Driver[] = previous ? domains.filter((d) => d.prev != null && d.score !== d.prev).map((d) => {
    const delta = ((d.score - (d.prev as number)) * d.weight) / W
    return { key: d.key, delta: round(delta, 1), text: `${DOMAIN_FA[d.key]}: ${n(d.prev as number)} ← ${n(d.score)}` }
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) : []

  const organOf = (ids: string[], key: OrganKey): OrganScore => {
    const sc = ids.map((id) => indicators[id]?.score).filter((s): s is number => s != null)
    const score = sc.length ? Math.round(sum(sc) / sc.length) : null
    return { key, score, status: statusOf(score), indicators: ids }
  }
  const organs: OrganScore[] = [
    organOf(['gap', 'spi', 'velocity', 'doc_overdue'], 'heart'),
    organOf(['dec_overdue', 'act_overdue', 'platelets'], 'brain'),
    organOf(['proc_gap', 'late_shipments', 'mat_disc'], 'lungs'),
    organOf(['manpower_util', 'manpower_cap', 'equip_util', 'stoppage_rate', 'activity_rate'], 'muscles'),
    organOf(['changes_pct', 'payables', 'vac_pct'], 'skeleton'),
    organOf(['report_compliance', 'esr'], 'nerves'),
    organOf(['risk_temp', 'crp', 'risk_response', 'preventive', 'recurring', 'recovery'], 'immune'),
  ]

  // imaging
  const fronts = new Map<string, { reports: number; stoppageHours: number; lastDate: string }>()
  for (const r of sent.filter((x) => inP(x.date, addDays(today, -29), today))) {
    const k = r.front || 'بدون جبهه'
    const a = fronts.get(k) ?? { reports: 0, stoppageHours: 0, lastDate: '' }
    a.reports++; if (r.date > a.lastDate) a.lastDate = r.date
    fronts.set(k, a)
  }
  const stopByCat = new Map<string, number>()
  for (const s of (site?.stoppages ?? []).filter((x) => inP(x.date, addDays(today, -29), today))) stopByCat.set(s.category, (stopByCat.get(s.category) ?? 0) + s.hours)
  const causes = rootCauses(f)
  const imaging: Imaging = {
    xray: domains.map((d) => ({ key: d.key, score: d.score })),
    ct: f.disciplines.map((d) => ({ label: d.key === 'engineering' ? 'مهندسی (E)' : d.key === 'procurement' ? 'تأمین کالا (P)' : 'اجرا (C)', actual: d.actual, planned: d.planned })),
    mri: [
      ...causes.slice(0, 4).map((c) => ({ label: c.text, detail: c.evidence.slice(0, 2).join('؛ '), weight: c.basis === 'direct' ? 3 : c.basis === 'associated' ? 2 : 1 })),
      ...[...stopByCat].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, h]) => ({ label: `توقف: ${c}`, detail: `${n(h, 1)} ساعت در ۳۰ روز اخیر`, weight: 2 })),
    ],
    ultrasound: [...fronts].map(([front, a]) => ({ front, ...a })).sort((a, b) => b.reports - a.reports).slice(0, 10),
    angio: [
      { path: 'supply', label: 'مسیر تأمین کالا: سفارش ← حمل ← انبار', blocked: indicators.late_shipments.value ?? 0, note: indicators.late_shipments.value == null ? 'دادهٔ محموله ثبت نشده' : `${n(indicators.late_shipments.value)} محمولهٔ دیرکرد · ${n(indicators.mat_disc.value ?? 0)} مغایرت باز` },
      { path: 'cash', label: 'مسیر نقدینگی: کارکرد ← صورت‌وضعیت ← پرداخت', blocked: indicators.payables.value != null && indicators.payables.value > 10 ? 1 : 0, note: indicators.payables.value == null ? 'دادهٔ مالی ثبت نشده' : `${n(indicators.payables.value, 1)}٪ مبلغ تأییدشده بیش از ۳۰ روز پرداخت نشده · جریان نقدینگی ${indicators.cash_flow.value == null ? '—' : n(indicators.cash_flow.value)}٪` },
      { path: 'docs', label: 'مسیر مدارک: تهیه ← تأیید ← صدور برای ساخت', blocked: indicators.doc_overdue.value ?? 0, note: indicators.doc_overdue.value == null ? 'مدارک مهندسی ثبت نشده' : `${n(indicators.doc_overdue.value)} مدرک معوق` },
    ],
  }

  const result: HealthResult = {
    projectId: f.id, asOf: today, index, rawIndex: Math.round(rawIndex), status: indexStatus(index), coverage: round(coverage, 2), prevIndex: previous?.index ?? null,
    domains, indicators, caps, drivers, organs, imaging, ecg,
    bp: { systolic: m?.evm && m.evm.bac > 0 && m.evm.cpi ? round(m.lifecycle.actual / m.evm.cpi, 1) : null, diastolic: m ? round(m.lifecycle.actual, 1) : null },
    diagnosis: { headline: '', summary: '', problems: [], causes: [], prognosis: { level: 'low', text: '', signals: [] }, prescriptions: [] },
  }
  result.diagnosis = diagnose(result, f, settings, causes)
  return result
}

/* ── diagnosis ─────────────────────────────────────────────────────── */

const RX: Record<string, string> = {
  gap: 'بازنگری برنامهٔ جبرانی و تمرکز منابع روی فعالیت‌های مسیر بحرانی',
  spi: 'تحلیل فعالیت‌های عقب‌افتادهٔ EPC و تدوین برنامهٔ تسریع با مسئول مشخص',
  velocity: 'افزایش ظرفیت جبهه‌های فعال یا افزودن شیفت در فعالیت‌های پرتأخیر',
  doc_overdue: 'جلسهٔ تعیین تکلیف مدارک معوق با مشاور و اولویت‌بندی مدارک بحرانی',
  cpi: 'بررسی علل افزایش هزینه و کنترل صورت‌وضعیت‌ها پیش از تأیید',
  vac_pct: 'بازنگری پیش‌بینی هزینهٔ تمام‌شده و تأمین منابع مالی تکمیلی',
  cash_flow: 'پیگیری تخصیص و پرداخت صورت‌وضعیت‌های تأییدشده',
  payables: 'تعیین تکلیف صورت‌وضعیت‌های پرداخت‌نشدهٔ بیش از ۳۰ روز',
  changes_pct: 'بازنگری دامنهٔ کار و کنترل تغییرات پیش از تصویب',
  manpower_util: 'شناسایی علت نیروی غیرفعال و جابه‌جایی نیرو بین جبهه‌ها',
  manpower_cap: 'بررسی کاهش نیروی کارگاه با پیمانکار و تعهد بسیج نیرو',
  equip_util: 'تعیین تکلیف ماشین‌آلات بیکار یا در تعمیر',
  resource_balance: 'متعادل‌سازی ترکیب نفرات و ماشین‌آلات در جبهه‌ها',
  stoppage_rate: 'رفع علت اصلی توقفات و ثبت اخطار تأخیر در صورت لزوم',
  activity_rate: 'بررسی جبهه‌های بدون گزارش و فعال‌سازی جبهه‌های متوقف',
  report_compliance: 'الزام ثبت گزارش روزانه در همان روز و پیگیری گزارش‌های معوق',
  ncr_open: 'بستن یافته‌های کیفی باز با اقدام اصلاحی و بازرسی مجدد',
  ncr_closure: 'برگزاری جلسهٔ کیفیت و تعیین مهلت برای یافته‌های باز',
  weld_repair: 'بازآموزی جوشکاران پرتعمیر و بازبینی WPS',
  punch_a: 'رفع پانچ‌های A پیش از برنامهٔ راه‌اندازی',
  ht_failed: 'عیب‌یابی، تعمیر و برنامهٔ آزمون مجدد مقاطع ناموفق',
  proc_gap: 'پیگیری سفارش‌ها و حمل اقلام بحرانی با تأمین‌کنندگان',
  late_shipments: 'پیگیری محموله‌های دیرکرد و برنامهٔ جایگزین',
  mat_disc: 'تعیین تکلیف مغایرت‌های باز کالا',
  risk_temp: 'بازنگری پاسخ ریسک‌های بحرانی و رفع مسائل مهمِ معوق',
  crp: 'جلسهٔ ویژهٔ رفع مسائل بحرانی و بالا',
  esr: 'تعیین تکلیف مسائل قدیمی و ارجاع موارد ماندگار به سطح بالاتر',
  platelets: 'تقویت پیگیری اقدامات اصلاحی و بستن موارد انجام‌شده',
  dec_overdue: 'طرح تصمیم‌های معوق در نخستین جلسهٔ مدیریت',
  act_overdue: 'پیگیری اقدام‌های معوق با مسئولان و به‌روزرسانی مهلت‌ها',
}
const fmt = (id: string, x: number | null) => (x == null ? '—' : `${x.toLocaleString('fa-IR', { maximumFractionDigits: DEF[id]?.digits ?? 0 })} ${DEF[id]?.unit ?? ''}`.trim())
export const rangeText = (_id: string, b: Band) => `مطلوب ${b.good.toLocaleString('fa-IR')} · بحرانی ${b.bad.toLocaleString('fa-IR')}`

function diagnose(r: HealthResult, f: ProjectFacts, s: HealthSettings, causes: ReturnType<typeof rootCauses>): Diagnosis {
  const counted = INDICATORS.filter((d) => d.domain && r.indicators[d.id].score != null)
  const worst = [...counted].sort((a, b) => (r.indicators[a.id].score as number) - (r.indicators[b.id].score as number) || (a.capAt != null ? -1 : 1))
  const problems = worst.filter((d) => r.indicators[d.id].status === 'critical' || r.indicators[d.id].status === 'bad').slice(0, 3)
  const weakest = [...r.domains].sort((a, b) => a.score - b.score)[0]
  const missing = INDICATORS.filter((d) => d.domain && r.indicators[d.id].value == null).length
  const headline = `${INDEX_FA[r.status]} — ${weakest ? `ضعیف‌ترین حوزه: ${DOMAIN_FA[weakest.key]} (${n(weakest.score)})` : ''}`
  const summary = [
    `شاخص سلامت ${n(r.index)} از ۱۰۰${r.caps.length ? ` (بدون سقف بحرانی ${n(r.rawIndex)})` : ''}.`,
    r.caps.length ? `سقف امتیاز به‌دلیل ${r.caps[0].reason} اعمال شده است.` : '',
    missing ? `${n(missing)} شاخص دادهٔ ثبت‌شده ندارد و با امتیاز ${n(s.missingScore)} در محاسبه آمده است.` : '',
  ].filter(Boolean).join(' ')
  const warns = earlyWarnings(f)
  const trendDown = r.prevIndex != null && r.index < r.prevIndex
  const level: Diagnosis['prognosis']['level'] = (trendDown && warns.some((w) => w.severity === 'high')) || warns.filter((w) => w.severity === 'high').length >= 2 ? 'high' : trendDown || warns.length ? 'medium' : 'low'
  const sugg = suggestions(f).filter((x) => !x.existing)
  const rx: Prescription[] = sugg.slice(0, 4).map((x) => ({ priority: x.priority, action: x.action, owner: x.owner, due: x.due, why: x.problem }))
  for (const d of problems) {
    if (rx.length >= 6 || rx.some((x) => x.why.includes(d.label))) continue
    const ind = r.indicators[d.id]
    rx.push({ priority: ind.status === 'critical' ? 'critical' : 'high', action: RX[d.id] ?? `بررسی ${d.label}`, owner: f.manager, due: new Date(t(r.asOf) + (ind.status === 'critical' ? 7 : 14) * DAY).toISOString().slice(0, 10), why: `${d.label}: ${fmt(d.id, ind.value)}` })
  }
  const order = { critical: 0, high: 1, medium: 2 }
  rx.sort((a, b) => order[a.priority] - order[b.priority] || a.due.localeCompare(b.due))
  return {
    headline, summary,
    problems: problems.map((d) => ({ id: d.id, label: d.label, value: fmt(d.id, r.indicators[d.id].value), range: rangeText(d.id, s.bands[d.id]), status: r.indicators[d.id].status })),
    causes: causes.slice(0, 3).map((c) => ({ text: c.text, basis: c.basis === 'direct' ? 'ثبت‌شده یا محاسبه‌شده' : c.basis === 'associated' ? 'همبستگی' : 'فرضیه', evidence: c.evidence.slice(0, 2).join('؛ ') })),
    prognosis: {
      level,
      text: level === 'high' ? 'احتمال وخیم‌تر شدن وضعیت در دورهٔ آینده بالاست.' : level === 'medium' ? 'نشانه‌هایی از احتمال بدتر شدن وضعیت دیده می‌شود.' : 'نشانه‌ای از وخیم‌تر شدن وضعیت دیده نمی‌شود.',
      signals: [...(trendDown ? [`شاخص سلامت از ${n(r.prevIndex as number)} به ${n(r.index)} کاهش یافته است.`] : []), ...warns.slice(0, 3).map((w) => `${w.title}: ${w.reason}`)],
    },
    prescriptions: rx.slice(0, 6),
  }
}
