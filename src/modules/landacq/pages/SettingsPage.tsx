import { useState } from 'react'
import { BellRing, Database, Route, Rows3, Scale, Timer, Trash2 } from 'lucide-react'
import { useLandStore } from '../store/useLandStore'
import { DEFAULT_SETTINGS, type RouteInfo } from '../types'
import { faNum } from '../lib/fa'
import { LEGAL_REFERENCE } from '../lib/legal'
import { ConfirmDialog, Field } from '../components/ui'
import { SettingsSection } from '../components/SettingsSection'
import { StepDaysEditor } from '../components/StepDaysEditor'
import { ParcelBuilder } from '../components/ParcelBuilder'
import { RolesCard } from '../components/RolesCard'
import { RouteImport } from '../components/RouteImport'

export function SettingsPage() {
  const data = useLandStore((s) => s.data)
  const projectId = useLandStore((s) => s.projectId)
  const saveRoute = useLandStore((s) => s.saveRoute)
  const loadDemo = useLandStore((s) => s.loadDemo)
  const clearDemo = useLandStore((s) => s.clearDemo)
  const loading = useLandStore((s) => s.loading)
  const route = data?.route
  const base: RouteInfo = route ?? { masterProjectId: projectId ?? '', name: '', totalKm: 0, startKm: 0, geometry: [], geometrySource: 'none', settings: DEFAULT_SETTINGS, isDemo: false }
  const [form, setForm] = useState({ name: base.name, totalKm: base.totalKm || 100, startKm: base.startKm, buffer: base.settings.bufferDays, horizon: base.settings.horizonDays })
  const [confirmClear, setConfirmClear] = useState(false)
  const [builder, setBuilder] = useState(false)
  const hasDemo = !!route?.isDemo || !!data?.parcels.some((p) => p.isDemo)
  const valid = form.name.trim() !== '' && form.totalKm > 0 && form.buffer >= 0 && form.horizon > 0

  const save = (geometry = base.geometry, geometrySource = base.geometrySource, totalKm = form.totalKm, startKm = form.startKm) =>
    saveRoute({ ...base, masterProjectId: projectId ?? base.masterProjectId, name: form.name.trim(), totalKm, startKm, geometry, geometrySource, settings: { ...base.settings, bufferDays: form.buffer, horizonDays: form.horizon } })

  const nParcels = data?.parcels.filter((p) => p.kind !== 'station').length ?? 0
  const customised = (['normal', 'dispute', 'art9'] as const).reduce((n, r) => n + Object.keys(base.settings.stepDays?.[r] ?? {}).length, 0)

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-4">
      <div className="la-hero-strip" role="group" aria-label="خلاصهٔ تنظیمات">
        <Chip color="#38bdf8" label="مسیر" value={base.name || 'تعریف نشده'} />
        <Chip color="#a78bfa" label="طول" value={`${faNum(base.totalKm)} km`} />
        <Chip color="#34d399" label="قطعه‌ها" value={faNum(nParcels)} />
        <Chip color="#fbbf24" label="مدت‌های سفارشی" value={customised ? faNum(customised) : 'متعارف'} />
        <Chip color="#fb7185" label="نقشه" value={base.geometry.length >= 2 ? 'مسیر واقعی' : 'شماتیک'} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SettingsSection icon={<Route size={18} />} color="#38bdf8" title="مسیر پروژه" hint="مبنای همهٔ قطعه‌ها، نقشه و برنامه: یک محور کیلومتراژ" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="نام مسیر" className="sm:col-span-3"><input className="la-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثلاً خط لولهٔ ۳۶ اینچ ..." /></Field>
            <Field label="طول کل (km)"><input className="la-input la-num" type="number" min={0} step={0.5} value={form.totalKm} onChange={(e) => setForm({ ...form, totalKm: Number(e.target.value) })} /></Field>
            <Field label="کیلومتر شروع" hint="معمولاً ۰؛ با KML دارای پست کیلومتری خودکار تشخیص داده می‌شود"><input className="la-input la-num" type="number" step={0.5} value={form.startKm} onChange={(e) => setForm({ ...form, startKm: Number(e.target.value) })} /></Field>
            <div className="flex items-end"><button className="la-btn la-btn-primary" disabled={!valid} onClick={() => save()}>ذخیرهٔ مسیر</button></div>
          </div>
          <div className="mt-4"><RouteImport onApply={(pts, src, lengthKm, setTotal, startKm) => { setForm((f) => ({ ...f, totalKm: setTotal ? +lengthKm.toFixed(3) : f.totalKm, startKm: startKm ?? f.startKm })); void save(pts, src, setTotal ? +lengthKm.toFixed(3) : undefined, startKm ?? undefined) }} /></div>
          <p className="la-hint">{base.geometry.length >= 2 ? `مختصات مسیر ثبت است (${faNum(base.geometry.length)} نقطه) — نقشه روی مسیر واقعی رسم می‌شود.` : 'مختصات مسیر ثبت نشده؛ نقشه نمای شماتیک نشان می‌دهد و همهٔ محاسبات با کیلومتراژ درست کار می‌کنند.'}</p>
        </SettingsSection>

        <SettingsSection icon={<Rows3 size={18} />} color="#34d399" title="قطعه‌های مسیر" hint="ساخت خودکار (با طول هر قطعه) یا دستی (کیلومتر شروع و پایان)" badge={<span className="la-badge" style={{ '--c': '#34d399' } as React.CSSProperties}><i /> {faNum(nParcels)} قطعه</span>}>
          <p className="la-eyebrow m-0 leading-7">تعداد قطعه‌ها از طول پروژه و طول هر قطعه به‌دست می‌آید. کیلومتر هر قطعه را بعداً در پنل خودش هم می‌توانید اصلاح کنید.</p>
          <div className="mt-3"><button className="la-btn la-btn-primary" disabled={!route} onClick={() => setBuilder(true)}>{nParcels ? 'ساخت دوبارهٔ قطعه‌ها' : 'ساخت قطعه‌ها'}</button></div>
        </SettingsSection>

        <SettingsSection icon={<BellRing size={18} />} color="#fbbf24" title="قواعد هشدار زودهنگام" hint="ذخیرهٔ اطمینان و افق پیش‌رو">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ذخیرهٔ اطمینان (روز)" hint="به زمان لازم تحصیل اضافه می‌شود"><input className="la-input la-num" type="number" min={0} value={form.buffer} onChange={(e) => setForm({ ...form, buffer: Number(e.target.value) })} /></Field>
            <Field label="افق «پیش‌رو» (روز)" hint="X روز آینده در داشبورد"><input className="la-input la-num" type="number" min={1} value={form.horizon} onChange={(e) => setForm({ ...form, horizon: Number(e.target.value) })} /></Field>
          </div>
          <div className="mt-3 flex justify-end"><button className="la-btn la-btn-primary" disabled={!valid} onClick={() => save()}>ذخیرهٔ تنظیمات</button></div>
        </SettingsSection>

        <SettingsSection icon={<Timer size={18} />} color="#a78bfa" title="مدت مراحل تحصیل (روز)" hint="مدت هر مرحله برای هر مسیر؛ در همهٔ برآوردها و برنامه‌ریزی به‌کار می‌رود" className="lg:col-span-2" defaultOpen={false} badge={customised ? <span className="la-badge" style={{ '--c': '#a78bfa' } as React.CSSProperties}><i /> {faNum(customised)} تغییر</span> : undefined}>
          <StepDaysEditor />
        </SettingsSection>

        <div className="lg:col-span-2"><RolesCard /></div>

        <SettingsSection icon={<Scale size={18} />} color="#fb7185" title="مواعد قانونی لایحهٔ ۱۳۵۸" hint="هر مهلت از رویداد آغازین حساب می‌شود؛ «ماه» ماه شمسی است" className="lg:col-span-2" defaultOpen={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ color: 'var(--la-muted)' }}><th className="px-2 py-2 text-right font-semibold">ماده</th><th className="px-2 py-2 text-right font-semibold">رویداد</th><th className="px-2 py-2 text-right font-semibold">مهلت</th></tr></thead>
            <tbody>
              {LEGAL_REFERENCE.map((r) => (
                <tr key={r.article + r.title} style={{ borderTop: '1px solid var(--la-line)' }}>
                  <td className="whitespace-nowrap px-2 py-2 font-bold">{r.article}</td>
                  <td className="px-2 py-2 leading-6"><b>{r.title}</b><span className="la-eyebrow block">{r.rule}</span></td>
                  <td className="whitespace-nowrap px-2 py-2 font-bold" style={{ color: 'var(--la-accent)' }}>{r.period}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </SettingsSection>

        <SettingsSection icon={<Database size={18} />} color="#94a3b8" title="داده‌های نمونه" hint="یک خط لولهٔ ۱۰۰ کیلومتری برای آشنایی؛ داده‌های واقعی شما هرگز لمس نمی‌شود" className="lg:col-span-2" defaultOpen={false}>
          <div className="flex flex-wrap gap-2">
            <button className="la-btn" disabled={loading} onClick={() => loadDemo()}><Database size={14} /> {hasDemo ? 'بازسازی داده نمونه' : 'بارگذاری داده نمونه'}</button>
            {hasDemo && <button className="la-btn la-btn-danger" onClick={() => setConfirmClear(true)}><Trash2 size={14} /> پاک‌کردن داده نمونه</button>}
          </div>
        </SettingsSection>
      </div>
      {builder && <ParcelBuilder replace={nParcels > 0} onClose={() => setBuilder(false)} />}
      {confirmClear && <ConfirmDialog title="پاک‌کردن داده نمونه" confirmLabel="پاک شود" description="فقط ردیف‌های نمونه حذف می‌شود؛ قطعه‌ها و فعالیت‌هایی که خودتان ثبت کرده‌اید می‌ماند." onClose={() => setConfirmClear(false)} onConfirm={async () => { await clearDemo(); setConfirmClear(false) }} />}
    </div>
  )
}

function Chip({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="la-hero-chip" style={{ '--c': color } as React.CSSProperties}>
      <i aria-hidden />
      <span className="la-eyebrow">{label}</span>
      <b className="la-num">{value}</b>
    </span>
  )
}
