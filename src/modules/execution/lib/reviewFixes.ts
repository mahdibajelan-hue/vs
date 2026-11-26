/**
 * The supervision's corrections of a sent report (065): where the supervision disagrees with a figure the contractor
 * entered, it writes its own value. The report carries the corrected value; the contractor's original stays in the fix
 * row, so the paper can show it struck through beside the supervision's figure.
 *
 * A path names one figure:  data:<key> · res:<id>:<column> · line:<id>:qty · line:<id>:d:<key> · stop:<id>:hours
 */
export interface ReportFix { id: string; reportId: string; path: string; label: string; was: unknown; value: unknown; note: string; fixedBy: string | null; fixedByName: string; fixedAt: string }
export interface FixInput { path: string; value: unknown; label: string; note?: string }

export const fixPath = {
  data: (key: string) => `data:${key}`,
  res: (id: string, col: string) => `res:${id}:${col}`,
  qty: (lineId: string) => `line:${lineId}:qty`,
  cell: (lineId: string, key: string) => `line:${lineId}:d:${key}`,
  stop: (id: string) => `stop:${id}:hours`,
}
/** resource fields of the client → their database columns */
export const RES_COL: Record<string, string> = { totalQty: 'total_qty', activeQty: 'active_qty', idleQty: 'idle_qty', leaveQty: 'leave_qty', stoppedQty: 'stopped_qty', nativeQty: 'native_qty', nonnativeQty: 'nonnative_qty', repairQty: 'repair_qty', hours: 'hours' }

const norm = (v: unknown) => (v == null ? '' : String(v).trim())
/** the same figure written two ways (5, "5", "5.0") */
export function sameValue(a: unknown, b: unknown): boolean {
  const x = norm(a), y = norm(b)
  if (x === y) return true
  if (x === '' || y === '') return false
  const nx = Number(x), ny = Number(y)
  return Number.isFinite(nx) && Number.isFinite(ny) && nx === ny
}

/**
 * What to send for the drafted values: a draft equal to the contractor's figure withdraws an earlier correction (value
 * null) or is left out; an unchanged correction is left out.
 */
export function fixItems(draft: Record<string, { value: unknown; label: string }>, current: (path: string) => unknown, fixes: Map<string, ReportFix>): FixInput[] {
  const out: FixInput[] = []
  for (const [path, d] of Object.entries(draft)) {
    const f = fixes.get(path)
    const original = f ? f.was : current(path)
    if (sameValue(d.value, original)) { if (f) out.push({ path, value: null, label: d.label }) }
    else if (!f || !sameValue(d.value, f.value)) out.push({ path, value: d.value, label: d.label })
  }
  return out
}

export const byPath = (fixes: ReportFix[]) => new Map(fixes.map((f) => [f.path, f]))
