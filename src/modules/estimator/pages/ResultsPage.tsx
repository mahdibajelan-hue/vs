import { useMemo, useRef, useState } from 'react'
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, Legend, ReferenceLine,
} from 'recharts'
import { AlertTriangle, CalendarRange, Layers3, Check, Copy, FileDown, FileSpreadsheet, Gauge, Landmark, LineChart, PackageSearch, PieChart as PieIcon, Printer, Ruler, Save, ShieldAlert, Table2, TrendingUp, X } from 'lucide-react'
import type { EstBenchmark, EstFullInputs, EstProject, EstRisk } from '../types'
import { annualCashFlow, buildCashFlowTimeline, computeSensitivity, estimateKpis, LIFECYCLE_PHASE_LABEL, MATURITY, maturityOf, scopeLabels, SENSITIVITY_PCT } from '../lib/calc'
import { finalResults, METHOD_META } from '../lib/methods'
import { MethodLadder } from '../components/MethodLadder'
import { exportEstimateToExcel, exportReportPagesToPdf, printReportElement } from '../lib/exportEstimate'
import { RouteSchematic } from '../components/RouteSchematic'
import {
  BORDER, fmtEUR, fmtEURm, fmtPct, fmtRial, fmtRialBn, fmtUSD, GRID, INK, INK_SOFT, MUTED_FG,
  SAFETY, SECTION_COLOR, STATUS, SURFACE, SURFACE_2, TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE, toFa,
} from '../lib/theme'
import { AnimatedNumber, Btn, Card, CardTitle, Kpi } from '../components/ui'
import { EstimatorPrintReport } from '../components/EstimatorPrintReport'

const RISK_CATEGORY_LABEL: Record<EstRisk['category'], string> = {
  fx: 'ارزی', procurement: 'تأمین کالا', geotechnical: 'ژئوتکنیک', schedule: 'زمان‌بندی',
  hse: 'HSE', contractor: 'پیمانکار', permit: 'مجوز/تملک', weather: 'آب‌وهوا', other: 'سایر',
}

const LIFECYCLE_COLOR: Record<string, string> = {
  consultant: '#6B7A8F', design: '#3987e5', contractor: '#9085e9', execution: SAFETY,
}

function riskBand(score: number) {
  if (score <= 4) return { label: 'کم', color: STATUS.good }
  if (score <= 9) return { label: 'متوسط', color: STATUS.warning }
  if (score <= 15) return { label: 'بالا', color: STATUS.serious }
  return { label: 'بحرانی', color: STATUS.critical }
}

