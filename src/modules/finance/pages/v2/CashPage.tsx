import { useMemo, useState } from 'react'
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Check, Download, Layers, Sparkles, Target, TrendingUp, Wand2 } from 'lucide-react'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../../store/useFinanceStore'
import { useFinanceControlStore } from '../../store/useFinanceControlStore'
import { buildCurves, draftProjectBaseline, fundsOf, isoMonthIdx, type Fund } from '../../lib/financeCurves'
import { exportFinanceReportToExcel } from '../../lib/financeExport'
import { JALALI_MONTHS } from '../../../../lib/jalali'
import { KpiCard, NumInput, Section, fmtPct } from '../../components/fn'
import { ChartTip, PB, Tile, axisProps, gridProps } from '../../components/charts'

const mname = (jy: number, jm: number) => `${JALALI_MONTHS[jm - 1]} ${jy.toLocaleString('fa-IR', { useGrouping: false })}`
const SRC_FA: Record<string, string> = { manual: 'دستی', shape: 'به شکل مبنا', even: 'پخش مساوی', project: 'مبنای کلان' }
const PROJECT = '__project__'

/**
 * Cash flow in three levels — Baseline (the plan), Actual (what was paid) and Forecast (the updated outlook) — completed stage by stage as information arrives:
 * 1) project-level phasing from the budget, 2) contract-level plans once contractors propose, 3) automatic updating from payments and approved changes.
 */
