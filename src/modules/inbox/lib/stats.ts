import { KIND_META, type InboxGroup, type InboxItem, type InboxSource } from '../types'
import { bucketOf, type DueBucket } from './model'

export type { DueBucket }
export const BUCKET_LABEL_FA: Record<DueBucket, string> = { overdue: 'دیرکرد', today: 'امروز', soon: '۱ تا ۳ روز', week: '۴ تا ۷ روز', later: 'بعد از هفته', none: 'بدون مهلت' }
export const BUCKETS: DueBucket[] = ['overdue', 'today', 'soon', 'week', 'later', 'none']
export { bucketOf }

export type AgeBucket = 'fresh' | 'days' | 'week' | 'old'
export const AGE_LABEL_FA: Record<AgeBucket, string> = { fresh: 'امروز', days: '۱ تا ۳ روز', week: '۴ تا ۷ روز', old: 'بیش از هفته' }
export const AGES: AgeBucket[] = ['fresh', 'days', 'week', 'old']
export function ageOf(since: string, now = Date.now()): AgeBucket {
  const d = Math.floor((now - Date.parse(since)) / 86400000)
  return d <= 0 ? 'fresh' : d <= 3 ? 'days' : d <= 7 ? 'week' : 'old'
}

export interface InboxStats {
  total: number
  urgent: number
  bySource: [InboxSource, number][]
  byGroup: Record<InboxGroup, number>
  byBucket: Record<DueBucket, number>
  byAge: Record<AgeBucket, number>
  /** share of items that are not urgent or overdue, 0–100 (100 for an empty inbox) */
  health: number
}

export function computeStats(items: InboxItem[], now = Date.now()): InboxStats {
  const src = new Map<InboxSource, number>()
  const byGroup: Record<InboxGroup, number> = { decide: 0, do: 0, fix: 0 }
  const byBucket = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<DueBucket, number>
  const byAge = Object.fromEntries(AGES.map((b) => [b, 0])) as Record<AgeBucket, number>
  let urgent = 0
  for (const i of items) {
    src.set(i.source, (src.get(i.source) ?? 0) + 1)
    byGroup[KIND_META[i.kind].group] += 1
    byBucket[bucketOf(i.due, now)] += 1
    byAge[ageOf(i.since, now)] += 1
    if (i.urgent) urgent += 1
  }
  return { total: items.length, urgent, bySource: [...src.entries()].sort((a, b) => b[1] - a[1]), byGroup, byBucket, byAge, health: items.length ? Math.round(((items.length - urgent) / items.length) * 100) : 100 }
}

/** A face for the state of the inbox — used as the mascot of the header, the banner and the empty states. */
export function mood(s: Pick<InboxStats, 'total' | 'urgent'>): { face: string; text: string } {
  if (s.total === 0) return { face: '🥳', text: 'همه‌چیز انجام شده؛ کار بازی ندارید' }
  if (s.urgent === 0) return { face: '😊', text: 'کارها سر وقت است' }
  if (s.urgent <= 3) return { face: '🙂', text: 'چند کار فوری منتظر شماست' }
  if (s.urgent <= 8) return { face: '😅', text: 'کارهای فوری زیاد شده' }
  return { face: '😰', text: 'کارتابل شما فشرده است' }
}
