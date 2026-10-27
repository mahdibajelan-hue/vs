import { JALALI_MONTHS, isoToJalali, jalaliMonthLength, jalaliToIso } from '../../../lib/jalali'

/**
 * تولید صورت‌وضعیت — the arithmetic of a monthly statement of one contract part. Each part reads its own source and never
 * a typed number: E from the engineering document register (price × the share of the document's reached stages), P from
 * the material chain (each stage of an item's payment sequence × the quantity that reached it × price), C from the
 * supervision-approved executed quantities × contract unit price. A line's accepted cumulative amount starts at the system
 * amount (never below what the previous statement accepted); the period = cumulative − previous; deductions follow the
 * contract's rates. Everything here is pure, so the page, the print and the tests compute the same figures.
 */
export type Part = 'E' | 'P' | 'C'
export const PARTS: Part[] = ['E', 'P', 'C']
export const PART_META: Record<Part, { title: string; long: string; source: string; color: string; unitWord: string }> = {
  E: { title: 'مهندسی', long: 'خدمات مهندسی و طراحی', source: 'فهرست مدارک و وزن/قیمت هر مدرک (ماژول پیشرفت مهندسی)', color: '#818cf8', unitWord: 'مدرک' },
  P: { title: 'تأمین کالا', long: 'خرید و تأمین کالا', source: 'سفارش، حمل، رسید انبار و بازرسی ورودی (ماژول کنترل و تأمین کالا)', color: '#f59e0b', unitWord: 'قلم کالا' },
  C: { title: 'اجرا', long: 'عملیات اجرایی و ساختمانی', source: 'مقادیر کارکرد تأییدشدهٔ نظارت × قیمت واحد ردیف‌های پیمان (ماژول مدیریت اجرا)', color: '#fb923c', unitWord: 'ردیف پیمان' },
}
export type StStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'posted'
export const STATUS_FA: Record<StStatus, string> = { draft: 'پیش‌نویس', submitted: 'در انتظار بررسی', approved: 'تأییدشده', rejected: 'برگشت برای اصلاح', posted: 'ثبت‌شده در مالی' }
export const STATUS_COLOR: Record<StStatus, string> = { draft: '#64748b', submitted: '#3b82f6', approved: '#10b981', rejected: '#ef4444', posted: '#8b5cf6' }

// ── Jalali month periods ───────────────────────────────────────────────────────────────────────────────────────
export interface Period { key: string; from: string; to: string; label: string }
const pad = (n: number) => String(n).padStart(2, '0')
export function periodOf(key: string): Period {
  const [jy, jm] = key.split('-').map(Number)
  return { key, from: jalaliToIso(jy, jm, 1), to: jalaliToIso(jy, jm, jalaliMonthLength(jy, jm)), label: `${JALALI_MONTHS[jm - 1]} ${jy.toLocaleString('fa-IR', { useGrouping: false })}` }
}
export function periodOfDate(iso: string): Period { const j = isoToJalali(iso)!; return periodOf(`${j.jy}-${pad(j.jm)}`) }
/** the `n` months up to (and including) the month of `iso`, newest first */
export function recentPeriods(iso: string, n: number): Period[] {
  const j = isoToJalali(iso)!; const out: Period[] = []
  let y = j.jy, m = j.jm
  for (let i = 0; i < n; i++) { out.push(periodOf(`${y}-${pad(m)}`)); m -= 1; if (m === 0) { m = 12; y -= 1 } }
  return out
}

// ── a generated line ─────────────────────────────────────────────────────────────────────────────────────────
export interface GenLine {
  sourceKind: 'doc' | 'material' | 'activity'; sourceId: string
  code: string; title: string; unit: string; groupLabel: string
  unitPrice: number; baseQty: number; baseAmount: number
  sysCumQty: number; sysCumAmount: number
  cumAmount: number; prevAmount: number; edited: boolean; note: string
  detail: Record<string, unknown>
}
export interface Built { lines: GenLine[]; warnings: string[] }
const line = (x: Omit<GenLine, 'cumAmount' | 'prevAmount' | 'edited' | 'note'>): GenLine => ({ ...x, cumAmount: x.sysCumAmount, prevAmount: 0, edited: false, note: '' })

