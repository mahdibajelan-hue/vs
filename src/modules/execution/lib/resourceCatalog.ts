import type { ReportResource } from '../types'

/** Default manpower / machinery lists grouped by work section (قسمت), modelled on the contractor's daily report sheet. Projects add rows per report. */
export interface ResSection { section: string; items: string[] }

export const MAN_CATALOG: ResSection[] = [
  { section: 'ستادی و پشتیبانی (پیمانکار اجرایی)', items: ['رئیس کارگاه', 'جانشین رئیس کارگاه', 'سرپرست اجرا', 'کنترل پروژه', 'سرپرست دفتر فنی', 'کارشناس دفتر فنی', 'کارشناس سیویل', 'سرپرست QC', 'بازرگانی و مالی و حقوقی', 'انباردار و کمک', 'تدارکات', 'اداری', 'ماشین‌آلات', 'سرپرست HSE', 'کارشناس HSE', 'افسر HSE', 'بهیار', 'راننده سبک', 'آبدارچی', 'آشپز و کمک آشپز', 'نگهبان', 'مکانیک و سرویس‌کار', 'خدمات', 'کمپ‌پاس', 'راننده جرثقیل'] },
  { section: 'کارفرما و نظارت', items: ['مسئول دفتر', 'راننده سبک', 'آبدارچی', 'کمپ‌پاس', 'آشپز'] },
  { section: 'نقشه‌برداری', items: ['سرپرست نقشه‌بردار', 'نقشه‌بردار', 'کمک نقشه‌بردار', 'راننده سبک'] },
  { section: 'مسیرسازی – تسطیح و کلاژ مسیر', items: ['کارشناس اجرا', 'گریدرچی', 'بولدوزرچی', 'راننده بیل مکانیکی', 'راننده لودر', 'راننده سبک'] },
  { section: 'بارگیری، حمل، دپو و ریسه لوله', items: ['راننده سایدبوم', 'راننده تریلی', 'کارگر ریسه', 'ریگر', 'QC', 'راننده تراکتور', 'راننده جرثقیل', 'راننده سبک'] },
  { section: 'جوشکاری و خمکاری – کانکشن – اتصال نهایی', items: ['سرپرست جوشکاری', 'جوشکار', 'کمک جوشکار', 'فیتر', 'راننده سایدبوم', 'برقکار', 'کمک فیتر', 'کارگر ساده', 'QC', 'راننده لودر', 'راننده پی‌ولدر', 'کمپرسورچی', 'آشیز و کمک آشیز', 'اپراتور بند زن', 'کمک بند زن', 'راننده بیل مکانیکی', 'نگهبان', 'راننده سبک'] },
  { section: 'حفاری کانال', items: ['کارشناس اجرا', 'راننده بیل مکانیکی', 'راننده چکش هیدرولیکی', 'راننده سبک', 'کارگر ساده'] },
  { section: 'رادیوگرافی', items: ['سرپرست رادیوگرافی', 'رادیوگرافر', 'کمک رادیوگرافر', 'منشی فیلم‌خوانی'] },
  { section: 'سندبلاست، عایق‌کاری و رنگ‌آمیزی', items: ['سرپرست عایق‌کاری', 'عایق‌کار', 'کمک عایق‌کار', 'اپراتور سندبلاست', 'کمک سندبلاست‌کار', 'کمپرسورچی', 'راننده سایدبوم', 'QC'] },
  { section: 'خاک سرندی، بکفیل و گرده‌ماهی', items: ['کارشناس اجرا', 'راننده بیل مکانیکی', 'راننده لودر', 'راننده کامیون', 'راننده سبک', 'کارگر ساده'] },
  { section: 'لوله‌گذاری و فیبر نوری', items: ['سرپرست لوله‌گذاری', 'راننده سایدبوم', 'کارگر ساده', 'راننده بیل مکانیکی', 'کارگر فیبر نوری'] },
  { section: 'اجرای CCW و عبور از موانع', items: ['آرماتوربند', 'قالب‌بند', 'بتن‌ریز', 'راننده بیل مکانیکی', 'راننده جرثقیل'] },
  { section: 'تست هیدرواستاتیک', items: ['سرپرست تست', 'تکنسین تست', 'راننده بیل مکانیکی', 'کارگر ساده'] },
  { section: 'سیویل و مکانیکال ایستگاه', items: ['سرپرست اجرا', 'استادکار / بنا', 'آرماتوربند', 'قالب‌بند', 'بتن‌ریز', 'جوشکار', 'فیتر', 'کارگر ساده', 'راننده جرثقیل'] },
]

