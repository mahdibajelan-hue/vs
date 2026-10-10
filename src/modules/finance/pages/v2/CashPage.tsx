import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, Check } from 'lucide-react'
import { useFinanceStore } from '../../store/useFinanceStore'
import { useFinanceControlStore } from '../../store/useFinanceControlStore'
import { buildCurves, fundsOf, isoMonthIdx, type CashPlan, type Fund } from '../../lib/financeCurves'
import { exportFinanceReportToExcel } from '../../lib/financeExport'
import { JALALI_MONTHS } from '../../../../lib/jalali'
import { KpiCard, NumInput, Section, fmtPct, splitMoney } from '../../components/fn'

const mname = (jy: number, jm: number) => `${JALALI_MONTHS[jm - 1]} ${jy.toLocaleString('fa-IR', { useGrouping: false })}`

/**
 * Cash flow: the employer's baseline plan, the contractor's proposal, actual payments and the forecast on one screen, month by month.
 * Pick one contract to edit its two plans; «همه قراردادها» shows the sums. The employer can adopt the contractor's proposal as the baseline in one step.
 */
export function CashPage({ masterProjectId }: { masterProjectId: string }) {
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId && c.status !== 'draft' && c.status !== 'replaced')
  const amendments = useFinanceStore((s) => s.amendments)
  const certificates = useFinanceStore((s) => s.certificates)
  const payments = useFinanceStore((s) => s.payments)
  const forecasts = useFinanceStore((s) => s.cashflowForecasts)
  const plans = useFinanceControlStore((s) => s.plans)
  const savePlan = useFinanceControlStore((s) => s.savePlan)
  const [fundKey, setFundKey] = useState('rial|ریال')
  const [scope, setScope] = useState('all')
  const [busy, setBusy] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  const ids = useMemo(() => new Set(contracts.map((c) => c.id)), [contracts])
  const certs = useMemo(() => certificates.filter((c) => ids.has(c.contractId)), [certificates, ids])
  const funds = useMemo(() => fundsOf(contracts, plans.filter((p) => ids.has(p.contractId)), certs), [contracts, plans, ids, certs])
  const fund: Fund = funds.find((f) => `${f.fund}|${f.currency}` === fundKey) ?? funds[0]
  const scoped = scope === 'all' ? contracts : contracts.filter((c) => c.id === scope)
  const curves = useMemo(() => buildCurves({ contracts: scoped, amendments, certificates: certs, payments, plans, manualForecasts: forecasts, fund, todayIso: today }), [scoped, amendments, certs, payments, plans, forecasts, fund, today])
  const nowIdx = isoMonthIdx(today) ?? 0
  const rial = fund.fund === 'rial'
  const unit = rial ? 1e9 : 1
  const uLabel = rial ? 'میلیارد ریال' : fund.currency
  const fmtU = (n: number) => (n / unit).toLocaleString('fa-IR', { maximumFractionDigits: rial ? 1 : 0 })
  const editable = scope !== 'all'

  // rows: every month that has data, plus today and the next 6, capped
  const months = useMemo(() => {
    const idx = new Set(curves.months.map((m) => m.idx)); for (let k = -1; k <= 6; k++) idx.add(nowIdx + k)
    return [...idx].sort((a, b) => a - b).slice(-30).map((i) => curves.months.find((m) => m.idx === i) ?? { idx: i, jy: Math.floor(i / 12), jm: (i % 12) + 1, baseline: 0, contractor: 0, actual: 0, forecast: 0, isFuture: i > nowIdx, cumBaseline: 0, cumContractor: 0, cumActual: null, cumForecast: null })
  }, [curves, nowIdx])
  const cellOf = (kind: 'baseline' | 'contractor', jy: number, jm: number) => plans.find((p) => p.contractId === scope && p.kind === kind && p.fund === fund.fund && (rial || p.currency === fund.currency) && p.jalaliYear === jy && p.jalaliMonth === jm)?.amount ?? 0
  const put = (kind: 'baseline' | 'contractor', jy: number, jm: number, v: number) => savePlan({ contractId: scope, kind, fund: fund.fund, currency: fund.currency, jalaliYear: jy, jalaliMonth: jm, amount: v })
  const adopt = async () => {
    if (!editable || !window.confirm('پیشنهاد پیمانکار جایگزین برنامهٔ پایهٔ این قرارداد شود؟ مقادیر قبلی برنامهٔ پایه از بین می‌رود (در سابقه می‌ماند).')) return
    setBusy(true)
    const prop = plans.filter((p) => p.contractId === scope && p.kind === 'contractor' && p.fund === fund.fund && (rial || p.currency === fund.currency))
    const base = plans.filter((p) => p.contractId === scope && p.kind === 'baseline' && p.fund === fund.fund && (rial || p.currency === fund.currency))
    for (const b of base) if (!prop.some((p) => p.jalaliYear === b.jalaliYear && p.jalaliMonth === b.jalaliMonth)) await put('baseline', b.jalaliYear, b.jalaliMonth, 0)
    for (const p of prop) await put('baseline', p.jalaliYear, p.jalaliMonth, p.amount)
    setBusy(false)
  }
  const chart = months.map((m) => ({ name: `${JALALI_MONTHS[m.jm - 1]} ${(m.jy % 100).toLocaleString('fa-IR', { minimumIntegerDigits: 2 })}`, idx: m.idx, 'برنامهٔ کارفرما': m.cumBaseline / unit, 'پیشنهاد پیمانکار': m.cumContractor / unit, 'واقعی': m.cumActual == null ? null : m.cumActual / unit, 'پیش‌بینی': m.cumForecast == null ? null : m.cumForecast / unit }))
  const exportIt = () => void exportFinanceReportToExcel(months.map((m) => ({ 'ماه': mname(m.jy, m.jm), 'برنامهٔ کارفرما': Math.round(m.baseline), 'پیشنهاد پیمانکار': Math.round(m.contractor), 'اختلاف': Math.round(m.contractor - m.baseline), 'واقعی': Math.round(m.actual), 'پیش‌بینی': Math.round(m.forecast) })), 'جریان-نقدی.xlsx')
  const next3 = months.filter((m) => m.idx > nowIdx && m.idx <= nowIdx + 3).reduce((n, m) => n + m.forecast, 0)
  const gap = curves.contractorGap
  const nextBn = splitMoney(rial ? next3 : 0)

  return (
    <div>
      <div className="fn-toolbar no-print">
        <div className="im-seg" role="group" aria-label="منبع">{funds.map((f) => <button key={`${f.fund}|${f.currency}`} className={fund === f ? 'on' : ''} onClick={() => setFundKey(`${f.fund}|${f.currency}`)}>{f.fund === 'rial' ? 'ریالی' : `ارزی (${f.currency})`}</button>)}</div>
        <select className="fn-scope" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="قرارداد"><option value="all">همهٔ قراردادها</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.contractNumber || c.title}</option>)}</select>
        <span className="fn-actions" style={{ marginInlineStart: 'auto' }}>
          <button className="im-btn im-btn-ghost im-btn-sm" onClick={exportIt}><Download size={13} /> Excel</button>
          <button className="im-btn im-btn-primary im-btn-sm" disabled={!editable || busy} title={editable ? '' : 'یک قرارداد را انتخاب کنید'} onClick={adopt}><Check size={13} /> پذیرش پیشنهاد پیمانکار</button>
        </span>
      </div>

      <div className="fn-kpis">
        <KpiCard i={0} label="جمع برنامهٔ کارفرما" value={fmtU(curves.totals.baseline)} unit={uLabel} hint="مجموع برنامهٔ پایهٔ ماهانه" />
        <KpiCard i={1} label="جمع پیشنهاد پیمانکار" value={fmtU(curves.totals.contractor)} unit={uLabel} sub={curves.totals.contractor || curves.totals.baseline ? `${gap > 0 ? 'بیش از' : gap < 0 ? 'کمتر از' : 'برابر با'} برنامهٔ کارفرما${gap ? `: ${fmtU(Math.abs(gap))}` : ''}` : 'وارد نشده'} tone={gap > 0 ? 'warn' : 'neutral'} hint="مجموع پیشنهاد نقدی پیمانکار؛ اختلاف با برنامهٔ کارفرما اینجا دیده می‌شود" />
        <KpiCard i={2} label="پرداخت واقعی تا امروز" value={fmtU(curves.totals.paid)} unit={uLabel} sub={curves.deviationPct == null ? 'برنامهٔ پایه وارد نشده' : `${fmtPct(Math.abs(curves.deviationPct))} ${curves.deviationPct < 0 ? 'کمتر از برنامه' : 'بیش از برنامه'}`} tone={curves.deviationPct == null ? 'neutral' : Math.abs(curves.deviationPct) > 15 ? 'bad' : Math.abs(curves.deviationPct) > 5 ? 'warn' : 'good'} hint="پرداخت تجمعی در برابر برنامهٔ پایه تا امروز" />
        <KpiCard i={3} label="نیاز ۳ ماه آینده" value={rial ? nextBn.v : fmtU(next3)} unit={rial ? nextBn.u : fund.currency} hint="پیش‌بینی پرداخت سه ماه آینده" />
      </div>

      <Section title="منحنی‌های تجمعی" hint={`واحد: ${uLabel}`}>
        {months.every((m) => !m.cumBaseline && !m.cumContractor && !m.cumActual && !m.cumForecast) ? <p className="im-helper">هنوز برنامه یا پرداختی نیست. یک قرارداد را انتخاب و برنامهٔ ماهانه را در جدول زیر وارد کنید.</p> : (
          <div dir="ltr" style={{ height: 300 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--im-line)" strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--im-muted)' }} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 10, fill: 'var(--im-muted)' }} width={48} tickFormatter={(v: number) => v.toLocaleString('fa-IR')} />
            <Tooltip formatter={(v) => `${Number(v).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} ${uLabel}`} contentStyle={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--im-line)', fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine x={chart.find((d) => d.idx === nowIdx)?.name} stroke="var(--im-muted)" strokeDasharray="4 4" label={{ value: 'امروز', fontSize: 10, fill: 'var(--im-muted)' }} />
            <Line dataKey="برنامهٔ کارفرما" stroke="var(--im-sky)" strokeWidth={2.2} dot={false} /><Line dataKey="پیشنهاد پیمانکار" stroke="var(--im-amber)" strokeWidth={2.2} strokeDasharray="3 4" dot={false} />
            <Line dataKey="واقعی" stroke="var(--im-mint)" strokeWidth={2.8} dot={false} connectNulls={false} /><Line dataKey="پیش‌بینی" stroke="var(--im-violet)" strokeWidth={2.2} strokeDasharray="7 5" dot={false} connectNulls={false} /></LineChart></ResponsiveContainer></div>
        )}
      </Section>

      <Section title="جدول ماهانه" hint={editable ? `مبالغ به ${uLabel}؛ مبلغ برنامهٔ کارفرما و پیشنهاد پیمانکار را مستقیم در جدول وارد کنید (صفر = حذف)` : `مجموع قراردادها به ${uLabel}؛ برای ورود برنامه یک قرارداد را انتخاب کنید`} flush>
        <div className="fn-tbl-wrap"><table className="fn-tbl">
          <thead><tr><th>ماه</th><th className="num">برنامهٔ کارفرما</th><th className="num">پیشنهاد پیمانکار</th><th className="num">اختلاف</th><th className="num">واقعی</th><th className="num">پیش‌بینی</th></tr></thead>
          <tbody>{months.map((m) => {
            const now = m.idx === nowIdx
            const inp = (kind: 'baseline' | 'contractor', v: number) => editable ? <NumInput value={v / unit} decimals={rial ? 2 : 0} label={`${kind === 'baseline' ? 'برنامهٔ کارفرما' : 'پیشنهاد پیمانکار'} ${mname(m.jy, m.jm)}`} onCommit={(x) => { const n = Math.round(x * unit); if (n !== v) void put(kind, m.jy, m.jm, n) }} /> : (v ? fmtU(v) : '—')
            const d = m.contractor - m.baseline
            return (
              <tr key={m.idx} style={now ? { background: 'color-mix(in srgb, var(--im-accent) 7%, transparent)' } : undefined}>
                <td><span className="strong">{mname(m.jy, m.jm)}</span>{now && <span className="sub" style={{ color: 'var(--im-accent)' }}>این ماه</span>}</td>
                <td className="num">{inp('baseline', editable ? cellOf('baseline', m.jy, m.jm) : m.baseline)}</td>
                <td className="num">{inp('contractor', editable ? cellOf('contractor', m.jy, m.jm) : m.contractor)}</td>
                <td className="num" style={{ color: d > 0 ? 'var(--im-amber)' : d < 0 ? 'var(--im-sky)' : 'var(--im-muted)' }}>{m.baseline || m.contractor ? `${d > 0 ? '+' : ''}${fmtU(d)}` : '—'}</td>
                <td className="num">{m.actual ? fmtU(m.actual) : '—'}</td>
                <td className="num" style={{ color: 'var(--im-violet)' }}>{m.forecast ? fmtU(m.forecast) : '—'}</td>
              </tr>
            )
          })}</tbody>
          <tfoot><tr><td>جمع</td><td className="num">{fmtU(curves.totals.baseline)}</td><td className="num">{fmtU(curves.totals.contractor)}</td><td className="num">{gap ? `${gap > 0 ? '+' : ''}${fmtU(gap)}` : '—'}</td><td className="num">{fmtU(curves.totals.paid)}</td><td className="num">{fmtU(curves.totals.forecastRemaining)}</td></tr></tfoot>
        </table></div>
        <p className="im-helper" style={{ padding: '8px 14px' }}>پیش‌بینی: اگر ورود دستی نشده باشد، مانده‌ی هر قرارداد (مبلغ اصلاح‌شده منهای پرداخت‌ها) تا تاریخ پایان اصلاح‌شده مساوی پخش می‌شود و با هر صورت‌وضعیت، پرداخت و تغییر مصوب به‌روز می‌شود. ریال و هر ارز جداگانه محاسبه می‌شوند.</p>
      </Section>
    </div>
  )
}
export type { CashPlan }
