/**
 * ارزش غذایی تقریبی هر وعده — one camp serving (a plate of rice ≈ 250 g cooked, a stew ladle, one bread).
 * Figures are rounded values from common Iranian food-composition tables; they are guides for planning, not lab values.
 */
import type { MenuItem } from './svMenu'

export interface Nutri { kcal: number; protein: number; carbs: number; fat: number }
const n = (kcal: number, protein: number, carbs: number, fat: number): Nutri => ({ kcal, protein, carbs, fat })
const ZERO = n(0, 0, 0, 0)

/** main dishes, breakfasts, desserts and fruits by their exact catalog name */
export const NUTRITION: Record<string, Nutri> = {
  'چلوکباب کوبیده': n(850, 38, 85, 38), 'جوجه‌کباب با برنج': n(720, 42, 85, 20), 'زرشک‌پلو با مرغ': n(780, 40, 95, 24),
  'قورمه‌سبزی با برنج': n(720, 28, 88, 27), 'قیمه با برنج': n(760, 28, 98, 26), 'خورش بادمجان با برنج': n(740, 26, 90, 30),
  'باقالی‌پلو با گوشت': n(850, 40, 98, 30), 'لوبیاپلو': n(680, 26, 95, 20), 'عدس‌پلو': n(620, 20, 100, 14),
  'ماهی قزل‌آلا با سبزی‌پلو': n(700, 38, 85, 22), 'ماهی سفید سرخ‌شده با کته': n(740, 34, 82, 30), 'استانبولی‌پلو': n(640, 20, 98, 18),
  'آبگوشت': n(620, 32, 40, 34), 'کشک بادمجان': n(420, 14, 30, 28), 'کوکوسبزی': n(380, 16, 12, 30), 'کوکوسیب‌زمینی': n(420, 12, 40, 24),
  'املت گوجه‌فرنگی': n(300, 15, 12, 21), 'عدسی': n(320, 18, 50, 5), 'آش رشته': n(380, 15, 62, 9), 'سوپ جو با مرغ': n(260, 16, 32, 7),
  'ماکارونی با گوشت': n(720, 30, 92, 24), 'کتلت': n(520, 24, 34, 32), 'الویه': n(480, 16, 30, 33), 'میرزاقاسمی': n(280, 10, 18, 19),
  // breakfasts (bread included where named)
  'نان، پنیر، گردو و چای': n(480, 18, 48, 24), 'نیمرو، نان و چای': n(450, 18, 46, 21), 'حلیم و چای': n(420, 22, 55, 12),
  'عدسی و نان': n(520, 26, 92, 6), 'کره، مربا، نان و چای': n(520, 8, 80, 18), 'خامه، عسل، نان و چای': n(580, 8, 78, 26),
  'املت، نان و چای': n(480, 17, 52, 22), 'تخم‌مرغ آب‌پز، پنیر و چای': n(300, 22, 4, 22), 'نان، پنیر، خیار، گوجه و چای': n(420, 16, 52, 16),
  // desserts
  'ژله': n(90, 2, 20, 0), 'فرنی': n(180, 5, 30, 4), 'شیربرنج': n(200, 5, 35, 4), 'ماست میوه‌ای': n(120, 5, 18, 3), 'شله‌زرد': n(220, 3, 45, 4),
  'کرم‌کارامل': n(180, 5, 28, 5), 'دوغ': n(70, 4, 6, 3), 'سالاد میوه': n(110, 1, 26, 0), 'بستنی': n(210, 4, 24, 11),
  // fruit, one serving
  'توت‌فرنگی': n(45, 1, 11, 0), 'گیلاس': n(75, 1, 18, 0), 'زردآلو': n(50, 1, 12, 0), 'خیار': n(15, 1, 3, 0), 'موز': n(105, 1, 27, 0),
  'هندوانه': n(85, 2, 21, 0), 'طالبی': n(55, 1, 13, 0), 'هلو': n(60, 1, 15, 0), 'انگور': n(100, 1, 26, 0), 'شلیل': n(60, 1, 14, 0),
  'سیب': n(95, 0, 25, 0), 'انار': n(105, 2, 26, 1), 'خرمالو': n(120, 1, 31, 0), 'پرتقال': n(70, 1, 17, 0), 'نارنگی': n(50, 1, 12, 0), 'کیوی': n(45, 1, 11, 0),
}

