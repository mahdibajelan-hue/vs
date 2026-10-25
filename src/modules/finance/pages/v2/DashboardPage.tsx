import { useMemo, useState } from 'react'
import { Briefcase, Coins, FileText, Gauge, Landmark } from 'lucide-react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar } from 'recharts'
import type { LucideIcon } from 'lucide-react'
import { useKpiModel, type ProjectRow } from '../../lib/useKpiModel'
import { toneOf, type KpiDef, type ProjectKpi, type Role, type Tone } from '../../lib/financeKpis'
import { Chip, DataTable, KpiCard, Section, StackBar, fmtBn, fmtPct, splitMoney, type Col } from '../../components/fn'
import { exportFinanceReportToExcel } from '../../lib/financeExport'
import type { FinTab } from '../../FinanceApp'
import { useFinanceStore } from '../../store/useFinanceStore'
import { useFinanceControlStore } from '../../store/useFinanceControlStore'
import { buildCurves, isoMonthIdx } from '../../lib/financeCurves'
import { certificateOutstanding } from '../../lib/financeCalc'
import { contractFile, daysBetween } from '../../lib/financeControl'
import { ChartTip, Donut, HBars, PB, Ring, Tile, Waterfall, axisProps, gridProps } from '../../components/charts'
import { JALALI_MONTHS } from '../../../../lib/jalali'

const ROLES: { id: Role; label: string; icon: LucideIcon; blurb: string; portfolio: boolean }[] = [
  { id: 'ceo', label: 'مدیرعامل', icon: Briefcase, blurb: 'تصویر کلان سبد: بودجه، تعهد، هزینهٔ نهایی و پروژه‌هایی که تصمیم می‌خواهند', portfolio: true },
  { id: 'pm', label: 'مدیر پروژه', icon: Gauge, blurb: 'یک پروژه: پیشرفت فیزیکی در برابر مالی، هزینهٔ نهایی، نقدینگی و کارهای باز', portfolio: false },
  { id: 'finance', label: 'امور مالی و بودجه', icon: Coins, blurb: 'مصرف بودجه، بدهی‌های معوق، نقدینگی و انحراف از برنامهٔ نقدی', portfolio: true },
  { id: 'contracts', label: 'امور قراردادها', icon: FileText, blurb: 'سلامت قراردادها: الحاقیه، تغییرات، ضمانت‌نامه، ادعا و مفاصاحساب', portfolio: true },
]

/** Sums the money of several projects; ratios are recomputed from the sums (never averaged). Foreign-currency exposure is already in rial equivalent. */
function aggregate(rows: ProjectRow[]): ProjectKpi {
  const k = rows.map((r) => r.kpi)
  const sum = (f: (x: ProjectKpi) => number) => k.reduce((n, x) => n + f(x), 0)
  const bac = sum((x) => x.bac), committed = sum((x) => x.committed), paid = sum((x) => x.paid), eac = sum((x) => x.eac)
  const valueOriginal = sum((x) => x.valueOriginal), valueCurrent = sum((x) => x.valueCurrent)
  const delays = k.map((x) => x.avgDelay).filter((x): x is number => x != null)
  return {
    bac, annual: null, linesTotal: sum((x) => x.linesTotal), unallocated: sum((x) => x.unallocated), committedContracts: sum((x) => x.committedContracts), landExposure: sum((x) => x.landExposure), committed,
    committedPct: bac > 0 ? Math.round((committed / bac) * 1000) / 10 : null, certified: sum((x) => x.certified), paid, paidPct: bac > 0 ? Math.round((paid / bac) * 1000) / 10 : null, remaining: bac - committed,
    eac, scenarioEac: sum((x) => x.scenarioEac), vac: bac > 0 ? bac - eac : 0, overrun: 'none', overdueAmount: sum((x) => x.overdueAmount), avgDelay: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null,
    pendingCerts: sum((x) => x.pendingCerts), cashNext3: sum((x) => x.cashNext3), cashDeviationPct: null, unpaidCertified: sum((x) => x.unpaidCertified), activeContracts: sum((x) => x.activeContracts), valueOriginal, valueCurrent,
    growthPct: valueOriginal > 0 ? Math.round(((valueCurrent - valueOriginal) / valueOriginal) * 1000) / 10 : 0, pendingChanges: sum((x) => x.pendingChanges), pendingChangesAmount: sum((x) => x.pendingChangesAmount),
    guaranteesAtRisk: sum((x) => x.guaranteesAtRisk), claimsOpen: sum((x) => x.claimsOpen), clearancesMissing: sum((x) => x.clearancesMissing), advanceOpen: sum((x) => x.advanceOpen), physical: null, financialPct: null, gapPct: null, cpi: null,
  }
}

