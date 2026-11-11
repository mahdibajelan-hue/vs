import type { ModuleKey } from '../../../store/useModuleStore'
import { HEALTH_DIMENSION_LABEL_FA } from '../../../modules/lifecycle/types'
import type { RadarData, RadarSignal, SignalCategory, SignalSeverity } from './radarTypes'

/**
 * The radar's executive brief: the few facts that set the project's status today, in the order a sponsor would want
 * them, each pointing at the module where it is acted on. Pure — computed from the radar's own live figures, so the
 * desktop cockpit and the phone radar say the same thing.
 */
export type BriefTone = 'bad' | 'warn' | 'ok'
export interface BriefItem { key: string; tone: BriefTone; title: string; detail: string; module: ModuleKey | null }

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: d })
const DAY = 86_400_000

/** days past due (positive) or left (negative); null without a date */
export function daysOverdue(due: string | null | undefined, today: string): number | null {
  if (!due) return null
  const d = Date.parse(due.slice(0, 10)), t = Date.parse(today)
  if (!Number.isFinite(d) || !Number.isFinite(t)) return null
  return Math.round((t - d) / DAY)
}

/** open items with a deadline that has passed (issues; milestones are upcoming by construction) */
export const isOverdue = (s: RadarSignal, today: string) => s.category !== 'milestone' && (daysOverdue(s.due, today) ?? 0) > 0

export function radarBrief(data: RadarData, today: string): BriefItem[] {
  if (!data.live) return []
  const out: (BriefItem & { rank: number })[] = []
  const k = data.kpi, hd = data.healthDetail

  // time: the forecast finish against the contract is what a sponsor asks first
  const s = data.schedule
  const late = s ? (s.contractorDelay ?? s.baselineSlip ?? 0) : 0
  if (late > 0) out.push({ key: 'finish', rank: late > 30 ? 0 : 2, tone: late > 30 ? 'bad' : 'warn', title: `پایان ${fa(late)} روز دیرتر`, detail: s?.contractorDelay != null ? 'از تاریخ قرارداد' : 'از خط مبنا', module: 'scheduling' })
  else if (k.spi && k.spi < 0.95) out.push({ key: 'spi', rank: k.spi < 0.85 ? 1 : 3, tone: k.spi < 0.85 ? 'bad' : 'warn', title: `${fa((1 - k.spi) * 100)}٪ عقب از برنامه`, detail: `SPI ${fa(k.spi, 2)}`, module: 'scheduling' })

  // cost
  if (k.cpi && k.cpi < 0.95) out.push({ key: 'cpi', rank: k.cpi < 0.85 ? 0 : 3, tone: k.cpi < 0.85 ? 'bad' : 'warn', title: `هزینه ${fa((1 / k.cpi - 1) * 100)}٪ بالاتر از ارزش کسب‌شده`, detail: `CPI ${fa(k.cpi, 2)}`, module: 'projectdashboard' })

  // the weakest health dimension, when the health centre names one that is not already said above
  if (hd?.drivenBy && hd.status !== 'green' && !['schedule', 'cost'].includes(hd.drivenBy)) {
    out.push({ key: 'health', rank: 4, tone: hd.status === 'red' || hd.status === 'black' ? 'bad' : 'warn', title: `ضعیف‌ترین بُعد سلامت: ${HEALTH_DIMENSION_LABEL_FA[hd.drivenBy]}`, detail: `سلامت ${fa(k.health)} از ۱۰۰`, module: 'healthcenter' })
  }

  // what is waiting on someone: critical items and missed deadlines
  const crit = data.signals.filter((x) => x.severity === 'critical')
  if (crit.length) {
    const byCat = new Map<SignalCategory, number>()
    for (const x of crit) byCat.set(x.category, (byCat.get(x.category) ?? 0) + 1)
    const top = [...byCat].sort((a, b) => b[1] - a[1])[0][0]
    out.push({ key: 'critical', rank: 1, tone: 'bad', title: `${fa(crit.length)} مورد بحرانی باز`, detail: [...byCat].map(([c, n]) => `${fa(n)} ${CAT_FA[c]}`).join(' · '), module: CAT_MODULE[top] })
  }
  const late2 = data.signals.filter((x) => isOverdue(x, today))
  if (late2.length) out.push({ key: 'overdue', rank: 2, tone: 'bad', title: `${fa(late2.length)} اقدام از مهلت گذشته`, detail: 'موانع و مسائل با مهلت سپری‌شده', module: 'taskissue' })

  // the next gate
  const g = data.nextGate
  if (g.prerequisites && g.readinessPct < 60) out.push({ key: 'gate', rank: 5, tone: g.failed ? 'bad' : 'warn', title: `گیت بعدی ${fa(g.readinessPct)}٪ آماده`, detail: `${g.name}${g.failed ? ` · ${fa(g.failed)} پیش‌نیاز رد شده` : ''}`, module: 'stagegate' })

  return out.sort((a, b) => a.rank - b.rank).slice(0, 4).map(({ rank: _r, ...b }) => b)
}

const CAT_FA: Record<SignalCategory, string> = { risk: 'ریسک', issue: 'مسئله', delay: 'تأخیر', change: 'تغییر', milestone: 'نقطهٔ عطف', contract: 'قراردادی', gate: 'گیت' }
const CAT_MODULE: Record<SignalCategory, ModuleKey> = { risk: 'risk', issue: 'taskissue', delay: 'scheduling', change: 'change', milestone: 'scheduling', contract: 'finance', gate: 'stagegate' }
export const SEVERITY_ORDER: SignalSeverity[] = ['critical', 'high', 'medium', 'low']
