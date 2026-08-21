import { Calculator, Trash2, Plus } from 'lucide-react'
import type { EstFullInputs, EstProject, EstRisk } from '../types'
import { PHASES } from '../lib/calc'
import { fmtPct, SECTION_COLOR, STEEL_DARK } from '../lib/theme'
import { Field, Section } from '../components/ui'

const RISK_CATEGORY_LABEL: Record<EstRisk['category'], string> = {
  fx: 'ارزی', procurement: 'تأمین کالا', geotechnical: 'ژئوتکنیک', schedule: 'زمان‌بندی',
  hse: 'HSE', contractor: 'پیمانکار', permit: 'مجوز/تملک', weather: 'آب‌وهوا', other: 'سایر',
}

export function SpecsPage({
  project, inputs, onChange, onCalculate, saving,
}: {
  project: EstProject
  inputs: EstFullInputs
  onChange: (next: EstFullInputs) => void
  onCalculate: () => void
  saving: boolean
}) {
  const patch = (fn: (draft: EstFullInputs) => EstFullInputs) => onChange(fn(inputs))

  const phaseSum = inputs.phaseWeights.reduce((a, b) => a + b, 0)

  function addRisk() {
    const r: EstRisk = { id: `r${Date.now()}`, title: '', category: 'other', likelihood: 3, impact: 3, mitigation: '' }
    patch((d) => ({ ...d, risks: [...d.risks, r] }))
  }
  function updateRisk(id: string, patchFields: Partial<EstRisk>) {
    patch((d) => ({ ...d, risks: d.risks.map((r) => (r.id === id ? { ...r, ...patchFields } : r)) }))
  }
  function removeRisk(id: string) {
    patch((d) => ({ ...d, risks: d.risks.filter((r) => r.id !== id) }))
  }

  return (
    <div className="h-full overflow-y-auto est-font" style={{ background: '#F3F5F7' }}>
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <div>
          <p className="text-sm font-bold" style={{ color: STEEL_DARK }}>۲. مشخصات و آپشن‌های هر بخش</p>
          <p className="text-[11px] text-slate-500 mt-0.5">فقط بخش‌هایی که در تعریف پروژه «{project.name}» فعال شده‌اند نمایش داده می‌شوند</p>
        </div>

        <div className="est-card bg-white rounded-2xl border border-slate-200 px-5">
          {project.hasOnshore && (
            <Section title="خط لوله خشکی" accent={SECTION_COLOR.onshore} defaultOpen>
              <div className="grid grid-cols-2 gap-x-3">
                <Field label="طول خط" unit="کیلومتر" value={inputs.specs.onshore.lengthKm}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, lengthKm: v } } }))} />
                <Field label="قطر لوله" unit="اینچ" value={inputs.specs.onshore.diameterIn}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, diameterIn: v } } }))} />
                <Field label="ضخامت جداره" unit="میلی‌متر" value={inputs.specs.onshore.wtMm} step={0.5}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, wtMm: v } } }))} />
                <Field label="قیمت فولاد" unit="$/تن" value={inputs.specs.onshore.steelUsdPerTon} step={10}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, steelUsdPerTon: v } } }))} />
                <Field label="عملیات اجرایی خطی" unit="$/km" value={inputs.specs.onshore.linework} step={5000}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, linework: v } } }))} />
                <Field label="عبور از موانع (HDD)" unit="$/km" value={inputs.specs.onshore.crossing} step={1000}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, crossing: v } } }))} />
                <Field label="تست هیدرواستاتیک" unit="$/km" value={inputs.specs.onshore.test} step={1000}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, test: v } } }))} />
                <Field label="تملک اراضی (ROW)" unit="$/km" value={inputs.specs.onshore.row} step={1000}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, row: v } } }))} />
                <Field label="HSE و محیط‌زیست" unit="$/km" value={inputs.specs.onshore.hse} step={500}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, hse: v } } }))} />
                <Field label="ضریب توپوگرافی" value={inputs.specs.onshore.terrain} step={0.05}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, terrain: v } } }))}
                  hint="۱٫۰ مسطح — ۱٫۲ تا ۱٫۴ ترکیبی — ۱٫۵ تا ۱٫۸ کوهستانی" />
              </div>
            </Section>
          )}

          {project.hasOffshore && (
            <Section title="خط لوله دریایی" accent={SECTION_COLOR.offshore} defaultOpen>
              <div className="grid grid-cols-2 gap-x-3">
                <Field label="طول خط" unit="کیلومتر" value={inputs.specs.offshore.lengthKm}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, lengthKm: v } } }))} />
                <Field label="قطر لوله" unit="اینچ" value={inputs.specs.offshore.diameterIn}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, diameterIn: v } } }))} />
                <Field label="ضخامت جداره" unit="میلی‌متر" value={inputs.specs.offshore.wtMm} step={0.5}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, wtMm: v } } }))} />
                <Field label="قیمت فولاد" unit="$/تن" value={inputs.specs.offshore.steelUsdPerTon} step={10}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, steelUsdPerTon: v } } }))} />
                <Field label="عملیات مدفون‌سازی/خط‌گذاری" unit="$/km" value={inputs.specs.offshore.layingUsdPerKm} step={10000}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, layingUsdPerKm: v } } }))} />
                <Field label="بسیج/جمع‌آوری شناور (Mob/Demob)" unit="$" value={inputs.specs.offshore.mobDemobUsd} step={100000}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, mobDemobUsd: v } } }))} />
                <Field label="ضریب آب کم‌عمق" value={inputs.specs.offshore.shallowWaterSurchargePct} step={0.01}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, shallowWaterSurchargePct: v } } }))} />
                <Field label="خدمات عمومی پروژه" value={inputs.specs.offshore.generalServicesPct} step={0.01}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, generalServicesPct: v } } }))} />
              </div>
            </Section>
          )}

          {project.hasCompressorStation && (
            <Section title="ایستگاه تقویت فشار" accent={SECTION_COLOR.compressor} defaultOpen>
              <div className="grid grid-cols-2 gap-x-3">
                <Field label="تعداد ایستگاه" value={inputs.specs.compressor.stationCount}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, compressor: { ...d.specs.compressor, stationCount: Math.max(1, Math.round(v)) } } }))} />
                <Field label="توان اسمی هر ایستگاه" unit="مگاوات" value={inputs.specs.compressor.ratedPowerMwPerStation} step={0.5}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, compressor: { ...d.specs.compressor, ratedPowerMwPerStation: v } } }))} />
              </div>
              <div className="flex gap-2 mt-1">
                {(['gasTurbine', 'electric'] as const).map((dt) => (
                  <button key={dt} type="button"
                    onClick={() => patch((d) => ({ ...d, specs: { ...d.specs, compressor: { ...d.specs.compressor, driverType: dt } } }))}
                    className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                    style={inputs.specs.compressor.driverType === dt
                      ? { background: STEEL_DARK, color: '#fff', borderColor: STEEL_DARK }
                      : { background: '#fff', color: '#64748b', borderColor: '#cbd5e1' }}>
                    {dt === 'gasTurbine' ? 'درایور توربین گازی' : 'درایور الکتروموتور'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                برآورد قیمت تجهیزات دوار بر مبنای منحنی هزینه راهنمای وزارت نفت (۲۰۱۹، دلار بر کیلووات) است.
              </p>
            </Section>
          )}

          {project.launcherCount > 0 && (
            <Section title={`ایستگاه‌های لانچر (${project.launcherCount} عدد)`} accent={SECTION_COLOR.launcher}>
              <Field label="هزینه واحد هر ایستگاه لانچر" unit="$" value={inputs.specs.launcher.unitCostUsd} step={5000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, launcher: { ...d.specs.launcher, unitCostUsd: v } } }))}
                hint="برآورد مهندسی-پارامتریک، خارج از محدوده راهنمای رسمی وزارت نفت" />
            </Section>
          )}
          {project.receiverCount > 0 && (
            <Section title={`ایستگاه‌های رسیور (${project.receiverCount} عدد)`} accent={SECTION_COLOR.receiver}>
              <Field label="هزینه واحد هر ایستگاه رسیور" unit="$" value={inputs.specs.receiver.unitCostUsd} step={5000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, receiver: { ...d.specs.receiver, unitCostUsd: v } } }))}
                hint="برآورد مهندسی-پارامتریک، خارج از محدوده راهنمای رسمی وزارت نفت" />
            </Section>
          )}
          {project.tieInCount > 0 && (
            <Section title={`ایستگاه‌های انشعاب (${project.tieInCount} عدد)`} accent={SECTION_COLOR.tieIn}>
              <Field label="هزینه واحد هر ایستگاه انشعاب" unit="$" value={inputs.specs.tieIn.unitCostUsd} step={5000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, tieIn: { ...d.specs.tieIn, unitCostUsd: v } } }))}
                hint="برآورد مهندسی-پارامتریک، خارج از محدوده راهنمای رسمی وزارت نفت" />
            </Section>
          )}
          {project.blockValveCount > 0 && (
            <Section title={`ایستگاه‌های شیر بین‌راهی (${project.blockValveCount} عدد)`} accent={SECTION_COLOR.blockValve}>
              <Field label="هزینه واحد هر ایستگاه شیر بین‌راهی" unit="$" value={inputs.specs.blockValve.unitCostUsd} step={5000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, blockValve: { ...d.specs.blockValve, unitCostUsd: v } } }))}
                hint="برآورد مهندسی-پارامتریک، خارج از محدوده راهنمای رسمی وزارت نفت" />
            </Section>
          )}
          {project.hasTelecomScada && (
            <Section title="مخابرات و اسکادا" accent={SECTION_COLOR.telecom}>
              <div className="flex gap-2 mb-2">
                {(['perKm', 'lumpSum'] as const).map((m) => (
                  <button key={m} type="button"
                    onClick={() => patch((d) => ({ ...d, specs: { ...d.specs, telecom: { ...d.specs.telecom, mode: m } } }))}
                    className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                    style={inputs.specs.telecom.mode === m
                      ? { background: STEEL_DARK, color: '#fff', borderColor: STEEL_DARK }
                      : { background: '#fff', color: '#64748b', borderColor: '#cbd5e1' }}>
                    {m === 'perKm' ? 'نرخ به ازای هر کیلومتر' : 'مبلغ مقطوع'}
                  </button>
                ))}
              </div>
              {inputs.specs.telecom.mode === 'perKm' ? (
                <Field label="نرخ مخابرات و اسکادا" unit="$/km" value={inputs.specs.telecom.perKmUsd} step={500}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, telecom: { ...d.specs.telecom, perKmUsd: v } } }))} />
              ) : (
                <Field label="مبلغ مقطوع مخابرات و اسکادا" unit="$" value={inputs.specs.telecom.lumpSumUsd} step={50000}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, telecom: { ...d.specs.telecom, lumpSumUsd: v } } }))} />
              )}
            </Section>
          )}

          <Section title="نرخ ارز و سربار پروژه">
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="نرخ یورو" unit="یورو/دلار" value={inputs.overhead.fxEurPerUsd} step={0.01}
                onChange={(v) => patch((d) => ({ ...d, overhead: { ...d.overhead, fxEurPerUsd: v } }))} />
              <Field label="نرخ ریال" unit="ریال/دلار" value={inputs.overhead.fxRialPerUsd} step={1000}
                onChange={(v) => patch((d) => ({ ...d, overhead: { ...d.overhead, fxRialPerUsd: v } }))} />
              <Field label="مهندسی و طراحی" value={inputs.overhead.eng} step={0.01}
                onChange={(v) => patch((d) => ({ ...d, overhead: { ...d.overhead, eng: v } }))} />
              <Field label="مدیریت پروژه (EPCM)" value={inputs.overhead.pm} step={0.01}
                onChange={(v) => patch((d) => ({ ...d, overhead: { ...d.overhead, pm: v } }))} />
              <Field label="بیمه و ضمانت‌نامه" value={inputs.overhead.ins} step={0.005}
                onChange={(v) => patch((d) => ({ ...d, overhead: { ...d.overhead, ins: v } }))} />
              <Field label="پیش‌بینی‌نشده (Contingency)" value={inputs.overhead.contingency} step={0.01}
                onChange={(v) => patch((d) => ({ ...d, overhead: { ...d.overhead, contingency: v } }))} />
              <Field label="ذخیره نوسان ارزی/تورمی" value={inputs.overhead.escalation} step={0.01}
                onChange={(v) => patch((d) => ({ ...d, overhead: { ...d.overhead, escalation: v } }))} />
            </div>
          </Section>

          <Section title="زمان‌بندی فصلی هزینه (Cash Flow)">
            {PHASES.map((ph, i) => (
              <Field key={ph.name} label={`${ph.name} — ${ph.desc}`} unit="سهم" value={inputs.phaseWeights[i]} step={0.01}
                onChange={(v) => patch((d) => ({ ...d, phaseWeights: d.phaseWeights.map((x, j) => (j === i ? v : x)) }))} />
            ))}
            <div className="text-[11px] est-mono" style={{ color: Math.abs(phaseSum - 1) > 0.001 ? '#B44711' : '#2A8C82' }}>
              جمع سهم فصل‌ها: {fmtPct(phaseSum)}
            </div>
          </Section>

          <Section title="چرخه عمر پروژه (پیش از اجرا)">
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="انتخاب مشاور طراح" unit="ماه" value={inputs.lifecycle.consultantSelectionMonths}
                onChange={(v) => patch((d) => ({ ...d, lifecycle: { ...d.lifecycle, consultantSelectionMonths: v } }))} />
              <Field label="اتمام طراحی پایه" unit="ماه" value={inputs.lifecycle.basicDesignMonths}
                onChange={(v) => patch((d) => ({ ...d, lifecycle: { ...d.lifecycle, basicDesignMonths: v } }))} />
              <Field label="انتخاب پیمانکار EPC" unit="ماه" value={inputs.lifecycle.epcContractorSelectionMonths}
                onChange={(v) => patch((d) => ({ ...d, lifecycle: { ...d.lifecycle, epcContractorSelectionMonths: v } }))} />
              <Field label="راه‌اندازی پس از اجرا" unit="ماه" value={inputs.lifecycle.commissioningMonths}
                onChange={(v) => patch((d) => ({ ...d, lifecycle: { ...d.lifecycle, commissioningMonths: v } }))} />
            </div>
          </Section>

          <Section title={`ریسک‌های پروژه (${inputs.risks.length})`}>
            <div className="space-y-2">
              {inputs.risks.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <input value={r.title} onChange={(e) => updateRisk(r.id, { title: e.target.value })}
                      placeholder="عنوان ریسک" className="est-input flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                    <button onClick={() => removeRisk(r.id)} className="shrink-0 text-slate-300 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <select value={r.category} onChange={(e) => updateRisk(r.id, { category: e.target.value as EstRisk['category'] })}
                      className="est-input rounded-md border border-slate-300 px-1.5 py-1 text-[11px]">
                      {Object.entries(RISK_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select value={r.likelihood} onChange={(e) => updateRisk(r.id, { likelihood: Number(e.target.value) as EstRisk['likelihood'] })}
                      className="est-input rounded-md border border-slate-300 px-1.5 py-1 text-[11px]">
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>احتمال {n}</option>)}
                    </select>
                    <select value={r.impact} onChange={(e) => updateRisk(r.id, { impact: Number(e.target.value) as EstRisk['impact'] })}
                      className="est-input rounded-md border border-slate-300 px-1.5 py-1 text-[11px]">
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>اثر {n}</option>)}
                    </select>
                  </div>
                  <input value={r.mitigation} onChange={(e) => updateRisk(r.id, { mitigation: e.target.value })}
                    placeholder="اقدام کاهش ریسک" className="est-input mt-1.5 w-full rounded-md border border-slate-300 px-2 py-1 text-[11px]" />
                </div>
              ))}
              <button onClick={addRisk} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
                <Plus size={13} /> افزودن ریسک
              </button>
            </div>
          </Section>
        </div>

        <button
          onClick={onCalculate}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-transform hover:scale-[1.01] disabled:opacity-60"
          style={{ background: STEEL_DARK }}
        >
          <Calculator size={16} /> {saving ? 'در حال محاسبه...' : 'محاسبه برآورد هزینه'}
        </button>
      </div>
    </div>
  )
}