export const EQUIP_CATALOG: ResSection[] = [
  { section: 'ستادی و پشتیبانی', items: ['خودرو دو دیفرانسیل', 'خودرو سواری و وانت', 'آمبولانس', 'خوابگاه', 'دفتر', 'کانکس ۶، ۱۲، ۷۲ متری', 'کامپیوتر', 'دستگاه کپی', 'پرینتر', 'تراکتور', 'مینی‌بوس', 'کامیون', 'تانکر سوخت', 'جرثقیل ۱۰ تن', 'جرثقیل ۳ تن', 'تانکر آب‌پاش', 'بنز ۹۱۱ کارواش'] },
  { section: 'نقشه‌برداری', items: ['خودرو دو دیفرانسیل', 'دوربین نقشه‌برداری', 'GPS'] },
  { section: 'مسیرسازی – تسطیح و کلاژ مسیر', items: ['گریدر', 'بلدوزر', 'بیل مکانیکی', 'خودرو دو دیفرانسیل', 'دستگاه لودر'] },
  { section: 'بارگیری، حمل، دپو و ریسه لوله', items: ['ساید بوم', 'تریلی حمل لوله', 'جرثقیل', 'لودر', 'تراکتور'] },
  { section: 'جوشکاری و خمکاری – کانکشن – اتصال نهایی', items: ['ساید بوم D8', 'ساید بوم بومار TD25', 'کف‌جوش پرکینز ۶ سیلندر', 'کف‌جوش کامینز ۶ سیلندر', 'رکتی‌فایر', 'کپسول هوا', 'بول ماشین', 'کپسول گاز', 'ژنراتور ۱۵۰', 'پی‌ولدر', 'سرپیک برش', 'سرپیک گرمکن', 'خودرو دو دیفرانسیل', 'خودرو سواری و وانت', 'بیل مکانیکی', 'مینی‌بوس', 'کفی کمرشکن', 'آون'] },
  { section: 'حفاری کانال', items: ['بیل مکانیکی', 'چکش هیدرولیکی', 'کمپرسی', 'خودرو دو دیفرانسیل'] },
  { section: 'رادیوگرافی', items: ['کراولر', 'چشمهٔ رادیوگرافی', 'چاه سورس', 'کالیبر – رادیومتر – TDL', 'خودرو دو دیفرانسیل'] },
  { section: 'سندبلاست، عایق‌کاری و رنگ‌آمیزی', items: ['ساید بوم کاترپیلار', 'دیگ و مخزن ماسه‌پاشی', 'دستگاه سندبلاست', 'نازل سندبلاست', 'هالیدی', 'کمپرسور'] },
  { section: 'خاک سرندی، بکفیل و گرده‌ماهی', items: ['بیل مکانیکی', 'لودر', 'کمپرسی', 'دستگاه سرند'] },
  { section: 'تست هیدرواستاتیک', items: ['تست‌پمپ', 'کمپرسور ۹۰۰', 'خودرو دو دیفرانسیل', 'فشارسنج وزنه‌ای', 'فشارسنج عقربه‌ای', 'ثبات فشار', 'ثبات دما', 'تانکر آب', 'فیلینگ پمپ', 'بیل مکانیکی'] },
  { section: 'سیویل و مکانیکال ایستگاه', items: ['جرثقیل', 'بیل مکانیکی', 'ژنراتور', 'کمپرسور', 'ویبراتور', 'موتور برق جوشکاری'] },
]

export const MAN_COLS = [['totalQty', 'تعداد کل'], ['activeQty', 'فعال'], ['leaveQty', 'مرخصی'], ['stoppedQty', 'متوقف'], ['nativeQty', 'بومی'], ['nonnativeQty', 'غیربومی']] as const
export const EQUIP_COLS = [['totalQty', 'تعداد کل'], ['activeQty', 'فعال'], ['idleQty', 'غیرفعال'], ['stoppedQty', 'متوقف'], ['repairQty', 'تعمیر']] as const
export type ResField = 'totalQty' | 'activeQty' | 'idleQty' | 'leaveQty' | 'stoppedQty' | 'nativeQty' | 'nonnativeQty' | 'repairQty'
export type ResRow = Pick<ReportResource, 'kind' | 'section' | 'name' | 'hours' | 'note'> & Record<ResField, number>

export const blankRes = (kind: 'man' | 'equip', section: string, name: string): ResRow => ({ kind, section, name, totalQty: 0, activeQty: 0, idleQty: 0, leaveQty: 0, stoppedQty: 0, nativeQty: 0, nonnativeQty: 0, repairQty: 0, hours: 0, note: '' })
export const catalogRows = (): ResRow[] => [
  ...MAN_CATALOG.flatMap((s) => s.items.map((n) => blankRes('man', s.section, n))),
  ...EQUIP_CATALOG.flatMap((s) => s.items.map((n) => blankRes('equip', s.section, n))),
]
export const resUsed = (r: ResRow) => r.totalQty > 0 || r.activeQty > 0 || r.idleQty > 0 || r.leaveQty > 0 || r.stoppedQty > 0 || r.repairQty > 0 || r.nativeQty > 0 || r.nonnativeQty > 0 || r.hours > 0

/** Internal consistency of one row: the parts must not exceed the total; manpower split native/non-native must match the total. */
export function resProblem(r: ResRow): string {
  if (r.kind === 'man') {
    const parts = r.activeQty + r.leaveQty + r.stoppedQty
    if (parts > r.totalQty + 1e-9) return 'مجموع فعال، مرخصی و متوقف از تعداد کل بیشتر است'
    if ((r.nativeQty || r.nonnativeQty) && r.nativeQty + r.nonnativeQty !== r.totalQty) return 'بومی + غیربومی باید برابر تعداد کل باشد'
  } else if (r.activeQty + r.idleQty + r.stoppedQty + r.repairQty > r.totalQty + 1e-9) return 'مجموع فعال، غیرفعال، متوقف و تعمیر از تعداد کل بیشتر است'
  return ''
}

export const toRow = (x: ReportResource): ResRow => ({ kind: x.kind, section: x.section, name: x.name, totalQty: x.totalQty, activeQty: x.activeQty, idleQty: x.idleQty, leaveQty: x.leaveQty, stoppedQty: x.stoppedQty, nativeQty: x.nativeQty, nonnativeQty: x.nonnativeQty, repairQty: x.repairQty, hours: x.hours, note: x.note })

/** Catalog rows merged with the saved ones (saved values win; saved rows that are not in the catalog are kept). */
export function mergeCatalog(saved: ResRow[]): ResRow[] {
  const key = (r: Pick<ResRow, 'kind' | 'section' | 'name'>) => `${r.kind}|${r.section}|${r.name}`
  const m = new Map(saved.map((r) => [key(r), r]))
  const out = catalogRows().map((c) => { const s = m.get(key(c)); m.delete(key(c)); return s ?? c })
  return [...out, ...m.values()]
}
