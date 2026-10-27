import { AlertTriangle, ArrowLeft, CalendarRange, Coins, GitBranch, Layers, Lock, PackageSearch, Pencil, Plus, ShieldAlert, Signpost, Trash2, Waves, Wind } from 'lucide-react'
import type { EstBenchmark, EstFullInputs, EstLongLeadItem, EstProject, EstRisk } from '../types'
import { computeAutoStationCounts, MATURITY, maturityOf } from '../lib/calc'
import { BORDER, INK, INK_SOFT, MUTED_FG, SAFETY, SECTION_COLOR, SURFACE, SURFACE_2, toFa } from '../lib/theme'
import { Btn, Field, Section, Segmented } from '../components/ui'
import { METHOD_META } from '../lib/methods'
import { LivePanel } from '../components/LivePanel'

const RISK_CATEGORY_LABEL: Record<EstRisk['category'], string> = {
  fx: 'ارزی', procurement: 'تأمین کالا', geotechnical: 'ژئوتکنیک', schedule: 'زمان‌بندی',
  hse: 'HSE', contractor: 'پیمانکار', permit: 'مجوز/تملک', weather: 'آب‌وهوا', other: 'سایر',
}


export function SpecsPage({
  project, inputs, benchmarks, nowYear, onChange, onCalculate, onEditStart,
}: {
  project: EstProject
  inputs: EstFullInputs
  benchmarks: EstBenchmark[]
  nowYear: number
  onChange: (next: EstFullInputs) => void
  onCalculate: () => void
  onEditStart: () => void
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
  const designWindow = inputs.lifecycle.consultantSelectionMonths + inputs.lifecycle.basicDesignMonths
  const lateLL = inputs.longLeadItems.filter((it) => it.leadTimeMonths > designWindow).length

  return (
    <div className="h-full overflow-y-auto est-font est-scroll">
      <div className="mx-auto max-w-6xl px-4 pt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px] items-start">
      <div className="space-y-4 min-w-0 pb-6">
        <div className="est-fade-in">
          <p className="text-[11px] font-semibold" style={{ color: SAFETY }}>گام ۲ از ۳</p>
          <h1 className="text-lg font-extrabold" style={{ color: INK }}>مشخصات فنی و زمان‌بندی «{project.name}»</h1>
          <p className="text-[11.5px] mt-1 leading-relaxed" style={{ color: MUTED_FG }}>فقط مشخصات فیزیکی و زمانی همین پروژه پرسیده می‌شود؛ نرخ‌های واحد، سربارها و ذخایر از «مبانی برآورد» خوانده می‌شوند و هر تغییر همان لحظه در برآورد زنده دیده می‌شود.</p>
        </div>

        <div className="est-startbar est-fade-in">
          <span><Coins size={14} /> یورو <b className="est-mono">{toFa(Math.round(inputs.overhead.fxRialPerEur ?? 0).toLocaleString('en-US'))}</b> ریال</span>
          <span><i style={{ background: METHOD_META[inputs.method ?? 'parametric'].color }} /> روش: <b>{METHOD_META[inputs.method ?? 'parametric'].short}</b></span>
          <span>مرحله: <b>{MATURITY[maturityOf(inputs)].label}</b></span>
          <button type="button" onClick={onEditStart}><Pencil size={12} /> تغییر</button>
        </div>

        <div className="est-card rounded-2xl px-5 est-fade-in" style={{ background: SURFACE, border: `1px solid ${BORDER}`, animationDelay: '80ms' }}>
          {project.hasOnshore && (
            <Section title="خط لوله خشکی" subtitle="طول، قطر، ضخامت، توپوگرافی و تملک اراضی" icon={<GitBranch size={17} />} accent={SECTION_COLOR.onshore} defaultOpen>
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
            <Section title="خط لوله دریایی" subtitle="طول، قطر، ضخامت و دشواری آب کم‌عمق" icon={<Waves size={17} />} accent={SECTION_COLOR.offshore} defaultOpen>
              <div className="grid grid-cols-2 gap-x-3">
                <Field label="طول خط" unit="کیلومتر" value={inputs.specs.offshore.lengthKm}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, lengthKm: v } } }))} />
                <Field label="قطر لوله" unit="اینچ" value={inputs.specs.offshore.diameterIn}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, diameterIn: v } } }))} />
                <Field label="ضخامت جداره" unit="میلی‌متر" value={inputs.specs.offshore.wtMm} step={0.5}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, wtMm: v } } }))} />
                <Field label="اضافه‌هزینهٔ آب کم‌عمق" percent value={inputs.specs.offshore.shallowWaterSurchargePct} step={0.01}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, shallowWaterSurchargePct: v } } }))}
                  hint="۰ برای آب عمیق — ۵ تا ۱۰ برای آب کم‌عمق ساحلی — ۱۵ تا ۲۵ برای مناطق بسیار کم‌عمق یا جزر و مدی" />
              </div>
            </Section>
          )}

          {project.hasCompressorStation && (
            <Section title="ایستگاه تقویت فشار" subtitle="تعداد، توان و نوع درایور" icon={<Wind size={17} />} accent={SECTION_COLOR.compressor} defaultOpen>
              <div className="grid grid-cols-2 gap-x-3">
                <Field label="تعداد ایستگاه" value={inputs.specs.compressor.stationCount}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, compressor: { ...d.specs.compressor, stationCount: Math.max(1, Math.round(v)) } } }))} />
                <Field label="توان اسمی هر ایستگاه" unit="مگاوات" value={inputs.specs.compressor.ratedPowerMwPerStation} step={0.5}
                  onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, compressor: { ...d.specs.compressor, ratedPowerMwPerStation: v } } }))} />
              </div>
              <Segmented full value={inputs.specs.compressor.driverType}
                onChange={(dt) => patch((d) => ({ ...d, specs: { ...d.specs, compressor: { ...d.specs.compressor, driverType: dt } } }))}
                options={[['gasTurbine', 'درایور توربین گازی'], ['electric', 'درایور الکتروموتور']]} />
              <p className="text-[10px] mt-2 leading-relaxed" style={{ color: MUTED_FG }}>
                قیمت تجهیزات دوار از منحنی هزینه بر حسب توان اسمی محاسبه و به هزینهٔ کل ایستگاه تعمیم داده می‌شود.
              </p>
            </Section>
          )}

          {hasPipeline && (
            <Section title="ایستگاه‌های توپک‌رانی و شیر بین‌راهی" subtitle="تعداد خودکار از طول خط یا ورود دستی" icon={<Signpost size={17} />} accent={SECTION_COLOR.launcher}>
              <div className="mb-3"><Segmented full value={inputs.specs.stations.mode}
                onChange={(m) => patch((d) => ({ ...d, specs: { ...d.specs, stations: { ...d.specs.stations, mode: m } } }))}
                options={[['auto', 'خودکار از طول خط'], ['manual', 'ورود دستی تعداد']]} /></div>

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

              <p className="text-[10.5px] mt-1 flex items-center gap-1" style={{ color: MUTED_FG }}><Lock size={11} /> هزینهٔ واحد هر ایستگاه از مبانی برآورد خوانده می‌شود.</p>
            </Section>
          )}

          <Section title="چرخهٔ عمر و زمان‌بندی" subtitle="مدت هر فاز؛ جریان نقدینگی از همین ساخته می‌شود" icon={<CalendarRange size={17} />} accent="#9085e9" defaultOpen>
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

          <Section title={`اقلام بلندمدت‌تأمین (${toFa(inputs.longLeadItems.length)})`} subtitle={lateLL ? `${toFa(lateLL)} قلم دیرتر از پایان طراحی پایه آماده می‌شود` : 'اقلامی که مدت تأمینشان زمان‌بندی را تعیین می‌کند'} icon={<PackageSearch size={17} />} accent={lateLL ? '#d03b3b' : '#c98500'}>
            <p className="text-[10px] mb-2 leading-relaxed" style={{ color: MUTED_FG }}>
              اقلامی که سفارش و تحویل آن‌ها زمان زیادی می‌برد و باید خیلی زودتر از شروع اجرا آغاز شود؛ اگر مدت تأمین از مجموع «انتخاب مشاور + طراحی پایه» بیشتر باشد، سفارش باید همان ابتدای طراحی آغاز شود وگرنه اجرای پروژه عقب می‌افتد.
            </p>
            <div className="space-y-2">
              {inputs.longLeadItems.map((it) => {
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
                      <p className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: '#e66767' }}><AlertTriangle size={11} />
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

          <Section title={`ریسک‌های پروژه (${toFa(inputs.risks.length)})`} subtitle="احتمال × اثر و اقدام کاهش" icon={<ShieldAlert size={17} />} accent="#e66767">
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

        <div className="est-bases est-fade-in">
          <Lock size={15} style={{ color: SAFETY }} />
          <p>از مبانی برآورد خوانده می‌شود و اینجا پرسیده نمی‌شود: قیمت فولاد و عملیات اجرایی هر کیلومتر، پوشش لوله، هزینهٔ واحد فرستنده و گیرندهٔ توپک، شیر بین‌راهی و انشعاب، نرخ مخابرات و اسکادا، منحنی تجهیزات دوار، درصدهای مهندسی، مدیریت، بیمه، پیش‌بینی‌نشده و ذخیرهٔ نوسان.</p>
        </div>

        <div className="flex justify-end">
          <Btn kind="primary" onClick={onCalculate}><Layers size={15} /> مشاهدهٔ برآورد و گزارش <ArrowLeft size={14} /></Btn>
        </div>
      </div>
      <LivePanel project={project} inputs={inputs} benchmarks={benchmarks} nowYear={nowYear} onOpenResults={onCalculate} />
      </div>
      <style>{SPECS_STYLE}</style>
    </div>
  )
}

const SPECS_STYLE = `
  .est-startbar { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; padding: .55rem .6rem; border-radius: 14px; background: ${SURFACE}; border: 1px solid ${BORDER}; }
  .est-startbar > span { display: inline-flex; align-items: center; gap: .35rem; font-size: 12px; color: ${INK_SOFT}; padding: .3rem .6rem; border-radius: 10px; background: ${SURFACE_2}; }
  .est-startbar b { color: ${INK}; }
  .est-startbar i { width: 8px; height: 8px; border-radius: 3px; display: inline-block; }
  .est-startbar button { margin-inline-start: auto; display: inline-flex; align-items: center; gap: .3rem; font-size: 12px; font-weight: 700; color: ${SAFETY}; padding: .35rem .7rem; border-radius: 10px; min-height: 36px; }
  .est-startbar button:hover { background: rgba(242,183,5,.08); }
  .est-bases { display: flex; gap: .65rem; align-items: flex-start; padding: .85rem 1rem; border-radius: 14px; background: rgba(242,183,5,.05); border: 1px dashed rgba(242,183,5,.3); }
  .est-bases p { font-size: 11.5px; line-height: 1.95; color: ${INK_SOFT}; }
`