const money = (n: number) => splitMoney(n)
function mk(def: Omit<KpiDef, 'value'> & { value: string }): KpiDef { return def }

function kpisFor(role: Role, k: ProjectKpi, rows: ProjectRow[], th: Parameters<typeof toneOf.committedPct>[1], critical: number): KpiDef[] {
  const m = (n: number) => money(n)
  const risky = rows.filter((r) => r.kpi.overrun === 'likely' || r.kpi.overrun === 'possible').length
  if (role === 'ceo') return [
    { key: 'bac', label: 'بودجهٔ مصوب سبد', value: m(k.bac).v, unit: m(k.bac).u, sub: `تخصیص‌نیافته به ردیف: ${fmtBn(k.unallocated, 0)} میلیارد`, tone: 'neutral', hint: 'جمع بودجهٔ جاری پروژه‌ها (مصوب + تغییرات مصوب بودجه)', go: { tab: 'budget' } },
    { key: 'committed', label: 'تعهد‌شده', value: m(k.committed).v, unit: m(k.committed).u, sub: `${fmtPct(k.committedPct)} بودجه`, tone: toneOf.committedPct(k.committedPct, th), hint: 'قراردادهای فعال و تکمیل‌شده با مبلغ اصلاح‌شده + هزینه‌ی تملک اراضی (پرداخت + تعهد)', go: { tab: 'budget' } },
    { key: 'paid', label: 'پرداخت‌شده', value: m(k.paid).v, unit: m(k.paid).u, sub: `${fmtPct(k.paidPct)} بودجه`, tone: 'neutral', hint: 'جمع پرداخت واقعی به پیمانکاران و تملک اراضی', go: { tab: 'billing' } },
    { key: 'vac', label: k.vac < 0 ? 'کسری بودجه در پایان' : 'مانده بودجه در پایان', value: m(Math.abs(k.vac)).v, unit: m(Math.abs(k.vac)).u, sub: `هزینهٔ نهایی ${m(k.eac).v} ${m(k.eac).u}`, tone: toneOf.vac(k.vac, k.bac), hint: 'بودجه منهای هزینهٔ نهایی پیش‌بینی‌شده (قراردادهای مصوب + تملک)', go: { tab: 'budget', sub: 'cost' } },
    { key: 'risky', label: 'پروژه در خطر تجاوز', value: risky.toLocaleString('fa-IR'), sub: `از ${rows.length.toLocaleString('fa-IR')} پروژه`, tone: toneOf.count(risky, 1, 2), hint: 'پروژه‌هایی که هزینهٔ نهایی مصوب یا سناریوی تغییرات از بودجه بیشتر می‌شود' },
    { key: 'cash3', label: 'نقدینگی لازم ۳ ماه آینده', value: m(k.cashNext3).v, unit: m(k.cashNext3).u, sub: 'پیش‌بینی پرداخت‌ها', tone: 'neutral', hint: 'پیش‌بینی پرداخت سه ماه آینده از برنامهٔ ماهانه یا مانده‌ی قراردادها', go: { tab: 'cash' } },
    { key: 'crit', label: 'مورد بحرانی', value: critical.toLocaleString('fa-IR'), sub: 'نیازمند تصمیم', tone: toneOf.count(critical, 1, 2), hint: 'ضمانت‌نامهٔ منقضی، کسری بودجه و … ', go: { tab: 'attention' } },
    { key: 'growth', label: 'رشد قراردادها از الحاقیه', value: fmtPct(k.growthPct), sub: `${k.pendingChanges.toLocaleString('fa-IR')} تغییر در جریان`, tone: toneOf.growth(k.growthPct, th), hint: 'مبلغ جاری قراردادها نسبت به مبلغ اولیه', go: { tab: 'contracts', sub: 'changes' } },
  ].map((x) => mk(x as never))
  if (role === 'pm') return [
    { key: 'phys', label: 'پیشرفت فیزیکی', value: fmtPct(k.physical), sub: k.physical == null ? 'پیشرفتی ثبت نشده' : 'از چرخهٔ عمر پروژه', tone: 'neutral', hint: 'پیشرفت واقعی پروژه — همان عدد رادار، چرخهٔ عمر و داشبورد پروژه' },
    { key: 'fin', label: 'پیشرفت مالی', value: fmtPct(k.financialPct), sub: k.gapPct == null ? 'تأییدشده ÷ مبلغ قرارداد' : `${k.gapPct > 0 ? 'پرداخت جلوتر از کار' : 'کار جلوتر از پرداخت'}: ${fmtPct(Math.abs(k.gapPct))}`, tone: toneOf.gap(k.gapPct), hint: 'مبلغ تأییدشدهٔ صورت‌وضعیت‌ها ÷ مبلغ اصلاح‌شدهٔ قراردادها', go: { tab: 'billing' } },
    { key: 'cpi', label: 'شاخص عملکرد هزینه (CPI)', value: k.cpi == null ? '—' : k.cpi.toLocaleString('fa-IR'), sub: k.cpi == null ? 'نیازمند پیشرفت فیزیکی' : k.cpi >= 1 ? 'هزینه کمتر از ارزش کار انجام‌شده' : 'هزینه بیش از ارزش کار انجام‌شده', tone: toneOf.cpi(k.cpi), hint: 'ارزش کسب‌شده (بودجه × پیشرفت فیزیکی) ÷ هزینهٔ تأییدشده؛ بالای ۱ یعنی مطلوب' },
    { key: 'eac', label: k.vac < 0 ? 'کسری بودجه در پایان' : 'مانده بودجه در پایان', value: m(Math.abs(k.vac)).v, unit: m(Math.abs(k.vac)).u, sub: `هزینهٔ نهایی ${m(k.eac).v} ${m(k.eac).u} از ${m(k.bac).v} ${m(k.bac).u}`, tone: toneOf.vac(k.vac, k.bac), hint: 'بودجه منهای هزینهٔ نهایی پیش‌بینی‌شده', go: { tab: 'budget', sub: 'cost' } },
    { key: 'rem', label: k.remaining < 0 ? 'کسری نسبت به تعهدات' : 'بودجهٔ آزاد (بدون تعهد)', value: m(k.remaining).v, unit: m(k.remaining).u, sub: `تعهد ${fmtPct(k.committedPct)}`, tone: toneOf.committedPct(k.committedPct, th), hint: 'بودجه منهای تعهدات', go: { tab: 'budget' } },
    { key: 'cash3', label: 'نقدینگی لازم ۳ ماه آینده', value: m(k.cashNext3).v, unit: m(k.cashNext3).u, sub: 'پیش‌بینی پرداخت‌ها', tone: 'neutral', hint: 'پیش‌بینی پرداخت‌ها', go: { tab: 'cash' } },
    { key: 'chg', label: 'تغییر در جریان تصویب', value: k.pendingChanges.toLocaleString('fa-IR'), sub: k.pendingChanges ? `مبلغ پیشنهادی ${m(k.pendingChangesAmount).v} ${m(k.pendingChangesAmount).u}` : 'موردی نیست', tone: toneOf.count(k.pendingChanges, 1, 3), hint: 'درخواست‌های تغییر قراردادی هنوز تصویب‌نشده (سناریو، مصوب نیست)', go: { tab: 'contracts', sub: 'changes' } },
    { key: 'open', label: 'موارد باز', value: critical.toLocaleString('fa-IR'), sub: 'بحرانی', tone: toneOf.count(critical, 1, 2), hint: 'استثناهای مالی و قراردادی این پروژه', go: { tab: 'attention' } },
  ].map((x) => mk(x as never))
  if (role === 'finance') return [
    { key: 'use', label: 'مصرف بودجه (تعهد)', value: fmtPct(k.committedPct), sub: `پرداخت ${fmtPct(k.paidPct)} · مانده ${m(k.remaining).v} ${m(k.remaining).u}`, tone: toneOf.committedPct(k.committedPct, th), hint: 'تعهدات ÷ بودجهٔ جاری', go: { tab: 'budget' } },
    { key: 'unalloc', label: 'بودجهٔ بدون ردیف', value: m(k.unallocated).v, unit: m(k.unallocated).u, sub: `از ${m(k.bac).v} ${m(k.bac).u}`, tone: k.bac > 0 && k.unallocated > k.bac * 0.1 ? 'warn' : 'neutral', hint: 'بخشی از بودجه که هنوز به ردیف بودجه تقسیم نشده', go: { tab: 'budget' } },
    { key: 'unpaid', label: 'تأییدشده، پرداخت‌نشده', value: m(k.unpaidCertified).v, unit: m(k.unpaidCertified).u, sub: 'مبلغ تأییدشده منهای پرداخت', tone: 'neutral', hint: 'جمع مبلغ تأییدشده منهای پرداخت‌ها در قراردادها', go: { tab: 'billing' } },
    { key: 'overdue', label: 'پرداخت معوق', value: m(k.overdueAmount).v, unit: m(k.overdueAmount).u, sub: `از ${k.avgDelay == null ? '—' : k.avgDelay.toLocaleString('fa-IR')} روز میانگین تأخیر`, tone: k.overdueAmount > 0 ? 'bad' : 'good', hint: 'مبلغ صورت‌وضعیت‌های تأییدشده که بیش از مهلت پرداخت نشده‌اند', go: { tab: 'billing' } },
    { key: 'wait', label: 'صورت‌وضعیت در انتظار', value: k.pendingCerts.toLocaleString('fa-IR'), sub: 'ارائه‌شده یا در بررسی', tone: toneOf.count(k.pendingCerts, 3, 6), hint: 'منتظر بررسی و تأیید', go: { tab: 'billing' } },
    { key: 'cash3', label: 'نقدینگی لازم ۳ ماه آینده', value: m(k.cashNext3).v, unit: m(k.cashNext3).u, sub: 'پیش‌بینی پرداخت‌ها', tone: 'neutral', hint: 'پیش‌بینی پرداخت‌ها', go: { tab: 'cash' } },
    { key: 'dev', label: 'انحراف نقدی از برنامهٔ پایه', value: k.cashDeviationPct == null ? '—' : fmtPct(k.cashDeviationPct), sub: k.cashDeviationPct == null ? 'برنامهٔ پایه وارد نشده' : k.cashDeviationPct < 0 ? 'پرداخت کمتر از برنامه' : 'پرداخت بیش از برنامه', tone: k.cashDeviationPct == null ? 'neutral' : Math.abs(k.cashDeviationPct) > 15 ? 'bad' : Math.abs(k.cashDeviationPct) > 5 ? 'warn' : 'good', hint: 'پرداخت واقعی تجمعی در برابر برنامهٔ پایهٔ کارفرما تا امروز', go: { tab: 'cash' } },
    { key: 'paid', label: 'پرداخت‌شده تا امروز', value: m(k.paid).v, unit: m(k.paid).u, sub: `${fmtPct(k.paidPct)} بودجه`, tone: 'neutral', hint: 'پرداخت واقعی', go: { tab: 'billing' } },
  ].map((x) => mk(x as never))
  return [
    { key: 'act', label: 'قرارداد فعال', value: k.activeContracts.toLocaleString('fa-IR'), sub: `ارزش جاری ${m(k.valueCurrent).v} ${m(k.valueCurrent).u}`, tone: 'neutral', hint: 'تعداد قراردادهای در وضعیت فعال', go: { tab: 'contracts' } },
    { key: 'growth', label: 'رشد تجمعی مبلغ قراردادها', value: fmtPct(k.growthPct), sub: `از ${m(k.valueOriginal).v} به ${m(k.valueCurrent).v} ${m(k.valueCurrent).u}`, tone: toneOf.growth(k.growthPct, th), hint: 'مبلغ اصلاح‌شده نسبت به مبلغ اولیه، با الحاقیه‌های تصویب‌شده', go: { tab: 'contracts', sub: 'changes' } },
    { key: 'chg', label: 'تغییر منتظر تصمیم', value: k.pendingChanges.toLocaleString('fa-IR'), sub: k.pendingChanges ? `${m(k.pendingChangesAmount).v} ${m(k.pendingChangesAmount).u} پیشنهادی` : 'موردی نیست', tone: toneOf.count(k.pendingChanges, 1, 4), hint: 'درخواست‌های تغییر در جریان', go: { tab: 'contracts', sub: 'changes' } },
    { key: 'guar', label: 'ضمانت‌نامه در خطر', value: k.guaranteesAtRisk.toLocaleString('fa-IR'), sub: `انقضا تا ${th.guaranteeExpiryDays.toLocaleString('fa-IR')} روز آینده`, tone: toneOf.count(k.guaranteesAtRisk, 1, 3), hint: 'ضمانت‌نامه‌های فعال نزدیک به انقضا یا منقضی', go: { tab: 'contracts', sub: 'guarantees' } },
    { key: 'claims', label: 'ادعاهای باز', value: m(k.claimsOpen).v, unit: m(k.claimsOpen).u, sub: 'ادعای بی‌تصمیم', tone: k.claimsOpen > 0 ? 'warn' : 'good', hint: 'جمع مبلغ ادعاهای بی‌تصمیم', go: { tab: 'contracts', sub: 'claims' } },
    { key: 'clr', label: 'مفاصاحساب ناقص', value: k.clearancesMissing.toLocaleString('fa-IR'), sub: 'قرارداد تکمیل‌شده بدون تأمین اجتماعی', tone: toneOf.count(k.clearancesMissing, 1, 3), hint: 'پیش‌شرط آزادسازی تضامین و حسن انجام کار', go: { tab: 'contracts', sub: 'guarantees' } },
    { key: 'adv', label: 'پیش‌پرداخت مستهلک‌نشده', value: m(k.advanceOpen).v, unit: m(k.advanceOpen).u, sub: `در قراردادهای پایان‌یافته`, tone: k.advanceOpen > 0 ? 'bad' : 'good', hint: 'مانده‌ی پیش‌پرداخت قراردادهای تکمیل یا فسخ‌شده', go: { tab: 'contracts', sub: 'guarantees' } },
    { key: 'delay', label: 'میانگین تأخیر پرداخت', value: k.avgDelay == null ? '—' : k.avgDelay.toLocaleString('fa-IR'), sub: 'روز از تأیید تا پرداخت', tone: k.avgDelay == null ? 'neutral' : k.avgDelay > th.overdueCertificateDays ? 'bad' : k.avgDelay > th.overdueCertificateDays / 2 ? 'warn' : 'good', hint: 'میانگین فاصلهٔ تأیید و پرداخت صورت‌وضعیت‌های پرداخت‌شده', go: { tab: 'billing' } },
  ].map((x) => mk(x as never))
}

