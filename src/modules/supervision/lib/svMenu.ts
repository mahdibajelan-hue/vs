/**
 * منوی غذای ناظران — a balanced weekly plan (Iranian site-camp dishes) and the satisfaction figures behind the alarms.
 * Pure: no React, no database.
 */

export type Meal = 'breakfast' | 'lunch' | 'dinner'
export type Protein = 'chicken' | 'beef' | 'lamb' | 'fish' | 'egg' | 'legume' | 'veg'

export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner']
export const MEAL_FA: Record<Meal, string> = { breakfast: 'صبحانه', lunch: 'ناهار', dinner: 'شام' }

export interface Dish { name: string; protein: Protein; side: string; /** heavy dishes (polo, khoresh) suit lunch, lighter ones dinner */ meals: Meal[] }

export const DISHES: Dish[] = [
  { name: 'چلوکباب کوبیده', protein: 'beef', side: 'گوجه کبابی و ماست', meals: ['lunch', 'dinner'] },
  { name: 'جوجه‌کباب با برنج', protein: 'chicken', side: 'سالاد شیرازی', meals: ['lunch', 'dinner'] },
  { name: 'زرشک‌پلو با مرغ', protein: 'chicken', side: 'ماست و خیار', meals: ['lunch'] },
  { name: 'قورمه‌سبزی با برنج', protein: 'beef', side: 'سالاد فصل', meals: ['lunch'] },
  { name: 'قیمه با برنج', protein: 'beef', side: 'ترشی', meals: ['lunch'] },
  { name: 'خورش بادمجان با برنج', protein: 'lamb', side: 'سبزی خوردن', meals: ['lunch'] },
  { name: 'باقالی‌پلو با گوشت', protein: 'lamb', side: 'ماست', meals: ['lunch'] },
  { name: 'لوبیاپلو', protein: 'beef', side: 'ماست و خیار', meals: ['lunch', 'dinner'] },
  { name: 'عدس‌پلو', protein: 'legume', side: 'ماست', meals: ['lunch', 'dinner'] },
  { name: 'ماهی قزل‌آلا با سبزی‌پلو', protein: 'fish', side: 'لیمو و سالاد', meals: ['lunch'] },
  { name: 'ماهی سفید سرخ‌شده با کته', protein: 'fish', side: 'سالاد فصل', meals: ['lunch', 'dinner'] },
  { name: 'استانبولی‌پلو', protein: 'beef', side: 'سالاد شیرازی', meals: ['lunch', 'dinner'] },
  { name: 'آبگوشت', protein: 'lamb', side: 'نان سنگک و سبزی', meals: ['lunch'] },
  { name: 'کشک بادمجان', protein: 'veg', side: 'نان و سبزی', meals: ['dinner'] },
  { name: 'کوکوسبزی', protein: 'egg', side: 'نان، ماست و گوجه', meals: ['dinner'] },
  { name: 'کوکوسیب‌زمینی', protein: 'egg', side: 'نان و خیارشور', meals: ['dinner'] },
  { name: 'املت گوجه‌فرنگی', protein: 'egg', side: 'نان و سبزی', meals: ['dinner'] },
  { name: 'عدسی', protein: 'legume', side: 'نان و پیاز', meals: ['dinner'] },
  { name: 'آش رشته', protein: 'legume', side: 'نان', meals: ['dinner'] },
  { name: 'سوپ جو با مرغ', protein: 'chicken', side: 'نان و لیمو', meals: ['dinner'] },
  { name: 'ماکارونی با گوشت', protein: 'beef', side: 'سالاد فصل', meals: ['lunch', 'dinner'] },
  { name: 'کتلت', protein: 'beef', side: 'نان، گوجه و خیارشور', meals: ['dinner'] },
  { name: 'الویه', protein: 'chicken', side: 'نان و خیارشور', meals: ['dinner'] },
  { name: 'میرزاقاسمی', protein: 'veg', side: 'نان و سیر', meals: ['dinner'] },
]

export const BREAKFASTS = ['نان، پنیر، گردو و چای', 'نیمرو، نان و چای', 'حلیم و چای', 'عدسی و نان', 'کره، مربا، نان و چای', 'خامه، عسل، نان و چای', 'املت، نان و چای', 'تخم‌مرغ آب‌پز، پنیر و چای', 'نان، پنیر، خیار، گوجه و چای']
export const DESSERTS = ['ژله', 'فرنی', 'شیربرنج', 'ماست میوه‌ای', 'شله‌زرد', 'کرم‌کارامل', 'دوغ', 'سالاد میوه', 'بستنی']
/** fruit by Jalali season (1 spring … 4 winter) */
export const FRUITS: Record<1 | 2 | 3 | 4, string[]> = {
  1: ['توت‌فرنگی', 'گیلاس', 'زردآلو', 'خیار', 'موز'],
  2: ['هندوانه', 'طالبی', 'هلو', 'انگور', 'شلیل'],
  3: ['سیب', 'انار', 'خرمالو', 'انگور', 'پرتقال'],
  4: ['پرتقال', 'نارنگی', 'سیب', 'کیوی', 'موز'],
}
export const seasonOf = (jm: number): 1 | 2 | 3 | 4 => (Math.min(4, Math.max(1, Math.ceil(jm / 3))) as 1 | 2 | 3 | 4)

export interface MenuItem { day: string; meal: Meal; main: string; side: string; dessert: string; fruit: string }

