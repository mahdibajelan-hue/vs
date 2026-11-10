import type { ModuleKey } from '../../../store/useModuleStore'
import { HEALTH_DIMENSION_LABEL_FA } from '../../../modules/lifecycle/types'
import type { RadarData, SignalCategory, SignalSeverity } from './radarTypes'

/** What the project menu shows beside a module and in its hover card — always the radar's own live figures. */
export interface MenuPeek {
  /** short value at the end of the menu row */
  row: string
  title: string
  value: string
  unit?: string
  note?: string
  /** small bar chart: real counts or percentages, never sample values */
  bars?: { label: string; value: number; tone: string }[]
  /** bars that are percentages (0–100) rather than counts */
  pct?: boolean
}

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: d })
const SEV: { key: SignalSeverity; label: string; tone: string }[] = [
  { key: 'critical', label: 'بحرانی', tone: '#ef4444' },
  { key: 'high', label: 'بالا', tone: '#f97316' },
  { key: 'medium', label: 'متوسط', tone: '#eab308' },
  { key: 'low', label: 'کم', tone: '#22c55e' },
]
const bySeverity = (d: RadarData, cat: SignalCategory) => SEV.map((s) => ({ label: s.label, tone: s.tone, value: d.signals.filter((x) => x.category === cat && x.severity === s.key).length }))
const healthTone = (score: number) => (score >= 75 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444')

export function menuPeek(module: ModuleKey | null, d: RadarData | null | undefined): MenuPeek | null {
  if (!d?.live || !module) return null
  const k = d.kpi
  switch (module) {
    case 'risk':
      return { row: `${fa(k.activeRisks)} فعال`, title: 'ریسک‌های فعال', value: fa(k.activeRisks), unit: 'ریسک', note: k.activeRisksHigh ? `${fa(k.activeRisksHigh)} ریسک با شدت بالا` : 'ریسک با شدت بالا نیست', bars: bySeverity(d, 'risk') }
    case 'taskissue':
      return { row: `${fa(k.openIssues)} باز`, title: 'موانع و مسائل باز', value: fa(k.openIssues), unit: 'مورد', note: k.openIssuesHigh ? `${fa(k.openIssuesHigh)} مورد با اولویت بالا` : 'مورد با اولویت بالا نیست', bars: bySeverity(d, 'issue') }
    case 'change':
      return { row: k.pendingChanges ? `${fa(k.pendingChanges)} در انتظار` : 'بدون انتظار', title: 'تغییرات در انتظار تصمیم', value: fa(k.pendingChanges), unit: 'درخواست', bars: bySeverity(d, 'change') }
    case 'scheduling': {
      if (!k.spi && !k.progressPlanned) return null
      return {
        row: `SPI ${fa(k.spi, 2)}`, title: 'شاخص عملکرد زمانی', value: fa(k.spi, 2), unit: 'SPI',
        note: k.delayedActivities ? `${fa(k.delayedActivities)} فعالیت معوق` : 'فعالیت معوقی ثبت نشده',
        bars: [{ label: 'برنامه', value: k.progressPlanned, tone: '#94a3b8' }, { label: 'واقعی', value: k.progressActual, tone: k.progressActual >= k.progressPlanned ? '#22c55e' : '#f59e0b' }], pct: true,
      }
    }
    case 'finance': {
      if (!k.cpi) return null
      return { row: `CPI ${fa(k.cpi, 2)}`, title: 'شاخص عملکرد هزینه', value: fa(k.cpi, 2), unit: 'CPI', note: `عملکرد هزینه ${fa(k.costPerformancePct)}٪` }
    }
    case 'healthcenter':
    case 'projectdashboard': {
      const h = d.healthDetail
      if (!h) return null
      const dims = h.dims.filter((x) => x.assessed !== false).sort((a, b) => a.score - b.score).slice(0, 6)
      return {
        row: `${fa(h.score)} از ۱۰۰`, title: 'سلامت پروژه', value: fa(h.score), unit: 'از ۱۰۰',
        note: h.drivenBy ? `ضعیف‌ترین بُعد: ${HEALTH_DIMENSION_LABEL_FA[h.drivenBy]}` : undefined,
        bars: dims.map((x) => ({ label: HEALTH_DIMENSION_LABEL_FA[x.dimension], value: Math.round(x.score), tone: healthTone(x.score) })), pct: true,
      }
    }
    default:
      return null
  }
}
