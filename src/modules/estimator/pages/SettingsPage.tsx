import { useEffect, useState } from 'react'
import { Check, Lock, RotateCcw, Save, ShieldAlert } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useEstimatorStore } from '../store/useEstimatorStore'
import { buildDefaultAssumptions } from '../lib/calc'
import type { EstAssumptions } from '../types'
import { BORDER, INK, MUTED_FG, SAFETY } from '../lib/theme'
import { Card, Field, Section } from '../components/ui'

export function SettingsPage() {
  const profile = useAuthStore((s) => s.profile)
  const assumptions = useEstimatorStore((s) => s.assumptions)
  const loadingAssumptions = useEstimatorStore((s) => s.loadingAssumptions)
  const savingAssumptions = useEstimatorStore((s) => s.savingAssumptions)
  const saveAssumptions = useEstimatorStore((s) => s.saveAssumptions)

  const [draft, setDraft] = useState<EstAssumptions | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!loadingAssumptions) setDraft(assumptions ?? buildDefaultAssumptions())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingAssumptions])

  if (!profile?.isAdmin) {
    return (
      <div className="flex h-full items-center justify-center est-font" style={{ background: 'inherit' }}>
        <Card className="max-w-sm text-center">
          <ShieldAlert size={26} className="mx-auto mb-3" style={{ color: MUTED_FG }} />
          <p className="text-sm font-bold mb-1" style={{ color: INK }}>دسترسی محدود</p>
          <p className="text-xs" style={{ color: MUTED_FG }}>ویرایش مبانی محاسبات فقط برای مدیر سامانه امکان‌پذیر است.</p>
        </Card>
      </div>
    )
  }

  if (loadingAssumptions || !draft) {
    return <div className="h-full est-font" />
  }

  const patch = (fn: (d: EstAssumptions) => EstAssumptions) => setDraft((d) => (d ? fn(d) : d))

  async function handleSave() {
    if (!draft) return
    const ok = await saveAssumptions(draft)
    if (ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    }
  }

  function resetToGuideline() {
    setDraft(buildDefaultAssumptions())
  }

  return (
    <div className="h-full overflow-y-auto est-font">
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold flex items-center gap-2" style={{ color: INK }}>
              <Lock size={14} style={{ color: SAFETY }} /> تنظیمات — مبانی محاسبات
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: MUTED_FG }}>
              این نرخ‌ها مبنای همه پروژه‌های جدید هستند و در بخش «مشخصات و آپشن‌ها» دیگر قابل ویرایش نیستند — فقط اینجا و فقط برای مدیر سامانه.
            </p>
          </div>
          <button onClick={resetToGuideline} className="flex items-center gap-1.5 text-xs" style={{ color: MUTED_FG }}>
            <RotateCcw size={13} /> بازگشت به مقادیر دستورالعمل
          </button>
        </div>

        <Card className="px-5">
          <Section title="خط لوله خشکی" defaultOpen>
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="قیمت فولاد" unit="$/تن" value={draft.specs.onshore.steelUsdPerTon} step={10}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, steelUsdPerTon: v } } }))}
                hint="قیمت خرید لوله فولادی به ازای هر تن؛ همراه با وزن محاسبه‌شده لوله (از قطر، ضخامت جداره و چگالی)، هزینه تأمین لوله هر کیلومتر را می‌سازد." />
              <Field label="عملیات اجرایی خطی" unit="$/km" value={draft.specs.onshore.linework} step={5000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, linework: v } } }))}
                hint="هزینه ترانشه‌زنی، جوش، خط‌گذاری و پوشش عایق به ازای هر کیلومتر؛ در ضریب توپوگرافی هر پروژه ضرب می‌شود." />
              <Field label="عبور از موانع (HDD)" unit="$/km" value={draft.specs.onshore.crossing} step={1000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, crossing: v } } }))}
                hint="سهم میانگین هزینهٔ عبور از رودخانه/جاده/راه‌آهن (حفاری افقی جهت‌دار و مشابه) به ازای هر کیلومتر کل مسیر." />
              <Field label="تست هیدرواستاتیک" unit="$/km" value={draft.specs.onshore.test} step={1000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, test: v } } }))}
                hint="آب‌گیری، تست فشار و راه‌اندازی خط پس از اتمام عملیات خطی." />
              <Field label="HSE و محیط‌زیست" unit="$/km" value={draft.specs.onshore.hse} step={500}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, hse: v } } }))}
                hint="ایمنی کارگاه، مطالعات و اقدامات زیست‌محیطی مسیر." />
              <Field label="ضریب توپوگرافی پیش‌فرض" value={draft.specs.onshore.terrain} step={0.05}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, terrain: v } } }))}
                hint="۱٫۰ زمین مسطح — ۱٫۲ تا ۱٫۴ زمین ترکیبی — ۱٫۵ تا ۱٫۸ زمین کوهستانی. هر پروژه می‌تواند این عدد را با توجه به مسیر واقعی خود تغییر دهد." />
              <Field label="هزینه تملک و تحصیل اراضی (مبنای پیشنهادی)" unit="ریال/km" value={draft.specs.onshore.rowCostRialPerKm} step={1_000_000_000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, onshore: { ...d.specs.onshore, rowCostRialPerKm: v } } }))}
                hint="فقط یک مبنای اولیه پیشنهادی برای پروژه‌های جدید است؛ چون قیمت زمین در هر منطقه کاملاً متفاوت است، کاربر همیشه این عدد را در همان پروژه به‌صورت دستی اصلاح می‌کند." />
            </div>
          </Section>

          <Section title="خط لوله دریایی">
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="قیمت فولاد" unit="$/تن" value={draft.specs.offshore.steelUsdPerTon} step={10}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, steelUsdPerTon: v } } }))}
                hint="قیمت لوله فولادی دریایی؛ معمولاً به‌دلیل ضخامت جداره و کلاس بالاتر، از لوله خشکی گران‌تر است." />
              <Field label="عملیات مدفون‌سازی/خط‌گذاری" unit="$/km" value={draft.specs.offshore.layingUsdPerKm} step={10000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, layingUsdPerKm: v } } }))}
                hint="هزینه خط‌گذاری با شناور، جوش زیرآبی و مدفون‌سازی به ازای هر کیلومتر." />
              <Field label="بسیج/جمع‌آوری شناور" unit="$" value={draft.specs.offshore.mobDemobUsd} step={100000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, mobDemobUsd: v } } }))}
                hint="هزینه ثابت اعزام و بازگشت شناور خط‌گذار، مستقل از طول خط." />
              <Field label="خدمات عمومی پروژه" value={draft.specs.offshore.generalServicesPct} step={0.01}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, offshore: { ...d.specs.offshore, generalServicesPct: v } } }))}
                hint="درصد اضافه برای پشتیبانی عمومی پروژه دریایی (لجستیک، بازرسی، مدیریت شناور)." />
            </div>
            <p className="text-[10px] mt-1" style={{ color: MUTED_FG }}>ضریب آب کم‌عمق در همان پروژه (بخش مشخصات) وارد می‌شود، چون به عمق آب مسیر هر پروژه بستگی دارد.</p>
          </Section>

          <Section title="پوشش خطوط لوله">
            <Field label="نرخ پوشش لوله" unit="$/km" value={draft.specs.coating.usdPerKm} step={1000}
              onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, coating: { ...d.specs.coating, usdPerKm: v } } }))}
              hint="هزینه پوشش ضدخوردگی (مانند سه‌لایه پلی‌اتیلن یا FBE) به ازای هر کیلومتر کل خط (خشکی + دریایی)؛ به‌صورت یک ردیف مستقل در برآورد نمایش داده می‌شود." />
          </Section>

          <Section title="ایستگاه تقویت فشار">
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="توان اسمی پیش‌فرض" unit="مگاوات" value={draft.specs.compressor.ratedPowerMwPerStation} step={0.5}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, compressor: { ...d.specs.compressor, ratedPowerMwPerStation: v } } }))}
                hint="توان پیشنهادی هر ایستگاه برای پروژه‌های جدید؛ در هر پروژه با توجه به دبی و افت فشار واقعی قابل تغییر است." />
            </div>
            <p className="text-[10px] mt-1" style={{ color: MUTED_FG }}>منحنی قیمت تجهیزات دوار (USD/kW) مستقیماً از راهنمای وزارت نفت است و در این صفحه قابل ویرایش نیست.</p>
          </Section>

          <Section title="ایستگاه‌های جانبی (خارج از محدوده راهنمای رسمی)">
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="هزینه واحد ایستگاه فرستنده توپک" unit="$" value={draft.specs.launcher.unitCostUsd} step={5000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, launcher: { ...d.specs.launcher, unitCostUsd: v } } }))}
                hint="هزینه احداث هر ایستگاه فرستنده توپک (Pig Launcher)." />
              <Field label="هزینه واحد ایستگاه گیرنده توپک" unit="$" value={draft.specs.receiver.unitCostUsd} step={5000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, receiver: { ...d.specs.receiver, unitCostUsd: v } } }))}
                hint="هزینه احداث هر ایستگاه گیرنده توپک (Pig Receiver)." />
              <Field label="هزینه واحد انشعاب" unit="$" value={draft.specs.tieIn.unitCostUsd} step={5000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, tieIn: { ...d.specs.tieIn, unitCostUsd: v } } }))}
                hint="هزینه هر نقطه انشعاب/تی‌این به خطوط یا مصرف‌کننده‌های جانبی." />
              <Field label="هزینه واحد شیر بین‌راهی" unit="$" value={draft.specs.blockValve.unitCostUsd} step={5000}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, blockValve: { ...d.specs.blockValve, unitCostUsd: v } } }))}
                hint="هزینه هر ایستگاه شیر بین‌راهی (Block Valve/SDV) در طول مسیر." />
              <Field label="نرخ مخابرات و اسکادا" unit="$/km" value={draft.specs.telecom.perKmUsd} step={500}
                onChange={(v) => patch((d) => ({ ...d, specs: { ...d.specs, telecom: { ...d.specs.telecom, perKmUsd: v } } }))}
                hint="هزینه فیبر نوری، مخابرات و سامانه اسکادا به ازای هر کیلومتر، در حالت محاسبه بر مبنای طول." />
            </div>
          </Section>

          <Section title="نرخ ارز و سربار پروژه">
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="نرخ یورو" unit="یورو/دلار" value={draft.overhead.fxEurPerUsd} step={0.01}
                onChange={(v) => patch((d) => ({ ...d, overhead: { ...d.overhead, fxEurPerUsd: v } }))}
                hint="نرخ تبدیل دلار به یورو برای نمایش نتایج؛ محاسبات داخلی همیشه بر مبنای دلار انجام می‌شود." />
              <Field label="نرخ ریال" unit="ریال/دلار" value={draft.overhead.fxRialPerUsd} step={1000}
                onChange={(v) => patch((d) => ({ ...d, overhead: { ...d.overhead, fxRialPerUsd: v } }))}
                hint="نرخ تبدیل دلار به ریال؛ برای تبدیل هزینه تملک اراضی (که به ریال وارد می‌شود) نیز از همین نرخ استفاده می‌شود." />
              <Field label="مهندسی و طراحی" value={draft.overhead.eng} step={0.01}
                onChange={(v) => patch((d) => ({ ...d, overhead: { ...d.overhead, eng: v } }))}
                hint="درصدی از هزینه مستقیم که صرف مهندسی پایه و تفصیلی می‌شود؛ در جریان نقدینگی هم در طول ماه‌های طراحی پایه توزیع می‌شود." />
              <Field label="مدیریت پروژه (EPCM)" value={draft.overhead.pm} step={0.01}
                onChange={(v) => patch((d) => ({ ...d, overhead: { ...d.overhead, pm: v } }))}
                hint="درصدی از هزینه مستقیم برای مدیریت پیمان، دفتر فنی و نظارت کارفرما/مشاور در طول اجرا." />
              <Field label="بیمه و ضمانت‌نامه" value={draft.overhead.ins} step={0.005}
                onChange={(v) => patch((d) => ({ ...d, overhead: { ...d.overhead, ins: v } }))}
                hint="هزینه بیمه‌های مسئولیت/تمام‌خطر پیمانکار و کارمزد ضمانت‌نامه‌های بانکی پروژه." />
              <Field label="پیش‌بینی‌نشده (Contingency)" value={draft.overhead.contingency} step={0.01}
                onChange={(v) => patch((d) => ({ ...d, overhead: { ...d.overhead, contingency: v } }))}
                hint="ذخیره برای ریسک‌های شناخته‌شده اما دقیقاً کمّی‌نشده؛ روی جمع هزینه مستقیم و سربار اعمال می‌شود." />
              <Field label="ذخیره نوسان ارزی/تورمی" value={draft.overhead.escalation} step={0.01}
                onChange={(v) => patch((d) => ({ ...d, overhead: { ...d.overhead, escalation: v } }))}
                hint="ذخیره برای افزایش قیمت‌ها و نرخ ارز طی دوره اجرای پروژه، جدا از پیش‌بینی‌نشده." />
            </div>
          </Section>

          <Section title="چرخه عمر پیش از اجرا (پیش‌فرض)">
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="انتخاب مشاور طراح" unit="ماه" value={draft.lifecycle.consultantSelectionMonths}
                onChange={(v) => patch((d) => ({ ...d, lifecycle: { ...d.lifecycle, consultantSelectionMonths: v } }))}
                hint="مدت فرآیند مناقصه/ارزیابی و عقد قرارداد با مشاور طراح؛ در این بازه هزینه‌ای در جریان نقدینگی لحاظ نمی‌شود." />
              <Field label="اتمام طراحی پایه" unit="ماه" value={draft.lifecycle.basicDesignMonths}
                onChange={(v) => patch((d) => ({ ...d, lifecycle: { ...d.lifecycle, basicDesignMonths: v } }))}
                hint="مدت طراحی پایه؛ هزینه مهندسی به‌طور یکنواخت در همین بازه توزیع می‌شود." />
              <Field label="انتخاب پیمانکار EPC" unit="ماه" value={draft.lifecycle.epcContractorSelectionMonths}
                onChange={(v) => patch((d) => ({ ...d, lifecycle: { ...d.lifecycle, epcContractorSelectionMonths: v } }))}
                hint="مدت مناقصه و عقد قرارداد EPC؛ مانند انتخاب مشاور، بدون هزینه در جریان نقدینگی." />
              <Field label="اجرا و راه‌اندازی" unit="ماه" value={draft.lifecycle.executionMonths}
                onChange={(v) => patch((d) => ({ ...d, lifecycle: { ...d.lifecycle, executionMonths: v } }))}
                hint="مدت اجرای فیزیکی پروژه تا راه‌اندازی؛ بیشترین حجم هزینه با شکل منحنی S در همین بازه هزینه‌کرد می‌شود." />
            </div>
          </Section>
        </Card>

        <button
          onClick={handleSave}
          disabled={savingAssumptions}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold disabled:opacity-60 transition-transform hover:scale-[1.01]"
          style={{ background: SAFETY, color: '#1A1400' }}
        >
          {saved ? <Check size={16} /> : <Save size={16} />} {savingAssumptions ? 'در حال ذخیره...' : saved ? 'ذخیره شد' : 'ذخیره مبانی محاسبات برای همه کاربران'}
        </button>
        <p className="text-[10px] text-center" style={{ color: MUTED_FG, borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
          این مقادیر فقط پایه پیش‌فرض پروژه‌های جدید است؛ تغییر آن، محاسبات پروژه‌های موجود را عوض نمی‌کند.
        </p>
      </div>
    </div>
  )
}