// ── E: documents × reached stages ─────────────────────────────────────────────────────────────────────────────
export interface EngDoc { id: string; docNo: string; title: string; discipline: string; status: string; price: number; actualPrepared: string | null; actualApproved: string | null; contract: string }
export interface EngStep { key: 'prepared' | 'approved'; label: string; pct: number }
export const DEFAULT_ENG_SPLIT: EngStep[] = [{ key: 'prepared', label: 'ارسال اولیه (IFR)', pct: 60 }, { key: 'approved', label: 'تأیید نهایی (AFC)', pct: 40 }]
/** documents of the contract (tagged with its number, or untagged) — superseded revisions are not paid again */
export function buildE(docs: EngDoc[], split: EngStep[], to: string, contractNo: string | null): Built {
  const warnings: string[] = []
  const mine = docs.filter((d) => d.status !== 'superseded' && (!contractNo || !d.contract || d.contract === contractNo))
  const unpriced = mine.filter((d) => !(d.price > 0)).length
  if (unpriced) warnings.push(`${unpriced.toLocaleString('fa-IR')} مدرک قیمت ندارد و در صورت‌وضعیت نیامده است (قیمت را در فهرست مدارک ماژول مهندسی وارد کنید).`)
  const sum = split.reduce((s, x) => s + x.pct, 0)
  if (Math.abs(sum - 100) > 0.01) warnings.push(`جمع درصد مراحل مدارک ${sum.toLocaleString('fa-IR')}٪ است، نه ۱۰۰٪.`)
  const lines = mine.filter((d) => d.price > 0).map((d) => {
    const approved = !!d.actualApproved && d.actualApproved <= to
    const prepared = approved || (!!d.actualPrepared && d.actualPrepared <= to)
    const stages = split.map((s) => { const reached = s.key === 'approved' ? approved : prepared; return { key: s.key, label: s.label, pct: s.pct, reached, date: s.key === 'approved' ? d.actualApproved : d.actualPrepared } })
    const pct = stages.filter((s) => s.reached).reduce((a, s) => a + s.pct, 0)
    return line({ sourceKind: 'doc', sourceId: d.id, code: d.docNo, title: d.title, unit: '٪', groupLabel: d.discipline || 'بدون دیسیپلین', unitPrice: d.price / 100, baseQty: 100, baseAmount: d.price, sysCumQty: pct, sysCumAmount: (d.price * pct) / 100, detail: { stages } })
  })
  return { lines, warnings }
}

// ── P: items × payment sequence × quantity that reached each stage ───────────────────────────────────────────────
export type MatStage = 'po_issue' | 'manufacturing' | 'inspection' | 'release' | 'shipping' | 'site_receipt' | 'entry_inspection'
export const MAT_STAGES: { key: MatStage; label: string; source: string }[] = [
  { key: 'po_issue', label: 'صدور سفارش خرید', source: 'مقدار سفارش‌شده در PO تا پایان دوره' },
  { key: 'manufacturing', label: 'ساخت و تولید', source: 'مرحلهٔ «ساخت و تولید» تأییدشده در بستهٔ کالا' },
  { key: 'inspection', label: 'بازرسی حین ساخت و نهایی', source: 'مرحلهٔ «بازرسی» تأییدشده در بستهٔ کالا' },
  { key: 'release', label: 'صدور مجوز حمل', source: 'مرحلهٔ «مجوز حمل» تأییدشده در بستهٔ کالا' },
  { key: 'shipping', label: 'حمل و ارسال', source: 'مقدار محموله‌های ارسال‌شده' },
  { key: 'site_receipt', label: 'ورود به انبار کارگاه', source: 'مقدار رسید انبار' },
  { key: 'entry_inspection', label: 'بازرسی ورودی و قبول', source: 'مقدار رسید انبار با بازرسی «قبول»' },
]
export const MAT_STAGE_FA = Object.fromEntries(MAT_STAGES.map((s) => [s.key, s.label])) as Record<MatStage, string>
export interface PayStep { stage: MatStage; pct: number }
export interface PaySeq { id: string; title: string; groupId: string | null; materialId: string | null; steps: PayStep[] }
export const DEFAULT_PAY_STEPS: PayStep[] = [{ stage: 'po_issue', pct: 10 }, { stage: 'inspection', pct: 20 }, { stage: 'site_receipt', pct: 60 }, { stage: 'entry_inspection', pct: 10 }]
export interface MatItem { id: string; code: string; title: string; unit: string; groupId: string | null; groupTitle: string; qty: number; unitPrice: number }
/** the sequence of an item: its own, else its group's, else the contract default */
export const seqFor = (it: Pick<MatItem, 'id' | 'groupId'>, seqs: PaySeq[]): PaySeq | null =>
  seqs.find((s) => s.materialId === it.id) ?? (it.groupId ? seqs.find((s) => !s.materialId && s.groupId === it.groupId) : undefined) ?? seqs.find((s) => !s.materialId && !s.groupId) ?? null
