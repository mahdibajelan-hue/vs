import type { LandEvent } from '../types'
import { OWNERSHIP_LABEL, ROUTE_LABEL, STAGE_LABEL, STAGE_STATUS_LABEL } from './labels'
import { fmtKmRange } from './dates'

export function describeEvent(e: LandEvent): string {
  const d = e.detail as Record<string, string | number | null>
  switch (e.kind) {
    case 'parcel_created':
      return `قطعه ${d.code ?? ''} (${fmtKmRange(Number(d.km_start), Number(d.km_end))}) ثبت شد`
    case 'route_changed':
      return `مسیر تحصیل از «${ROUTE_LABEL[d.from as keyof typeof ROUTE_LABEL] ?? d.from}» به «${ROUTE_LABEL[d.to as keyof typeof ROUTE_LABEL] ?? d.to}» تغییر کرد`
    case 'ownership_changed':
      return `ماهیت مالکیت از «${OWNERSHIP_LABEL[d.from as keyof typeof OWNERSHIP_LABEL] ?? d.from}» به «${OWNERSHIP_LABEL[d.to as keyof typeof OWNERSHIP_LABEL] ?? d.to}» تغییر کرد`
    case 'stage':
      return `مرحلهٔ «${STAGE_LABEL[d.stage_key as keyof typeof STAGE_LABEL] ?? d.stage_key}» ← ${STAGE_STATUS_LABEL[d.status as keyof typeof STAGE_STATUS_LABEL] ?? d.status}`
    case 'transfer':
      return `به ${d.target === 'risk' ? 'مدیریت ریسک' : d.target === 'issue' ? 'مدیریت مسائل' : 'برنامه زمان‌بندی'} منتقل شد`
    default:
      return e.kind
  }
}
