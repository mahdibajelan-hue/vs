import type { MissionDiscipline } from '../types'

/** What the visitor does for a living on the project — decides which topics and questions the interview opens with. */
export const DISCIPLINE_LABEL: Record<MissionDiscipline, string> = {
  general: 'مدیریت و اجرایی پروژه',
  hse: 'ایمنی، بهداشت و محیط‌زیست (HSE)',
  legal: 'حقوقی و قراردادها',
  quality: 'کنترل و تضمین کیفیت',
  engineering: 'مهندسی و طراحی',
  procurement: 'بازرگانی، خرید و تأمین',
  finance: 'مالی و کنترل هزینه',
  planning: 'برنامه‌ریزی و کنترل پروژه',
  hr_admin: 'منابع انسانی و اداری',
}

export const DISCIPLINE_HINT: Record<MissionDiscipline, string> = {
  general: 'پیشرفت، اجرا و هماهنگی کلی — همه موضوع‌های اصلی پرسیده می‌شود.',
  hse: 'سؤال‌ها روی ایمنی، حوادث، مجوزها و آمادگی اضطراری متمرکز می‌شود؛ پیشرفت اجرایی پرسیده نمی‌شود.',
  legal: 'سؤال‌ها روی قرارداد، ادعاها، دعاوی، ضمانت‌نامه‌ها و تطبیق با قوانین متمرکز می‌شود.',
  quality: 'سؤال‌ها روی بازرسی‌ها، عدم‌انطباق‌ها، ITP و مستندات کیفی متمرکز می‌شود.',
  engineering: 'سؤال‌ها روی مدارک مهندسی، تأییدیه‌ها و تغییرات طراحی متمرکز می‌شود.',
  procurement: 'سؤال‌ها روی سفارش‌ها، سازندگان، حمل و ترخیص متمرکز می‌شود.',
  finance: 'سؤال‌ها روی صورت‌وضعیت‌ها، پرداخت‌ها، جریان نقدی و هزینه‌ها متمرکز می‌شود.',
  planning: 'سؤال‌ها روی برنامه زمانی، مسیر بحرانی و انحراف‌ها متمرکز می‌شود.',
  hr_admin: 'سؤال‌ها روی نیروی انسانی، اسکان، پشتیبانی و امور اداری متمرکز می‌شود.',
}

const RULES: [MissionDiscipline, RegExp][] = [
  ['hse', /ایمنی|hse|بهداشت|محیط ?زیست|safety/i],
  ['legal', /حقوق|قرارداد|وکیل|دعاو|legal|contract/i],
  ['quality', /کیفیت|بازرس|qa|qc|کنترل کیفی|quality/i],
  ['finance', /مالی|حسابدار|هزینه|بودجه|خزانه|finance|cost/i],
  ['procurement', /بازرگانی|خرید|تدارکات|تأمین|تامین|procurement|expedit/i],
  ['engineering', /مهندسی|طراح|پایپینگ|process|engineering|design/i],
  ['planning', /برنامه ?ریز|کنترل پروژه|planning|pmo|زمان ?بندی/i],
  ['hr_admin', /منابع انسانی|اداری|پرسنل|hr\b|اسکان|پشتیبانی/i],
]

/** Best guess of the visitor's discipline from the job title on the profile; «general» when nothing matches. */
export function guessDiscipline(position: string | undefined | null): MissionDiscipline {
  const p = position ?? ''
  for (const [d, re] of RULES) if (re.test(p)) return d
  return 'general'
}
