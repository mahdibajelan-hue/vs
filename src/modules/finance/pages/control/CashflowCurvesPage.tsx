import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../../store/useFinanceStore'
import { useFinanceControlStore } from '../../store/useFinanceControlStore'
import { buildCurves, fundsOf, idxToYM, isoMonthIdx, monthIdx, type Fund } from '../../lib/financeCurves'
import { JALALI_MONTHS } from '../../../../lib/jalali'
import { fmtCurrency } from '../../components/FinanceKpiTile'
import { FINANCE_ACCENT } from '../../FinanceApp'

/**
 * Three cash curves per fund: baseline (the owner's plan), actual (payments) and forecast, plus the contractor's own proposal for comparison.
 * Rial and each foreign currency are separate funds — they are never added together.
 */
export function CashflowCurvesPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId && c.status !== 'draft' && c.status !== 'replaced')
  const amendments = useFinanceStore((s) => s.amendments)
  const certificates = useFinanceStore((s) => s.certificates)
  const payments = useFinanceStore((s) => s.payments)
  const forecasts = useFinanceStore((s) => s.cashflowForecasts)
  const plans = useFinanceControlStore((s) => s.plans)
  const savePlan = useFinanceControlStore((s) => s.savePlan)
  const [fundKey, setFundKey] = useState('rial|ریال')
  const [contractId, setContractId] = useState('')
  const [kind, setKind] = useState<'baseline' | 'contractor'>('baseline')
  const today = new Date().toISOString().slice(0, 10)

  const ids = useMemo(() => new Set(contracts.map((c) => c.id)), [contracts])
  const certs = useMemo(() => certificates.filter((c) => ids.has(c.contractId)), [certificates, ids])
  const funds = useMemo(() => fundsOf(contracts, plans.filter((p) => ids.has(p.contractId)), certs), [contracts, plans, ids, certs])
  const fund: Fund = funds.find((f) => `${f.fund}|${f.currency}` === fundKey) ?? funds[0]
  const curves = useMemo(() => buildCurves({ contracts, amendments, certificates: certs, payments, plans, manualForecasts: forecasts, fund, todayIso: today }), [contracts, amendments, certs, payments, plans, forecasts, fund, today])
  const nowIdx = isoMonthIdx(today) ?? 0
  const data = curves.months.map((m) => ({ name: `${JALALI_MONTHS[m.jm - 1]} ${(m.jy % 100).toLocaleString('fa-IR', { minimumIntegerDigits: 2 })}`, idx: m.idx, 'پایه': m.cumBaseline, 'پیشنهاد پیمانکار': m.cumContractor, 'واقعی': m.cumActual, 'پیش‌بینی': m.cumForecast }))
  const cid = contractId || contracts[0]?.id || ''
  const cName = fund.currency
  const editMonths = Array.from({ length: 12 }, (_, k) => idxToYM(nowIdx - 2 + k))
  const cell = (jy: number, jm: number) => plans.find((p) => p.contractId === cid && p.kind === kind && p.fund === fund.fund && (fund.fund === 'rial' || p.currency === fund.currency) && p.jalaliYear === jy && p.jalaliMonth === jm)?.amount ?? 0
  if (!project) return null

  return (
    <div className="space-y-4">
      <div className="fin-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="fin-text-muted text-xs">جریان نقدی: پایه، واقعی، پیش‌بینی و پیشنهاد پیمانکار</p><h1 className="fin-text mt-1 text-lg font-extrabold">{project.officialName}</h1></div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="منبع">
          {funds.map((f) => <button key={`${f.fund}|${f.currency}`} onClick={() => setFundKey(`${f.fund}|${f.currency}`)} className="rounded-lg border px-3 py-1.5 text-xs font-bold" style={{ borderColor: 'var(--fin-divider)', background: fund === f ? FINANCE_ACCENT : undefined, color: fund === f ? '#16110a' : undefined }}>{f.fund === 'rial' ? 'ریالی' : `ارزی ${f.currency}`}</button>)}
        </div>
      </div>

      {curves.months.length === 0 ? <div className="fin-card p-8 text-center text-xs fin-text-muted">هنوز برنامه یا پرداختی برای این منبع نیست. برنامهٔ پایه را در جدول پایین وارد کنید.</div> : (
        <>
          <div className="grid grid-cols-2 gap-3 text-xs lg:grid-cols-4">
            <Kpi label="جمع برنامهٔ پایه" v={fmtCurrency(curves.totals.baseline, cName)} />
            <Kpi label="جمع پیشنهاد پیمانکار" v={fmtCurrency(curves.totals.contractor, cName)} sub={curves.totals.contractor || curves.totals.baseline ? `اختلاف با پایه ${curves.contractorGap >= 0 ? '+' : '-'}${fmtCurrency(Math.abs(curves.contractorGap), cName)}` : undefined} warn={curves.contractorGap > 0} />
            <Kpi label="پرداخت واقعی تا امروز" v={fmtCurrency(curves.totals.paid, cName)} sub={curves.deviationPct != null ? `انحراف از پایه ${curves.deviationPct.toLocaleString('fa-IR')}٪` : undefined} warn={curves.deviationPct != null && Math.abs(curves.deviationPct) > 15} />
            <Kpi label="نیاز نقدینگی باقی‌مانده (پیش‌بینی)" v={fmtCurrency(curves.totals.forecastRemaining, cName)} />
          </div>
          <div className="fin-card p-4" dir="ltr" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid stroke="var(--fin-divider)" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--fin-text-muted)' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: 'var(--fin-text-muted)' }} tickFormatter={(v: number) => fmtCurrency(v)} width={70} />
                <Tooltip formatter={(v) => fmtCurrency(Number(v), cName)} contentStyle={{ background: 'var(--fin-card-bg)', border: '1px solid var(--fin-card-border)', fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine x={data.find((d) => d.idx === nowIdx)?.name} stroke="var(--fin-text-muted)" strokeDasharray="4 4" label={{ value: 'امروز', fontSize: 10, fill: 'var(--fin-text-muted)' }} />
                <Line dataKey="پایه" stroke="#5c7290" strokeWidth={2} dot={false} />
                <Line dataKey="پیشنهاد پیمانکار" stroke="#c28a2b" strokeWidth={2} strokeDasharray="2 4" dot={false} />
                <Line dataKey="واقعی" stroke="#3e7c74" strokeWidth={2.5} dot={false} connectNulls={false} />
                <Line dataKey="پیش‌بینی" stroke={FINANCE_ACCENT} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <div className="fin-card space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <p className="me-auto text-sm font-extrabold">ورود برنامهٔ ماهانه ({fund.fund === 'rial' ? 'ریال' : fund.currency})</p>
          <select className="fin-input w-56" value={cid} onChange={(e) => setContractId(e.target.value)}>{contracts.map((c) => <option key={c.id} value={c.id}>{c.contractNumber || c.title}</option>)}</select>
          <select className="fin-input w-48" value={kind} onChange={(e) => setKind(e.target.value as 'baseline' | 'contractor')}><option value="baseline">برنامهٔ پایهٔ کارفرما</option><option value="contractor">پیشنهاد پیمانکار</option></select>
        </div>
        {!cid ? <p className="text-xs fin-text-muted">قراردادی نیست.</p> : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {editMonths.map(({ jy, jm }) => (
              <label key={monthIdx(jy, jm)} className="block"><span className="mb-0.5 block text-[10.5px] fin-text-muted">{JALALI_MONTHS[jm - 1]} {jy.toLocaleString('fa-IR', { useGrouping: false })}</span>
                <input type="number" min={0} className="fin-input num" defaultValue={cell(jy, jm) || ''} key={`${cid}${kind}${fund.currency}${jy}${jm}${cell(jy, jm)}`}
                  onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== cell(jy, jm)) void savePlan({ contractId: cid, kind, fund: fund.fund, currency: fund.currency, jalaliYear: jy, jalaliMonth: jm, amount: v }) }} /></label>
            ))}
          </div>
        )}
        <p className="text-[11px] leading-5 fin-text-muted">مبلغ صفر ردیف را پاک می‌کند. «پیش‌بینی» بدون ورود دستی از مانده‌ی هر قرارداد (مبلغ اصلاح‌شده منهای پرداخت‌ها) تا تاریخ پایان اصلاح‌شده به‌صورت مساوی پخش می‌شود و با هر صورت‌وضعیت، پرداخت و تغییر مصوب خودکار به‌روز می‌شود؛ ورود دستی ریالی در «جریان نقدینگی» جایگزین آن می‌شود.</p>
      </div>
    </div>
  )
}
function Kpi({ label, v, sub, warn }: { label: string; v: string; sub?: string; warn?: boolean }) {
  return <div className="fin-card p-3"><p className="fin-text-muted text-[10.5px]">{label}</p><p className="num mt-0.5 text-sm font-extrabold">{v}</p>{sub && <p className="text-[10.5px]" style={{ color: warn ? '#b5573a' : 'var(--fin-text-muted)' }}>{sub}</p>}</div>
}