export function ResultsPage({
  project, inputs, benchmarks, nowYear, onChange, onSave, saving, versionLabel,
}: {
  project: EstProject
  inputs: EstFullInputs
  benchmarks: EstBenchmark[]
  nowYear: number
  onChange: (next: EstFullInputs) => void
  onSave: (args: { label: string }) => void | Promise<void>
  saving: boolean
  /** set when the page shows a saved version rather than the working inputs */
  versionLabel?: string
}) {
  const fr = useMemo(() => finalResults(project, inputs, benchmarks, nowYear), [project, inputs, benchmarks, nowYear])
  const results = fr.results
  const chosen = fr.methods.chosen
  const cashFlow = useMemo(() => buildCashFlowTimeline(inputs, results), [inputs, results])
  // the parametric swings, scaled to the chosen method's total so they sit around the same number
  const sensitivity = useMemo(() => {
    const k = fr.parametric.grand ? results.grand / fr.parametric.grand : 1
    return computeSensitivity(project, inputs).map((x) => ({ ...x, lowGrandUsd: x.lowGrandUsd * k, highGrandUsd: x.highGrandUsd * k, swingUsd: x.swingUsd * k }))
  }, [project, inputs, fr, results.grand])
  const kpis = useMemo(() => estimateKpis(project, inputs, results, cashFlow), [project, inputs, results, cashFlow])
  const years = useMemo(() => annualCashFlow(cashFlow), [cashFlow])
  const maturity = maturityOf(inputs)
  const range = { low: chosen.low / inputs.overhead.fxEurPerUsd, high: chosen.high / inputs.overhead.fxEurPerUsd, lowPct: chosen.low / chosen.eur - 1, highPct: chosen.high / chosen.eur - 1 }
  const [copied, setCopied] = useState(false)
  const [naming, setNaming] = useState(false)
  const [vName, setVName] = useState('')
  const [busy, setBusy] = useState<'' | 'pdf' | 'xlsx'>('')
  const [savedOk, setSavedOk] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)
  const printRef = useRef<HTMLDivElement>(null)

  const eurRate = inputs.overhead.fxEurPerUsd
  const rialRate = inputs.overhead.fxRialPerUsd
  const toEur = (usd: number) => usd * eurRate
  const toRial = (usd: number) => usd * rialRate

  const donutData = results.sections.map((s) => ({ key: s.key, name: s.label, value: s.totalUsd }))
  const barData = [...results.sections].sort((a, b) => b.totalUsd - a.totalUsd).map((s) => ({ key: s.key, name: s.chartLabel, value: s.totalUsd }))

  const totalMonths = inputs.lifecycle.consultantSelectionMonths + inputs.lifecycle.basicDesignMonths + inputs.lifecycle.epcContractorSelectionMonths + inputs.lifecycle.executionMonths
  const lifecyclePhases = [
    { key: 'consultant', label: 'انتخاب مشاور طراح', months: inputs.lifecycle.consultantSelectionMonths },
    { key: 'design', label: 'طراحی پایه', months: inputs.lifecycle.basicDesignMonths },
    { key: 'contractor', label: 'انتخاب پیمانکار EPC', months: inputs.lifecycle.epcContractorSelectionMonths },
    { key: 'execution', label: 'اجرا و راه‌اندازی', months: inputs.lifecycle.executionMonths },
  ]

  const summary =
    `برآورد کل پروژه به روش ${METHOD_META[chosen.method].short} در مرحلهٔ ${MATURITY[maturity].label} ${fmtEUR(toEur(results.grand))} معادل ${fmtRial(toRial(results.grand))} (یورو ${Math.round(inputs.overhead.fxRialPerEur ?? 0).toLocaleString('en-US')} ریال) است؛ ` +
    `هزینهٔ نهایی به احتمال زیاد بین ${fmtEURm(toEur(range.low))} و ${fmtEURm(toEur(range.high))} یورو خواهد بود. ` +
    `از انتخاب مشاور طراح تا راه‌اندازی حدود ${toFa(totalMonths)} ماه زمان لازم است و اوج نیاز نقدینگی در ماه ${toFa(kpis.peakMonth)} است.`

  // 5x5 likelihood x impact grid — counts + worst band per cell.
  const heatGrid = Array.from({ length: 5 }, (_, impactIdx) =>
    Array.from({ length: 5 }, (_, likelihoodIdx) => {
      const likelihood = likelihoodIdx + 1
      const impact = 5 - impactIdx
      const cellRisks = inputs.risks.filter((r) => r.likelihood === likelihood && r.impact === impact)
      return { likelihood, impact, count: cellRisks.length, risks: cellRisks, score: likelihood * impact }
    }),
  )

  function smsSummary() {
    return (
      `برآورد هزینه پروژه «${project.name}»\n` +
      `جمع کل: ${fmtEUR(toEur(results.grand))} (≈ ${fmtRialBn(toRial(results.grand))})\n` +
      `مدت پیش از راه‌اندازی: ${toFa(totalMonths)} ماه`
    ).slice(0, 640)
  }

  function copySms() {
    navigator.clipboard?.writeText(smsSummary()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  async function exportPdf() {
    if (!printRef.current) return
    setBusy('pdf')
    try {
      await exportReportPagesToPdf(printRef.current, `estimate-${project.name}.pdf`)
    } finally { setBusy('') }
  }

  async function exportXlsx() {
    setBusy('xlsx')
    try { await exportEstimateToExcel(project, inputs, results, versionLabel, fr.methods.list, chosen.method) } finally { setBusy('') }
  }

  function printReport() {
    if (!printRef.current) return
    if (!printReportElement(printRef.current, `برآورد ${project.name}`)) alert('پنجرهٔ چاپ باز نشد؛ اجازهٔ باز شدن پنجره (pop-up) را برای این سایت فعال کنید.')
  }

  async function saveVersion() {
    await onSave({ label: vName.trim() || `نسخهٔ ${new Date().toLocaleDateString('fa-IR')}` })
    setNaming(false); setVName(''); setSavedOk(true)
    setTimeout(() => setSavedOk(false), 2200)
  }

  return (
    <div className="h-full overflow-y-auto est-font est-scroll">
      <div className="comp-print-offscreen" ref={printRef} aria-hidden="true">
        <EstimatorPrintReport project={project} inputs={inputs} results={results} versionLabel={versionLabel} methods={fr.methods.list} chosen={chosen.method} />
      </div>

      {/* action bar */}
      <div className="est-actionbar no-print">
        <div className="mx-auto max-w-6xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold" style={{ color: SAFETY }}>{versionLabel ? 'نسخهٔ ذخیره‌شده' : 'گام ۳ از ۳ — برآورد و گزارش'}</p>
            <p className="text-sm font-extrabold truncate" style={{ color: INK }}>{versionLabel ?? project.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {naming ? (
              <form className="est-name-form" onSubmit={(e) => { e.preventDefault(); void saveVersion() }}>
                <input autoFocus value={vName} onChange={(e) => setVName(e.target.value)} placeholder="نام نسخه، مثلاً «پس از استعلام لوله»" className="est-input" />
                <Btn kind="primary" type="submit" disabled={saving}><Save size={14} /> {saving ? 'در حال ذخیره…' : 'ذخیره'}</Btn>
                <Btn kind="quiet" onClick={() => setNaming(false)} title="انصراف"><X size={14} /></Btn>
              </form>
            ) : (
              <Btn kind="primary" onClick={() => setNaming(true)} disabled={saving}>{savedOk ? <><Check size={14} /> ذخیره شد</> : <><Save size={14} /> ذخیرهٔ نسخه</>}</Btn>
            )}
            <Btn kind="ghost" onClick={printReport} title="گزارش دوصفحه‌ای A4؛ در پنجرهٔ چاپ «ذخیره به‌صورت PDF» هم هست"><Printer size={14} /> چاپ</Btn>
            <Btn kind="ghost" onClick={() => void exportPdf()} disabled={busy === 'pdf'}><FileDown size={14} /> {busy === 'pdf' ? 'در حال ساخت…' : 'PDF'}</Btn>
            <Btn kind="ghost" onClick={() => void exportXlsx()} disabled={busy === 'xlsx'}><FileSpreadsheet size={14} /> اکسل</Btn>
            <Btn kind="quiet" onClick={copySms} title="خلاصهٔ کوتاه برای پیام">{copied ? <Check size={14} color={STATUS.good} /> : <Copy size={14} />} {copied ? 'کپی شد' : 'خلاصه'}</Btn>
          </div>
        </div>
      </div>

      <div ref={reportRef} className="mx-auto max-w-6xl px-4 py-6 space-y-4 pb-24 lg:pb-8">
        {/* executive summary */}
        <section className="est-exec est-fade-in">
          <div className="est-exec-main">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="est-chip"><Landmark size={12} /> خلاصهٔ مدیریتی</span>
              <span className="est-chip is-soft">مرحلهٔ {MATURITY[maturity].label}</span>
              <span className="est-chip is-soft"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: METHOD_META[chosen.method].color }} /> روش {METHOD_META[chosen.method].short}</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black leading-snug" style={{ color: INK }}>{project.name}</h1>
            <p className="text-[11.5px] mt-1" style={{ color: MUTED_FG }}>{scopeLabels(project).map((l) => l.replace(/\d+/g, (d) => toFa(d))).join(' · ')}</p>
            <div className="mt-3 rounded-xl overflow-hidden" style={{ background: 'rgba(10,18,28,.55)', border: `1px solid ${BORDER}` }}>
              <RouteSchematic project={project} lengthKm={kpis.lengthKm} height={112} />
            </div>
            <p className="text-[13px] leading-[2] mt-3" style={{ color: INK_SOFT }}>{summary}</p>
          </div>
          <div className="est-exec-total">
            <span className="text-[11px]" style={{ color: MUTED_FG }}>برآورد کل هزینهٔ سرمایه‌ای</span>
            <b className="est-mono est-total"><AnimatedNumber value={toEur(results.grand)} format={fmtEUR} /></b>
            <span className="est-mono text-sm" style={{ color: INK }}>{fmtRial(toRial(results.grand))}</span>
            <div className="mt-4">
              <div className="text-[10.5px] mb-1.5" style={{ color: MUTED_FG }}>بازهٔ برآورد ({fmtPct(range.lowPct)} تا +{fmtPct(range.highPct)})</div>
              <div className="est-range-lg"><span style={{ insetInlineStart: `${(-range.lowPct / ((range.highPct - range.lowPct) || 1)) * 100}%` }} /></div>
              <div className="flex justify-between text-xs mt-1.5" style={{ color: INK_SOFT }}>
                <span className="est-mono">{fmtEURm(toEur(range.low))}</span><span style={{ color: SAFETY }}>برآورد</span><span className="est-mono">{fmtEURm(toEur(range.high))}</span>
              </div>
            </div>
            <p className="text-[10.5px] leading-relaxed mt-3" style={{ color: MUTED_FG }}>{chosen.method === 'parametric' ? `${MATURITY[maturity].hint}. با پیشرفت طراحی، مرحله را در گام ۱ به‌روز کنید تا بازه تنگ‌تر شود.` : chosen.note}</p>
          </div>
        </section>

        <Card>
          <CardTitle icon={<Layers3 size={15} />} title="مقایسهٔ روش‌های برآورد"
            hint={<>همهٔ روش‌ها روی یک محور؛ نوار بازهٔ هر روش و خط عمودی برآورد آن است. روی هر روش بزنید تا مبنای عدد نهایی شود — ساختار شکست هزینه و جریان نقدینگی به نسبت روش پارامتریک به همان عدد تخصیص داده می‌شود.{fr.methods.fellBack && <b style={{ color: '#f0b45a' }}> روش انتخاب‌شده داده ندارد؛ برآورد پارامتریک نمایش داده می‌شود.</b>}</>} />
          <MethodLadder list={fr.methods.list} chosen={chosen.method} onPick={(m) => onChange({ ...inputs, method: m })} />
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi icon={<CalendarRange size={16} />} label="مدت تا راه‌اندازی" value={`${toFa(kpis.totalMonths)} ماه`} sub={`اجرا ${toFa(inputs.lifecycle.executionMonths)} ماه`} delay={40} />
          <Kpi icon={<Ruler size={16} />} label="هزینهٔ هر کیلومتر" value={kpis.usdPerKm ? fmtEURm(toEur(kpis.usdPerKm)) : '—'} sub={kpis.lengthKm ? `${toFa(kpis.lengthKm)} کیلومتر` : undefined} tone="#3987e5" delay={80} />
          <Kpi icon={<TrendingUp size={16} />} label="اوج نیاز ماهانه" value={fmtEURm(toEur(kpis.peakMonthlyUsd))} sub={`ماه ${toFa(kpis.peakMonth)}`} tone="#9085e9" delay={120} />
          <Kpi icon={<Gauge size={16} />} label="سهم ذخایر از کل" value={fmtPct(kpis.reserveShare)} sub="پیش‌بینی‌نشده + نوسان" tone="#199e70" delay={160} />
          <Kpi icon={<ShieldAlert size={16} />} label="ریسک بالا و بحرانی" value={toFa(kpis.highRisks)} sub={`از ${toFa(inputs.risks.length)} ریسک`} tone={kpis.highRisks ? STATUS.critical : STATUS.good} delay={200} />
          <Kpi icon={<PackageSearch size={16} />} label="تأمین دیرهنگام" value={toFa(kpis.lateLongLead)} sub="قلم بلندمدت پرخطر" tone={kpis.lateLongLead ? STATUS.serious : STATUS.good} delay={240} />
        </div>

        {/* Section share + magnitude */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardTitle icon={<PieIcon size={15} />} title="سهم هر بخش از هزینهٔ مستقیم" />
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={2} strokeWidth={0}>
                  {donutData.map((d) => (<Cell key={d.key} fill={SECTION_COLOR[d.key]} />))}
                </Pie>
                <Tooltip formatter={(v) => fmtEUR(Number(v) * eurRate)} contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, color: INK_SOFT }} formatter={(v) => <span style={{ color: INK_SOFT }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardTitle icon={<Table2 size={15} />} title="مقایسهٔ مبلغ هر بخش" />
            <div dir="ltr">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID} />
                  <XAxis type="number" tickFormatter={(v) => fmtEURm(v * eurRate)} tick={{ fontSize: 11, fill: MUTED_FG }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: INK_SOFT }} />
                  <Tooltip formatter={(v) => fmtEUR(Number(v) * eurRate)} contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} animationDuration={700} animationEasing="ease-out">
                    {barData.map((d) => (<Cell key={d.key} fill={SECTION_COLOR[d.key]} />))}
                    <LabelList dataKey="value" position="right" formatter={(v) => fmtEURm(Number(v) * eurRate)} style={{ fontSize: 11, fill: INK_SOFT }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Lifecycle + cash flow */}
        <Card>
          <CardTitle icon={<LineChart size={15} />} title="چرخهٔ عمر و جریان نقدینگی" hint={<>جمع مدت تا راه‌اندازی: <span className="est-mono font-bold" style={{ color: INK }}>{toFa(totalMonths)} ماه</span> — هزینهٔ مهندسی در دورهٔ طراحی پایه و بقیه با منحنی S در دورهٔ اجرا توزیع شده است.</>} />

          <div className="flex h-7 w-full overflow-hidden rounded-lg mb-3" dir="ltr">
            {lifecyclePhases.map((p) => (
              <div key={p.key} className="flex items-center justify-center text-[10px] font-bold"
                style={{ width: `${(p.months / totalMonths) * 100}%`, background: LIFECYCLE_COLOR[p.key], color: p.key === 'execution' ? '#1A1400' : '#fff' }}>
                {toFa(p.months)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {lifecyclePhases.map((p) => (
              <div key={p.key} className="flex items-center gap-1.5 text-[11px]" style={{ color: INK_SOFT }}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: LIFECYCLE_COLOR[p.key] }} />
                {p.label} — <span className="est-mono">{toFa(p.months)} ماه</span>
              </div>
            ))}
          </div>

          <p className="text-[11px] mb-1.5" style={{ color: MUTED_FG }}>جریان نقدینگی ماهانه</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={cashFlow} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: MUTED_FG }} tickFormatter={(v) => toFa(v)} interval={Math.ceil(cashFlow.length / 12)} />
              <YAxis tickFormatter={(v) => fmtEURm(v * eurRate)} tick={{ fontSize: 10, fill: MUTED_FG }} width={44} />
              <Tooltip
                formatter={(v) => fmtEUR(Number(v) * eurRate)}
                labelFormatter={(m) => `ماه ${toFa(Number(m))}`}
                contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar dataKey="monthlyUsd" name="هزینه ماهانه" radius={[3, 3, 0, 0]} animationDuration={600}>
                {cashFlow.map((p, i) => (<Cell key={i} fill={LIFECYCLE_COLOR[p.phase]} />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <p className="text-[11px] mb-1.5 mt-4" style={{ color: MUTED_FG }}>جریان نقدینگی تجمعی</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={cashFlow} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="est-cum-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SAFETY} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={SAFETY} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: MUTED_FG }} tickFormatter={(v) => toFa(v)} interval={Math.ceil(cashFlow.length / 12)} />
              <YAxis tickFormatter={(v) => fmtEURm(v * eurRate)} tick={{ fontSize: 10, fill: MUTED_FG }} width={44} />
              <Tooltip
                formatter={(v) => fmtEUR(Number(v) * eurRate)}
                labelFormatter={(m) => `ماه ${toFa(Number(m))}`}
                contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
              />
              <Area type="monotone" dataKey="cumulativeUsd" name="تجمعی" stroke={SAFETY} strokeWidth={2} fill="url(#est-cum-fill)" animationDuration={700} />
            </AreaChart>
          </ResponsiveContainer>

          <p className="text-[11px] mb-1.5 mt-5" style={{ color: MUTED_FG }}>نیاز نقدینگی سال‌به‌سال (مبنای درخواست بودجهٔ سالانه)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 520 }}>
              <thead>
                <tr className="text-xs" style={{ borderBottom: `1px solid ${BORDER}`, color: MUTED_FG }}>
                  <th className="text-right py-1.5 font-medium">سال پروژه</th>
                  <th className="text-right py-1.5 font-medium">فازها</th>
                  <th className="text-left py-1.5 font-medium">نیاز سال (یورو)</th>
                  <th className="text-left py-1.5 font-medium">نیاز سال (ریال)</th>
                  <th className="text-left py-1.5 font-medium">تجمعی</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.year} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td className="py-1.5 est-mono" style={{ color: INK }}>سال {toFa(y.year)}</td>
                    <td className="py-1.5 text-[11px]" style={{ color: MUTED_FG }}>{y.phases.map((ph) => LIFECYCLE_PHASE_LABEL[ph]).join('، ')}</td>
                    <td className="py-1.5 text-left est-mono" style={{ color: INK }}>{y.usd ? fmtEUR(toEur(y.usd)) : '—'}</td>
                    <td className="py-1.5 text-left est-mono" style={{ color: MUTED_FG }}>{y.usd ? fmtRialBn(toRial(y.usd)) : '—'}</td>
                    <td className="py-1.5 text-left">
                      <span className="inline-flex items-center gap-2 est-mono text-xs" style={{ color: INK_SOFT }}>
                        <span className="inline-block h-1.5 w-16 rounded-full overflow-hidden" style={{ background: SURFACE_2 }}><span className="block h-full est-grow" style={{ width: `${(y.cumulativeUsd / (results.grand || 1)) * 100}%`, background: SAFETY }} /></span>
                        {fmtPct(y.cumulativeUsd / (results.grand || 1))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* CBS detail table */}
        <Card>
          <CardTitle icon={<Table2 size={15} />} title="ساختار شکست هزینه" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 520 }}>
              <thead>
                <tr className="text-xs" style={{ borderBottom: `1px solid ${BORDER}`, color: MUTED_FG }}>
                  <th className="text-right py-1.5 font-medium">بخش</th>
                  <th className="text-left py-1.5 font-medium est-mono">یورو</th>
                  <th className="text-left py-1.5 font-medium est-mono">ریال</th>
                </tr>
              </thead>
              <tbody>
                {results.sections.map((s) => (
                  <tr key={s.key} style={{ borderBottom: `1px solid ${BORDER}`, borderRight: `3px solid ${SECTION_COLOR[s.key]}` }}>
                    <td className="py-1.5 pr-2" style={{ color: INK_SOFT }}>
                      {s.label}
                      {s.note && <div className="text-[10px] mt-0.5" style={{ color: MUTED_FG }}>{s.note}</div>}
                    </td>
                    <td className="text-left est-mono" style={{ color: INK }}>{fmtEUR(toEur(s.totalUsd))}</td>
                    <td className="text-left est-mono" style={{ color: MUTED_FG }}>{fmtRialBn(toRial(s.totalUsd))}</td>
                  </tr>
                ))}
                <tr className="font-bold" style={{ background: SURFACE_2 }}>
                  <td className="py-2" style={{ color: INK }}>جمع هزینه‌های مستقیم</td>
                  <td className="text-left est-mono" style={{ color: INK }}>{fmtEUR(toEur(results.direct))}</td>
                  <td className="text-left est-mono" style={{ color: INK }}>{fmtRialBn(toRial(results.direct))}</td>
                </tr>
                {[
                  ['مهندسی و طراحی', results.eng],
                  ['مدیریت پروژه (EPCM)', results.pm],
                  ['بیمه و ضمانت‌نامه', results.ins],
                  [`پیش‌بینی‌نشده (${fmtPct(inputs.overhead.contingency)})`, results.contingency],
                  [`ذخیره نوسان ارزی (${fmtPct(inputs.overhead.escalation)})`, results.escalation],
                ].map(([label, val]) => (
                  <tr key={label as string} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td className="py-1.5" style={{ color: INK_SOFT }}>{label}</td>
                    <td className="text-left est-mono" style={{ color: INK }}>{fmtEUR(toEur(val as number))}</td>
                    <td className="text-left est-mono" style={{ color: MUTED_FG }}>{fmtRialBn(toRial(val as number))}</td>
                  </tr>
                ))}
                <tr className="font-extrabold" style={{ background: SAFETY }}>
                  <td className="py-2.5 rounded-r-md" style={{ color: '#1A1400' }}>جمع کل برآورد پروژه</td>
                  <td className="text-left est-mono" style={{ color: '#1A1400' }}>{fmtEUR(toEur(results.grand))}</td>
                  <td className="text-left est-mono rounded-l-md" style={{ color: '#1A1400' }}>{fmtRialBn(toRial(results.grand))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="text-xs mt-3" style={{ color: MUTED_FG }}>
            مبنای محاسبات به دلار آمریکا: <span className="est-mono" style={{ color: INK_SOFT }}>{fmtUSD(results.grand)}</span>
          </div>
        </Card>

        {/* Long-lead items */}
        <Card>
          <CardTitle icon={<PackageSearch size={15} />} title="اقلام بلندمدت‌تأمین" />
          <p className="text-[11px] leading-relaxed mb-3" style={{ color: MUTED_FG }}>
            اقلام بلندمدت‌تأمین، تجهیزات یا موادی هستند که فاصله سفارش تا تحویل آن‌ها آن‌قدر طولانی است که خودشان می‌توانند تعیین‌کننده زمان‌بندی کل پروژه باشند، نه عملیات اجرایی.
            اگر سفارش این اقلام دیر آغاز شود، حتی با اجرای سریع بقیه پروژه، تاریخ راه‌اندازی نهایی عقب می‌افتد؛ به همین دلیل باید معمولاً هم‌زمان با طراحی پایه سفارش داده شوند.
          </p>
          {inputs.longLeadItems.length === 0 ? (
            <p className="text-xs" style={{ color: MUTED_FG }}>قلمی برای این پروژه ثبت نشده است.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 460 }}>
                <thead>
                  <tr className="text-xs" style={{ borderBottom: `1px solid ${BORDER}`, color: MUTED_FG }}>
                    <th className="text-right py-1.5 font-medium">قلم</th>
                    <th className="text-center py-1.5 font-medium">مدت تأمین</th>
                    <th className="text-right py-1.5 font-medium">توضیحات</th>
                  </tr>
                </thead>
                <tbody>
                  {[...inputs.longLeadItems].sort((a, b) => b.leadTimeMonths - a.leadTimeMonths).map((it) => {
                    const designWindow = inputs.lifecycle.consultantSelectionMonths + inputs.lifecycle.basicDesignMonths
                    const atRisk = it.leadTimeMonths > designWindow
                    return (
                      <tr key={it.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                        <td className="py-1.5 pr-2" style={{ color: INK_SOFT }}>{it.title || '—'}</td>
                        <td className="py-1.5 text-center">
                          <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white est-mono" style={{ background: atRisk ? STATUS.critical : STATUS.good }}>
                            {toFa(it.leadTimeMonths)} ماه
                          </span>
                        </td>
                        <td className="py-1.5 text-xs" style={{ color: MUTED_FG }}>{it.notes || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Sensitivity analysis */}
        <Card>
          <CardTitle icon={<Gauge size={15} />} title="تحلیل حساسیت برآورد" />
          <p className="text-[11px] leading-relaxed mb-3" style={{ color: MUTED_FG }}>
            این نمودار — که به آن «تورنادو» هم گفته می‌شود — نشان می‌دهد اگر هر یک از فرضیات زیر به‌تنهایی {toFa(Math.round(SENSITIVITY_PCT * 100))}٪ کمتر یا بیشتر شود (و بقیه فرضیات ثابت بمانند)، جمع کل برآورد چقدر تغییر می‌کند.
            هر چه میله یک ردیف بلندتر باشد، آن فرضیه برای دقت برآورد نهایی حساس‌تر است و باید با دقت بیشتری راستی‌آزمایی شود.
          </p>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={Math.max(160, sensitivity.length * 34)}>
              <BarChart data={sensitivity.map((s) => ({
                key: s.key, name: s.label,
                base: toEur(s.lowGrandUsd), range: toEur(s.highGrandUsd - s.lowGrandUsd),
              }))} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID} />
                <XAxis type="number" tickFormatter={(v) => fmtEURm(v)} tick={{ fontSize: 11, fill: MUTED_FG }} domain={['dataMin', 'dataMax']} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: INK_SOFT }} />
                <Tooltip
                  formatter={(v, key) => (key === 'range' ? fmtEUR(Number(v)) + ' نوسان' : null)}
                  contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <ReferenceLine x={toEur(results.grand)} stroke={SAFETY} strokeDasharray="4 4" label={{ value: 'برآورد پایه', fontSize: 10, fill: SAFETY, position: 'insideTopLeft' }} />
                <Bar dataKey="base" stackId="tornado" fill="transparent" isAnimationActive={false} />
                <Bar dataKey="range" stackId="tornado" radius={[3, 3, 3, 3]} animationDuration={600}>
                  {sensitivity.map((s) => (<Cell key={s.key} fill="#3987e5" />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Risk heat map */}
        <Card>
          <CardTitle icon={<AlertTriangle size={15} />} title="ریسک‌های پروژه" />
          <div className="flex flex-wrap items-start gap-4 mb-2">
            <div className="shrink-0">
              <p className="text-[10px] mb-1" style={{ color: MUTED_FG }}>نقشه حرارتی (احتمال × اثر)</p>
              <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(5, 18px)', direction: 'ltr' }}>
                {heatGrid.flat().map((cell) => {
                  const band = riskBand(cell.score)
                  return (
                    <div
                      key={`${cell.likelihood}-${cell.impact}`}
                      title={cell.risks.map((r) => r.title || 'ریسک بی‌نام').join('، ') || 'بدون ریسک'}
                      className="flex items-center justify-center rounded-[3px] text-[9px] font-bold"
                      style={{ width: 18, height: 18, background: cell.count > 0 ? band.color : SURFACE_2, color: cell.count > 0 ? '#fff' : MUTED_FG, opacity: cell.count > 0 ? 1 : 0.5 }}
                    >
                      {cell.count > 0 ? toFa(cell.count) : ''}
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-between text-[8px] mt-1" style={{ color: MUTED_FG, direction: 'ltr', width: 5 * 18 + 4 * 2 }}>
                <span>کم</span>
                <span>زیاد</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-4">
              {(['good', 'warning', 'serious', 'critical'] as const).map((k) => (
                <div key={k} className="flex items-center gap-1.5 text-[11px]" style={{ color: INK_SOFT }}>
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATUS[k] }} />
                  {k === 'good' ? 'کم' : k === 'warning' ? 'متوسط' : k === 'serious' ? 'بالا' : 'بحرانی'}
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm" style={{ minWidth: 480 }}>
              <thead>
                <tr className="text-xs" style={{ borderBottom: `1px solid ${BORDER}`, color: MUTED_FG }}>
                  <th className="text-right py-1.5 font-medium">ریسک</th>
                  <th className="text-right py-1.5 font-medium">دسته</th>
                  <th className="text-center py-1.5 font-medium">سطح</th>
                  <th className="text-right py-1.5 font-medium">اقدام کاهش</th>
                </tr>
              </thead>
              <tbody>
                {inputs.risks.map((r) => {
                  const band = riskBand(r.likelihood * r.impact)
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <td className="py-1.5 pr-2" style={{ color: INK_SOFT }}>{r.title || '—'}</td>
                      <td className="py-1.5 text-xs" style={{ color: MUTED_FG }}>{RISK_CATEGORY_LABEL[r.category]}</td>
                      <td className="py-1.5 text-center">
                        <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: band.color }}>
                          {band.label} ({toFa(r.likelihood * r.impact)})
                        </span>
                      </td>
                      <td className="py-1.5 text-xs" style={{ color: MUTED_FG }}>{r.mitigation || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="text-[11px] leading-relaxed px-1 pb-6" style={{ color: MUTED_FG }}>
          این برآورد پارامتریک و بر پایهٔ مبانی محاسباتی سازمان است؛ پیش از تصمیم نهایی سرمایه‌گذاری، نرخ‌های اصلی (لوله، شیرآلات، تجهیزات دوار و عملیات اجرایی) با استعلام بازار و فهرست‌بهای روز راستی‌آزمایی شوند.
        </div>
      </div>
      <style>{RESULTS_STYLE}</style>
    </div>
  )
}

const RESULTS_STYLE = `
  .est-actionbar { position: sticky; top: 0; z-index: 6; background: rgba(10,18,28,.88); backdrop-filter: blur(10px); border-bottom: 1px solid ${BORDER}; }
  .est-name-form { display: flex; align-items: center; gap: .35rem; }
  .est-name-form input { width: min(62vw, 250px); background: ${SURFACE_2}; border: 1px solid ${BORDER}; color: ${INK}; border-radius: 10px; padding: .5rem .7rem; font-size: 12px; }
  .est-exec { display: grid; gap: 1rem; grid-template-columns: 1fr; padding: 1.3rem; border-radius: 22px; border: 1px solid ${BORDER};
    background: radial-gradient(110% 120% at 100% 0%, rgba(242,183,5,.09), transparent 55%), radial-gradient(90% 120% at 0% 100%, rgba(57,135,229,.10), transparent 60%), ${SURFACE}; }
  @media (min-width: 1024px) { .est-exec { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); padding: 1.6rem 1.8rem; } }
  .est-exec-total { display: flex; flex-direction: column; padding: 1.2rem 1.3rem; border-radius: 18px; background: rgba(10,18,28,.6); border: 1px solid ${BORDER}; }
  .est-total { font-size: clamp(1.9rem, 3.6vw, 2.7rem); line-height: 1.15; color: ${SAFETY}; font-weight: 700; margin: .25rem 0 .2rem; text-shadow: 0 0 28px rgba(242,183,5,.25); }
  .est-chip { display: inline-flex; align-items: center; gap: .3rem; font-size: 11px; font-weight: 700; color: ${SAFETY}; background: rgba(242,183,5,.08); border: 1px solid rgba(242,183,5,.25); padding: .2rem .55rem; border-radius: 99px; }
  .est-chip.is-soft { color: ${INK_SOFT}; background: rgba(255,255,255,.04); border-color: ${BORDER}; }
  .est-range-lg { position: relative; height: 10px; border-radius: 99px; background: linear-gradient(270deg, rgba(57,135,229,.55), rgba(242,183,5,.3) 40%, rgba(230,103,103,.6)); }
  .est-range-lg span { position: absolute; top: -5px; width: 4px; height: 20px; border-radius: 2px; background: ${SAFETY}; transform: translateX(50%); box-shadow: 0 0 12px rgba(242,183,5,.6); }
`