export const stepsTotal = (steps: PayStep[]) => steps.reduce((s, x) => s + x.pct, 0)
export function buildP(items: MatItem[], qtyAt: Map<string, Partial<Record<MatStage, number>>>, seqs: PaySeq[]): Built {
  const warnings: string[] = []
  for (const s of seqs) { const t = stepsTotal(s.steps); if (Math.abs(t - 100) > 0.01) warnings.push(`جمع درصد توالی «${s.title || 'پیش‌فرض'}» ${t.toLocaleString('fa-IR')}٪ است، نه ۱۰۰٪.`) }
  const noSeq = items.filter((it) => !seqFor(it, seqs)).length
  if (noSeq) warnings.push(`برای ${noSeq.toLocaleString('fa-IR')} قلم توالی پرداخت تعریف نشده است (در «تنظیمات» یک توالی پیش‌فرض بسازید).`)
  const noPrice = items.filter((it) => it.qty > 0 && !(it.unitPrice > 0)).length
  if (noPrice) warnings.push(`${noPrice.toLocaleString('fa-IR')} قلم کالا قیمت واحد ندارد.`)
  const lines: GenLine[] = []
  for (const it of items) {
    const seq = seqFor(it, seqs)
    if (!seq || !(it.qty > 0) || !(it.unitPrice > 0)) continue
    const q = qtyAt.get(it.id) ?? {}
    const steps = seq.steps.map((s) => { const qty = Math.min(it.qty, Math.max(0, q[s.stage] ?? 0)); return { stage: s.stage, label: MAT_STAGE_FA[s.stage], pct: s.pct, qty, amount: (s.pct / 100) * qty * it.unitPrice } })
    const amount = steps.reduce((a, s) => a + s.amount, 0)
    lines.push(line({ sourceKind: 'material', sourceId: it.id, code: it.code, title: it.title, unit: it.unit, groupLabel: it.groupTitle || 'بدون گروه', unitPrice: it.unitPrice, baseQty: it.qty, baseAmount: it.qty * it.unitPrice,
      sysCumQty: it.unitPrice > 0 ? amount / it.unitPrice : 0, sysCumAmount: amount, detail: { seq: seq.title || 'پیش‌فرض', steps } }))
  }
  return { lines, warnings }
}

// ── C: approved executed quantities × unit price ──────────────────────────────────────────────────────────────────
export interface ActRow { activityId: string; itemNo: string; title: string; unit: string; chapter: string; unitPrice: number; base: number; cum: number; pending: number }
export function buildC(rows: ActRow[], unmapped = 0): Built {
  const warnings: string[] = []
  if (unmapped) warnings.push(`${unmapped.toLocaleString('fa-IR')} نوع کارکرد ثبت‌شده به ردیف پیمان وصل نیست و در صورت‌وضعیت نیامده است (ماژول اجرا ← تنظیمات اقدامات).`)
  const over = rows.filter((r) => r.base > 0 && r.cum > r.base + 1e-9).length
  if (over) warnings.push(`کارکرد ${over.toLocaleString('fa-IR')} ردیف از مقدار پیمان بیشتر است.`)
  const lines = rows.filter((r) => r.cum > 0 && r.unitPrice > 0).map((r) => line({ sourceKind: 'activity', sourceId: r.activityId, code: r.itemNo, title: r.title, unit: r.unit, groupLabel: r.chapter || 'بدون فصل',
    unitPrice: r.unitPrice, baseQty: r.base, baseAmount: r.base * r.unitPrice, sysCumQty: r.cum, sysCumAmount: r.cum * r.unitPrice, detail: { pending: r.pending, over: r.base > 0 && r.cum > r.base + 1e-9 } }))
  return { lines, warnings }
}