/** a side is free text («نان، ماست و گوجه»): each recognised part counts once */
const SIDE_PARTS: [RegExp, Nutri][] = [
  [/نان/, n(230, 8, 46, 2)], [/ماست/, n(100, 6, 8, 5)], [/سالاد/, n(65, 1, 8, 4)], [/گوجه/, n(25, 1, 5, 0)],
  [/خیارشور|ترشی/, n(20, 0, 4, 0)], [/سبزی/, n(20, 1, 4, 0)], [/پیاز/, n(20, 0, 5, 0)], [/(^|[\s،])خیار(?!شور)/, n(15, 1, 3, 0)],
]
/** dishes typed by hand: a rough figure by kind, so the day total stays meaningful */
const GUESS: [RegExp, Nutri][] = [
  [/کباب/, n(780, 38, 80, 32)], [/ماهی|میگو/, n(680, 34, 80, 24)], [/پلو|چلو|برنج|کته/, n(700, 26, 92, 22)], [/ماکارونی|لازانیا|پاستا/, n(700, 28, 90, 24)],
  [/آش|سوپ|حلیم|عدسی/, n(340, 15, 52, 8)], [/کوکو|املت|نیمرو|تخم/, n(360, 16, 15, 26)], [/ساندویچ|الویه|کتلت|شامی/, n(520, 22, 40, 30)],
  [/نان/, n(420, 15, 52, 16)],
]

const add = (a: Nutri, b: Nutri): Nutri => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat })
const lookup = (name: string, guess = true): Nutri | null => {
  const k = name.trim()
  if (!k) return ZERO
  if (NUTRITION[k]) return NUTRITION[k]
  if (!guess) return null
  return GUESS.find(([re]) => re.test(k))?.[1] ?? null
}
export function sideNutrition(side: string): Nutri {
  return SIDE_PARTS.filter(([re]) => re.test(side)).reduce((s, [, v]) => add(s, v), ZERO)
}

export interface MealNutri extends Nutri {
  /** false when a part could not be recognised (its energy is missing from the total) */
  complete: boolean
  /** true when the main dish figure is a guess by kind (typed by hand) */
  estimated: boolean
}

/** One meal: main + side + dessert + fruit. An empty meal is all zero. */
export function mealNutrition(m: Pick<MenuItem, 'main' | 'side' | 'dessert' | 'fruit'>): MealNutri {
  let total = ZERO, complete = true, estimated = false
  if (m.main.trim()) {
    const exact = lookup(m.main, false)
    const v = exact ?? lookup(m.main)
    if (!exact) estimated = true
    if (v) total = add(total, v); else complete = false
  }
  total = add(total, sideNutrition(m.side))
  for (const x of [m.dessert, m.fruit]) {
    if (!x.trim()) continue
    const v = lookup(x, false)
    if (v) total = add(total, v); else complete = false
  }
  return { ...total, complete, estimated }
}

export function sumNutri(list: Nutri[]): Nutri { return list.reduce(add, ZERO) }

/** daily energy for supervisors (moderately active site work), kcal */
export const DAY_TARGET = { low: 2000, high: 3000, mid: 2500 }
export const dayLevel = (kcal: number): 'low' | 'ok' | 'high' => (kcal < DAY_TARGET.low ? 'low' : kcal > DAY_TARGET.high ? 'high' : 'ok')

/** share of energy from protein / carbs / fat (4 / 4 / 9 kcal per gram), in % */
export function energySplit(x: Nutri): { protein: number; carbs: number; fat: number } {
  const p = x.protein * 4, c = x.carbs * 4, f = x.fat * 9, t = p + c + f
  if (!t) return { protein: 0, carbs: 0, fat: 0 }
  return { protein: Math.round((p / t) * 100), carbs: Math.round((c / t) * 100), fat: Math.round((f / t) * 100) }
}
