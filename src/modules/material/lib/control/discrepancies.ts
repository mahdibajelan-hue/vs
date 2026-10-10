import type { DiscrepancyKind, Material, MtlSettings, PoLine, PurchaseOrder } from '../../types'
import type { Position } from './model'

export interface Detected {
  fingerprint: string
  kind: DiscrepancyKind
  materialId: string
  diffQty: number | null
  probableCause: string
  usageLocation: string
  impact: string
  dueDate: string | null
}

const day = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)
const place = (m: Material) => [m.facility, m.area, m.front, m.pipelineNo || m.tagNumber].filter(Boolean).join(' · ') || m.usageLocation
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10)

/** Latest planned delivery of the order lines that are still open for this material. */
export function expectedArrival(m: Material, poLines: PoLine[], pos: PurchaseOrder[], received: number, ordered: number): string | null {
  if (ordered <= 0 || received >= ordered) return null
  const live = new Set(pos.filter((p) => ['issued', 'active', 'completed'].includes(p.status)).map((p) => p.id))
  const dates = poLines.filter((l) => l.materialId === m.id && live.has(l.poId) && l.plannedDeliveryDate).map((l) => l.plannedDeliveryDate as string)
  return dates.length ? dates.sort().at(-1)! : null
}

/**
 * Compares the contract MTO, the detail-design MTO and the real supply for every item and lists what does not fit.
 * It only detects: items outside the contract MTO are flagged, never decided on (who pays, whether to buy more, how to supply — that is for the employer and the consultant).
 */
export function detectDiscrepancies(a: { materials: Material[]; positions: Map<string, Position>; poLines: PoLine[]; purchaseOrders: PurchaseOrder[]; settings: MtlSettings; today: string }): Detected[] {
  const out: Detected[] = []
  const tol = a.settings.qtyTolerancePct / 100
  for (const m of a.materials) {
    const p = a.positions.get(m.id)
    if (!p) continue
    const where = place(m)
    const push = (kind: DiscrepancyKind, diff: number | null, cause: string, impact: string, due: string | null = null) =>
      out.push({ fingerprint: `${kind}:${m.id}`, kind, materialId: m.id, diffQty: diff, probableCause: cause, usageLocation: where, impact, dueDate: due })
    const inContract = (m.contractQty ?? 0) > 0
    const inDesign = m.detailQty != null && m.detailQty > 0

    if (inDesign && !inContract) {
      push('not_in_contract', m.detailQty, 'قلم در طراحی تفصیلی آمده ولی در MTO پیمان نیست؛ احتمالاً تغییر طراحی یا اقلام جاافتاده در پیمان.', 'مسئولیت و نحوهٔ تأمین باید با بررسی و تأیید کارفرما و مشاور تعیین شود.')
    } else if (inContract && m.detailQty != null && Math.abs(m.detailQty - (m.contractQty ?? 0)) > Math.max(0, (m.contractQty ?? 0) * tol)) {
      const d = m.detailQty - (m.contractQty ?? 0)
      push('qty_diff', d, d > 0 ? 'مقدار طراحی تفصیلی از مقدار پیمان بیشتر است؛ احتمالاً تغییر مسیر، افزایش اقلام یا خطای برآورد پیمان.' : 'مقدار طراحی تفصیلی کمتر از مقدار پیمان است؛ احتمال سفارش مازاد.', d > 0 ? 'کسری در صورت نبود سفارش مکمل' : 'مازاد احتمالی')
    }
    if (m.detailSpec && m.detailSpec !== m.spec) push('spec_mismatch', null, `مشخصات پیمان «${m.spec || '—'}» با طراحی «${m.detailSpec}» فرق دارد.`, 'ممکن است کالای سفارش‌شده قابل استفاده نباشد.')
    if (m.detailUnit && m.detailUnit !== m.unit) push('unit_mismatch', null, `واحد پیمان «${m.unit}» با طراحی «${m.detailUnit}» فرق دارد.`, 'مقدارها قابل مقایسه نیستند تا واحد یکسان شود.')
    if (m.detailCode && m.detailCode !== m.materialCode) push('code_mismatch', null, `کد پیمان «${m.materialCode || '—'}» با طراحی «${m.detailCode}» فرق دارد.`, 'احتمال تکرار یا از‌قلم‌افتادن قلم در سفارش.')
    if (m.detailLocation && m.detailLocation !== m.usageLocation) push('location_mismatch', null, `محل مصرف پیمان «${m.usageLocation || '—'}» با طراحی «${m.detailLocation}» فرق دارد.`, 'تخصیص و حمل به محل درست انجام نمی‌شود.')

    const needed = p.requiredQty
    if (needed <= 0) continue
    if (inContract && p.ordered === 0) {
      const lead = m.leadTimeDays ?? 0
      const lastOrder = m.needDate ? addDays(m.needDate, -(lead + a.settings.delayBufferDays)) : null
      const late = lastOrder != null && a.today > lastOrder
      push('no_order', needed, late ? 'سفارش خرید ثبت نشده و مهلت سفارش‌گذاری با توجه به زمان تأمین گذشته است.' : 'برای قلم موجود در MTO پیمان هنوز سفارش خرید ثبت نشده است.', late ? 'تأخیر قطعی نسبت به تاریخ نیاز' : 'در صورت تأخیر بیشتر، تأخیر تأمین محتمل است', lastOrder)
    } else if (p.ordered > 0 && p.ordered < needed * (1 - tol)) {
      push('under_ordered', needed - p.ordered, 'مقدار سفارش‌شده از نیاز (طراحی تفصیلی یا پیمان) کمتر است.', 'کسری در زمان مصرف در صورت عدم تکمیل سفارش')
    }
    const eta = expectedArrival(m, a.poLines, a.purchaseOrders, p.received, p.ordered)
    if (m.needDate && eta && day(addDays(eta, a.settings.delayBufferDays), m.needDate) > 0 && p.onHand < needed) {
      const late = day(addDays(eta, a.settings.delayBufferDays), m.needDate)
      push('delay_risk', p.uncoveredGap || null, `تحویل برنامه‌ای ${eta} است و با حاشیهٔ ${a.settings.delayBufferDays} روز، ${late} روز دیرتر از تاریخ نیاز (${m.needDate}) می‌رسد.`, 'احتمال توقف جبهه اجرایی در محل مصرف', m.needDate)
    }
    if (p.accepted > 0 && p.allocated === 0 && p.onHand > 0) push('unallocated', p.onHand, 'کالا تحویل و پذیرفته شده ولی برای محل مصرف مشخصی تخصیص نیافته است.', 'موجودی بدون مصرف‌کننده؛ خطر ماندن در انبار')
  }
  return out
}
