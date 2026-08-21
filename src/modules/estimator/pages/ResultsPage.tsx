import { useMemo, useRef, useState } from 'react'
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, Legend,
} from 'recharts'
import { Check, Copy, FileDown, Save } from 'lucide-react'
import { exportElementToPdf } from '../../../lib/export'
import type { EstFullInputs, EstProject, EstRisk } from '../types'
import { computeEstimate, buildCashFlowTimeline } from '../lib/calc'
import {
  BORDER, fmtEUR, fmtEURm, fmtPct, fmtRial, fmtRialBn, fmtUSD, GRID, INK, INK_SOFT, MUTED_FG,
  SAFETY, SECTION_COLOR, STATUS, SURFACE, SURFACE_2, TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE, toFa,
} from '../lib/theme'
import { Card } from '../components/ui'
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
  project, inputs, onSave, saving,
}: {
  project: EstProject
  inputs: EstFullInputs
  onSave: (args: { grandTotalEur: number; grandTotalRial: number }) => void
  saving: boolean
}) {
  const results = useMemo(() => computeEstimate(project, inputs), [project, inputs])
  const cashFlow = useMemo(() => buildCashFlowTimeline(inputs, results), [inputs, results])
  const [copied, setCopied] = useState(false)
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

  const activeSectionLabels = results.sections.map((s) => s.label).join('، ')
  const summary =
    `این گزارش برآورد هزینهٔ پروژهٔ «${project.name}» را در ${toFa(results.sections.length)} بخش (${activeSectionLabels}) ارائه می‌دهد. ` +
    `برآورد کل پروژه ${fmtEUR(toEur(results.grand))} معادل ${fmtRial(toRial(results.grand))} است. ` +
    `چرخهٔ عمر پروژه از انتخاب مشاور طراح تا پایان راه‌اندازی حدود ${toFa(totalMonths)} ماه برآورد می‌شود.`

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
    await exportElementToPdf(printRef.current, `estimate-${project.name}.pdf`, {
      orientation: 'portrait', backgroundColor: '#ffffff', fitToOnePage: true,
    })
  }

  return (
    <div className="h-full overflow-y-auto est-font">
      <div className="comp-print-offscreen" ref={printRef} aria-hidden="true">
        <EstimatorPrintReport project={project} inputs={inputs} results={results} totalMonths={totalMonths} />
      </div>

      <div ref={reportRef} className="mx-auto max-w-4xl px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 no-print">
          <div>
            <p className="text-sm font-bold" style={{ color: INK }}>۳. نتیجه برآورد هزینه</p>
            <p className="text-[11px] mt-0.5" style={{ color: MUTED_FG }}>پروژه: {project.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onSave({ grandTotalEur: toEur(results.grand), grandTotalRial: toRial(results.grand) })}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium disabled:opacity-60 transition-transform hover:scale-[1.02]"
              style={{ background: SAFETY, color: '#1A1400' }}>
              <Save size={14} /> {saving ? 'در حال ذخیره...' : 'ذخیره در تاریخچه'}
            </button>
            <button onClick={exportPdf}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-transform hover:scale-[1.02]"
              style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK }}>
              <FileDown size={14} /> گزارش جامع PDF
            </button>
            <button onClick={copySms}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-transform hover:scale-[1.02]"
              style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK }}>
              {copied ? <Check size={14} color={STATUS.good} /> : <Copy size={14} />}
              {copied ? 'کپی شد' : 'خلاصه پیامکی'}
            </button>
          </div>
        </div>

        {/* Management report header */}
        <div className="est-card rounded-2xl p-6" style={{ background: `linear-gradient(160deg, ${SURFACE}, ${SURFACE_2})`, border: `1px solid ${BORDER}` }}>
          <div className="text-[11px] uppercase tracking-widest mb-1" style={{ color: MUTED_FG }}>گزارش مدیریتی برآورد هزینه</div>
          <h1 className="text-xl font-extrabold mb-3" style={{ color: INK }}>{project.name}</h1>
          <p className="text-sm leading-relaxed mb-5" style={{ color: INK_SOFT }}>{summary}</p>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div className="text-[11px] mb-0.5" style={{ color: MUTED_FG }}>برآورد کل (یورو)</div>
              <div className="text-3xl md:text-4xl font-extrabold est-mono" style={{ color: SAFETY }}>{fmtEUR(toEur(results.grand))}</div>
            </div>
            <div>
              <div className="text-[11px] mb-0.5" style={{ color: MUTED_FG }}>برآورد کل (ریال)</div>
              <div className="text-xl md:text-2xl font-extrabold est-mono" style={{ color: INK }}>{fmtRial(toRial(results.grand))}</div>
            </div>
          </div>
        </div>

        {/* Section share + magnitude */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <h2 className="font-bold mb-3 text-sm" style={{ color: INK }}>سهم هر بخش از هزینه کل</h2>
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
            <h2 className="font-bold mb-3 text-sm" style={{ color: INK }}>مقایسه مبلغ هر بخش</h2>
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
          <h2 className="font-bold mb-1 text-sm" style={{ color: INK }}>چرخه عمر پروژه و جریان نقدینگی</h2>
          <p className="text-[11px] mb-3" style={{ color: MUTED_FG }}>جمع مدت پیش از راه‌اندازی: <span className="est-mono font-bold" style={{ color: INK }}>{toFa(totalMonths)} ماه</span></p>

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
        </Card>

        {/* CBS detail table */}
        <Card>
          <h2 className="font-bold mb-3 text-sm" style={{ color: INK }}>ریز برآورد به تفکیک بخش</h2>
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
            هزینه پایه محاسبات (دلار آمریکا، بر اساس جداول مرجع): <span className="est-mono" style={{ color: INK_SOFT }}>{fmtUSD(results.grand)}</span>
          </div>
        </Card>

        {/* Risk heat map */}
        <Card>
          <h2 className="font-bold mb-3 text-sm" style={{ color: INK }}>ریسک‌های پروژه</h2>
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
          توجه: نرخ‌های واحد خطوط لوله و ایستگاه تقویت فشار بر مبنای ساختار هزینه راهنمای برآورد وزارت نفت است و برای پوشش لوله، ایستگاه‌های فرستنده/گیرنده توپک، انشعاب، شیر بین‌راهی و مخابرات/اسکادا — که خارج از محدوده راهنمای رسمی هستند — از برآورد مهندسی-پارامتریک استفاده شده است.
          پیش از ارائه نهایی و تصمیم‌گیری سرمایه‌گذاری، با فهرست‌بهای مصوب و استعلام بازار روز راستی‌آزمایی شوند.
        </div>
      </div>
    </div>
  )
}