// ── previous statement, totals and deductions ────────────────────────────────────────────────────────────────────
export const lineKey = (l: Pick<GenLine, 'sourceKind' | 'sourceId'>) => `${l.sourceKind}:${l.sourceId}`
/** carry the previous statement's accepted cumulative amount; a line never accepts less than before. Lines that were in the
 *  previous statement but have no source any more are kept at their previous amount (zero for the period). */
export function withPrevious(lines: GenLine[], prev: Pick<GenLine, 'sourceKind' | 'sourceId' | 'cumAmount' | 'code' | 'title' | 'unit' | 'groupLabel' | 'unitPrice' | 'baseQty' | 'baseAmount'>[]): GenLine[] {
  const pm = new Map(prev.map((p) => [lineKey(p), p]))
  const out: GenLine[] = lines.map((l) => { const p = pm.get(lineKey(l)); const pa = p?.cumAmount ?? 0; pm.delete(lineKey(l)); return { ...l, prevAmount: pa, cumAmount: Math.max(l.sysCumAmount, pa), detail: { ...l.detail, ...(l.sysCumAmount + 0.5 < pa ? { belowPrev: true } : {}) } } })
  for (const p of pm.values()) if (p.cumAmount > 0) out.push({ ...p, sysCumQty: 0, sysCumAmount: 0, prevAmount: p.cumAmount, cumAmount: p.cumAmount, edited: false, note: '', detail: { orphan: true } })
  return out
}
export interface Rates { advRecoveryPct: number; retPct: number; taxPct: number; insPct: number }
export interface Deductions { advance: number; retention: number; tax: number; insurance: number; total: number }
export interface Totals { cumSys: number; cumAmount: number; prevAmount: number; thisAmount: number; cap: number | null; capLeft: number | null; overCap: number; deductions: Deductions; payable: number }
/** `advanceLeft` = advance paid on the contract not yet recovered by earlier statements (recovery stops there) */
export function totals(lines: Pick<GenLine, 'sysCumAmount' | 'cumAmount' | 'prevAmount'>[], rates: Rates, cap: number | null, advanceLeft = Infinity): Totals {
  const r = (x: number) => Math.round(x)
  const cumSys = lines.reduce((s, l) => s + l.sysCumAmount, 0), cumAmount = lines.reduce((s, l) => s + l.cumAmount, 0), prevAmount = lines.reduce((s, l) => s + l.prevAmount, 0)
  const thisAmount = cumAmount - prevAmount, base = Math.max(0, thisAmount)
  const advance = r(Math.min(base * rates.advRecoveryPct / 100, Math.max(0, advanceLeft))), retention = r(base * rates.retPct / 100), tax = r(base * rates.taxPct / 100), insurance = r(base * rates.insPct / 100)
  const total = advance + retention + tax + insurance
  return { cumSys: r(cumSys), cumAmount: r(cumAmount), prevAmount: r(prevAmount), thisAmount: r(thisAmount), cap, capLeft: cap == null ? null : r(cap - cumAmount), overCap: cap == null ? 0 : r(Math.max(0, cumAmount - cap)),
    deductions: { advance, retention, tax, insurance, total }, payable: r(thisAmount - total) }
}

/** group lines for display, in source order */
export function groupLines<T extends Pick<GenLine, 'groupLabel'>>(lines: T[]): { label: string; lines: T[] }[] {
  const m = new Map<string, T[]>()
  for (const l of lines) { const x = m.get(l.groupLabel); if (x) x.push(l); else m.set(l.groupLabel, [l]) }
  return [...m.entries()].map(([label, ls]) => ({ label, lines: ls }))
}