export function CashPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId && c.status !== 'draft' && c.status !== 'replaced')
  const amendments = useFinanceStore((s) => s.amendments)
  const certificates = useFinanceStore((s) => s.certificates)
  const payments = useFinanceStore((s) => s.payments)
  const forecasts = useFinanceStore((s) => s.cashflowForecasts)
  const budgets = useFinanceStore((s) => s.budgets)
  const upsertForecast = useFinanceStore((s) => s.upsertCashflowForecast)
  const deleteForecast = useFinanceStore((s) => s.deleteCashflowForecast)
  const allPlans = useFinanceControlStore((s) => s.plans)
  const savePlan = useFinanceControlStore((s) => s.savePlan)
  const [fundKey, setFundKey] = useState('rial|ریال')
  const [scope, setScope] = useState<string>('all')
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const nowIdx = isoMonthIdx(today) ?? 0

  const plans = useMemo(() => allPlans.filter((p) => p.projectId === masterProjectId), [allPlans, masterProjectId])
  const ids = useMemo(() => new Set(contracts.map((c) => c.id)), [contracts])
  const certs = useMemo(() => certificates.filter((c) => ids.has(c.contractId)), [certificates, ids])
  const funds = useMemo(() => fundsOf(contracts, plans, certs), [contracts, plans, certs])
  const fund: Fund = funds.find((f) => `${f.fund}|${f.currency}` === fundKey) ?? funds[0]
  const rial = fund.fund === 'rial'
  const unit = rial ? 1e9 : 1
  const uLabel = rial ? 'میلیارد ریال' : fund.currency
  const fmtU = (n: number) => (n / unit).toLocaleString('fa-IR', { maximumFractionDigits: rial ? 1 : 0 })
  const editable = scope !== 'all'
  const isProject = scope === PROJECT
  const scoped = scope === 'all' || isProject ? contracts : contracts.filter((c) => c.id === scope)

  // the three levels always use the whole project for totals; the table edits the chosen level
  const curves = useMemo(() => buildCurves({ contracts: scope === 'all' ? contracts : scoped, amendments, certificates: certs, payments, plans, manualForecasts: forecasts, fund, todayIso: today, includeProject: scope === 'all' || isProject }), [scope, contracts, scoped, amendments, certs, payments, plans, forecasts, fund, today, isProject])
  const whole = useMemo(() => buildCurves({ contracts, amendments, certificates: certs, payments, plans, manualForecasts: forecasts, fund, todayIso: today }), [contracts, amendments, certs, payments, plans, forecasts, fund, today])

  const months = useMemo(() => {
    const idx = new Set(curves.months.map((m) => m.idx)); for (let k = -1; k <= 6; k++) idx.add(nowIdx + k)
    const all = [...idx].sort((a, b) => a - b)
    const sel = showAll ? all : all.filter((i) => i >= nowIdx - 3 && i <= nowIdx + 12)
    return sel.slice(0, 48).map((i) => curves.months.find((m) => m.idx === i) ?? { idx: i, jy: Math.floor(i / 12), jm: (i % 12) + 1, src: [] as string[], baseline: 0, contractor: 0, actual: 0, forecast: 0, isFuture: i > nowIdx, cumBaseline: 0, cumContractor: 0, cumActual: null, cumForecast: null })
  }, [curves, nowIdx, showAll])

  const cellOf = (kind: 'baseline' | 'contractor', jy: number, jm: number) => plans.find((p) => (isProject ? p.contractId == null : p.contractId === scope) && p.kind === kind && p.fund === fund.fund && (rial || p.currency === fund.currency) && p.jalaliYear === jy && p.jalaliMonth === jm)?.amount ?? 0
  const put = (kind: 'baseline' | 'contractor', jy: number, jm: number, v: number) => savePlan({ projectId: masterProjectId, contractId: isProject ? null : scope, kind, fund: fund.fund, currency: fund.currency, jalaliYear: jy, jalaliMonth: jm, amount: v })
  const manualOf = (jy: number, jm: number) => forecasts.find((f) => f.contractId === scope && f.jalaliYear === jy && f.jalaliMonth === jm)
  const canForecastEdit = rial && editable && !isProject

  const adopt = async () => {
    if (!editable || isProject || !window.confirm('پیشنهاد پیمانکار جایگزین مبنای این قرارداد شود؟ مقادیر قبلی مبنا حذف می‌شود (در سابقه می‌ماند).')) return
    setBusy(true)
    const mine = (k: 'baseline' | 'contractor') => plans.filter((p) => p.contractId === scope && p.kind === k && p.fund === fund.fund && (rial || p.currency === fund.currency))
    const prop = mine('contractor')
    for (const b of mine('baseline')) if (!prop.some((p) => p.jalaliYear === b.jalaliYear && p.jalaliMonth === b.jalaliMonth)) await put('baseline', b.jalaliYear, b.jalaliMonth, 0)
    for (const p of prop) await put('baseline', p.jalaliYear, p.jalaliMonth, p.amount)
    setBusy(false)
  }
  const draft = async () => {
    const budgetRow = budgets.find((b) => b.masterProjectId === masterProjectId)
    const bac = budgetRow ? budgetRow.approvedBudget : 0
    if (!bac) { window.alert('ابتدا بودجهٔ پروژه را در «بودجه و هزینه ← بودجهٔ کل و سالانه» وارد کنید.'); return }
    const endIso = project?.revisedCompletionDate ?? project?.contractualCompletionDate ?? project?.plannedFinishDate ?? null
    const aheadBase = plans.filter((p) => p.kind === 'baseline' && p.fund === 'rial' && p.jalaliYear * 12 + (p.jalaliMonth - 1) > nowIdx).reduce((n, p) => n + p.amount, 0)
    const d = draftProjectBaseline({ bac, paid: whole.totals.paid, plannedAhead: aheadBase, nowIdx, endIdx: endIso ? isoMonthIdx(endIso) : null })
    if (!d.length) { window.alert('بودجهٔ آزادی برای پخش باقی نمانده است.'); return }
    if (!window.confirm(`بودجهٔ آزاد (${fmtU(d.reduce((n, x) => n + x.amount, 0))} میلیارد ریال) به‌طور مساوی در ${d.length.toLocaleString('fa-IR')} ماه آینده روی «مبنای کلان پروژه» پخش شود؟ بعداً می‌توانید هر ماه را اصلاح کنید.`)) return
    setBusy(true)
    for (const x of d) await savePlan({ projectId: masterProjectId, contractId: null, kind: 'baseline', fund: 'rial', currency: 'ریال', jalaliYear: Math.floor(x.idx / 12), jalaliMonth: (x.idx % 12) + 1, amount: x.amount })
    setBusy(false)
  }

  const chart = months.map((m) => ({ name: `${JALALI_MONTHS[m.jm - 1]} ${(m.jy % 100).toLocaleString('fa-IR', { minimumIntegerDigits: 2 })}`, idx: m.idx,
    'مبنا (ماهانه)': (m.baseline || null) && m.baseline / unit, 'واقعی (ماهانه)': m.isFuture || !m.actual ? null : m.actual / unit, 'پیش‌بینی (ماهانه)': m.isFuture && m.forecast ? m.forecast / unit : null,
    'مبنا (تجمعی)': m.cumBaseline / unit, 'واقعی (تجمعی)': m.cumActual == null ? null : m.cumActual / unit, 'پیش‌بینی (تجمعی)': m.cumForecast == null ? null : m.cumForecast / unit }))
  const sparkB = whole.months.map((m) => m.cumBaseline / unit), sparkA = whole.months.filter((m) => !m.isFuture).map((m) => (m.cumActual ?? 0) / unit), sparkF = whole.months.filter((m) => m.cumForecast != null).map((m) => (m.cumForecast ?? 0) / unit)
  const eac = whole.totals.paid + whole.totals.forecastRemaining
  const varBase = eac - whole.totals.baseline
  const next3 = whole.months.filter((m) => m.idx > nowIdx && m.idx <= nowIdx + 3).reduce((n, m) => n + m.forecast, 0)
  const exportIt = () => void exportFinanceReportToExcel(months.map((m) => ({ 'ماه': mname(m.jy, m.jm), 'مبنا': Math.round(m.baseline), 'پیشنهاد پیمانکار': Math.round(m.contractor), 'واقعی': Math.round(m.actual), 'پیش‌بینی': Math.round(m.forecast), 'مبنای پیش‌بینی': m.src.map((x) => SRC_FA[x]).join('، ') })), 'جریان-نقدی.xlsx')
  const hasProjectPlan = plans.some((p) => p.contractId == null)
  const cov = whole.coverage
  const steps = [
    { n: 1, t: 'مبنای کلان پروژه', d: hasProjectPlan ? `${fmtU(whole.projectLevelTotal)} ${uLabel} در سطح پروژه برنامه‌ریزی شده` : 'از روی بودجه و برنامهٔ پروژه؛ نیازی به اطلاعات پیمانکار نیست', done: hasProjectPlan, c: PB.blue },
    { n: 2, t: 'مبنای قراردادها', d: cov == null ? 'پس از انعقاد قرارداد، برنامهٔ هر قرارداد را از پیشنهاد پیمانکار تکمیل کنید' : `${fmtPct(cov * 100, 0)} ارزش قراردادهای فعال برنامهٔ نقدی دارد`, done: cov != null && cov >= 0.95, c: PB.yellow, pct: cov },
    { n: 3, t: 'به‌روزرسانی با عملکرد', d: 'پرداخت‌ها، صورت‌وضعیت‌ها و تغییرات مصوب پیش‌بینی را خودکار به‌روز می‌کنند', done: whole.totals.paid > 0, c: PB.teal },
  ]

  if (!project) return null
  return (
    <div>
      <div className="fn-stages no-print">{steps.map((s) => (
        <div key={s.n} className={`fn-stage${s.done ? ' done' : ''}`} style={{ ['--c' as string]: s.c }}>
          <span className="n">{s.done ? <Check size={14} strokeWidth={3} /> : s.n.toLocaleString('fa-IR')}</span>
          <div><b>{s.t}</b><p>{s.d}</p>{s.pct != null && <div className="fn-mini"><i style={{ width: `${Math.round(s.pct * 100)}%` }} /></div>}</div>
        </div>))}
      </div>

      <div className="fn-toolbar no-print" style={{ marginTop: 14 }}>
        <div className="im-seg" role="group" aria-label="منبع">{funds.map((f) => <button key={`${f.fund}|${f.currency}`} className={fund === f ? 'on' : ''} onClick={() => setFundKey(`${f.fund}|${f.currency}`)}>{f.fund === 'rial' ? 'ریالی' : `ارزی (${f.currency})`}</button>)}</div>
        <select className="fn-scope" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="سطح برنامه">
          <option value="all">جمع کل (فقط مشاهده)</option>
          <option value={PROJECT}>مبنای کلان پروژه (قابل ویرایش)</option>
          {contracts.map((c) => <option key={c.id} value={c.id}>{c.contractNumber || c.title} (قابل ویرایش)</option>)}
        </select>
        <span className="fn-actions" style={{ marginInlineStart: 'auto' }}>
          <button className="im-btn im-btn-ghost im-btn-sm" onClick={draft} disabled={busy || !rial}><Wand2 size={13} /> پیش‌نویس مبنا از بودجه</button>
          <button className="im-btn im-btn-ghost im-btn-sm" onClick={exportIt}><Download size={13} /> Excel</button>
          <button className="im-btn im-btn-primary im-btn-sm" disabled={!editable || isProject || busy} title={editable && !isProject ? '' : 'یک قرارداد را انتخاب کنید'} onClick={adopt}><Check size={13} /> پذیرش پیشنهاد پیمانکار</button>
        </span>
      </div>

      <div className="fn-levels">
        <div className="fn-level" style={{ ['--c' as string]: PB.blue }}><Target size={18} /><div><span>سطح ۱ · جریان نقدی مبنا</span><b>{fmtU(whole.totals.baseline)} <small>{uLabel}</small></b><em>برنامهٔ مصوب: کلان پروژه + قراردادها</em></div></div>
        <div className="fn-level" style={{ ['--c' as string]: PB.teal }}><Layers size={18} /><div><span>سطح ۲ · جریان نقدی واقعی</span><b>{fmtU(whole.totals.paid)} <small>{uLabel}</small></b><em>{whole.deviationPct == null ? 'برنامهٔ مبنا وارد نشده' : `${fmtPct(Math.abs(whole.deviationPct))} ${whole.deviationPct < 0 ? 'کمتر از مبنا تا امروز' : 'بیش از مبنا تا امروز'}`}</em></div></div>
        <div className="fn-level" style={{ ['--c' as string]: PB.violet }}><TrendingUp size={18} /><div><span>سطح ۳ · پیش‌بینی به‌روز</span><b>{fmtU(eac)} <small>{uLabel}</small></b><em>واقعی + مانده‌ی پیش‌بینی؛ {varBase === 0 ? 'برابر مبنا' : `${varBase > 0 ? 'بیش از' : 'کمتر از'} مبنا ${fmtU(Math.abs(varBase))}`}</em></div></div>
      </div>

      <div className="fn-kpis" style={{ marginTop: 14 }}>
        <KpiCard i={0} label="مبنا" value={fmtU(whole.totals.baseline)} unit={uLabel} spark={sparkB} sparkColor={PB.blue} hint="مجموع برنامهٔ نقدی مبنا" />
        <KpiCard i={1} label="واقعی تا امروز" value={fmtU(whole.totals.paid)} unit={uLabel} spark={sparkA} sparkColor={PB.teal} tone={whole.deviationPct == null ? 'neutral' : Math.abs(whole.deviationPct) > 15 ? 'bad' : Math.abs(whole.deviationPct) > 5 ? 'warn' : 'good'} sub={whole.deviationPct == null ? undefined : `${whole.deviationPct > 0 ? '▲' : '▼'} ${fmtPct(Math.abs(whole.deviationPct))} نسبت به مبنا`} hint="پرداخت تجمعی در برابر مبنا تا امروز" />
        <KpiCard i={2} label="پیش‌بینی تا پایان" value={fmtU(eac)} unit={uLabel} spark={sparkF} sparkColor={PB.violet} tone={varBase > 0 ? 'warn' : 'neutral'} sub={varBase ? `${varBase > 0 ? '▲' : '▼'} ${fmtU(Math.abs(varBase))} نسبت به مبنا` : undefined} hint="پرداخت‌شده + مانده‌ی پیش‌بینی‌شده" />
        <KpiCard i={3} label="نیاز ۳ ماه آینده" value={fmtU(next3)} unit={uLabel} hint="مجموع پیش‌بینی سه ماه آینده" />
      </div>

      <Tile title="سه سطح جریان نقدی" hint={`ستون‌ها ماهانه، خط‌ها تجمعی (${uLabel})`} span={3}>
        {chart.every((d) => !d['مبنا (تجمعی)'] && !d['واقعی (تجمعی)'] && !d['پیش‌بینی (تجمعی)']) ? <p className="im-helper">هنوز برنامه یا پرداختی نیست. از «پیش‌نویس مبنا از بودجه» شروع کنید یا مبنا را در جدول زیر وارد کنید.</p> : (
          <div dir="ltr" style={{ height: 340 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chart} margin={{ left: 4, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="gBase" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PB.blue} stopOpacity={0.35} /><stop offset="100%" stopColor={PB.blue} stopOpacity={0} /></linearGradient>
              <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill={PB.violet} fillOpacity={0.22} /><line x1="0" y1="0" x2="0" y2="6" stroke={PB.violet} strokeWidth="2" /></pattern>
            </defs>
            <CartesianGrid {...gridProps} /><XAxis dataKey="name" {...axisProps} interval="preserveStartEnd" /><YAxis {...axisProps} width={48} tickFormatter={(v: number) => v.toLocaleString('fa-IR')} />
            <Tooltip content={<ChartTip unit={uLabel} />} /><Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            <ReferenceLine x={chart.find((d) => d.idx === nowIdx)?.name} stroke="var(--im-muted)" strokeDasharray="4 4" label={{ value: 'امروز', fontSize: 10.5, fill: 'var(--im-muted)', position: 'insideTopRight' }} />
            <Area dataKey="مبنا (تجمعی)" stroke={PB.blue} strokeWidth={2.4} fill="url(#gBase)" dot={false} />
            <Bar dataKey="مبنا (ماهانه)" fill={PB.blue} fillOpacity={0.35} radius={[4, 4, 0, 0]} barSize={14} />
            <Bar dataKey="واقعی (ماهانه)" fill={PB.teal} radius={[4, 4, 0, 0]} barSize={14} />
            <Bar dataKey="پیش‌بینی (ماهانه)" fill="url(#hatch)" stroke={PB.violet} strokeDasharray="3 2" radius={[4, 4, 0, 0]} barSize={14} />
            <Line dataKey="واقعی (تجمعی)" stroke={PB.teal} strokeWidth={3} dot={false} connectNulls={false} />
            <Line dataKey="پیش‌بینی (تجمعی)" stroke={PB.violet} strokeWidth={2.6} strokeDasharray="7 5" dot={false} connectNulls={false} />
          </ComposedChart></ResponsiveContainer></div>
        )}
      </Tile>

      <Section title={isProject ? 'جدول ماهانه — مبنای کلان پروژه' : scope === 'all' ? 'جدول ماهانه — جمع کل' : 'جدول ماهانه — یک قرارداد'} hint={editable ? `مبالغ به ${uLabel}؛ اعداد را مستقیم در جدول اصلاح کنید (صفر = حذف)` : 'این نما جمع همه است و ویرایش ندارد؛ از فهرست بالا «مبنای کلان پروژه» یا یک قرارداد را برای ویرایش انتخاب کنید'} flush
        action={<label className="fn-check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> همهٔ ماه‌ها</label>}>
        <div className="fn-tbl-wrap"><table className="fn-tbl fn-fixed">
          <colgroup><col style={{ width: 150 }} /><col /><col /><col /><col /><col /><col style={{ width: 140 }} /></colgroup>
          <thead><tr><th>ماه</th><th className="num"><i className="dot" style={{ background: PB.blue }} />مبنا</th><th className="num"><i className="dot" style={{ background: PB.yellow }} />پیشنهاد پیمانکار</th><th className="num"><i className="dot" style={{ background: PB.teal }} />واقعی</th><th className="num"><i className="dot" style={{ background: PB.violet }} />پیش‌بینی</th><th className="num">انحراف از مبنا</th><th>مبنای پیش‌بینی</th></tr></thead>
          <tbody>{months.map((m) => {
            const now = m.idx === nowIdx
            const bV = editable ? cellOf('baseline', m.jy, m.jm) : m.baseline
            const cV = editable && !isProject ? cellOf('contractor', m.jy, m.jm) : m.contractor
            const man = canForecastEdit ? manualOf(m.jy, m.jm) : undefined
            const dev = m.isFuture ? m.forecast - m.baseline : m.actual - m.baseline
            return (
              <tr key={m.idx} className={now ? 'now' : ''}>
                <td><span className="strong">{mname(m.jy, m.jm)}</span>{now && <span className="sub" style={{ color: 'var(--im-accent)' }}>این ماه</span>}</td>
                <td className="num">{editable ? <NumInput value={bV / unit} decimals={rial ? 2 : 0} label={`مبنا ${mname(m.jy, m.jm)}`} onCommit={(x) => { const n = Math.round(x * unit); if (n !== bV) void put('baseline', m.jy, m.jm, n) }} /> : (m.baseline ? fmtU(m.baseline) : '—')}</td>
                <td className="num">{editable && !isProject ? <NumInput value={cV / unit} decimals={rial ? 2 : 0} label={`پیشنهاد پیمانکار ${mname(m.jy, m.jm)}`} onCommit={(x) => { const n = Math.round(x * unit); if (n !== cV) void put('contractor', m.jy, m.jm, n) }} /> : (isProject ? <span className="fn-na">—</span> : m.contractor ? fmtU(m.contractor) : '—')}</td>
                <td className="num" style={{ color: m.actual ? PB.teal : undefined, fontWeight: m.actual ? 800 : 500 }}>{m.actual ? fmtU(m.actual) : '—'}</td>
                <td className="num">{canForecastEdit && m.isFuture ? <NumInput value={(man ? man.forecastAmount : m.forecast) / unit} decimals={2} label={`پیش‌بینی ${mname(m.jy, m.jm)}`} onCommit={(x) => { const n = Math.round(x * unit); if (n <= 0) { if (man) void deleteForecast(man.id) } else void upsertForecast(scope, m.jy, m.jm, { forecastAmount: n }) }} /> : <span style={{ color: PB.violet, fontWeight: 700 }}>{m.isFuture && m.forecast ? fmtU(m.forecast) : '—'}</span>}</td>
                <td className="num" style={{ color: dev > 0 ? 'var(--im-amber)' : dev < 0 ? 'var(--im-sky)' : 'var(--im-muted)' }}>{(m.baseline || m.actual || m.forecast) && (m.baseline || dev) ? `${dev > 0 ? '+' : ''}${fmtU(dev)}` : '—'}</td>
                <td>{m.isFuture && m.src.length ? m.src.map((x) => <span key={x} className="fn-src">{SRC_FA[x]}</span>) : <span className="fn-na">—</span>}</td>
              </tr>
            )
          })}</tbody>
          <tfoot><tr><td>جمع</td><td className="num">{fmtU(curves.totals.baseline)}</td><td className="num">{fmtU(curves.totals.contractor)}</td><td className="num">{fmtU(curves.totals.paid)}</td><td className="num">{fmtU(curves.totals.forecastRemaining)}</td><td className="num">{curves.totals.baseline ? fmtU(curves.totals.paid + curves.totals.forecastRemaining - curves.totals.baseline) : '—'}</td><td /></tr></tfoot>
        </table></div>
        <p className="im-helper" style={{ padding: '8px 14px' }}><Sparkles size={12} style={{ display: 'inline', marginInlineEnd: 4 }} />پیش‌بینی ماه‌های آینده خودکار است: ورود دستی در همان ماه اولویت دارد؛ بعد مانده‌ی هر قرارداد به شکل مبنای خودش پخش می‌شود؛ اگر مبنایی نباشد مساوی تا تاریخ پایان اصلاح‌شده؛ و مبنای کلان پروژه برای هزینه‌های بدون قرارداد همان‌طور که هست می‌آید. ریال و هر ارز جدا محاسبه می‌شوند.</p>
      </Section>
    </div>
  )
}
