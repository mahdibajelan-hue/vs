/** Quantity concepts that must never be mixed: executed (contractor's daily reports) → approved (supervision) → employer-confirmed (optional) → measured (حجم اندازه‌گیری‌شده) → billed (صورت‌وضعیت‌شده) → paid. */
export interface MeasureRow { activityId: string; periodKey: string; measured: number; billed: number; paid: number; certificateId: string | null }
export interface LedgerInput { activityId: string; title: string; unit: string; executed: number; approved: number; employer: number | null; evidenceMissing: number; rows: MeasureRow[] }
export type MismatchKind = 'measured_over_approved' | 'billed_over_measured' | 'paid_over_billed' | 'approved_not_measured' | 'billed_without_certificate' | 'approved_without_evidence' | 'approved_over_executed'
export interface Mismatch { activityId: string; title: string; kind: MismatchKind; qty: number; unit: string; detail: string }
export interface Ledger {
  activityId: string; title: string; unit: string
  executed: number; approved: number; employer: number | null; measured: number; billed: number; paid: number
  /** approved but not yet measured / measured not yet billed / billed not yet paid */
  toMeasure: number; toBill: number; toPay: number
  mismatches: Mismatch[]
}
const r = (x: number) => Math.round(x * 1e6) / 1e6

export function reconcile(inputs: LedgerInput[], opts: { tol?: number; measureAgingFloor?: number } = {}): Ledger[] {
  const tol = opts.tol ?? 1e-6
  return inputs.map((i) => {
    const measured = r(i.rows.reduce((s, x) => s + x.measured, 0)), billed = r(i.rows.reduce((s, x) => s + x.billed, 0)), paid = r(i.rows.reduce((s, x) => s + x.paid, 0))
    const ceiling = i.employer ?? i.approved
    const mm: Mismatch[] = []
    const add = (kind: MismatchKind, qty: number, detail: string) => mm.push({ activityId: i.activityId, title: i.title, kind, qty: r(qty), unit: i.unit, detail })
    if (i.approved > i.executed + tol) add('approved_over_executed', i.approved - i.executed, 'مقدار تأییدشده از مقدار اعلامی گزارش‌های روزانه بیشتر است.')
    if (measured > ceiling + tol) add('measured_over_approved', measured - ceiling, `حجم اندازه‌گیری‌شده از مقدار تأییدشدهٔ ${i.employer != null ? 'کارفرما' : 'نظارت'} بیشتر است.`)
    if (billed > measured + tol) add('billed_over_measured', billed - measured, 'مقدار صورت‌وضعیت‌شده از حجم اندازه‌گیری‌شده بیشتر است.')
    if (paid > billed + tol) add('paid_over_billed', paid - billed, 'مقدار پرداخت‌شده از مقدار صورت‌وضعیت‌شده بیشتر است.')
    const unlinked = i.rows.filter((x) => x.billed > 0 && !x.certificateId)
    if (unlinked.length) add('billed_without_certificate', unlinked.reduce((s, x) => s + x.billed, 0), `دوره‌های ${unlinked.map((x) => x.periodKey).join('، ')} بدون ارجاع به صورت‌وضعیت ثبت شده‌اند.`)
    if (i.evidenceMissing > 0) add('approved_without_evidence', i.evidenceMissing, 'ردیف‌های تأییدشده بدون مستند تصویری/مدرک.')
    const toMeasure = r(Math.max(0, ceiling - measured))
    if (toMeasure > (opts.measureAgingFloor ?? 0) && ceiling > 0 && measured === 0) add('approved_not_measured', toMeasure, 'مقدار تأییدشده هنوز اندازه‌گیری نشده است.')
    return { activityId: i.activityId, title: i.title, unit: i.unit, executed: i.executed, approved: i.approved, employer: i.employer, measured, billed, paid, toMeasure, toBill: r(Math.max(0, measured - billed)), toPay: r(Math.max(0, billed - paid)), mismatches: mm }
  })
}