const STATUS: Record<string, { t: Tone; l: string }> = { none: { t: 'good', l: 'در محدوده' }, watch: { t: 'warn', l: 'نزدیک سقف' }, possible: { t: 'warn', l: 'احتمال تجاوز' }, likely: { t: 'bad', l: 'تجاوز' } }

export function DashboardPage({ projectId, onProject, onGo }: { projectId: string | null; onProject: (id: string) => void; onGo: (tab: FinTab, sub?: string) => void }) {
  const { rows, exceptions, thresholds } = useKpiModel()
  const [role, setRole] = useState<Role>(() => { try { return (localStorage.getItem('fn-role') as Role) || 'ceo' } catch { return 'ceo' } })
  const pick = (r: Role) => { setRole(r); try { localStorage.setItem('fn-role', r) } catch { /* private mode */ } }
  const def = ROLES.find((r) => r.id === role)!
  const scope = def.portfolio ? rows : rows.filter((r) => r.id === (projectId ?? rows[0]?.id))
  const k = useMemo(() => (scope.length === 1 ? scope[0].kpi : aggregate(scope)), [scope])
  const ids = new Set(scope.map((r) => r.id))
  const exc = exceptions.filter((e) => ids.has(e.masterProjectId))
  const critical = scope.reduce((n, r) => n + r.critical, 0)
  const fin = useFinanceStore()
  const ctl = useFinanceControlStore()
  const today = new Date().toISOString().slice(0, 10)
  const nowIdx = isoMonthIdx(today) ?? 0
  const vis = useMemo(() => {
    const contracts = fin.contracts.filter((c) => ids.has(c.masterProjectId) && c.status !== 'draft' && c.status !== 'replaced')
    const cids = new Set(contracts.map((c) => c.id))
    const certs = fin.certificates.filter((c) => cids.has(c.contractId))
    const curves = buildCurves({ contracts, amendments: fin.amendments, certificates: certs, payments: fin.payments, plans: ctl.plans.filter((p) => ids.has(p.projectId)), manualForecasts: fin.cashflowForecasts.filter((f) => cids.has(f.contractId)), fund: { fund: 'rial', currency: 'ریال' }, todayIso: today })
    const act = curves.months.filter((m) => !m.isFuture).slice(-12)
    const fut = curves.months.filter((m) => m.idx > nowIdx && m.idx <= nowIdx + 6)
    const aging = [0, 0, 0, 0]
    for (const c of certs) { if (c.status !== 'certified' && c.status !== 'partially_paid') continue; const since = c.approvedDate ?? c.certifiedDate; if (!since) continue; const d = daysBetween(today, since); aging[d <= 30 ? 0 : d <= 60 ? 1 : d <= 90 ? 2 : 3] += certificateOutstanding(c) }
    const growth = contracts.filter((c) => c.status === 'active').map((c) => ({ name: (c.contractNumber || c.title).slice(0, 14), value: contractFile(c, fin.amendments).increasePct })).sort((a, b) => b.value - a.value).slice(0, 8)
    const guars = fin.guarantees.filter((g) => cids.has(g.contractId) && g.status === 'active' && g.expiryDate).map((g) => ({ name: g.number.slice(0, 14), value: daysBetween(g.expiryDate!, today) })).sort((a, b) => a.value - b.value).slice(0, 6)
    const statusCount = ['active', 'completed', 'suspended', 'terminated'].map((s) => ({ s, n: contracts.filter((c) => c.status === s).length }))
    return { curves, act, fut, aging, growth, guars, statusCount }
  }, [fin.contracts, fin.certificates, fin.amendments, fin.payments, fin.cashflowForecasts, fin.guarantees, ctl.plans, ids, today, nowIdx])
  const sparks: Record<string, number[]> = { paid: vis.act.map((m) => (m.cumActual ?? 0) / 1e9), cash3: vis.fut.map((m) => m.forecast / 1e9) }
  const defs = kpisFor(role, k, scope, thresholds, critical)
  const bn = (v: number) => (v / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: 0 })
  const scenarioDelta = Math.max(0, k.scenarioEac - k.eac)
  const certifiedUnpaid = Math.max(0, k.certified - k.paid)
  const monthName = (jy: number, jm: number) => `${JALALI_MONTHS[jm - 1]} ${(jy % 100).toLocaleString('fa-IR', { minimumIntegerDigits: 2 })}`
  const flow = vis.curves.months.filter((m) => m.idx >= nowIdx - 8 && m.idx <= nowIdx + 6).map((m) => ({ name: monthName(m.jy, m.jm), 'مبنا': m.cumBaseline / 1e9, 'واقعی': m.cumActual == null ? null : m.cumActual / 1e9, 'پیش‌بینی': m.cumForecast == null ? null : m.cumForecast / 1e9, 'پرداخت ماهانه': m.isFuture ? null : m.actual / 1e9 }))

  const cols: Col<ProjectRow>[] = [
    { key: 'p', label: 'پروژه', render: (r) => <span className="strong">{r.name}</span>, sort: (r) => r.name },
    { key: 'b', label: 'بودجه', num: true, render: (r) => (r.kpi.bac ? fmtBn(r.kpi.bac, 0) : '—'), sort: (r) => r.kpi.bac, foot: fmtBn(k.bac, 0) },
    { key: 'u', label: 'مصرف بودجه', w: 220, render: (r) => (
      <div style={{ minWidth: 150 }}><StackBar max={r.kpi.bac || r.kpi.committed} marker={r.kpi.bac} segs={[{ v: Math.min(r.kpi.paid, r.kpi.committed), c: 'var(--im-mint)', label: 'پرداخت‌شده' }, { v: Math.max(0, r.kpi.committed - r.kpi.paid), c: 'var(--im-sky)', label: 'تعهد پرداخت‌نشده' }]} /><span className="sub">{fmtPct(r.kpi.committedPct, 0)} تعهد · {fmtPct(r.kpi.paidPct, 0)} پرداخت</span></div>), sort: (r) => r.kpi.committedPct ?? 0 },
    { key: 'c', label: 'تعهد', num: true, render: (r) => fmtBn(r.kpi.committed, 0), sort: (r) => r.kpi.committed, foot: fmtBn(k.committed, 0) },
    { key: 'e', label: 'هزینهٔ نهایی', num: true, render: (r) => fmtBn(r.kpi.eac, 0), sort: (r) => r.kpi.eac, foot: fmtBn(k.eac, 0), hint: 'قراردادهای مصوب + تملک؛ بدون سناریوی تغییرات' },
    { key: 'v', label: 'انحراف', num: true, render: (r) => <span style={{ color: r.kpi.vac < 0 ? 'var(--im-coral)' : undefined }}>{r.kpi.bac ? fmtBn(r.kpi.vac, 0) : '—'}</span>, sort: (r) => r.kpi.vac, foot: fmtBn(k.vac, 0) },
    { key: 'x', label: 'مورد باز', num: true, render: (r) => (r.exceptions ? <b style={{ color: r.critical ? 'var(--im-coral)' : undefined }}>{r.exceptions.toLocaleString('fa-IR')}</b> : '—'), sort: (r) => r.exceptions },
    { key: 's', label: 'وضعیت', render: (r) => <Chip tone={STATUS[r.kpi.overrun].t}>{STATUS[r.kpi.overrun].l}</Chip> },
  ]
  const exportIt = () => void exportFinanceReportToExcel(scope.map((r) => ({ 'پروژه': r.name, 'بودجه (ریال)': Math.round(r.kpi.bac), 'تعهد': Math.round(r.kpi.committed), 'پرداخت': Math.round(r.kpi.paid), 'هزینه نهایی': Math.round(r.kpi.eac), 'انحراف': Math.round(r.kpi.vac), 'موارد باز': r.exceptions })), `داشبورد-${def.label}.xlsx`)

  return (
    <div>
      <div className="fn-who no-print" role="tablist" aria-label="دیدگاه">
        {ROLES.map((r) => <button key={r.id} role="tab" aria-selected={role === r.id} className={role === r.id ? 'on' : ''} onClick={() => pick(r.id)}><r.icon size={16} aria-hidden /><span>{r.label}</span></button>)}
      </div>
      <p className="fn-blurb">{def.blurb}{!def.portfolio && scope[0] && <> · <b>{scope[0].name}</b>{rows.length > 1 && <select className="fn-inline-select" value={scope[0].id} onChange={(e) => onProject(e.target.value)} aria-label="پروژه">{rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}</>}</p>

      {scope.length === 0 ? <div className="im-card im-empty">هنوز قرارداد، بودجه یا پرداختی ثبت نشده است. از بخش «قراردادها» و «بودجه و هزینه» شروع کنید.</div> : (
        <>
          <div className="fn-kpis">{defs.map((d, i) => <KpiCard key={d.key} i={i} label={d.label} value={d.value} unit={d.unit} sub={d.sub} tone={d.tone} hint={d.hint} spark={sparks[d.key]} sparkColor={d.key === 'paid' ? PB.teal : PB.violet} onClick={d.go ? () => onGo(d.go!.tab as FinTab, d.go!.sub) : undefined} />)}</div>


          <div className="fn-tiles">
            {role !== 'contracts' && <Tile title="از بودجه تا مانده" hint="میلیارد ریال" span={role === 'pm' ? undefined : undefined}>
              <Waterfall fmt={bn} steps={[{ label: 'بودجه', value: k.bac, kind: 'total', color: PB.blue }, { label: 'قراردادها', value: -k.committedContracts, kind: 'delta' }, { label: 'تملک', value: -k.landExposure, kind: 'delta', color: PB.violet }, { label: 'تغییرات در جریان', value: -scenarioDelta, kind: 'delta', color: PB.yellow }, { label: 'مانده', value: k.bac - k.eac - scenarioDelta, kind: 'total', color: PB.teal }]} />
            </Tile>}
            {role !== 'contracts' && <Tile title="ترکیب بودجه" hint="پرداخت، تأیید، تعهد و آزاد">
              <Donut fmt={(v) => `${bn(v)} م`} center={{ v: fmtPct(k.committedPct, 0), l: 'تعهد‌شده' }} data={[{ name: 'پرداخت‌شده', value: Math.min(k.paid, k.committed), color: PB.teal }, { name: 'تأییدشده، پرداخت‌نشده', value: certifiedUnpaid, color: PB.yellow }, { name: 'تعهد، هنوز تأییدنشده', value: Math.max(0, k.committed - Math.max(k.certified, k.paid)), color: PB.blue }, { name: 'آزاد', value: Math.max(0, k.bac - k.committed), color: 'var(--im-panel-3)' }]} />
            </Tile>}
            {role === 'pm' ? (
              <Tile title="پیشرفت و مصرف"><div className="fn-rings"><Ring pct={k.physical} color={PB.blue} label="فیزیکی" /><Ring pct={k.financialPct} color={PB.teal} label="مالی" /><Ring pct={k.committedPct} color={k.committedPct != null && k.committedPct > 100 ? PB.coral : PB.yellow} label="تعهد بودجه" /></div></Tile>
            ) : role === 'finance' ? (
              <Tile title="سنی‌بندی بدهی تأییدشده" hint="روز از تأیید؛ میلیارد ریال"><HBars fmt={bn} data={[{ name: '۰–۳۰ روز', value: vis.aging[0], color: PB.teal }, { name: '۳۱–۶۰ روز', value: vis.aging[1], color: PB.yellow }, { name: '۶۱–۹۰ روز', value: vis.aging[2], color: PB.orange }, { name: 'بیش از ۹۰', value: vis.aging[3], color: PB.coral }]} /></Tile>
            ) : role === 'contracts' ? (
              <Tile title="رشد مبلغ قراردادها" hint="٪ نسبت به مبلغ اولیه"><HBars fmt={(v) => `${v.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`} data={vis.growth.length ? vis.growth : [{ name: '—', value: 0 }]} /></Tile>
            ) : (
              <Tile title="انحراف پروژه‌ها از بودجه" hint="میلیارد ریال؛ منفی = کسری"><HBars fmt={bn} data={scope.map((r) => ({ name: r.name.slice(0, 16), value: r.kpi.bac ? r.kpi.vac : 0, color: r.kpi.vac < 0 ? PB.coral : PB.teal }))} /></Tile>
            )}
            {role === 'contracts' && <Tile title="ضمانت‌نامه‌ها: روز تا انقضا" hint="کمترین مانده اول"><HBars fmt={(v) => `${v.toLocaleString('fa-IR')} روز`} data={vis.guars.length ? vis.guars.map((g) => ({ ...g, color: g.value < 0 ? PB.coral : g.value < 60 ? PB.yellow : PB.teal })) : [{ name: '—', value: 0 }]} /></Tile>}
            {role === 'contracts' && <Tile title="وضعیت قراردادها"><Donut fmt={(v) => v.toLocaleString('fa-IR')} center={{ v: vis.statusCount.reduce((n, x) => n + x.n, 0).toLocaleString('fa-IR'), l: 'قرارداد' }} data={[{ name: 'فعال', value: vis.statusCount[0].n, color: PB.teal }, { name: 'تکمیل‌شده', value: vis.statusCount[1].n, color: PB.blue }, { name: 'متوقف', value: vis.statusCount[2].n, color: PB.yellow }, { name: 'فسخ‌شده', value: vis.statusCount[3].n, color: PB.coral }]} /></Tile>}
            <Tile title="پرداخت تجمعی: مبنا، واقعی، پیش‌بینی" hint="میلیارد ریال" span={role === 'contracts' ? 3 : 3}>
              {flow.length < 2 ? <p className="im-helper">هنوز داده‌ی نقدی نیست.</p> : (
                <div dir="ltr" style={{ height: 250 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={flow} margin={{ left: 4, right: 8, top: 6 }}>
                  <defs><linearGradient id="dB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PB.blue} stopOpacity={0.32} /><stop offset="100%" stopColor={PB.blue} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid {...gridProps} /><XAxis dataKey="name" {...axisProps} /><YAxis {...axisProps} width={44} tickFormatter={(v: number) => v.toLocaleString('fa-IR')} /><Tooltip content={<ChartTip unit="میلیارد" />} />
                  <Area dataKey="مبنا" stroke={PB.blue} strokeWidth={2.2} fill="url(#dB)" dot={false} /><Bar dataKey="پرداخت ماهانه" fill={PB.teal} fillOpacity={0.55} radius={[4, 4, 0, 0]} barSize={12} />
                  <Line dataKey="واقعی" stroke={PB.teal} strokeWidth={3} dot={false} connectNulls={false} /><Line dataKey="پیش‌بینی" stroke={PB.violet} strokeWidth={2.6} strokeDasharray="7 5" dot={false} connectNulls={false} />
                </ComposedChart></ResponsiveContainer></div>
              )}
            </Tile>
          </div>

          {(def.portfolio) && (
            <Section title="وضعیت پروژه‌ها" hint="مبالغ به میلیارد ریال؛ روی ستون‌ها بزنید تا مرتب شود، روی ردیف بزنید تا پروژه باز شود" action={<button className="im-btn im-btn-ghost im-btn-sm" onClick={exportIt}>خروجی Excel</button>} flush>
              <DataTable cols={cols} rows={scope} rowKey={(r) => r.id} foot onRow={(r) => { onProject(r.id); onGo('budget') }} />
            </Section>
          )}
          {!def.portfolio && scope[0] && (
            <Section title="پیشرفت فیزیکی در برابر مالی" hint="فاصلهٔ این دو نشان می‌دهد پرداخت از کار جلوتر است یا عقب‌تر">
              {[{ l: 'فیزیکی', v: scope[0].kpi.physical, c: 'var(--im-sky)' }, { l: 'مالی (تأییدشده ÷ مبلغ قرارداد)', v: scope[0].kpi.financialPct, c: 'var(--im-mint)' }].map((b) => (
                <div key={b.l} style={{ marginBottom: 12 }}><div className="fn-row-between"><span>{b.l}</span><b className="fn-num">{fmtPct(b.v)}</b></div><StackBar max={100} segs={[{ v: b.v ?? 0, c: b.c, label: b.l }]} height={10} /></div>
              ))}
              {scope[0].kpi.physical == null && <p className="im-helper">پیشرفت فیزیکی از ماژول زمان‌بندی خوانده می‌شود؛ این پروژه هنوز به آن نگاشت نشده است.</p>}
            </Section>
          )}

          <Section title={`موارد نیازمند تصمیم (${exc.length.toLocaleString('fa-IR')})`} hint="مرتب‌شده بر اساس شدت" action={<button className="im-btn im-btn-ghost im-btn-sm" onClick={() => onGo('attention')}>همه و ثبت اقدام</button>} flush>
            <div className="fn-tbl-wrap"><table className="fn-tbl"><tbody>
              {exc.slice(0, 6).map((e) => (
                <tr key={e.key} className="click" onClick={() => { onProject(e.masterProjectId); onGo('attention') }}>
                  <td style={{ width: 90 }}><Chip tone={e.severity === 'critical' ? 'bad' : e.severity === 'high' ? 'warn' : 'neutral'}>{e.severity === 'critical' ? 'بحرانی' : e.severity === 'high' ? 'زیاد' : 'متوسط'}</Chip></td>
                  <td><span className="strong">{e.title}</span><span className="sub">{rows.find((r) => r.id === e.masterProjectId)?.name} · {e.detail}</span></td>
                </tr>
              ))}
              {exc.length === 0 && <tr><td className="fn-empty">مورد استثنایی نیست.</td></tr>}
            </tbody></table></div>
          </Section>
          <details className="fn-legend"><summary><Landmark size={13} /> شاخص‌ها چطور محاسبه می‌شوند؟</summary>
            <ul>{defs.map((d) => <li key={d.key}><b>{d.label}:</b> {d.hint}</li>)}</ul></details>
        </>
      )}
    </div>
  )
}
