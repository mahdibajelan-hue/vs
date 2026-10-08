import type { AcqRoute, AgreementStatus, CriticalityLevel, DocStatus, LandType, OwnershipClass, PaymentStatus, StageKey, StageStatus } from '../types'

export const OWNERSHIP_LABEL: Record<OwnershipClass, string> = {
  private: 'زمین شخصی',
  natural_resources: 'ملی / منابع طبیعی',
  exempt: 'مستثنیات',
  governmental: 'دولتی / سازمانی',
  unknown: 'نامشخص',
}
export const OWNERSHIP_CLASSES = Object.keys(OWNERSHIP_LABEL) as OwnershipClass[]

export const LAND_TYPE_LABEL: Record<LandType, string> = {
  agricultural: 'کشاورزی',
  garden: 'باغ',
  rangeland: 'مرتع',
  forest: 'جنگل',
  desert: 'بیابان / بایر',
  urban: 'شهری / مسکونی',
  industrial: 'صنعتی',
  riverbed: 'بستر رودخانه',
  road_rail: 'راه / راه‌آهن',
  other: 'سایر',
  unknown: 'نامشخص',
}
export const LAND_TYPES = Object.keys(LAND_TYPE_LABEL) as LandType[]

export const ROUTE_LABEL: Record<AcqRoute, string> = {
  normal: 'تحصیل عادی',
  accelerated: 'مسیر قانونی تسریع',
  dispute: 'مسیر اختلاف / بحرانی',
  art9: 'تصرف فوری (ماده ۹)',
}
export const ROUTE_HINT: Record<AcqRoute, string> = {
  normal: 'مسیر معمول: توافق با مالک و پرداخت بر اساس کارشناسی.',
  accelerated: 'استفاده از ظرفیت‌های قانونی تسریع در آزادسازی، با مجوزها و الزامات مربوط.',
  dispute: 'اختلاف، مالکیت نامشخص یا مانع جدی؛ نیازمند پیگیری ویژه.',
  art9: 'فوریت اجرای طرح به تشخیص وزیر: تصرف پیش از معامله قطعی با صورت‌مجلس، و پرداخت یا تودیع بهای عادله حداکثر ظرف ۳ ماه.',
}

export const STAGE_LABEL: Record<StageKey, string> = {
  identification: 'شناسایی زمین',
  ownership_status: 'تعیین وضعیت مالکیت',
  owner_identification: 'شناسایی مالک / متولی',
  preliminary_assessment: 'ارزیابی اولیه',
  expert_referral: 'ارجاع به کارشناسی',
  valuation: 'ارزش‌گذاری',
  financial_settlement: 'تعیین تکلیف مالی',
  payment: 'پرداخت',
  release: 'آزادسازی',
  ready_for_construction: 'آماده برای اجرا',
  art9_necessity: 'تشخیص و تأیید ضرورت و فوریت (امضای وزیر)',
  art9_minutes: 'صورت‌جلسه آزادسازی با نماینده دادستانی',
  art9_possession: 'تصرف فوری و شروع عملیات اجرایی',
  art9_payment: 'تعیین بهای عادله و پرداخت یا تودیع (ظرف ۳ ماه)',
}
export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  not_started: 'شروع نشده',
  in_progress: 'در جریان',
  done: 'انجام شد',
  blocked: 'متوقف',
  skipped: 'رد شد (لازم نیست)',
}
export const AGREEMENT_LABEL: Record<AgreementStatus, string> = {
  unknown: 'نامشخص',
  not_contacted: 'تماس گرفته نشده',
  negotiating: 'در حال مذاکره',
  agreed: 'توافق شد',
  refused: 'مخالفت',
  legal: 'پیگیری قانونی',
}
export const PAYMENT_LABEL: Record<PaymentStatus, string> = { unpaid: 'پرداخت نشده', partial: 'بخشی پرداخت شد', paid: 'پرداخت شد' }
export const DOC_STATUS_LABEL: Record<DocStatus, string> = { pending: 'در انتظار', submitted: 'ارسال شده', approved: 'تأیید شده', rejected: 'ردشده' }

export const LEVEL_LABEL: Record<CriticalityLevel, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }
export const LEVEL_LABEL_FA: Record<CriticalityLevel, string> = { low: 'کم', medium: 'متوسط', high: 'زیاد', critical: 'بحرانی' }
export const LEVEL_COLOR: Record<CriticalityLevel, string> = { low: '#22c55e', medium: '#eab308', high: '#f97316', critical: '#ef4444' }

export const FLAG_LABEL = {
  sensitive_area: 'منطقهٔ حساس',
  has_facilities: 'وجود تأسیسات / نهاد خاص',
  past_dispute: 'سابقهٔ اختلاف',
  high_value: 'ارزش بالای زمین',
  critical_for_execution: 'عبور خط از این قطعه برای اجرا حیاتی است',
  residence_livelihood: 'محل سکونت یا ممر اعاشهٔ مالک (۱۵٪ افزایش بها، تبصرهٔ ۱ ماده ۵)',
} as const

export const ACTIVITY_PRESETS: { key: string; name: string }[] = [
  { key: 'clearing', name: 'Clearing' },
  { key: 'grading', name: 'Grading' },
  { key: 'stringing', name: 'Stringing' },
  { key: 'welding', name: 'Welding' },
  { key: 'lowering', name: 'Lowering' },
  { key: 'backfilling', name: 'Backfilling' },
  { key: 'reinstatement', name: 'Reinstatement' },
]

/** One line of law per Article 9 step, shown under the step in the workflow. */
export const ART9_STEP_HINT: Partial<Record<string, string>> = {
  art9_necessity: 'ضرورت اجرای فوری طرح با ذکر دلایل موجه به تشخیص وزیر دستگاه اجرایی، به‌گونه‌ای که تأخیر موجب ضرر و زیان جبران‌ناپذیر شود.',
  art9_minutes: 'صورت‌مجلس وضع موجود ملک با حضور مالک یا نماینده او، و در غیاب او با حضور نماینده دادستان و کارشناس رسمی تنظیم می‌شود.',
  art9_possession: 'پس از صورت‌مجلس، دستگاه اجرایی پیش از معامله قطعی ملک را تصرف و عملیات اجرایی را آغاز می‌کند.',
  art9_payment: 'قیمت عادله به‌روز طبق این قانون تعیین و حداکثر ظرف سه ماه از تاریخ تصرف پرداخت یا تودیع می‌شود.',
}
