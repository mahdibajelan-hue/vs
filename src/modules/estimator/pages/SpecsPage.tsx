import { Calculator, Trash2, Plus } from 'lucide-react'
import type { EstFullInputs, EstLongLeadItem, EstProject, EstRisk } from '../types'
import { computeAutoStationCounts } from '../lib/calc'
import { BORDER, INK, INK_SOFT, MUTED_FG, SAFETY, SECTION_COLOR, SURFACE, SURFACE_2, toFa } from '../lib/theme'
import { Field, Section } from '../components/ui'

const RISK_CATEGORY_LABEL: Record<EstRisk['category'], string> = {
  fx: 'ارزی', procurement: 'تأمین کالا', geotechnical: 'ژئوتکنیک', schedule: 'زمان‌بندی',
  hse: 'HSE', contractor: 'پیمانکار', permit: 'مجوز/تملک', weather: 'آب‌وهوا', other: 'سایر',
}

function segButtonStyle(active: boolean): React.CSSProperties {
  return active
    ? { background: SAFETY, color: '#1A1400', borderColor: SAFETY }
    : { background: SURFACE_2, color: MUTED_FG, borderColor: BORDER }
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

  function addLongLead() {
    const item: EstLongLeadItem = { id: `l${Date.now()}`, title: '', leadTimeMonths: 6, notes: '' }
    patch((d) => ({ ...d, longLeadItems: [...d.longLeadItems, item] }))
  }
  function updateLongLead(id: string, patchFields: Partial<EstLongLeadItem>) {
    patch((d) => ({ ...d, longLeadItems: d.longLeadItems.map((it) => (it.id === id ? { ...it, ...patchFields } : it)) }))
  }
  function removeLongLead(id: string) {
    patch((d) => ({ ...d, longLeadItems: d.longLeadItems.filter((it) => it.id !== id) }))
  }

  const hasPipeline = project.hasOnshore || project.hasOffshore
  const totalLengthKm = (project.hasOnshore ? inputs.specs.onshore.lengthKm : 0) + (project.hasOffshore ? inputs.specs.offshore.lengthKm : 0)
  const autoStations = computeAutoStationCounts(totalLengthKm)

  return (
    <div className="h-full overflow-y-auto est-font">
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <div>
          <p className="text-sm font-bold" style={{ color: INK }}>۲. مشخصات و آپشن‌های هر بخش</p>
          <p className="text-[11px] mt-0.5" style={{ color: MUTED_FG }}>فقط بخش‌هایی که در تعریف پروژه «{project.name}» فعال شده‌اند نمایش داده می‌شوند. نرخ‌های واحد از بخش تنظیمات خوانده می‌شوند.</p>
        </div>

        <div className="est-card rounded-2xl px-5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          {project.hasOnshore && (
            <Section title="خط لوله خشکی" accent={SECTION_COLOR.onshore} defaultOpen>
              <div className="grid grid-cols-2 gap-x-3">
                <Field label="طول خط" unit="کیلومتر" value={inputs.specs.onshore.lengthKm}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, lengthKm: v } } }))} />
                <Field label="قطر لوله" unit="اینچ" value={inputs.specs.onshore.diameterIn}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, diameterIn: v } } }))} />
                <Field label="ضخامت جداره" unit="میلی‌متر" value={inputs.specs.onshore.wtMm} step={0.5}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, wtMm: v } } }))} />
                <Field label="ضریب توپوگرافی" value={inputs.specs.onshore.terrain} step={0.05}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, terrain: v } } }))}
                  hint="۱٫۰ مسطح — ۱٫۲ تا ۱٫۴ ترکیبی — ۱٫۵ تا ۱٫۸ کوهستانی" />
              </div>
              <Field label="هزینه تملک و تحصیل اراضی" unit="ریال/کیلومتر" value={inputs.specs.onshore.rowCostRialPerKm} step={1_000_000_000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, rowCostRialPerKm: v } } }))}
                hint="چون قیمت زمین از پروژه‌ای به پروژه دیگر کاملاً متفاوت است، این مقدار را خودتان به ریال وارد کنید. مقدار پیشنهادی در تنظیمات فقط یک مبنای اولیه است." />
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
                <Field label="ضریب آب کم‌عمق" value={inputs.specs.offshore.shallowWaterSurchargePct} step={0.01}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, shallowWaterSurchargePct: v } } }))}
                  hint="۰ برای آب عمیق (بدون دشواری اجرایی) — ۰٫۰۵ تا ۰٫۱۰ برای آب کم‌عمق ساحلی — ۰٫۱۵ تا ۰٫۲۵ برای مناطق بسیار کم‌عمق/جزر و مدی با دشواری اجرای بالا" />
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
                    style={segButtonStyle(inputs.specs.compressor.driverType === dt)}>
                    {dt === 'gasTurbine' ? 'درایور توربین گازی' : 'درایور الکتروموتور'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] mt-2 leading-relaxed" style={{ color: MUTED_FG }}>
                برآورد قیمت تجهیزات دوار بر مبنای منحنی هزینه راهنمای وزارت نفت (۲۰۱۹، دلار بر کیلووات) است.
              </p>
            </Section>
          )}

          {hasPipeline && (
            <Section title="ایستگاه‌های فرستنده/گیرنده توپک و شیر بین‌راهی" accent={SECTION_COLOR.launcher} defaultOpen>
              <div className="flex gap-2 mb-2">
                {(['auto', 'manual'] as const).map((m) => (
                  <button key={m} type="button"
                    onClick={() => patch((d) => ({ ...d, specs: { ...d.specs, stations: { ...d.specs.stations, mode: m } } }))}
                    className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                    style={segButtonStyle(inputs.specs.stations.mode === m)}>
                    {m === 'auto' ? 'محاسبه خودکار بر اساس طول خط' : 'ورود دستی تعداد'}
                  </button>
                ))}
              </div>

              {inputs.specs.stations.mode === 'auto' ? (
                <div className="rounded-lg p-3 mb-3 text-xs" style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK_SOFT }}>
                  <p className="leading-relaxed mb-2" style={{ color: MUTED_FG }}>
                    فرض: هر ۱۰۰ کیلومتر یک‌بار ایستگاه فرستنده و گیرنده توپک احداث می‌شود و در فاصله‌های میانی هر ۲۵ کیلومتر یک ایستگاه شیر بین‌راهی پیش‌بینی می‌شود.
                  </p>
                  <div className="flex flex-wrap gap-3 est-mono">
                    <span>فرستنده توپک: <b style={{ color: INK }}>{toFa(autoStations.launcher)}</b></span>
                    <span>گیرنده توپک: <b style={{ color: INK }}>{toFa(autoStations.receiver)}</b></span>
                    <span>شیر بین‌راهی: <b style={{ color: INK }}>{toFa(autoStations.blockValve)}</b></span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-x-2 mb-3">
                  <Field label="تعداد فرستنده توپک" value={inputs.specs.stations.manualLauncherCount}
                    onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, stations: { ...d.specs.stations, manualLauncherCount: Math.max(0, Math.round(v)) } } }))} />
                  <Field label="تعداد گیرنده توپک" value={inputs.specs.stations.manualReceiverCount}
                    onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, stations: { ...d.specs.stations, manualReceiverCount: Math.max(0, Math.round(v)) } } }))} />
                  <Field label="تعداد شیر بین‌راهی" value={inputs.specs.stations.manualBlockValveCount}
                    onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, stations: { ...d.specs.stations, manualBlockValveCount: Math.max(0, Math.round(v)) } } }))} />
                </div>
              )}

              <div className="grid grid-cols-3 gap-x-2">
                <Field label="هزینه واحد فرستنده توپک" unit="$" value={inputs.specs.launcher.unitCostUsd} step={5000}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, launcher: { ...d.specs.launcher, unitCostUsd: v } } }))} />
                <Field label="هزینه واحد گیرنده توپک" unit="$" value={inputs.specs.receiver.unitCostUsd} step={5000}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, receiver: { ...d.specs.receiver, unitCostUsd: v } } }))} />
                <Field label="هزینه واحد شیر بین‌راهی" unit="$" value={inputs.specs.blockValve.unitCostUsd} step={5000}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, blockValve: { ...d.specs.blockValve, unitCostUsd: v } } }))} />
              </div>
              <p className="text-[10px] mt-2" style={{ color: MUTED_FG }}>برآورد مهندسی-پارامتریک، خارج از محدوده راهنمای رسمی وزارت نفت</p>
            </Section>
          )}

          {project.tieInCount > 0 && (
            <Section title={`ایستگاه‌های انشعاب (${project.tieInCount} عدد)`} accent={SECTION_COLOR.tieIn}>
              <Field label="هزینه واحد هر ایستگاه انشعاب" unit="$" value={inputs.specs.tieIn.unitCostUsd} step={5000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, tieIn: { ...d.specs.tieIn, unitCostUsd: v } } }))}
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
                    style={segButtonStyle(inputs.specs.telecom.mode === m)}>
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

          <Section title="چرخه عمر پروژه" defaultOpen>
            <p className="text-[10px] mb-2" style={{ color: MUTED_FG }}>جریان نقدینگی و مدت کل پروژه به‌صورت خودکار بر اساس این مدت‌ها محاسبه می‌شود.</p>
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="انتخاب مشاور طراح" unit="ماه" value={inputs.lifecycle.consultantSelectionMonths}
                onChange={(v) => patch((d) => ({ ...d, lifecycle: { ...d.lifecycle, consultantSelectionMonths: v } }))} />
              <Field label="اتمام طراحی پایه" unit="ماه" value={inputs.lifecycle.basicDesignMonths}
                onChange={(v) => patch((d) => ({ ...d, lifecycle: { ...d.lifecycle, basicDesignMonths: v } }))} />
              <Field label="انتخاب پیمانکار EPC" unit="ماه" value={inputs.lifecycle.epcContractorSelectionMonths}
                onChange={(v) => patch((d) => ({ ...d, lifecycle: { ...d.lifecycle, epcContractorSelectionMonths: v } }))} />
              <Field label="اجرا و راه‌اندازی" unit="ماه" value={inputs.lifecycle.executionMonths}
                onChange={(v) => patch((d) => ({ ...d, lifecycle: { ...d.lifecycle, executionMonths: v } }))} />
            </div>
          </Section>

          <Section title={`اقلام بلندمدت‌تأمین / Long Lead Items (${inputs.longLeadItems.length})`}>
            <p className="text-[10px] mb-2 leading-relaxed" style={{ color: MUTED_FG }}>
              اقلامی که سفارش و تحویل آن‌ها زمان زیادی می‌برد و باید خیلی زودتر از شروع اجرا آغاز شود؛ اگر مدت تأمین از مجموع «انتخاب مشاور + طراحی پایه» بیشتر باشد، سفارش باید همان ابتدای طراحی آغاز شود وگرنه اجرای پروژه عقب می‌افتد.
            </p>
            <div className="space-y-2">
              {inputs.longLeadItems.map((it) => {
                const designWindow = inputs.lifecycle.consultantSelectionMonths + inputs.lifecycle.basicDesignMonths
                const atRisk = it.leadTimeMonths > designWindow
                return (
                  <div key={it.id} className="rounded-lg p-2.5" style={{ border: `1px solid ${atRisk ? '#d03b3b' : BORDER}` }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <input value={it.title} onChange={(e) => updateLongLead(it.id, { title: e.target.value })}
                        placeholder="نام قلم" className="est-input flex-1 rounded-md px-2 py-1 text-xs"
                        style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK }} />
                      <input type="number" min={0} value={it.leadTimeMonths}
                        onChange={(e) => updateLongLead(it.id, { leadTimeMonths: Math.max(0, Number(e.target.value) || 0) })}
                        className="est-input est-mono w-16 rounded-md px-2 py-1 text-xs text-center"
                        style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK, direction: 'ltr' }} />
                      <span className="text-[10px]" style={{ color: MUTED_FG }}>ماه</span>
                      <button onClick={() => removeLongLead(it.id)} className="shrink-0" style={{ color: MUTED_FG }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <input value={it.notes} onChange={(e) => updateLongLead(it.id, { notes: e.target.value })}
                      placeholder="توضیحات" className="est-input w-full rounded-md px-2 py-1 text-[11px]"
                      style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK_SOFT }} />
                    {atRisk && (
                      <p className="text-[10px] mt-1.5" style={{ color: '#d03b3b' }}>
                        مدت تأمین ({toFa(it.leadTimeMonths)} ماه) از دوره مشاور+طراحی پایه ({toFa(designWindow)} ماه) بیشتر است — سفارش باید زودتر آغاز شود.
                      </p>
                    )}
                  </div>
                )
              })}
              <button onClick={addLongLead} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: MUTED_FG }}>
                <Plus size={13} /> افزودن قلم بلندمدت‌تأمین
              </button>
            </div>
          </Section>

          <Section title={`ریسک‌های پروژه (${inputs.risks.length})`}>
            <div className="space-y-2">
              {inputs.risks.map((r) => (
                <div key={r.id} className="rounded-lg p-2.5" style={{ border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <input value={r.title} onChange={(e) => updateRisk(r.id, { title: e.target.value })}
                      placeholder="عنوان ریسک" className="est-input flex-1 rounded-md px-2 py-1 text-xs"
                      style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK }} />
                    <button onClick={() => removeRisk(r.id)} className="shrink-0" style={{ color: MUTED_FG }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <select value={r.category} onChange={(e) => updateRisk(r.id, { category: e.target.value as EstRisk['category'] })}
                      className="est-input rounded-md px-1.5 py-1 text-[11px]" style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK_SOFT }}>
                      {Object.entries(RISK_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select value={r.likelihood} onChange={(e) => updateRisk(r.id, { likelihood: Number(e.target.value) as EstRisk['likelihood'] })}
                      className="est-input rounded-md px-1.5 py-1 text-[11px]" style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK_SOFT }}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>احتمال {n}</option>)}
                    </select>
                    <select value={r.impact} onChange={(e) => updateRisk(r.id, { impact: Number(e.target.value) as EstRisk['impact'] })}
                      className="est-input rounded-md px-1.5 py-1 text-[11px]" style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK_SOFT }}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>اثر {n}</option>)}
                    </select>
                  </div>
                  <input value={r.mitigation} onChange={(e) => updateRisk(r.id, { mitigation: e.target.value })}
                    placeholder="اقدام کاهش ریسک" className="est-input mt-1.5 w-full rounded-md px-2 py-1 text-[11px]"
                    style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK_SOFT }} />
                </div>
              ))}
              <button onClick={addRisk} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: MUTED_FG }}>
                <Plus size={13} /> افزودن ریسک
              </button>
            </div>
          </Section>
        </div>

        <button
          onClick={onCalculate}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold disabled:opacity-60 transition-transform hover:scale-[1.01]"
          style={{ background: SAFETY, color: '#1A1400' }}
        >
          <Calculator size={16} /> {saving ? 'در حال محاسبه...' : 'محاسبه برآورد هزینه'}
        </button>
      </div>
    </div>
  )
}
