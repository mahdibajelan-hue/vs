/** Management-level pipeline indicators. Detail (weld numbers, welder IDs) stays in the technical forms; here only totals per metric. */
export const PIPELINE_METRICS: { key: string; label: string; unit: string }[] = [
  { key: 'weld_joint', label: 'سرجوش جوشکاری‌شده', unit: 'عدد' },
  { key: 'rt_joint', label: 'سرجوش رادیوگرافی‌شده', unit: 'عدد' },
  { key: 'coat_joint', label: 'سرجوش عایق‌شده', unit: 'عدد' },
  { key: 'pipe_m', label: 'طول لوله‌گذاری (ریسه)', unit: 'm' },
  { key: 'excavation_m', label: 'طول حفاری', unit: 'm' },
  { key: 'lowering_m', label: 'طول پایین‌گذاری', unit: 'm' },
  { key: 'backfill_m', label: 'طول خاکریزی', unit: 'm' },
  { key: 'reinstate_m', label: 'طول ریم‌بک و بازسازی', unit: 'm' },
  { key: 'bend_count', label: 'خم‌کاری', unit: 'عدد' },
  { key: 'hydrotest_m', label: 'طول تست هیدرواستاتیک', unit: 'm' },
]
export const STATION_METRICS: { key: string; label: string; unit: string }[] = [
  { key: 'civil_m3', label: 'بتن‌ریزی', unit: 'm³' },
  { key: 'structure_ton', label: 'نصب سازه', unit: 'ton' },
  { key: 'piping_dim', label: 'لوله‌کشی (دیامتر-اینچ)', unit: 'inch-dia' },
  { key: 'equipment_set', label: 'نصب تجهیز', unit: 'عدد' },
  { key: 'cable_m', label: 'کابل‌کشی', unit: 'm' },
  { key: 'instrument_loop', label: 'لوپ ابزار دقیق', unit: 'عدد' },
]
export const ALL_METRICS = [...PIPELINE_METRICS, ...STATION_METRICS]
export const metricLabel = (k: string): string => ALL_METRICS.find((m) => m.key === k)?.label ?? k

export interface MetricActivity { id: string; metric: string; baseQty: number; unit: string }
/** Totals per metric (executed approved / base / remaining) — only activities carrying the same metric are added, so units never mix. */
export function metricTotals(activities: MetricActivity[], cum: Map<string, number>): { key: string; label: string; unit: string; base: number; done: number; remaining: number; pct: number; rows: number }[] {
  const m = new Map<string, { key: string; label: string; unit: string; base: number; done: number; rows: number }>()
  for (const a of activities) {
    if (!a.metric) continue
    const x = m.get(a.metric) ?? { key: a.metric, label: metricLabel(a.metric), unit: ALL_METRICS.find((k) => k.key === a.metric)?.unit ?? a.unit, base: 0, done: 0, rows: 0 }
    x.base += a.baseQty; x.done += Math.min(a.baseQty, cum.get(a.id) ?? 0); x.rows++; m.set(a.metric, x)
  }
  return [...m.values()].map((x) => ({ ...x, remaining: Math.max(0, x.base - x.done), pct: x.base > 0 ? x.done / x.base : 0 })).sort((a, b) => b.base - a.base)
}
