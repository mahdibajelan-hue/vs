import { isoToJalali, JALALI_MONTHS, jalaliToIso, jalaliMonthLength } from '../../../lib/jalali'

/**
 * Quarterly in-service evaluation of people working on projects. Four kinds of evidence, each with its own weight:
 * ratings from the employer (and supervisor), 360° ratings from peers and subordinates, a technical assessment, and the
 * measured results of the person's work. The score is the weighted average of the components that actually have data, so a
 * missing source lowers the stated coverage, never the person's score.
 */
export type RaterKind = 'employer' | 'supervisor' | 'peer' | 'subordinate'
export interface Weights { employer: number; supervisor: number; peers: number; subordinates: number; technical: number; results: number }
export const DEFAULT_WEIGHTS: Weights = { employer: 35, supervisor: 0, peers: 15, subordinates: 10, technical: 20, results: 20 }
export const KIND_LABEL_FA: Record<RaterKind, string> = { employer: 'کارفرما', supervisor: 'سرپرست مستقیم', peer: 'همکار', subordinate: 'زیردست' }
export const COMPONENT_LABEL_FA: Record<keyof Weights, string> = { employer: 'ارزیابی کارفرما', supervisor: 'ارزیابی سرپرست', peers: 'همکاران (۳۶۰)', subordinates: 'زیردستان (۳۶۰)', technical: 'ارزیابی تخصصی', results: 'نتایج اقدامات در پروژه' }
const KIND_TO_COMPONENT: Record<RaterKind, keyof Weights> = { employer: 'employer', supervisor: 'supervisor', peer: 'peers', subordinate: 'subordinates' }

export interface RatingRow { kind: RaterKind; rating: number }
export interface ResultItem { label: string; score: number; weight: number }
export interface ComponentScore { key: keyof Weights; label: string; score: number | null; weight: number; n: number }
export interface CycleScore { components: ComponentScore[]; final: number | null; coverage: number; missing: string[] }

const to100 = (r: number) => ((r - 1) / 4) * 100

export function cycleScore(input: { ratings: RatingRow[]; technical: number | null; results: ResultItem[]; weights?: Partial<Weights> }): CycleScore {
  const w: Weights = { ...DEFAULT_WEIGHTS, ...input.weights }
  const comps: ComponentScore[] = (Object.keys(w) as (keyof Weights)[]).map((key) => {
    let score: number | null = null, n = 0
    if (key === 'technical') { score = input.technical; n = input.technical == null ? 0 : 1 }
    else if (key === 'results') {
      const items = input.results.filter((r) => r.weight > 0)
      const tw = items.reduce((a, r) => a + r.weight, 0)
      n = items.length; score = tw > 0 ? items.reduce((a, r) => a + r.score * r.weight, 0) / tw : null
    } else {
      const rs = input.ratings.filter((r) => KIND_TO_COMPONENT[r.kind] === key)
      n = rs.length; score = n ? to100(rs.reduce((a, r) => a + r.rating, 0) / n) : null
    }
    return { key, label: COMPONENT_LABEL_FA[key], score, weight: w[key], n }
  })
  const used = comps.filter((c) => c.score != null && c.weight > 0)
  const den = used.reduce((a, c) => a + c.weight, 0)
  const total = comps.reduce((a, c) => a + c.weight, 0)
  return {
    components: comps, final: den > 0 ? Math.round(used.reduce((a, c) => a + (c.score as number) * c.weight, 0) / den) : null, coverage: total > 0 ? den / total : 0,
    missing: comps.filter((c) => c.weight > 0 && c.score == null).map((c) => c.label),
  }
}

export const BAND_FA = (score: number | null): { label: string; color: string } => score == null ? { label: 'بدون دادهٔ کافی', color: '#94a3b8' } : score >= 85 ? { label: 'عالی', color: '#34d399' } : score >= 70 ? { label: 'خوب', color: '#38bdf8' } : score >= 55 ? { label: 'نیازمند بهبود', color: '#fbbf24' } : { label: 'ضعیف', color: '#f87171' }

/** Jalali quarter containing the date: label «۱۴۰۵ — فصل ۳ (مهر تا آذر)», plus its first and last day as ISO dates. */
export function jalaliQuarter(iso: string): { label: string; start: string; end: string } {
  const j = isoToJalali(iso) ?? { jy: 1404, jm: 1, jd: 1 }
  const q = Math.floor((j.jm - 1) / 3), m0 = q * 3 + 1, m2 = m0 + 2
  const fa = (n: number) => n.toLocaleString('fa-IR', { useGrouping: false })
  return { label: `${fa(j.jy)}-فصل ${fa(q + 1)} (${JALALI_MONTHS[m0 - 1]} تا ${JALALI_MONTHS[m2 - 1]})`, start: jalaliToIso(j.jy, m0, 1), end: jalaliToIso(j.jy, m2, jalaliMonthLength(j.jy, m2)) }
}
