import type { FinContract, FinContractAmendment, FinPaymentCertificate } from '../types'
import { contractFile, daysBetween } from './financeControl'

export interface Clearance { contractId: string; kind: 'social_security' | 'insurance' | 'tax'; status: 'pending' | 'issued' | 'expired'; number: string; issueDate: string | null; expiryDate: string | null; note: string }
export const CLEARANCE_FA: Record<Clearance['kind'], string> = { social_security: 'مفاصاحساب تأمین اجتماعی', insurance: 'بیمه', tax: 'مفاصاحساب مالیاتی' }

export interface AdvanceStatus { advance: number; recovered: number; balance: number; recoveredPct: number; certifiedPct: number; behind: boolean }
/** Advance payment and its amortisation: advance = value × %, recovered = sum of recovery on non-rejected certificates. «behind» = work certified outpaces the recovery by more than 15 points. */
export function advanceStatus(c: FinContract, amendments: FinContractAmendment[], certs: FinPaymentCertificate[]): AdvanceStatus | null {
  if (!c.advancePaymentPercent) return null
  const value = contractFile(c, amendments).current
  const advance = Math.round((value * c.advancePaymentPercent) / 100)
  const mine = certs.filter((x) => x.contractId === c.id && x.status !== 'rejected' && x.status !== 'draft')
  const recovered = mine.reduce((n, x) => n + (x.advanceRecoveryAmount || 0), 0)
  const certified = mine.reduce((n, x) => n + (x.certifiedAmount ?? 0), 0)
  const recoveredPct = advance > 0 ? Math.round((recovered / advance) * 1000) / 10 : 0
  const certifiedPct = value > 0 ? Math.round((certified / value) * 1000) / 10 : 0
  return { advance, recovered, balance: advance - recovered, recoveredPct, certifiedPct, behind: certifiedPct - recoveredPct > 15 }
}

export interface Insight { key: string; severity: 'critical' | 'high' | 'medium'; masterProjectId: string; sourceType: 'contract' | 'certificate'; sourceId: string; title: string; detail: string; suggestion: string }
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0 }