/** small deterministic RNG so «پیشنهاد هفته» gives the same plan for the same week */
function rng(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000 }
}
const shuffle = <T,>(a: T[], r: () => number) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]] } return x }
const RED: Protein[] = ['beef', 'lamb']

/**
 * A week's menu: three meals a day, lunch with a dessert and dinner with seasonal fruit.
 * Rules: no main dish twice in the week; fish at least once (lunch); red meat at most `redMax` times; never the same
 * protein two meals in a row; at least two light (egg / legume / vegetable) dinners; dishes in `avoid` (low satisfaction) are left out.
 */
export function planWeek(days: string[], opts: { jm: number; avoid?: Iterable<string>; seed?: string; redMax?: number } ): MenuItem[] {
  const r = rng(opts.seed ?? days.join())
  const avoid = new Set(opts.avoid ?? [])
  const redMax = opts.redMax ?? Math.ceil(days.length * 0.6)
  const pool = DISHES.filter((d) => !avoid.has(d.name))
  const used = new Set<string>()
  let red = 0, light = 0, fish = 0
  let last: Protein | null = null
  const fruits = shuffle(FRUITS[seasonOf(opts.jm)], r), desserts = shuffle(DESSERTS.filter((d) => !avoid.has(d)), r), breakfasts = shuffle(BREAKFASTS.filter((b) => !avoid.has(b)), r)
  const out: MenuItem[] = []
  // the fish day: a lunch in the middle of the week
  const fishAt = Math.min(days.length - 1, Math.floor(days.length / 2))
  const pick = (meal: Meal, dayIdx: number): Dish | null => {
    const left = days.length - dayIdx
    let cand = pool.filter((d) => d.meals.includes(meal) && !used.has(d.name) && d.protein !== last)
    if (meal === 'lunch' && dayIdx === fishAt && fish === 0) { const f = cand.filter((d) => d.protein === 'fish'); if (f.length) cand = f }
    if (red >= redMax) cand = cand.filter((d) => !RED.includes(d.protein))
    if (meal === 'dinner' && light < 2 && left <= 2 - light) { const l = cand.filter((d) => ['egg', 'legume', 'veg'].includes(d.protein)); if (l.length) cand = l }
    if (!cand.length) cand = pool.filter((d) => d.meals.includes(meal) && d.protein !== last)
    if (!cand.length) cand = pool.filter((d) => d.meals.includes(meal))
    if (!cand.length) return null
    return cand[Math.floor(r() * cand.length)]
  }
  days.forEach((day, i) => {
    out.push({ day, meal: 'breakfast', main: breakfasts[i % breakfasts.length] ?? '', side: '', dessert: '', fruit: '' })
    for (const meal of ['lunch', 'dinner'] as Meal[]) {
      const d = pick(meal, i)
      if (!d) { out.push({ day, meal, main: '', side: '', dessert: '', fruit: '' }); continue }
      used.add(d.name); last = d.protein
      if (RED.includes(d.protein)) red++
      if (d.protein === 'fish') fish++
      if (meal === 'dinner' && ['egg', 'legume', 'veg'].includes(d.protein)) light++
      out.push({ day, meal, main: d.name, side: d.side, dessert: meal === 'lunch' ? desserts[i % desserts.length] ?? '' : '', fruit: meal === 'dinner' ? fruits[i % fruits.length] ?? '' : '' })
    }
  })
  return out
}

// ── satisfaction ─────────────────────────────────────────────────────────────

/** 1 … 5 */
export const FACES = ['😞', '🙁', '😐', '🙂', '😋'] as const
export const FACE_FA = ['خیلی بد', 'بد', 'معمولی', 'خوب', 'عالی'] as const
export const faceFor = (avg: number) => FACES[Math.min(4, Math.max(0, Math.round(avg) - 1))]

/** same thresholds as the server alarm (my_supervision_notifications) */
export const LOW_DISH_AVG = 2.5
export const LOW_DISH_MIN = 3
export const LOW_COOK_AVG = 3
export const LOW_COOK_MIN = 10

export interface Rating { menuId: string; score: number }
export interface DishScore { dish: string; avg: number; n: number; low: boolean }

/** Average per main dish over the menus given (only rated dishes), lowest first. */
export function dishScores(menus: { id: string; main: string }[], ratings: Rating[]): DishScore[] {
  const main = new Map(menus.map((m) => [m.id, m.main]))
  const acc = new Map<string, { sum: number; n: number }>()
  for (const x of ratings) {
    const d = main.get(x.menuId)
    if (!d) continue
    const a = acc.get(d) ?? { sum: 0, n: 0 }
    a.sum += x.score; a.n++
    acc.set(d, a)
  }
  return [...acc].map(([dish, a]) => ({ dish, avg: a.sum / a.n, n: a.n, low: a.n >= LOW_DISH_MIN && a.sum / a.n <= LOW_DISH_AVG })).sort((a, b) => a.avg - b.avg || b.n - a.n)
}

/** Overall average of a set of ratings (e.g. the cook team's last two weeks) and whether it calls for a change. */
export function overall(ratings: Rating[]): { avg: number; n: number; low: boolean } {
  const n = ratings.length
  const avg = n ? ratings.reduce((s, x) => s + x.score, 0) / n : 0
  return { avg, n, low: n >= LOW_COOK_MIN && avg <= LOW_COOK_AVG }
}
