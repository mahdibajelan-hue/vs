import type { Material } from '../../types'

/** What is missing on an item that later calculations need. An item with gaps is still kept; the gaps are shown so they get filled. */
export function dataGaps(m: Material): string[] {
  const g: string[] = []
  if (!m.groupId) g.push('گروه کالا')
  if (!m.unit) g.push('واحد')
  if (!((m.contractQty ?? 0) > 0 || (m.detailQty ?? 0) > 0)) g.push('مقدار')
  if (!(m.unitPrice > 0)) g.push('قیمت واحد')
  if (!m.facility) g.push('ایستگاه')
  if (!(m.pipelineNo || m.isometricNo || m.tagNumber || m.usageLocation)) g.push('محل مصرف')
  if (!m.needDate) g.push('تاریخ نیاز')
  return g
}