/** Rule-based findings for human review (nothing is changed automatically): inconsistencies and unusual patterns in contracts, certificates, advances and clearances. */
export function buildInsights(a: { contracts: FinContract[]; amendments: FinContractAmendment[]; certificates: FinPaymentCertificate[]; clearances: Clearance[]; today: string }): Insight[] {
  const out: Insight[] = []
  for (const c of a.contracts) {
    if (c.status === 'draft' || c.status === 'replaced') continue
    const name = c.contractNumber || c.title
    const certs = a.certificates.filter((x) => x.contractId === c.id)
    const live = certs.filter((x) => x.status !== 'rejected' && x.status !== 'draft')
    const f = contractFile(c, a.amendments)
    const certified = live.reduce((n, x) => n + (x.certifiedAmount ?? 0), 0)
    if (f.current > 0 && certified > f.current * 1.001) out.push({ key: `over-certified:${c.id}`, severity: 'critical', masterProjectId: c.masterProjectId, sourceType: 'contract', sourceId: c.id, title: `مبلغ تأییدشدهٔ ${name} از مبلغ قرارداد بیشتر است`, detail: `تأییدشده ${Math.round(certified).toLocaleString('fa-IR')} در برابر مبلغ اصلاح‌شده ${Math.round(f.current).toLocaleString('fa-IR')}`, suggestion: 'الحاقیه یا درخواست تغییر مصوب بررسی شود؛ در غیر این صورت پرداخت مازاد متوقف شود.' })
    const seen = new Map<string, number>()
    for (const x of certs) seen.set(x.certificateNumber, (seen.get(x.certificateNumber) ?? 0) + 1)
    for (const [num, n] of seen) if (n > 1 && num) out.push({ key: `dup-cert:${c.id}:${num}`, severity: 'high', masterProjectId: c.masterProjectId, sourceType: 'contract', sourceId: c.id, title: `شمارهٔ صورت‌وضعیت ${num} در ${name} ${n} بار ثبت شده`, detail: 'احتمال ثبت تکراری', suggestion: 'مبلغ و تاریخ ردیف‌ها مقایسه و ردیف اضافه حذف یا اصلاح شود.' })
    const gross = live.filter((x) => x.certificateType !== 'adjustment').map((x) => x.grossAmount).filter((v) => v > 0)
    const med = median(gross)
    if (gross.length >= 4) for (const x of live) if (x.certificateType !== 'adjustment' && med > 0 && x.grossAmount > med * 2.5) out.push({ key: `outlier:${x.id}`, severity: 'medium', masterProjectId: c.masterProjectId, sourceType: 'certificate', sourceId: x.id, title: `صورت‌وضعیت ${x.certificateNumber} (${name}) ${(x.grossAmount / med).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} برابر میانهٔ صورت‌وضعیت‌های قبلی است`, detail: 'جهش غیرعادی کارکرد', suggestion: 'با پیشرفت فیزیکی و برنامهٔ زمان‌بندی مطابقت داده شود.' })
    for (const x of live) if (x.paidAmount > (x.certifiedAmount ?? x.payableAmount) * 1.001 && (x.certifiedAmount ?? x.payableAmount) > 0) out.push({ key: `overpaid:${x.id}`, severity: 'high', masterProjectId: c.masterProjectId, sourceType: 'certificate', sourceId: x.id, title: `پرداخت صورت‌وضعیت ${x.certificateNumber} (${name}) از مبلغ تأییدشده بیشتر است`, detail: `پرداخت ${Math.round(x.paidAmount).toLocaleString('fa-IR')} > تأییدشده ${Math.round(x.certifiedAmount ?? x.payableAmount).toLocaleString('fa-IR')}`, suggestion: 'مازاد از صورت‌وضعیت بعدی کسر یا استرداد شود.' })
    const adv = advanceStatus(c, a.amendments, a.certificates)
    if (adv?.behind && c.status === 'active') out.push({ key: `advance:${c.id}`, severity: 'medium', masterProjectId: c.masterProjectId, sourceType: 'contract', sourceId: c.id, title: `استهلاک پیش‌پرداخت ${name} از پیشرفت مالی عقب است`, detail: `کارکرد تأییدشده ${adv.certifiedPct.toLocaleString('fa-IR')}٪ ولی ${adv.recoveredPct.toLocaleString('fa-IR')}٪ پیش‌پرداخت مستهلک شده`, suggestion: 'کسر پیش‌پرداخت در صورت‌وضعیت‌های بعدی با درصد قرارداد تطبیق داده شود.' })
    if (f.current > 0 && c.status === 'completed' && adv && adv.balance > adv.advance * 0.02) out.push({ key: `advance-open:${c.id}`, severity: 'high', masterProjectId: c.masterProjectId, sourceType: 'contract', sourceId: c.id, title: `قرارداد تکمیل‌شدهٔ ${name} پیش‌پرداخت مستهلک‌نشده دارد`, detail: `مانده ${Math.round(adv.balance).toLocaleString('fa-IR')}`, suggestion: 'پیش از آزادسازی حسن انجام کار تسویه شود.' })
    const ss = a.clearances.find((x) => x.contractId === c.id && x.kind === 'social_security')
    if (c.status === 'completed' && (!ss || ss.status !== 'issued')) out.push({ key: `clearance-missing:${c.id}`, severity: 'high', masterProjectId: c.masterProjectId, sourceType: 'contract', sourceId: c.id, title: `برای قرارداد تکمیل‌شدهٔ ${name} مفاصاحساب تأمین اجتماعی صادرشده ثبت نشده`, detail: 'پیش‌شرط آزادسازی تضامین و حسن انجام کار', suggestion: 'وضعیت مفاصاحساب پیگیری و ثبت شود.' })
    for (const cl of a.clearances.filter((x) => x.contractId === c.id)) if (cl.status === 'issued' && cl.expiryDate && daysBetween(cl.expiryDate, a.today) < 0) out.push({ key: `clearance-expired:${c.id}:${cl.kind}`, severity: 'medium', masterProjectId: c.masterProjectId, sourceType: 'contract', sourceId: c.id, title: `${CLEARANCE_FA[cl.kind]} ${name} منقضی شده است`, detail: `${-daysBetween(cl.expiryDate, a.today)} روز از انقضا`, suggestion: 'تمدید یا دریافت مفاصاحساب جدید.' })
  }
  const rank = { critical: 0, high: 1, medium: 2 }
  return out.sort((x, y) => rank[x.severity] - rank[y.severity])
}
