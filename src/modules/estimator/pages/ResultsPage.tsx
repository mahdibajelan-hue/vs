import { useMemo, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import { Check, Copy, FileDown, Save } from 'lucide-react'
import { exportElementToPdf } from '../../../lib/export'
import type { EstFullInputs, EstProject, EstRisk } from '../types'
import { computeEstimate, PHASES } from '../lib/calc'
import {
  fmtEUR, fmtEURm, fmtPct, fmtRial, fmtRialBn, fmtUSD, LINE, SAFETY, SECTION_COLOR, STEEL, STEEL_DARK,
  TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE, toFa,
} from '../lib/theme'
import { Card } from '../components/ui'

const RISK_CATEGORY_LABEL: Record<EstRisk['category'], string> = {
  fx: 'ارزی', procurement: 'تأمین کالا', geotechnical: 'ژئوتکنیک', schedule: 'زمان‌بندی',
  hse: 'HSE', contractor: 'پیمانکار', permit: 'مجوز/تملک', weather: 'آب‌وهوا', other: 'سایر',
}

function riskBand(score: number) {
  if (score <= 4) return { label: 'کم', color: '#2A8C82' }
  if (score <= 9) return { label: 'متوسط', color: SAFETY }
  if (score <= 15) return { label: 'بالا', color: '#B44711' }
  return { label: 'بحرانی', color: '#9B1C1C' }
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
  const [copied, setCopied] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  const eurRate = inputs.overhead.fxEurPerUsd
  const rialRate = inputs.overhead.fxRialPerUsd
  const toEur = (usd: number) => usd * eurRate
  const toRial = (usd: number) => usd * rialRate

  const chartData = [...results.sections]
    .sort((a, b) => b.totalUsd - a.totalUsd)
    .map((s) => ({ key: s.key, name: s.chartLabel, value: s.totalUsd }))

  const phaseSum = inputs.phaseWeights.reduce((a, b) => a + b, 0) || 1
  const cashFlow = PHASES.map((ph, i) => ({
    name: ph.name, desc: ph.desc, pct: inputs.phaseWeights[i],
    usd: (inputs.phaseWeights[i] / phaseSum) * results.grand,
  }))

  const lifecyclePhases = [
    { label: 'انتخاب مشاور طراح', months: inputs.lifecycle.consultantSelectionMonths },
    { label: 'اتمام طراحی پایه', months: inputs.lifecycle.basicDesignMonths },
    { label: 'انتخاب پیمانکار EPC', months: inputs.lifecycle.epcContractorSelectionMonths },
    { label: 'اجرا و راه‌اندازی', months: inputs.lifecycle.commissioningMonths },
  ]
  const totalMonths = lifecyclePhases.reduce((s, p) => s + p.months, 0) || 1

  function smsSummary() {
    return (
      `برآورد هزینه پروژه «${project.name}»\n` +
      `جمع کل: ${fmtEUR(toEur(results.grand))} (≈ ${fmtRialBn(toRial(results.grand))})\n` +
      `مدت پیش از اجرا: ${toFa(totalMonths)} ماه`
    ).slice(0, 640)
  }

  function copySms() {
    navigator.clipboard?.writeText(smsSummary()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  async function exportPdf() {
    if (!reportRef.current) return
    await exportElementToPdf(reportRef.current, `estimate-${project.name}.pdf`, { backgroundColor: '#F3F5F7' })
  }

  return (
    <div className="h-full overflow-y-auto est-font" style={{ background: '#F3F5F7' }}>
      <div ref={reportRef} className="mx-auto max-w-4xl px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 no-print">
          <div>
            <p className="text-sm font-bold" style={{ color: STEEL_DARK }}>۳. نتیجه برآورد هزینه</p>
            <p className="text-[11px] text-slate-500 mt-0.5">پروژه: {project.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onSave({ grandTotalEur: toEur(results.grand), grandTotalRial: toRial(results.grand) })}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-white disabled:opacity-60 transition-transform hover:scale-[1.02]"
              style={{ background: STEEL }}>
              <Save size={14} /> {saving ? 'در حال ذخیره...' : 'ذخیره در تاریخچه'}
            </button>
            <button onClick={exportPdf}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium border border-slate-300 bg-white transition-transform hover:scale-[1.02]">
              <FileDown size={14} /> گزارش جامع PDF
            </button>
            <button onClick={copySms}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium border border-slate-300 bg-white transition-transform hover:scale-[1.02]">
              {copied ? <Check size={14} color="#2A8C82" /> : <Copy size={14} />}
              {copied ? 'کپی شد' : 'خلاصه پیامکی'}
            </button>
          </div>
        </div>

        {/* Headline */}
        <div className="est-card rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${STEEL_DARK}, #0A2434)` }}>
          <div className="est-hazard absolute inset-x-0 top-0" />
          <div className="text-[11px] text-slate-300 mb-1 pt-2">جمع کل برآورد پروژه</div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="text-3xl md:text-4xl font-extrabold est-mono" style={{ color: SAFETY }}>{fmtEUR(toEur(results.grand))}</div>
            <div className="text-sm text-slate-300 est-mono mb-1">≈ {fmtRial(toRial(results.grand))}</div>
          </div>
          <div className="text-xs text-slate-400 mt-1 est-mono">مبنای محاسبه: {fmtUSD(results.grand)} (بر اساس نرخ‌های ارز واردشده)</div>
        </div>

        {/* CBS by section */}
        <Card>
          <h2 className="font-bold mb-3" style={{ color: STEEL_DARK }}>ریز برآورد به تفکیک بخش</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 520 }}>
              <thead>
                <tr className="text-slate-500 text-xs border-b" style={{ borderColor: LINE }}>
                  <th className="text-right py-1.5 font-medium">بخش</th>
                  <th className="text-left py-1.5 font-medium est-mono">یورو</th>
                  <th className="text-left py-1.5 font-medium est-mono">ریال</th>
                </tr>
              </thead>
              <tbody>
                {results.sections.map((s) => (
                  <tr key={s.key} className="border-b" style={{ borderColor: LINE, borderRight: `3px solid ${SECTION_COLOR[s.key]}` }}>
                    <td className="py-1.5 pr-2">
                      {s.label}
                      {s.note && <div className="text-[10px] text-slate-400 mt-0.5">{s.note}</div>}
                    </td>
                    <td className="text-left est-mono">{fmtEUR(toEur(s.totalUsd))}</td>
                    <td className="text-left est-mono text-slate-500">{fmtRialBn(toRial(s.totalUsd))}</td>
                  </tr>
                ))}
                <tr className="font-bold" style={{ background: '#F7F3E2' }}>
                  <td className="py-2">جمع هزینه‌های مستقیم</td>
                  <td className="text-left est-mono">{fmtEUR(toEur(results.direct))}</td>
                  <td className="text-left est-mono">{fmtRialBn(toRial(results.direct))}</td>
                </tr>
                {[
                  ['مهندسی و طراحی', results.eng],
                  ['مدیریت پروژه (EPCM)', results.pm],
                  ['بیمه و ضمانت‌نامه', results.ins],
                  [`پیش‌بینی‌نشده (${fmtPct(inputs.overhead.contingency)})`, results.contingency],
                  [`ذخیره نوسان ارزی (${fmtPct(inputs.overhead.escalation)})`, results.escalation],
                ].map(([label, val]) => (
                  <tr key={label as string} className="border-b" style={{ borderColor: LINE }}>
                    <td className="py-1.5 text-slate-600">{label}</td>
                    <td className="text-left est-mono">{fmtEUR(toEur(val as number))}</td>
                    <td className="text-left est-mono text-slate-500">{fmtRialBn(toRial(val as number))}</td>
                  </tr>
                ))}
                <tr className="font-extrabold text-white" style={{ background: STEEL_DARK }}>
                  <td className="py-2.5 rounded-r-md">جمع کل برآورد پروژه</td>
                  <td className="text-left est-mono" style={{ color: SAFETY }}>{fmtEUR(toEur(results.grand))}</td>
                  <td className="text-left est-mono rounded-l-md" style={{ color: SAFETY }}>{fmtRialBn(toRial(results.grand))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* Chart */}
        <Card>
          <h2 className="font-bold mb-3" style={{ color: STEEL_DARK }}>سهم هر بخش از هزینه مستقیم</h2>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 42)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={LINE} />
                <XAxis type="number" tickFormatter={(v) => fmtEURm(v * eurRate)} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmtEUR(Number(v) * eurRate)} contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} cursor={{ fill: 'rgba(15,47,65,0.04)' }} />
                <Bar dataKey="value" name="هزینه" radius={[0, 4, 4, 0]} animationDuration={700} animationEasing="ease-out">
                  {chartData.map((d) => (<Cell key={d.key} fill={SECTION_COLOR[d.key]} />))}
                  <LabelList dataKey="value" position="right" formatter={(v) => fmtEURm(Number(v) * eurRate)} style={{ fontSize: 11, fill: '#16232E' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Cash flow */}
        <Card>
          <h2 className="font-bold mb-3" style={{ color: STEEL_DARK }}>جریان نقدی اجرا (Cash Flow)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cashFlow} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={LINE} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => fmtEURm(v * eurRate)} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmtEUR(Number(v) * eurRate)}
                labelFormatter={(l, d) => (d?.[0]?.payload as { desc?: string } | undefined)?.desc || l}
                contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} cursor={{ fill: 'rgba(15,47,65,0.04)' }} />
              <Bar dataKey="usd" name="هزینه" radius={[4, 4, 0, 0]} animationDuration={700} animationEasing="ease-out">
                {cashFlow.map((_, i) => (<Cell key={i} fill={i % 2 === 0 ? STEEL : '#2E6C8E'} />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Lifecycle */}
        <Card>
          <h2 className="font-bold mb-3" style={{ color: STEEL_DARK }}>چرخه عمر پروژه تا شروع بهره‌برداری</h2>
          <div className="flex h-8 w-full overflow-hidden rounded-lg" dir="ltr">
            {lifecyclePhases.map((p, i) => (
              <div key={p.label} className="flex items-center justify-center text-[10px] font-medium text-white"
                style={{ width: `${(p.months / totalMonths) * 100}%`, background: [STEEL_DARK, STEEL, '#2E6C8E', '#3E9C90'][i] }}>
                {toFa(p.months)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {lifecyclePhases.map((p) => (
              <div key={p.label} className="text-[11px] text-slate-600">
                <div className="font-medium">{p.label}</div>
                <div className="est-mono text-slate-400">{toFa(p.months)} ماه</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-500 mt-2 est-mono">جمع مدت پیش از شروع اجرا: {toFa(totalMonths)} ماه</div>
        </Card>

        {/* Risks */}
        <Card>
          <h2 className="font-bold mb-3" style={{ color: STEEL_DARK }}>ریسک‌های پروژه</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 480 }}>
              <thead>
                <tr className="text-slate-500 text-xs border-b" style={{ borderColor: LINE }}>
                  <th className="text-right py-1.5 font-medium">ریسک</th>
                  <th className="text-right py-1.5 font-medium">دسته</th>
                  <th className="text-center py-1.5 font-medium">سطح</th>
                  <th className="text-right py-1.5 font-medium">اقدام کاهش</th>
                </tr>
              </thead>
              <tbody>
                {inputs.risks.map((r) => {
                  const score = r.likelihood * r.impact
                  const band = riskBand(score)
                  return (
                    <tr key={r.id} className="border-b" style={{ borderColor: LINE }}>
                      <td className="py-1.5 pr-2">{r.title || '—'}</td>
                      <td className="py-1.5 text-slate-500 text-xs">{RISK_CATEGORY_LABEL[r.category]}</td>
                      <td className="py-1.5 text-center">
                        <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: band.color }}>
                          {band.label} ({toFa(score)})
                        </span>
                      </td>
                      <td className="py-1.5 text-slate-500 text-xs">{r.mitigation || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="text-[11px] text-slate-400 leading-relaxed px-1 pb-6">
          توجه: نرخ‌های واحد خطوط لوله بر مبنای ساختار هزینه راهنمای برآورد وزارت نفت است و برای ایستگاه‌های لانچر، رسیور، انشعاب، شیر بین‌راهی و مخابرات/اسکادا — که خارج از محدوده راهنمای رسمی هستند — از برآورد مهندسی-پارامتریک استفاده شده است.
          پیش از ارائه نهایی و تصمیم‌گیری سرمایه‌گذاری، با فهرست‌بهای مصوب و استعلام بازار روز راستی‌آزمایی شوند.
        </div>
      </div>
    </div>
  )
}
